# Qstar-Mesh

P2P mesh networking stack — connection management with lattice location routing, interest synchronization, topology maintenance, phase locking, swarm fusion, TLS encryption (XChaCha20-Poly1305), multi-hop relay, peer discovery.

## Quick Start

```bash
zig build test          # 171 tests
zig build run           # connection manager + peer discovery + location demo
```

## Usage

```zig
const mesh = @import("mesh");
const p2p = @import("p2p_types");
const relay_router = @import("relay_router");

// Connection manager
var cm = mesh.ConnectionManager.init(allocator, location, 25, 200, false);
defer cm.deinit();
const conn_id = (try cm.connect("203.0.113.7:9000", peer_location, now_ms)).?;
try cm.markEstablished(conn_id);
try stdout.print("Connections: {d}\n", .{cm.connectionCount()});

// Peer manager — bounded, fallible peer table
var pm = p2p.PeerManager.init(allocator);
defer pm.deinit();
const admitted = try pm.addPeer(peer_id, location, conn_id);
if (!admitted) return error.PeerTableFull;

// Relay router shares the live peer table
var router = relay_router.RelayRouter.init(allocator, own_id, own_location, &pm);
const packet = try router.buildRelayPacket(allocator, target_id, .data, payload);
defer allocator.free(packet);
```

## Boundary contract

- `PeerManager` is heap-owned by `MeshPeer` so `RelayRouter` never retains a
  stack-lifetime peer table.
- `PeerManager.addPeer` returns `!bool`: `false` means the bounded table is
  full; allocation failure propagates.
- Wire enum bytes are validated before `@enumFromInt`; relay frames require the
  declared inner length to match the packet exactly.
- Relay TTL and hop count are bounded by `MAX_RELAY_TTL = 16`; message and
  relay payload lengths are bounded by `MAX_RELAY_PAYLOAD_BYTES = 8192`.
- `encryptMessage`/`decryptMessage` validate output capacity and use checked
  plaintext-plus-tag arithmetic.
- `SharedFace` synchronization frames are exactly 225 Q32.32 cells; delta index
  and vector lengths are validated before mutation.
- `mesh.Location`, phase locking, and sensor fusion are f64 sidecar lanes.
  Wire identities, locations, and payloads remain integer bytes/u128.

## API Reference

### Mesh (`mesh.zig`)

| Function | Description |
|----------|-------------|
| `Location.new(v)` | Create canonical lattice location |
| `Location.distance(other)` | Distance to another location |
| `ConnectionManager.init(allocator, loc, min, max, gateway)` | Create connection manager |
| `cm.connect(addr, loc, now_ms)` | Add pending connection; returns `!?u64` |
| `cm.markEstablished(id)` | Complete pending connection; errors on invalid state |
| `cm.prune(id)` | Remove connection |
| `cm.connectionCount()` | Get established connection count |
| `cm.isBelowMin()` | Check if below minimum connections |
| `cm.isAtMax()` | Check if at maximum connections |
| `SharedFace.setLocalStates(frame)` | Install exact 225-cell local frame |
| `SharedFace.applyDelta(indices, values)` | Apply validated remote delta |
| `SharedFace.serializeFull(out)` | Write exact 1800-byte state frame |

### P2P Types (`p2p_types.zig`)

| Type | Description |
|------|-------------|
| `PeerId` | 32-byte peer identifier |
| `Location` | u128 lattice location |
| `Peer` | Peer with distance, state, connection |
| `PeerManager` | Bounded peer tracking and discovery |
| `MAX_RELAY_TTL` | Relay TTL bound (`16`) |
| `MAX_RELAY_PAYLOAD_BYTES` | Wire payload bound (`8192`) |
| `AEAD_TAG_SIZE` | XChaCha20-Poly1305 tag length (`16`) |

| Function | Description |
|----------|-------------|
| `PeerManager.init(allocator)` | Create peer manager |
| `pm.addPeer(id, location, conn_id)` | Add/update peer; returns `!bool` |
| `pm.removePeer(conn_id)` | Remove peer by connection |
| `pm.getById(id)` | Find peer by ID |
| `pm.allPeers()` | Get all peers |

### Relay Router (`relay_router.zig`)

| Function | Description |
|----------|-------------|
| `RelayRouter.init(allocator, own_id, location, peers)` | Create relay router |
| `router.handleRelayRoute(payload)` | Deliver, forward, or drop relay packet |
| `router.handleRendezvousReq(sender, payload)` | Handle exact 32-byte rendezvous request |
| `router.handleRendezvousRes(conn_id, payload)` | Register validated rendezvous response |
| `router.buildRelayPacket(...)` | Build relay packet |
| `router.freeForwardPayload(payload)` | Free owned forwarded packet |
| `router.nextHopForTarget(target_id, exclude)` | Get next hop |

## Modules

| Module | Lines | Tests |
|--------|-------|-------|
| mesh.zig | 2,144 | 68 |
| p2p_types.zig | 989 | 40 |
| relay_router.zig | 839 | 25 |
| mesh_peer.zig | 797 | 8 |
| fixed_point.zig | 725 | 30 |

**Total: 5,494 lines, 171 tests. Zero dependencies (std only).**

## Origin

Extracted from Qstar. Fully standalone, no dependency on Qstar at build time.
