const std = @import("std");
const builtin = @import("builtin");
const fp = @import("fixed_point");
const ops = @import("tensor_ops");
const worker_pool = @import("worker_pool");

const MAX_PARALLEL_WORK = 128;
const supports_threads = switch (builtin.target.cpu.arch) {
    .wasm32, .wasm64 => false,
    else => true,
};

const WorkKind = enum { update, output };

const WorkContext = struct {
    output: []fp.Q128_128,
    present_state: []fp.Q128_128,
    query: []const fp.Q128_128,
    key: []const fp.Q128_128,
    value: []const fp.Q128_128,
    decay: []const fp.Q128_128,
    beta: []const fp.Q128_128,
    batch: usize,
    length: usize,
    query_heads: usize,
    kv_heads: usize,
    key_size: usize,
    value_size: usize,
    scale: fp.Q128_128,
    errors: *[MAX_PARALLEL_WORK]?anyerror,
};

fn updateHead(context: *const WorkContext, batch_index: usize, time: usize, kv_head: usize) !void {
    const state_base = (batch_index * context.kv_heads + kv_head) * context.key_size * context.value_size;
    const decay_value = try ops.expApprox(context.decay[(batch_index * context.length + time) * context.kv_heads + kv_head]);
    for (0..context.key_size * context.value_size) |index| context.present_state[state_base + index] = try context.present_state[state_base + index].mul(decay_value);
    for (0..context.value_size) |value_index| {
        var retrieved = fp.Q128_128.zero;
        for (0..context.key_size) |key_index| {
            const k_index = (batch_index * context.length + time) * context.kv_heads * context.key_size + kv_head * context.key_size + key_index;
            retrieved = try retrieved.add(try context.present_state[state_base + key_index * context.value_size + value_index].mul(context.key[k_index]));
        }
        const v_index = (batch_index * context.length + time) * context.kv_heads * context.value_size + kv_head * context.value_size + value_index;
        const beta_value = context.beta[(batch_index * context.length + time) * context.kv_heads + kv_head];
        const delta = try beta_value.mul(try context.value[v_index].sub(retrieved));
        for (0..context.key_size) |key_index| {
            const k_index = (batch_index * context.length + time) * context.kv_heads * context.key_size + kv_head * context.key_size + key_index;
            const slot = state_base + key_index * context.value_size + value_index;
            context.present_state[slot] = try context.present_state[slot].add(try context.key[k_index].mul(delta));
        }
    }
}

fn outputHead(context: *const WorkContext, batch_index: usize, time: usize, query_head: usize) !void {
    const group = context.query_heads / context.kv_heads;
    const kv_head = query_head / group;
    const state_base = (batch_index * context.kv_heads + kv_head) * context.key_size * context.value_size;
    for (0..context.value_size) |value_index| {
        var result = fp.Q128_128.zero;
        for (0..context.key_size) |key_index| {
            const q_index = (batch_index * context.length + time) * context.query_heads * context.key_size + query_head * context.key_size + key_index;
            result = try result.add(try context.query[q_index].mul(context.present_state[state_base + key_index * context.value_size + value_index]));
        }
        context.output[(batch_index * context.length + time) * context.query_heads * context.value_size + query_head * context.value_size + value_index] = try result.mul(context.scale);
    }
}

fn parallelWorker(context: *WorkContext, work_index: usize, time: usize, kind: WorkKind) void {
    const result = switch (kind) {
        .update => updateHead(context, work_index / context.kv_heads, time, work_index % context.kv_heads),
        .output => outputHead(context, work_index / context.query_heads, time, work_index % context.query_heads),
    };
    result catch |err| {
        context.errors[work_index] = err;
    };
}

fn runParallel(context: *WorkContext, work_count: usize, time: usize, kind: WorkKind) !void {
    var threads: [MAX_PARALLEL_WORK]?std.Thread = .{null} ** MAX_PARALLEL_WORK;
    for (0..work_count) |work_index| {
        context.errors[work_index] = null;
        threads[work_index] = std.Thread.spawn(.{}, parallelWorker, .{ context, work_index, time, kind }) catch null;
        if (threads[work_index] == null) parallelWorker(context, work_index, time, kind);
    }
    for (threads[0..work_count]) |thread| if (thread) |value| value.join();
    for (context.errors[0..work_count]) |err| if (err) |value| return value;
}

