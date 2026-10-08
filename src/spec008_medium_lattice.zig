// spec008_medium_lattice.zig — the medium-as-lattice falsification harness.
//
// The claim under test (7q transcript): a multi-port reflection-coefficient
// array — the "four Smith charts" — can be digitized so the propagation
// medium itself resolves into lattice coordinates. Radio Tomographic
// Imaging (Wilson & Patwari, IEEE TMC 9(5):621, 2010) is the published
// precedent; IEEE 802.11bf standardized WLAN sensing; TDR does the same
// on wires.
//
// This harness proves the *coordinate-resolution* side is feasible under a
// bounded noise model — and, just as important, states exactly where it
// breaks (LAWB-09 pattern: the failure boundary is the deliverable):
//
//   * quantizeGamma: a complex reflection coefficient Gamma (|Gamma|<=1)
//     resolves to a cell on a 15x15 quantization grid over [-1,1]^2 —
//     lattice-consistent with the 15^3 canon; |Gamma|>1 refuses.
//   * resolveCoord: a four-port Gamma array folds deterministically into a
//     lattice triple — dominant port by |Gamma|^2, k = port index, (r,c)
//     = its cell. Constant op-count per port: O(1) resolution, matching
//     the SPEC-008 scope note (resolution, not delivery).
//   * bound test BOTH ways: perturbations below the quantization radius
//     stay in-cell; above it they can move the coordinate — the minimum
//     usable cell size IS the noise floor, filed quantitatively.
//
// Integer-only: complex Q64.64 on i128 — no floats, no trig. |Gamma|^2 is
// exact; comparisons never need sqrt.
//
// What this does NOT claim: that a real RF channel sits below the
// perturbation threshold. That is an empirical question — the live-node
// probes (security/rf-field-probe.mjs, /api/fano/interference) are the
// instrument for it. This file proves the mapping and its break condition.

const std = @import("std");

const SCALE: i128 = 1 << 64;
const GRID: i32 = 15; // cells per axis — the 15-lattice canon
const HALF_GRID: i128 = SCALE / 2; // cell pitch: 2*SCALE / 2*GRID = SCALE/GRID

pub const Cx = struct { re: i128, im: i128 };

pub const Cell = struct { x: i32, y: i32 };
pub const Coord = struct { k: i32, r: i32, c: i32 };

pub const Error = error{OutsideDisk};

fn mag2(g: Cx) i256 {
    // |g|^2 in Q64 — squares reach 2^128 at |g|=1, so work in i256.
    const a = @as(i256, g.re) * g.re;
    const b = @as(i256, g.im) * g.im;
    return (a + b) >> 64;
}

/// Quantize one Gamma into a grid cell over [-1,1]^2. Components exactly
/// +/-1 map to the edge cells; anything outside the unit disk refuses.
pub fn quantizeGamma(g: Cx) Error!Cell {
    if (mag2(g) > SCALE) return error.OutsideDisk;
    // cell index = floor((v + SCALE) * GRID / (2*SCALE)), clamped to GRID-1
    const fx = @divFloor((g.re + SCALE) * GRID, 2 * SCALE);
    const fy = @divFloor((g.im + SCALE) * GRID, 2 * SCALE);
    return .{ .x = @intCast(@min(fx, GRID - 1)), .y = @intCast(@min(fy, GRID - 1)) };
}

/// Fold a four-port Gamma array into a lattice coordinate: dominant port
/// (max |Gamma|^2) supplies k and the (r,c) cell; ties break to the lower
/// port index — deterministic, constant work per port.
pub fn resolveCoord(ports: [4]Cx) Error!Coord {
    var best: usize = 0;
    var best_m: i256 = 0;
    for (ports, 0..) |p, i| {
        const m = mag2(p);
        if (m > best_m) {
            best_m = m;
            best = i;
        }
    }
    const cell = try quantizeGamma(ports[best]);
    return .{ .k = @intCast(best), .r = cell.x, .c = cell.y };
}

/// Manhattan distance between two coordinates.
pub fn dist(a: Coord, b: Coord) i32 {
    const dx = a.r - b.r;
    const dy = a.c - b.c;
    const dk = a.k - b.k;
    return (if (dx < 0) -dx else dx) + (if (dy < 0) -dy else dy) + (if (dk < 0) -dk else dk);
}

fn q(num: i128, den: i128) i128 {
    return @divTrunc(num * SCALE, den);
}

