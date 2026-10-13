//! Persistent worker pool for deterministic parallel-for work.
//!
//! Workers spawn once at `init` and sleep on a condition variable; each
//! `run` call publishes a job (context + function + item count) and bumps a
//! generation counter. Workers and the submitting thread all drain items
//! through an atomic index, so the submitted order does not matter — every
//! item is processed exactly once and the mapping from index to work is
//! fixed, keeping results deterministic regardless of scheduling.

const std = @import("std");
const builtin = @import("builtin");

pub const supports_threads = switch (builtin.target.cpu.arch) {
    .wasm32, .wasm64 => false,
    else => true,
};

pub const MAX_WORKERS = 16;

pub const Pool = struct {
    allocator: std.mem.Allocator,
    threads: [MAX_WORKERS]?std.Thread = .{null} ** MAX_WORKERS,
    worker_count: usize = 0,
    mutex: std.Thread.Mutex = .{},
    cond: std.Thread.Condition = .{},
    done: std.Thread.Condition = .{},
    job: ?Job = null,
    next_index: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
    remaining: std.atomic.Value(usize) = std.atomic.Value(usize).init(0),
    epoch: u64 = 0,
    shutdown: bool = false,

    const Job = struct {
        context: *anyopaque,
        run_fn: *const fn (context: *anyopaque, index: usize) void,
        count: usize,
        epoch: u64,
    };

    /// Spawns `worker_count` threads (clamped to MAX_WORKERS). The pool is a
    /// *pool pointer* so worker contexts can reference it stably.
    pub fn create(allocator: std.mem.Allocator, worker_count: usize) !*Pool {
        const self = try allocator.create(Pool);
        self.* = .{ .allocator = allocator };
        errdefer allocator.destroy(self);
        if (comptime supports_threads) {
            const count = @min(worker_count, MAX_WORKERS);
            var spawned: usize = 0;
            errdefer {
                self.shutdown = true;
                self.cond.broadcast();
                for (self.threads[0..spawned]) |thread| if (thread) |value| value.join();
            }
            for (0..count) |index| {
                self.threads[index] = std.Thread.spawn(.{}, workerMain, .{self}) catch null;
                if (self.threads[index] != null) spawned += 1;
            }
            self.worker_count = spawned;
        }
        return self;
    }

    pub fn destroy(self: *Pool) void {
        if (comptime supports_threads) {
            {
                self.mutex.lock();
                defer self.mutex.unlock();
                self.shutdown = true;
                self.cond.broadcast();
            }
            for (self.threads) |thread| if (thread) |value| value.join();
        }
        self.allocator.destroy(self);
    }

    fn workerMain(self: *Pool) void {
        var seen_epoch: u64 = 0;
        self.mutex.lock();
        while (true) {
            while (!self.shutdown and (self.job == null or self.job.?.epoch == seen_epoch)) {
                self.cond.wait(&self.mutex);
            }
            if (self.shutdown) {
                self.mutex.unlock();
                return;
            }
            const job = self.job.?;
            seen_epoch = job.epoch;
            self.mutex.unlock();
            self.drain(job);
            self.mutex.lock();
        }
    }

    /// Drains job items via the shared atomic index. Called by workers and by
    /// the submitting thread so a single-worker pool still completes.
    fn drain(self: *Pool, job: Job) void {
        while (true) {
            const index = self.next_index.fetchAdd(1, .acq_rel);
            if (index >= job.count) break;
            job.run_fn(job.context, index);
            if (self.remaining.fetchSub(1, .acq_rel) == 1) {
                self.mutex.lock();
                self.done.broadcast();
                self.mutex.unlock();
            }
        }
    }

    /// Runs `run_fn(context, index)` for every index in `0..count`, returning
    /// after all items complete. Falls back to a sequential loop when no
    /// workers are available.
    pub fn run(self: *Pool, context: *anyopaque, run_fn: *const fn (context: *anyopaque, index: usize) void, count: usize) void {
        if (self.worker_count == 0 or count <= 1) {
            for (0..count) |index| run_fn(context, index);
            return;
        }
        {
            self.mutex.lock();
            defer self.mutex.unlock();
            self.epoch += 1;
            self.job = .{ .context = context, .run_fn = run_fn, .count = count, .epoch = self.epoch };
            self.next_index.store(0, .release);
            self.remaining.store(count, .release);
            self.cond.broadcast();
        }
        self.drain(self.job.?);
        self.mutex.lock();
        defer self.mutex.unlock();
        while (self.remaining.load(.acquire) != 0) self.done.wait(&self.mutex);
    }
};

test "pool processes every item exactly once" {
    if (comptime !supports_threads) return;
    var counters: [64]std.atomic.Value(u32) = undefined;
    for (&counters) |*counter| counter.* = std.atomic.Value(u32).init(0);
    const Context = struct {
        counters: []std.atomic.Value(u32),
        fn run(context: *anyopaque, index: usize) void {
            const ctx: *@This() = @ptrCast(@alignCast(context));
            _ = ctx.counters[index].fetchAdd(1, .monotonic);
        }
    };
    const pool = try Pool.create(std.testing.allocator, 8);
    defer pool.destroy();
    var context = Context{ .counters = &counters };
    pool.run(&context, Context.run, 64);
    pool.run(&context, Context.run, 64);
    for (counters) |counter| try std.testing.expectEqual(@as(u32, 2), counter.load(.monotonic));
}