pub fn gatedDelta(
    output: []fp.Q128_128,
    present_state: []fp.Q128_128,
    query: []const fp.Q128_128,
    key: []const fp.Q128_128,
    value: []const fp.Q128_128,
    past_state: []const fp.Q128_128,
    decay: []const fp.Q128_128,
    beta: []const fp.Q128_128,
    batch: usize,
    length: usize,
    query_heads: usize,
    kv_heads: usize,
    key_size: usize,
    value_size: usize,
    scale: fp.Q128_128,
) !void {
    if (kv_heads == 0 or query_heads == 0 or query_heads % kv_heads != 0) return error.ShapeMismatch;
    const state_size = batch * kv_heads * key_size * value_size;
    if (query.len != batch * length * query_heads * key_size or key.len != batch * length * kv_heads * key_size or
        value.len != batch * length * kv_heads * value_size or output.len != batch * length * query_heads * value_size or
        present_state.len != state_size or (past_state.len != 0 and past_state.len != state_size) or
        decay.len != batch * length * kv_heads or beta.len != batch * length * kv_heads) return error.ShapeMismatch;
    if (past_state.len == 0) @memset(present_state, fp.Q128_128.zero) else @memcpy(present_state, past_state);
    var errors: [MAX_PARALLEL_WORK]?anyerror = .{null} ** MAX_PARALLEL_WORK;
    var context = WorkContext{
        .output = output,
        .present_state = present_state,
        .query = query,
        .key = key,
        .value = value,
        .decay = decay,
        .beta = beta,
        .batch = batch,
        .length = length,
        .query_heads = query_heads,
        .kv_heads = kv_heads,
        .key_size = key_size,
        .value_size = value_size,
        .scale = scale,
        .errors = &errors,
    };
    const update_count = batch * kv_heads;
    const output_count = batch * query_heads;
    if (comptime supports_threads) {
        if (update_count <= MAX_PARALLEL_WORK and output_count <= MAX_PARALLEL_WORK and update_count > 1) {
            for (0..length) |time| {
                try runParallel(&context, update_count, time, .update);
                try runParallel(&context, output_count, time, .output);
            }
            return;
        }
    }
    for (0..batch) |b| {
        for (0..length) |time| {
            for (0..kv_heads) |kv_head| try updateHead(&context, b, time, kv_head);
            for (0..query_heads) |query_head| try outputHead(&context, b, time, query_head);
        }
    }
}

const WorkContextF64 = struct {
    output: []fp.Q128_128,
    present_state: []fp.Q128_128,
    query: []const f64,
    key: []const f64,
    value: []const f64,
    state: []f64,
    decay: []const f64,
    beta: []const f64,
    batch: usize,
    length: usize,
    query_heads: usize,
    kv_heads: usize,
    key_size: usize,
    value_size: usize,
    scale: f64,
    errors: *[MAX_PARALLEL_WORK]?anyerror,
};

/// Decay + retrieve + delta update for one (batch, time, kv_head) block —
/// the whole block is touched, so the worker also converts it to Q128
/// `present_state`, removing the separate sequential writeback pass.
fn updateHeadF64(context: *const WorkContextF64, batch_index: usize, time: usize, kv_head: usize) !void {
    const state_base = (batch_index * context.kv_heads + kv_head) * context.key_size * context.value_size;
    const block = context.state[state_base..][0 .. context.key_size * context.value_size];
    const decay_value = @exp(context.decay[(batch_index * context.length + time) * context.kv_heads + kv_head]);
    for (block) |*slot| slot.* *= decay_value;
    const beta_value = context.beta[(batch_index * context.length + time) * context.kv_heads + kv_head];
    for (0..context.value_size) |value_index| {
        var retrieved: f64 = 0;
        for (0..context.key_size) |key_index| {
            const k_index = (batch_index * context.length + time) * context.kv_heads * context.key_size + kv_head * context.key_size + key_index;
            retrieved += context.state[state_base + key_index * context.value_size + value_index] * context.key[k_index];
        }
        const v_index = (batch_index * context.length + time) * context.kv_heads * context.value_size + kv_head * context.value_size + value_index;
        const delta = beta_value * (context.value[v_index] - retrieved);
        for (0..context.key_size) |key_index| {
            const k_index = (batch_index * context.length + time) * context.kv_heads * context.key_size + kv_head * context.key_size + key_index;
            context.state[state_base + key_index * context.value_size + value_index] += context.key[k_index] * delta;
        }
    }
    for (context.present_state[state_base..][0 .. context.key_size * context.value_size], context.state[state_base..][0 .. context.key_size * context.value_size]) |*slot, element|
        slot.* = try fp.Q128_128.fromF64Saturating(element);
}

fn outputHeadF64(context: *const WorkContextF64, batch_index: usize, time: usize, query_head: usize) !void {
    const group = context.query_heads / context.kv_heads;
    const kv_head = query_head / group;
    const state_base = (batch_index * context.kv_heads + kv_head) * context.key_size * context.value_size;
    for (0..context.value_size) |value_index| {
        var result: f64 = 0;
        for (0..context.key_size) |key_index| {
            const q_index = (batch_index * context.length + time) * context.query_heads * context.key_size + query_head * context.key_size + key_index;
            result += context.query[q_index] * context.state[state_base + key_index * context.value_size + value_index];
        }
        context.output[(batch_index * context.length + time) * context.query_heads * context.value_size + query_head * context.value_size + value_index] =
            try fp.Q128_128.fromF64Saturating(result * context.scale);
    }
}

fn parallelWorkerF64(context: *WorkContextF64, work_index: usize, time: usize, kind: WorkKind) void {
    const result = switch (kind) {
        .update => updateHeadF64(context, work_index / context.kv_heads, time, work_index % context.kv_heads),
        .output => outputHeadF64(context, work_index / context.query_heads, time, work_index % context.query_heads),
    };
    result catch |err| {
        context.errors[work_index] = err;
    };
}

