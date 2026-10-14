# Qstar-Quantum

Quantum computing simulation + cryptography — quantum gates, Grover search, DLCZ entanglement, Reed-Solomon, Shamir secret sharing, 3D DFT, metasurface transforms, RF fingerprinting. All integer-only.

## Quick Start

```bash
zig build test          # 135 tests
zig build run           # quantum gates + Bell state + Grover search demo
```

## Usage

```zig
const quantum = @import("quantum");

// Create 2-qubit state
var state = try quantum.QuantumState.init(allocator, 2);
defer state.deinit();

// Apply gates
quantum.applyHadamard(&state, 0);  // Superposition
quantum.applyCNOT(&state, 0, 1);   // Bell state

// Measure
var rng = std.Random.DefaultPrng.init(42);
const result = state.measure(&rng);
```

## API Reference

### Quantum (`quantum.zig`)

| Function | Description |
|----------|-------------|
| `QuantumState.init(allocator, num_qubits)` | Create quantum state |
| `applyHadamard(state, target)` | Apply Hadamard gate |
| `applyCNOT(state, control, target)` | Apply CNOT gate |
| `applyPauliX/Y/Z(state, target)` | Apply Pauli gates |
| `applyPhase(state, target, theta)` | Apply phase gate |
| `applySWAP(state, a, b)` | Apply SWAP gate |
| `state.normalize()` | Normalize amplitudes |
| `state.measure(rng)` | Measure (collapse) |
| `state.totalProbability()` | Get total probability |

### Entangle (`entangle.zig`)

| Function | Description |
|----------|-------------|
| `rsEncode(allocator, config, data)` | Vandermonde RS encode; checked config and OOM-clean shard allocation |
| `rsReconstruct(allocator, config, shards, present)` | Erasure reconstruction; exact shard/present shape and uniform shard length |
| `shamirSplit(allocator, secret, n, k)` | Shamir split; OOM-clean initialized shares |
| `shamirRecover(allocator, shares, n)` | Recover secret; rejects duplicate/zero coordinates and length drift |
| `dlczEntangle(...)` | DLCZ entanglement protocol |

### Holographic (`holographic.zig`)

| Function | Description |
|----------|-------------|
| `latticeFFT(allocator, input, level)` | 3D DFT |
| `latticeIFFT(allocator, input, level)` | Inverse 3D DFT |
| `latticeConvolution(...)` | Lattice convolution |
| `metasurfaceTransform(...)` | Metasurface transform |
| `holographicEncode(...)` | Encode data holographically |
| `holographicDecode(allocator, encoded)` | Decode holographic data |
| `rfFingerprint(...)` | 128-dim RF fingerprint |

## Modules

| Module | Lines | Tests |
|--------|-------|-------|
| quantum.zig | 1,272 | 37 |
| entangle.zig | 1,427 | 39 |
| holographic.zig | 1,065 | 32 |
| fixed_point.zig | 677 | 27 |

**Total: ~4,441 lines, 135 tests. Zero dependencies (std only).**

## Origin

Extracted from Qstar. Fully standalone, no dependency on Qstar at build time.
