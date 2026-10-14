# Qstar-Render

Zero-dependency WebGPU rendering engine — scene/transform graph, topological render graph, Smith chart torus, E0 lattice expansion, render governor, and WGSL render/compute shaders.

## Quick Start

```bash
zig build test          # 89 tests
zig build run           # Vec3 + Mat4 + quaternion demo
```

## Usage

```zig
const render = @import("render");

// Vector math
const v = render.Vec3.new(1.0, 2.0, 3.0);
const len = render.Vec3.length(v);
const n = render.Vec3.normalize(v);

// Matrix transforms — perspective FOV is radians
const proj = render.Mat4.perspective(60.0 * std.math.pi / 180.0, 16.0/9.0, 0.1, 100.0);
const trans = render.Mat4.translation(5.0, 0.0, 0.0);
const mvp = render.Mat4.multiply(proj, trans);

// Quaternion rotation — Euler angles are radians
const q = render.Quat.fromEuler(0.0, 90.0 * std.math.pi / 180.0, 0.0);
const rot = render.Mat4.rotation(q);

// Scene graph
var scene = render.Scene.init(allocator);
defer scene.deinit();
const root = try scene.createNode(null);
const child = try scene.createNode(root);
```

## Boundary contract

- `Mat4.translate/scaled/rotate` and `Quat` helpers reject non-finite input.
- `Scene` bounds node IDs and rejects cyclic parenting before mutation.
- `RenderGraph` validates pass names/dependencies and reports topological
  cycles before traversal.
- `expandNode` validates node coordinates, expansion depth, output capacity,
  and written-cell counts before mutating the caller's output buffer.
- Lattice/torus generation uses checked integer counting and saturates shifts
  instead of overflowing on forged levels.
- The governor's surface-wait path refuses clock regressions rather than
  underflowing.
- This module is the approved f32/f64 sidecar boundary: floating-point values
  stay in transform/render state and never enter mesh wire bytes or governance
  state.

## API Reference

### Vector Math

| Function | Description |
|----------|-------------|
| `Vec3.new(x, y, z)` | Create 3D vector |
| `Vec3.add/sub(a, b)` | Vector addition/subtraction |
| `Vec3.scale(v, s)` | Scale vector |
| `Vec3.dot(a, b)` | Dot product |
| `Vec3.cross(a, b)` | Cross product |
| `Vec3.length(v)` | Vector length |
| `Vec3.normalize(v)` | Normalize non-degenerate vector |
| `Vec3.distance(a, b)` | Distance between vectors |

### Matrix Transforms

| Function | Description |
|----------|-------------|
| `Mat4.identity()` | Identity matrix |
| `Mat4.perspective(fov_rad, aspect, near, far)` | Perspective projection |
| `Mat4.translation(x, y, z)` | Translation matrix |
| `Mat4.translate(m, x, y, z)` | Transform point; rejects NaN/Inf |
| `Mat4.scaling(x, y, z)` | Scaling matrix |
| `Mat4.scaled(m, x, y, z)` | Scale point; rejects NaN/Inf |
| `Mat4.rotation(q)` | Rotation from quaternion |
| `Mat4.multiply(a, b)` | Matrix multiplication |
| `m.invert()` | Matrix inverse |

### Quaternion

| Function | Description |
|----------|-------------|
| `Quat.identity()` | Identity quaternion |
| `Quat.fromEuler(x, y, z)` | From Euler angles in radians |

### Scene and Render Graphs

| Function | Description |
|----------|-------------|
| `Scene.init(allocator)` | Create scene |
| `scene.createNode(parent)` | Create node under optional parent |
| `scene.setParent(child, parent)` | Reparent; rejects cycles/invalid IDs |
| `RenderGraph.init(allocator)` | Create render graph |
| `graph.addPass(name, deps)` | Add pass; rejects duplicate/missing deps |
| `graph.topologicalOrder(out)` | Emit valid pass order or detect cycle |

## Modules

| Module | Lines | Tests |
|--------|-------|-------|
| render.zig | 2,107 | 62 |
| fixed_point.zig | 677 | 27 |
| shaders/render.wgsl | 618 | — |
| shaders/compute.wgsl | 477 | — |

**Total: ~3,879 lines, 89 tests. Zero dependencies (std only).**

## Origin

Extracted from Qstar. Fully standalone, no dependency on Qstar at build time.
