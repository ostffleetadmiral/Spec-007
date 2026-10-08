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
}