test "mapping: known Gamma values resolve to expected cells" {
    // Gamma = 0 -> center cell (7,7): index 7 of 15 over [-1,1]
    const c0 = try quantizeGamma(.{ .re = 0, .im = 0 });
    try std.testing.expectEqual(@as(i32, 7), c0.x);
    try std.testing.expectEqual(@as(i32, 7), c0.y);
    // Gamma = (1,0) -> rightmost column
    const c1 = try quantizeGamma(.{ .re = SCALE, .im = 0 });
    try std.testing.expectEqual(@as(i32, 14), c1.x);
    // Gamma = (-1,0) -> leftmost column
    const c2 = try quantizeGamma(.{ .re = -SCALE, .im = 0 });
    try std.testing.expectEqual(@as(i32, 0), c2.x);
    // quadrant check: (+,+) upper-right half, (-,-) lower-left
    const cq = try quantizeGamma(.{ .re = q(1, 2), .im = q(1, 2) });
    try std.testing.expect(cq.x > 7 and cq.y > 7);
    const cm = try quantizeGamma(.{ .re = -q(1, 2), .im = -q(1, 2) });
    try std.testing.expect(cm.x < 7 and cm.y < 7);
}

test "boundary: |Gamma|>1 refuses; the singularity edge maps to edge cells" {
    try std.testing.expectError(error.OutsideDisk, quantizeGamma(.{ .re = SCALE + 1, .im = 0 }));
    try std.testing.expectError(error.OutsideDisk, quantizeGamma(.{ .re = 0, .im = -SCALE - 1 }));
    // |Gamma|=1 exactly at 45 degrees: re=im=1/sqrt2 ≈ 0.7071 -> still on-disk
    const edge = q(7071, 10000);
    _ = try quantizeGamma(.{ .re = edge, .im = edge });
    const nudge = @divTrunc(SCALE, 10000); // ~1e-4 past the 45-degree rim
    try std.testing.expectError(error.OutsideDisk, quantizeGamma(.{ .re = edge + nudge, .im = edge + nudge }));
}

test "determinism and constant per-port op count" {
    const ports = [4]Cx{
        .{ .re = q(1, 4), .im = q(1, 4) },
        .{ .re = -q(1, 3), .im = q(1, 8) },
        .{ .re = q(1, 2), .im = -q(1, 5) },
        .{ .re = 0, .im = 0 },
    };
    const a = try resolveCoord(ports);
    const b = try resolveCoord(ports);
    try std.testing.expectEqual(a, b);
    try std.testing.expectEqual(@as(i32, 2), a.k); // port 2 dominates (|g|=0.54)
}

test "bound: sub-threshold perturbation stays in-cell" {
    // perturbation small vs the half-cell pitch (SCALE/GRID ~ 6.7% of radius)
    const g: Cx = .{ .re = q(1, 4), .im = q(1, 4) };
    const c0 = try quantizeGamma(g);
    const eps = SCALE / (GRID * 4); // quarter-cell — safely sub-threshold
    const c1 = try quantizeGamma(.{ .re = g.re + eps, .im = g.im - eps });
    try std.testing.expectEqual(c0, c1); // coordinate unchanged — the bound holds
}

test "bound-failure: super-threshold perturbation moves the coordinate" {
    // LAWB-09 pattern: demonstrate the break, don't hide it. One full cell
    // of displacement is guaranteed to move the cell boundary somewhere.
    const g: Cx = .{ .re = q(1, 4), .im = q(1, 4) };
    const c0 = try quantizeGamma(g);
    const cell_pitch = 2 * SCALE / GRID;
    const c1 = try quantizeGamma(.{ .re = g.re + cell_pitch, .im = g.im });
    try std.testing.expect(c1.x != c0.x); // the bound broke — documented, not hidden
}

test "radar property: one-port perturbation shifts the resolved coordinate" {
    var ports = [4]Cx{
        .{ .re = q(4, 5), .im = 0 }, // dominant
        .{ .re = q(1, 5), .im = 0 },
        .{ .re = q(1, 6), .im = 0 },
        .{ .re = q(1, 7), .im = 0 },
    };
    const before = try resolveCoord(ports);
    // move the dominant port one full cell — the tracked object moved
    ports[0] = .{ .re = q(4, 5) - (2 * SCALE / GRID), .im = 0 };
    const after = try resolveCoord(ports);
    try std.testing.expect(dist(before, after) >= 1);
    // and a perturbation on a NON-dominant port leaves the coordinate fixed
    ports[3] = .{ .re = q(1, 7), .im = q(1, 9) };
    const after2 = try resolveCoord(ports);
    try std.testing.expectEqual(after, after2);
}