const JobContextF64 = struct {
    context: *WorkContextF64,
    time: usize,
    kind: WorkKind,
};

fn jobEntryF64(job_context: *anyopaque, index: usize) void {
    const job: *JobContextF64 = @ptrCast(@alignCast(job_context));
    parallelWorkerF64(job.context, index, job.time, job.kind);
}

fn runParallelF64(context: *WorkContextF64, pool: ?*worker_pool.Pool, work_count: usize, time: usize, kind: WorkKind) !void {
    if (pool) |pool_instance| {
        if (pool_instance.worker_count > 0) {
            for (0..work_count) |work_index| context.errors[work_index] = null;
            var job = JobContextF64{ .context = context, .time = time, .kind = kind };
            pool_instance.run(&job, jobEntryF64, work_count);
            for (context.errors[0..work_count]) |err| if (err) |value| return value;
            return;
        }
    }
    var threads: [MAX_PARALLEL_WORK]?std.Thread = .{null} ** MAX_PARALLEL_WORK;
    for (0..work_count) |work_index| {
        context.errors[work_index] = null;
        threads[work_index] = std.Thread.spawn(.{}, parallelWorkerF64, .{ context, work_index, time, kind }) catch null;
        if (threads[work_index] == null) parallelWorkerF64(context, work_index, time, kind);
    }
    for (threads[0..work_count]) |thread| if (thread) |value| value.join();
    for (context.errors[0..work_count]) |err| if (err) |value| return value;
}

/// Fast-tier variant (ADR-0024): the gated delta recurrence in f64 behind the
/// Q128 tensor boundary. The caller supplies f64 views of every input plus an
/// f64 state buffer initialized from `past_state`; `present_state` and
/// `output` are converted back to Q128 inside the per-head workers. Head
/// blocks are disjoint, so the parallel schedule is deterministic.
pub fn gatedDeltaF64(
    output: []fp.Q128_128,
    present_state: []fp.Q128_128,
    query: []const f64,
    key: []const f64,
    value: []const f64,
    state: []f64,
    decay: []const f64,
    beta: []const f64,
    batch: usize,
    length: usize,
    query_heads: usize,
    kv_heads: usize,
    key_size: usize,
    value_size: usize,
    scale: f64,
    pool: ?*worker_pool.Pool,
) !void {
    const state_size = batch * kv_heads * key_size * value_size;
    if (kv_heads == 0 or query_heads == 0 or query_heads % kv_heads != 0) return error.ShapeMismatch;
    if (query.len != batch * length * query_heads * key_size or key.len != batch * length * kv_heads * key_size or
        value.len != batch * length * kv_heads * value_size or output.len != batch * length * query_heads * value_size or
        present_state.len != state_size or state.len != state_size or
        decay.len != batch * length * kv_heads or beta.len != batch * length * kv_heads) return error.ShapeMismatch;
    var errors: [MAX_PARALLEL_WORK]?anyerror = .{null} ** MAX_PARALLEL_WORK;
    var context = WorkContextF64{
        .output = output,
        .present_state = present_state,
        .query = query,
        .key = key,
        .value = value,
        .state = state,
        .decay = decay,
        .beta = beta,
        .batch = batch,
        .length = length,
        .query_heads = query_heads,
        .kv_heads = kv_heads,
        .key_size = key_size,
        .value_size = value_size,
        .scale = scale,
        .errors = &errors,
    };
    const update_count = batch * kv_heads;
    const output_count = batch * query_heads;
    if (comptime supports_threads) {
        if (update_count <= MAX_PARALLEL_WORK and output_count <= MAX_PARALLEL_WORK and update_count > 1) {
            for (0..length) |time| {
                try runParallelF64(&context, pool, update_count, time, .update);
                try runParallelF64(&context, pool, output_count, time, .output);
            }
            return;
        }
    }
    for (0..batch) |b| {
        for (0..length) |time| {
            for (0..kv_heads) |kv_head| try updateHeadF64(&context, b, time, kv_head);
            for (0..query_heads) |query_head| try outputHeadF64(&context, b, time, query_head);
        }
    }
}

test "linear gated delta updates state and reads it" {
    const query = [_]fp.Q128_128{fp.Q128_128.one};
    const key = [_]fp.Q128_128{fp.Q128_128.one};
    const value = [_]fp.Q128_128{fp.Q128_128.fromInt(3)};
    const decay = [_]fp.Q128_128{fp.Q128_128.zero};
    const beta = [_]fp.Q128_128{fp.Q128_128.one};
    var output: [1]fp.Q128_128 = undefined;
    var state: [1]fp.Q128_128 = undefined;
    try gatedDelta(&output, &state, &query, &key, &value, &.{}, &decay, &beta, 1, 1, 1, 1, 1, 1, fp.Q128_128.one);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, output[0].raw);
    try std.testing.expectEqual(fp.Q128_128.fromInt(3).raw, state[0].raw);
}
