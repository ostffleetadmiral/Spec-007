const std = @import("std");

// SPEC-008 qstar exploitation build — vendored deps under deps/ are wired as
// modules here (mirroring each dep's own build.zig import graph) plus the
// spec008_qstar_* integration harnesses under src/.
//
// Integer-only rule: every wire format, hash, and governance path in the
// harnesses is integer/bytes. qstar-mesh Location, merge activation, and
// qstar-render use f64 internally — consumed at the boundary only
// (sidecar semantics), never entering wire bytes.

const D = "deps/";

fn depMod(
    b: *std.Build,
    path: []const u8,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
) *std.Build.Module {
    return b.createModule(.{
        .root_source_file = b.path(path),
        .target = target,
        .optimize = optimize,
    });
}

fn depTest(
    b: *std.Build,
    step: *std.Build.Step,
    path: []const u8,
    target: std.Build.ResolvedTarget,
    optimize: std.builtin.OptimizeMode,
    imports: []const std.Build.Module.Import,
) void {
    const t = b.addTest(.{
        .root_source_file = b.path(path),
        .target = target,
        .optimize = optimize,
    });
    for (imports) |i| t.root_module.addImport(i.name, i.module);
    step.dependOn(&b.addRunArtifact(t).step);
}

fn imp(name: []const u8, m: *std.Build.Module) std.Build.Module.Import {
    return .{ .name = name, .module = m };
}

pub fn build(b: *std.Build) void {
    const target = b.standardTargetOptions(.{});
    const optimize = b.standardOptimizeOption(.{});
    const test_step = b.step("test", "dep unit tests + spec008 qstar harnesses");

    // ── qstar-quantum ──────────────────────────────────────────────────
    const q_fp = depMod(b, D ++ "qstar-quantum/src/fixed_point.zig", target, optimize);
    const q_entangle = depMod(b, D ++ "qstar-quantum/src/entangle.zig", target, optimize);

    depTest(b, test_step, D ++ "qstar-quantum/src/fixed_point.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-quantum/src/quantum.zig", target, optimize, &.{imp("fixed_point", q_fp)});
    depTest(b, test_step, D ++ "qstar-quantum/src/entangle.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-quantum/src/holographic.zig", target, optimize, &.{imp("fixed_point", q_fp)});

    // ── qstar-transport ────────────────────────────────────────────────
    const t_qr = depMod(b, D ++ "qstar-transport/src/transport_qr.zig", target, optimize);
    const t_optar = depMod(b, D ++ "qstar-transport/src/transport_optar.zig", target, optimize);
    const t_paper = depMod(b, D ++ "qstar-transport/src/transport_paperback.zig", target, optimize);
    const t_audio = depMod(b, D ++ "qstar-transport/src/transport_audio.zig", target, optimize);
    const t_cassette = depMod(b, D ++ "qstar-transport/src/transport_cassette.zig", target, optimize);
    const t_poly = depMod(b, D ++ "qstar-transport/src/transport_polyglot.zig", target, optimize);
    const t_stega = depMod(b, D ++ "qstar-transport/src/transport_stega.zig", target, optimize);
    const t_lora = depMod(b, D ++ "qstar-transport/src/transport_lora.zig", target, optimize);
    const t_maypole = depMod(b, D ++ "qstar-transport/src/maypole_bridge.zig", target, optimize);
    t_maypole.addImport("transport_lora", t_lora);

    depTest(b, test_step, D ++ "qstar-transport/src/transport_qr.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_optar.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_paperback.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_audio.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_cassette.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_polyglot.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_convert.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_video.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_quine.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_stega.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_wifi.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_p2p.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/transport_lora.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-transport/src/maypole_bridge.zig", target, optimize, &.{imp("transport_lora", t_lora)});

    // ── qstar-net ──────────────────────────────────────────────────────
    const n_nat = depMod(b, D ++ "qstar-net/src/nat.zig", target, optimize);
    const n_webrtc = depMod(b, D ++ "qstar-net/src/webrtc.zig", target, optimize);
    const n_boot = depMod(b, D ++ "qstar-net/src/bootstrap.zig", target, optimize);
    const n_sybil = depMod(b, D ++ "qstar-net/src/sybil.zig", target, optimize);
    const n_merge = depMod(b, D ++ "qstar-net/src/merge.zig", target, optimize);

    depTest(b, test_step, D ++ "qstar-net/src/nat.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-net/src/webrtc.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-net/src/bootstrap.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-net/src/sybil.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-net/src/merge.zig", target, optimize, &.{});

    // ── qstar-mesh ─────────────────────────────────────────────────────
    const m_fp = depMod(b, D ++ "qstar-mesh/src/fixed_point.zig", target, optimize);
    const m_p2p = depMod(b, D ++ "qstar-mesh/src/p2p_types.zig", target, optimize);
    const m_mesh = depMod(b, D ++ "qstar-mesh/src/mesh.zig", target, optimize);
    m_mesh.addImport("fixed_point", m_fp);
    const m_relay = depMod(b, D ++ "qstar-mesh/src/relay_router.zig", target, optimize);
    m_relay.addImport("p2p_types", m_p2p);
    const m_peer = depMod(b, D ++ "qstar-mesh/src/mesh_peer.zig", target, optimize);
    m_peer.addImport("mesh", m_mesh);
    m_peer.addImport("p2p_types", m_p2p);
    m_peer.addImport("relay_router", m_relay);

    depTest(b, test_step, D ++ "qstar-mesh/src/fixed_point.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-mesh/src/mesh.zig", target, optimize, &.{imp("fixed_point", m_fp)});
    depTest(b, test_step, D ++ "qstar-mesh/src/p2p_types.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-mesh/src/relay_router.zig", target, optimize, &.{imp("p2p_types", m_p2p)});
    depTest(b, test_step, D ++ "qstar-mesh/src/mesh_peer.zig", target, optimize, &.{
        imp("mesh", m_mesh), imp("p2p_types", m_p2p), imp("relay_router", m_relay),
    });

    // ── qstar-vfs ──────────────────────────────────────────────────────
    const v_fp = depMod(b, D ++ "qstar-vfs/src/fixed_point.zig", target, optimize);
    const v_bridge = depMod(b, D ++ "qstar-vfs/src/vfs_bridge.zig", target, optimize);
    v_bridge.addImport("fixed_point", v_fp);
    const v_stream = depMod(b, D ++ "qstar-vfs/src/vfs_streaming.zig", target, optimize);
    v_stream.addImport("vfs_bridge", v_bridge);
    const v_dist = depMod(b, D ++ "qstar-vfs/src/vfs_distributed.zig", target, optimize);

    depTest(b, test_step, D ++ "qstar-vfs/src/fixed_point.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-vfs/src/vfs_bridge.zig", target, optimize, &.{imp("fixed_point", v_fp)});
    depTest(b, test_step, D ++ "qstar-vfs/src/vfs_streaming.zig", target, optimize, &.{
        imp("vfs_bridge", v_bridge), imp("fixed_point", v_fp),
    });
    depTest(b, test_step, D ++ "qstar-vfs/src/vfs_distributed.zig", target, optimize, &.{});

    // ── qstar-compress ─────────────────────────────────────────────────
    const c_fp = depMod(b, D ++ "qstar-compress/src/fixed_point.zig", target, optimize);
    const c_tq = depMod(b, D ++ "qstar-compress/src/turbo_quant.zig", target, optimize);
    const c_compress = depMod(b, D ++ "qstar-compress/src/compress.zig", target, optimize);
    c_compress.addImport("fixed_point", c_fp);
    c_compress.addImport("turbo_quant", c_tq);

    depTest(b, test_step, D ++ "qstar-compress/src/fixed_point.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-compress/src/turbo_quant.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-compress/src/compress.zig", target, optimize, &.{
        imp("fixed_point", c_fp), imp("turbo_quant", c_tq),
    });

    // ── qstar-collapse ─────────────────────────────────────────────────
    const x_collapse = depMod(b, D ++ "qstar-collapse/src/collapse.zig", target, optimize);
    depTest(b, test_step, D ++ "qstar-collapse/src/collapse.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-collapse/src/qr_nest.zig", target, optimize, &.{});

    // ── qstar-render ───────────────────────────────────────────────────
    const r_fp = depMod(b, D ++ "qstar-render/src/fixed_point.zig", target, optimize);
    const r_render = depMod(b, D ++ "qstar-render/src/render.zig", target, optimize);
    r_render.addImport("fixed_point", r_fp);

    depTest(b, test_step, D ++ "qstar-render/src/fixed_point.zig", target, optimize, &.{});
    depTest(b, test_step, D ++ "qstar-render/src/render.zig", target, optimize, &.{imp("fixed_point", r_fp)});

    // ── spec008 integration harnesses ──────────────────────────────────
    depTest(b, test_step, "src/spec008_qstar_escrow.zig", target, optimize, &.{
        imp("qentangle", q_entangle),
    });
    depTest(b, test_step, "src/spec008_qstar_carriage.zig", target, optimize, &.{
        imp("transport_qr", t_qr),             imp("transport_optar", t_optar),
        imp("transport_paperback", t_paper),   imp("transport_audio", t_audio),
        imp("transport_cassette", t_cassette), imp("transport_polyglot", t_poly),
        imp("transport_stega", t_stega),       imp("transport_lora", t_lora),
        imp("maypole_bridge", t_maypole),
    });
    depTest(b, test_step, "src/spec008_qstar_fleet.zig", target, optimize, &.{
        imp("bootstrap", n_boot), imp("sybil", n_sybil),
        imp("merge", n_merge),    imp("nat", n_nat),
        imp("webrtc", n_webrtc),
    });
    depTest(b, test_step, "src/spec008_qstar_archive.zig", target, optimize, &.{
        imp("collapse", x_collapse),    imp("compress", c_compress),
        imp("vfs_bridge", v_bridge),    imp("vfs_streaming", v_stream),
        imp("vfs_distributed", v_dist),
    });
    depTest(b, test_step, "src/spec008_qstar_mesh.zig", target, optimize, &.{
        imp("mesh", m_mesh),          imp("p2p_types", m_p2p),
        imp("relay_router", m_relay), imp("mesh_peer", m_peer),
        imp("render", r_render),
    });
    depTest(b, test_step, "src/spec008_qstar_parity.zig", target, optimize, &.{});
    depTest(b, test_step, "src/spec008_medium_lattice.zig", target, optimize, &.{});
    depTest(b, test_step, "src/spec008_seal.zig", target, optimize, &.{});

    // ── T7 native DHT (dht_native on the vfs_distributed substrate,
    //    sealed-wire ops via spec008_seal) ──────────────────────────
    const s_seal = depMod(b, "src/spec008_seal.zig", target, optimize);
    const n_dht = depMod(b, "src/dht_native.zig", target, optimize);
    n_dht.addImport("spec008_seal", s_seal);
    n_dht.addImport("vfs_distributed", v_dist);
    depTest(b, test_step, "src/dht_native.zig", target, optimize, &.{
        imp("spec008_seal", s_seal), imp("vfs_distributed", v_dist),
    });
    const dhtd_module = depMod(b, "src/dhtd.zig", target, optimize);
    dhtd_module.addImport("dht_native", n_dht);
    dhtd_module.addImport("spec008_seal", s_seal);
    dhtd_module.addImport("vfs_distributed", v_dist);
    const dhtd = b.addExecutable(.{
        .name = "dhtd",
        .root_source_file = b.path("src/dhtd.zig"),
        .target = target,
        .optimize = optimize,
    });
    dhtd.root_module.addImport("dht_native", n_dht);
    dhtd.root_module.addImport("spec008_seal", s_seal);
    dhtd.root_module.addImport("vfs_distributed", v_dist);
    b.installArtifact(dhtd);
    depTest(b, test_step, "src/dhtd.zig", target, optimize, &.{
        imp("dht_native", n_dht), imp("spec008_seal", s_seal), imp("vfs_distributed", v_dist),
    });

    // spec008_seal CLI — seal-hex/verify-hex/build-hex differential
    // probing surface for the JS↔Zig twin-parity harness. The core is a
    // separate root so it stays wasm32-freestanding-clean.
    const seal_exe = b.addExecutable(.{
        .name = "spec008_seal",
        .root_source_file = b.path("src/spec008_seal_cli.zig"),
        .target = target,
        .optimize = optimize,
    });
    b.installArtifact(seal_exe);

    // spec008_seal.wasm — wasm32-freestanding build of the same core,
    // consumed in-process by security/fano-mesh-bridge.mjs when present
    // (BigInt twin remains the fallback — honest degradation).
    const seal_wasm = b.addExecutable(.{
        .name = "spec008_seal_wasm",
        .root_source_file = b.path("src/spec008_seal.zig"),
        .target = b.resolveTargetQuery(.{
            .cpu_arch = .wasm32,
            .os_tag = .freestanding,
        }),
        .optimize = .ReleaseSmall,
    });
    seal_wasm.entry = .disabled;
    seal_wasm.rdynamic = true;
    b.installArtifact(seal_wasm);

    // ── Digit model-session donor (read-only source, native Spec-007 build) ─
    const digit_fixed = depMod(b, "deps/digit/src/fixed_point.zig", target, optimize);
    const digit_brain = depMod(b, "deps/digit/src/brain_contracts.zig", target, optimize);
    digit_brain.addImport("fixed_point", digit_fixed);
    const digit_e5 = depMod(b, "deps/digit/src/e5_state.zig", target, optimize);
    digit_e5.addImport("fixed_point", digit_fixed);
    const digit_onnx_weights = depMod(b, "deps/digit/src/onnx_weights.zig", target, optimize);
    const digit_onnx_graph = depMod(b, "deps/digit/src/onnx_graph.zig", target, optimize);
    const digit_shape = depMod(b, "deps/digit/src/shape_ops.zig", target, optimize);
    digit_shape.addImport("fixed_point", digit_fixed);
    const digit_skip = depMod(b, "deps/digit/src/skip_layer_norm.zig", target, optimize);
    digit_skip.addImport("fixed_point", digit_fixed);
    const digit_worker = depMod(b, "deps/digit/src/worker_pool.zig", target, optimize);
    const digit_tensor_ops = depMod(b, "deps/digit/src/tensor_ops.zig", target, optimize);
    digit_tensor_ops.addImport("fixed_point", digit_fixed);
    const digit_qwen_embed = depMod(b, "deps/digit/src/qwen_embed.zig", target, optimize);
    digit_qwen_embed.addImport("fixed_point", digit_fixed);
    digit_qwen_embed.addImport("tensor_ops", digit_tensor_ops);
    digit_qwen_embed.addImport("onnx_weights", digit_onnx_weights);
    const digit_causal = depMod(b, "deps/digit/src/causal_conv.zig", target, optimize);
    digit_causal.addImport("fixed_point", digit_fixed);
    digit_causal.addImport("tensor_ops", digit_tensor_ops);
    const digit_linear = depMod(b, "deps/digit/src/linear_attention.zig", target, optimize);
    digit_linear.addImport("fixed_point", digit_fixed);
    digit_linear.addImport("tensor_ops", digit_tensor_ops);
    digit_linear.addImport("worker_pool", digit_worker);
    const digit_graph = depMod(b, "deps/digit/src/graph_exec.zig", target, optimize);
    digit_graph.addImport("fixed_point", digit_fixed);
    digit_graph.addImport("tensor_ops", digit_tensor_ops);
    digit_graph.addImport("shape_ops", digit_shape);
    digit_graph.addImport("skip_layer_norm", digit_skip);
    digit_graph.addImport("causal_conv", digit_causal);
    digit_graph.addImport("linear_attention", digit_linear);
    digit_graph.addImport("worker_pool", digit_worker);
    digit_graph.addImport("onnx_graph", digit_onnx_graph);
    const digit_package = depMod(b, "deps/digit/src/model_package.zig", target, optimize);
    digit_package.addImport("onnx_graph", digit_onnx_graph);
    const digit_upload = depMod(b, "deps/digit/src/tensor_upload.zig", target, optimize);
    digit_upload.addImport("fixed_point", digit_fixed);
    digit_upload.addImport("graph_exec", digit_graph);
    const digit_bridge = depMod(b, "deps/digit/src/onnx_fixed_bridge.zig", target, optimize);
    digit_bridge.addImport("fixed_point", digit_fixed);
    const digit_session = depMod(b, "deps/digit/src/model_session.zig", target, optimize);
    digit_session.addImport("fixed_point", digit_fixed);
    digit_session.addImport("graph_exec", digit_graph);
    digit_session.addImport("onnx_graph", digit_onnx_graph);
    digit_session.addImport("model_package", digit_package);
    digit_session.addImport("tensor_upload", digit_upload);
    digit_session.addImport("brain_contracts", digit_brain);
    digit_session.addImport("onnx_fixed_bridge", digit_bridge);
    depTest(b, test_step, "deps/digit/src/e5_state.zig", target, optimize, &.{imp("fixed_point", digit_fixed)});
    depTest(b, test_step, "deps/digit/src/graph_exec.zig", target, optimize, &.{
        imp("fixed_point", digit_fixed),  imp("tensor_ops", digit_tensor_ops),
        imp("shape_ops", digit_shape),    imp("skip_layer_norm", digit_skip),
        imp("causal_conv", digit_causal), imp("linear_attention", digit_linear),
        imp("worker_pool", digit_worker), imp("onnx_graph", digit_onnx_graph),
    });
    depTest(b, test_step, "deps/digit/src/onnx_weights.zig", target, optimize, &.{});
    depTest(b, test_step, "deps/digit/src/onnx_graph.zig", target, optimize, &.{});
    depTest(b, test_step, "deps/digit/src/tensor_ops.zig", target, optimize, &.{imp("fixed_point", digit_fixed)});
    depTest(b, test_step, "deps/digit/src/model_package.zig", target, optimize, &.{imp("onnx_graph", digit_onnx_graph)});
    depTest(b, test_step, "deps/digit/src/tensor_upload.zig", target, optimize, &.{
        imp("fixed_point", digit_fixed), imp("graph_exec", digit_graph),
    });
    depTest(b, test_step, "deps/digit/src/model_session.zig", target, optimize, &.{
        imp("fixed_point", digit_fixed),        imp("graph_exec", digit_graph),
        imp("onnx_graph", digit_onnx_graph),    imp("model_package", digit_package),
        imp("tensor_upload", digit_upload),     imp("brain_contracts", digit_brain),
        imp("onnx_fixed_bridge", digit_bridge),
    });

    // ── Native AIWO graft ──────────────────────────────────────────────
    // Policy, officer state, directive, heartbeat, and receipt adapters are
    // native Spec-007 modules. External AIWO services remain compatibility
    // oracles until the parity/cutover gates pass.
    const aiwo_types = depMod(b, "src/aiwo_types.zig", target, optimize);
    const aiwo_policy = depMod(b, "src/aiwo_policy.zig", target, optimize);
    aiwo_policy.addImport("aiwo_types", aiwo_types);
    const aiwo_manifest = depMod(b, "src/aiwo_manifest.zig", target, optimize);
    aiwo_manifest.addImport("aiwo_types", aiwo_types);
    const aiwo_state = depMod(b, "src/aiwo_state.zig", target, optimize);
    aiwo_state.addImport("aiwo_types", aiwo_types);
    const aiwo_directive = depMod(b, "src/aiwo_directive.zig", target, optimize);
    aiwo_directive.addImport("aiwo_types", aiwo_types);
    aiwo_directive.addImport("aiwo_policy", aiwo_policy);
    const aiwo_fano = depMod(b, "src/aiwo_fano.zig", target, optimize);
    aiwo_fano.addImport("spec008_seal", s_seal);
    const aiwo_dht = depMod(b, "src/aiwo_dht.zig", target, optimize);
    aiwo_dht.addImport("dht_native", n_dht);
    const aiwo_cognitive = depMod(b, "src/aiwo_cognitive.zig", target, optimize);
    const aiwo_chunk_checkpoint = depMod(b, "src/aiwo_chunk_checkpoint.zig", target, optimize);
    const aiwo_prompt = depMod(b, "src/aiwo_prompt.zig", target, optimize);
    const aiwo_model_observation = depMod(b, "src/aiwo_model_observation.zig", target, optimize);
    aiwo_model_observation.addImport("aiwo_cognitive", aiwo_cognitive);
    const aiwo_digit_bridge = depMod(b, "src/aiwo_digit_bridge.zig", target, optimize);
    aiwo_digit_bridge.addImport("aiwo_cognitive", aiwo_cognitive);
    aiwo_digit_bridge.addImport("digit_brain", digit_brain);
    aiwo_digit_bridge.addImport("fixed_point", digit_fixed);
    const aiwo_runtime = depMod(b, "src/aiwo_runtime.zig", target, optimize);
    aiwo_runtime.addImport("aiwo_digit_bridge", aiwo_digit_bridge);
    aiwo_runtime.addImport("digit_brain", digit_brain);
    aiwo_runtime.addImport("aiwo_cognitive", aiwo_cognitive);
    aiwo_runtime.addImport("aiwo_types", aiwo_types);
    aiwo_runtime.addImport("aiwo_policy", aiwo_policy);
    aiwo_runtime.addImport("aiwo_state", aiwo_state);
    aiwo_runtime.addImport("aiwo_directive", aiwo_directive);
    aiwo_runtime.addImport("aiwo_fano", aiwo_fano);
    const aiwo_heartbeat = depMod(b, "src/aiwo_heartbeat.zig", target, optimize);
    aiwo_heartbeat.addImport("aiwo_types", aiwo_types);
    aiwo_heartbeat.addImport("aiwo_runtime", aiwo_runtime);

    depTest(b, test_step, "src/aiwo_types.zig", target, optimize, &.{});
    depTest(b, test_step, "src/aiwo_policy.zig", target, optimize, &.{imp("aiwo_types", aiwo_types)});
    depTest(b, test_step, "src/aiwo_manifest.zig", target, optimize, &.{imp("aiwo_types", aiwo_types)});
    depTest(b, test_step, "src/aiwo_state.zig", target, optimize, &.{imp("aiwo_types", aiwo_types)});
    depTest(b, test_step, "src/aiwo_directive.zig", target, optimize, &.{
        imp("aiwo_types", aiwo_types), imp("aiwo_policy", aiwo_policy),
    });
    depTest(b, test_step, "src/aiwo_fano.zig", target, optimize, &.{imp("spec008_seal", s_seal)});
    depTest(b, test_step, "src/aiwo_dht.zig", target, optimize, &.{imp("dht_native", n_dht)});
    depTest(b, test_step, "src/aiwo_cognitive.zig", target, optimize, &.{});
    depTest(b, test_step, "src/aiwo_chunk_checkpoint.zig", target, optimize, &.{});
    depTest(b, test_step, "src/aiwo_prompt.zig", target, optimize, &.{});
    depTest(b, test_step, "src/aiwo_model_observation.zig", target, optimize, &.{imp("aiwo_cognitive", aiwo_cognitive)});
    depTest(b, test_step, "src/aiwo_digit_bridge.zig", target, optimize, &.{
        imp("aiwo_cognitive", aiwo_cognitive), imp("digit_brain", digit_brain), imp("fixed_point", digit_fixed),
    });
    depTest(b, test_step, "src/aiwo_runtime.zig", target, optimize, &.{
        imp("aiwo_digit_bridge", aiwo_digit_bridge), imp("digit_brain", digit_brain),
        imp("aiwo_cognitive", aiwo_cognitive),       imp("aiwo_types", aiwo_types),
        imp("aiwo_policy", aiwo_policy),             imp("aiwo_state", aiwo_state),
        imp("aiwo_directive", aiwo_directive),       imp("aiwo_fano", aiwo_fano),
    });
    depTest(b, test_step, "src/aiwo_heartbeat.zig", target, optimize, &.{
        imp("aiwo_types", aiwo_types), imp("aiwo_runtime", aiwo_runtime),
    });
    const digit_probe = b.addExecutable(.{
        .name = "spec007-digit-model-probe",
        .root_source_file = b.path("src/aiwo_digit_model_probe.zig"),
        .target = target,
        .optimize = optimize,
    });
    digit_probe.root_module.addImport("digit_model_session", digit_session);
    digit_probe.root_module.addImport("digit_onnx_weights", digit_onnx_weights);
    digit_probe.root_module.addImport("digit_qwen_embed", digit_qwen_embed);
    digit_probe.root_module.addImport("digit_fixed_point", digit_fixed);
    digit_probe.root_module.addImport("aiwo_runtime", aiwo_runtime);
    digit_probe.root_module.addImport("aiwo_types", aiwo_types);
    digit_probe.root_module.addImport("aiwo_prompt", aiwo_prompt);
    b.installArtifact(digit_probe);
    const aiwo_cli = b.addExecutable(.{
        .name = "spec007-aiwo",
        .root_source_file = b.path("src/aiwo_cli.zig"),
        .target = target,
        .optimize = optimize,
    });
    aiwo_cli.root_module.addImport("aiwo_types", aiwo_types);
    aiwo_cli.root_module.addImport("aiwo_cognitive", aiwo_cognitive);
    aiwo_cli.root_module.addImport("aiwo_chunk_checkpoint", aiwo_chunk_checkpoint);
    aiwo_cli.root_module.addImport("aiwo_dht", aiwo_dht);
    aiwo_cli.root_module.addImport("aiwo_runtime", aiwo_runtime);
    b.installArtifact(aiwo_cli);

    const perf_baseline = b.addExecutable(.{
        .name = "spec007-perf-baseline",
        .root_source_file = b.path("src/perf_baseline.zig"),
        .target = target,
        .optimize = optimize,
    });
    perf_baseline.root_module.addImport("dhtd", dhtd_module);
    b.installArtifact(perf_baseline);
    depTest(b, test_step, "src/perf_baseline.zig", target, optimize, &.{imp("dhtd", dhtd_module)});

    // ── spec007 integer harnesses (was a serial zig-test loop in
    //    publish-check — the build graph parallelizes + caches) ───────
    const spec007_harnesses = [_][]const u8{
        "src/spec007_alpha_probe.zig",
        "src/spec007_astrometric_probe.zig",
        "src/spec007_calculations.zig",
        "src/spec007_checksum_audit.zig",
        "src/spec007_ckm_probe.zig",
        "src/spec007_coincidence_probe.zig",
        "src/spec007_compute.zig",
        "src/spec007_drivetrain_calculations.zig",
        "src/spec007_dynamics_calculations.zig",
        "src/spec007_ephemeris_probe.zig",
        "src/spec007_expanded_calculations.zig",
        "src/spec007_fixedpoint_prototype.zig",
        "src/spec007_manifold_calculations.zig",
        "src/spec007_portal_probe.zig",
        "src/spec007_q_toys.zig",
        "src/spec007_verified_calculations.zig",
        "src/spec007_warp_probe.zig",
        "src/spec007_wow_shape_probe.zig",
        "src/fixed_point_q128.zig",
    };
    for (spec007_harnesses) |h| depTest(b, test_step, h, target, optimize, &.{});
}
