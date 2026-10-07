# SPEC-008: IPv6 128-Bit Flat-Routing Fabric

**Status:** Draft 0 — proposal; conformance gates unbuilt
**Scope:** A fabric-internal addressing and transport scheme in which the
IPv6 destination address *is* the lattice coordinate. The address ceases
to be a name to be looked up and becomes a position to be computed.

Normative terms (MUST/SHOULD/MAY) carry their RFC-2119 senses.

**Honest scope note.** This document is a *proposal*, classified
CONSTRUCTION by the dossier's own standard: the encoding below is
designed, not derived. Nothing here changes SPEC-007's bifurcation
invariant — all sensory traffic described is ordinary signal-channel
wire movement and pays normal wire cost.

---

## 1. The Symmetry (and Its Honest Limit)

An IPv6 address is 128 bits. The engine's fixed-point cell-label domain
is u3-valued over a 15³ cube; the fabric's fixed-point arithmetic is
Q128.128 (i256 storage: 128 integer bits + 128 fractional bits).

The "isomorphism" is a deliberate mirror, not an identity:

| IPv6 | Fabric | Match |
|---|---|---|
| 128-bit address | i256 Q128.128 | pun — width rhymes, sizes differ |
| interface identifier (low 64) | lattice coordinate + organ id | designed embedding |
| prefix (high 64) | fleet ULA + state digest | designed embedding |

The *useful* consequence is narrower and stronger than the pun: a
128-bit field is far more than enough to carry a lattice position
(12 bits), an organ selector (8 bits), and a state-binding digest
fragment (44 bits) — so the address itself can attest *where* and
*which version of the world* the packet describes.

## 2. Address Format — `SPEC008v1`

All multi-byte fields big-endian (network order). Total: 128 bits.

```
| 64 bits        | 12 bits  | 8 bits  | 44 bits          |
| fleet prefix   | (k,r,c)  | organ   | state digest     |
| fd53:5007      | 4+4+4    | id      | sha256(cell bytes)|
| ::/48          | u4 each  | u8      | fragment, low 44 |
```

- **Prefix** `fd53:5007::/48` — inside ULA `fc00::/7`; the hex reads
  `53 50 07` ("SP07"). Site-local by construction; MUST NOT route to
  the public internet.
- **Coordinate** — `khat`-domain values 1..15 packed as u4 triples.
  `k=r=c=8` is the E₀ heart.
- **Organ id** — 0=bridge, 1=k3 brain, 2=rations leg, 3=deck, 4=gov,
  5..15 reserved, 240..255 = ephemerals.
- **Digest fragment** — low 44 bits of the cell-byte sha256 of the
  emitter's lattice artifact (`9106b153…` family). A receiver whose
  own artifact hashes differently knows the sender's world-view is
  stale — version disagreement is *detectable from the address alone*.

**Route resolution is O(1):** given an address, the next hop is
computed from the address bits — coordinate → organ table → socket —
with no routing-table lookup, no ARP, no DNS inside the fabric. This
is O(1) *resolution*. Packet *delivery* still traverses real physical
hops and is not claimed faster than light or topology (UNVERIFIED
until measured on the WAN lab).

## 3. Transport Classes

| Class | Wire | Content | Note |
|---|---|---|---|
| `LATTICE-FULL` | UDP | packed cell labels | 3375 cells × u3 = 10125 b = **1266 B** |
| `LATTICE-FULL-C` | UDP | compressed cell labels | canon state measured 267 B (brotli) — OVR-02 |
| `LATTICE-LAYER` | UDP | one 15×15 slice | 225 cells × u3 = 675 b = 85 B |
| `K3-TOKEN` | UDP | u32-LE emitted ids | 4 B per generated id |
| `FABRIC-EVENT` | UDP | audit-chain entry | same bytes as the JSONL record |
| `SEED-DROP` | UDP/out-of-band | Rations token | MUST NOT replace the paper leg |

**The MTU fact.** The *raw* full lattice state (1266 B) does **not** fit
a single minimum-MTU (1280 B) IPv6 datagram: 1280 − 40 (IPv6) − 8 (UDP)
= 1232 B available. Conforming senders MUST emit raw `LATTICE-FULL` as
either two datagrams or 15 `LATTICE-LAYER` datagrams (85 B each).
Claiming single-datagram *raw* full-state delivery at minimum MTU is a
FRACTURE-class statement.

**OVR-02 amendment (prototype-verified).** The canonical lattice state
is canon-structured — its joint entropy is far below the ~3 bits/cell
marginal — and compresses losslessly to 267 B (brotli) / 299 B
(deflate), 4.6× under the min-MTU payload. `LATTICE-FULL-C` therefore
MAY carry a *canonical* state in one datagram. The compression ratio is
state-dependent, NOT guaranteed: a sender MUST fall back to the raw
multiframe path whenever the compressed form does not fit, and the
codec itself is CONSTRUCTION until specified (falsification ledger N-02
records the sealed→resurrected history).

## 4. The E₀ Multicast Heart

Organ traffic MAY also ride link-local/site multicast mapped to the
e-label ring — the φ-mapped octonion units are u3 values, eight groups:

```
ff05::e0 .. ff05::e7   (site-local scope)
```

`ff05::e0` is the E₀-heart group — the "brain feed": `k3serve` nodes
join it; lattice state changes and fabric events MAY be fanned there.
Multicast still pays wire cost per hop — the zero-wire discriminator
(`bits > 0 ∧ wire == 0`) applies unchanged: a multicast pulse is a
signal-channel event, never correlation.

## 5. Conformance Gates (the honest frontier)

| Gate | Proof required | Status |
|---|---|---|
| `addr-derive` | coord+organ+digest → address, bit-exact vector | UNBUILT |
| `route-o1` | next-hop computed in bounded ops, no table scan | **PROVEN** (`route-o1.mjs`): max 14 instrumented ops over all 3375² pairs; monotone descent verified exhaustively → ≤42 hops; 502× vs early-exit table scan. Scope: resolution only |
| `mtu-honesty` | 1266 B raw never claims one min-MTU datagram; `LATTICE-FULL-C` single-datagram only while compressed form fits | SPECIFIED (§3, amended OVR-02) |
| `staleness-detect` | digest-fragment mismatch → receiver flags | **PROVEN** (`staleness-detect.mjs`): in-sync accepted; single-cell wound, 2-cell permutation, truncation all flagged STALE; verdict position-agnostic across all 3375 receivers; 2⁻⁴⁴ collision bound — detects divergence, not forgery (auth stays with dual-anchor) |
| `wan-lab` | stream survives seeded impairment on the raw UDP wire | **PROVEN** (`spec008-wire.mjs`): 6/6 on ::1 — clean channel bit-identical; 15% drop → honest INCOMPLETE by seq gaps; reorder+dup → dedupe + bit-identical reassembly; stale fragment refused at header; LATTICE-FULL-C 299 B ≤ 1232 B single datagram alongside lawful 15-frame path; 495/500 token burst with exact seq↔payload match. Scope: tensor address as routing header — literal `fd53:5007::/48` bind is host-dependent. **WAN edge (2026-10-07)**: `qstar-llm.abrdns.com` DDNS write path verified — the on-box DynamicURL (`/usr/local/bin/qstar-dyndns-update.py`, cron */5min) updated the A record live (ns71 serving current WAN IP). IPv4 inbound remains CGNAT-blocked (T-Mobile `172.59.x` space — DDNS fixes bookkeeping, not reachability). **Real WAN key = IPv6**: digit holds global v6 `2607:fb91:3a11:bafb::/64` on wlan0; `fano-wan-gateway.mjs` binds `[::]` UDP, verifies the FNV-256 seal at the boundary, drops unsigned datagrams, forwards verified 136-B packets into the mesh (locally verified end-to-end: sealed→inbox `valid:true`, forged→dropped). **External v6 inbound: UNVERIFIED** — AAAA record pending (needs the record's own v6 DynamicURL or API creds; `ddns-update.mjs` reads `CLOUDNS_DYNURL_V6` or reuses the on-box v4 token). **DNS-bypass amendment (fleet order 2026-10-07)**: transport does not depend on public DNS — packets self-authenticate via FNV-256 seal, so the CA trust chain is decorative for the wire layer. `fleet-map.mjs` emits a probe-measured address book (digit edge `[2607:fb91:…]:9779`, sheraton v6+v4, both nodes' AP/STA) — rendezvous by measured binding, not asserted names. External checkers could not verify inbound v6 (check-host nodes can't resolve v6-literal zones; no out-of-fleet probe box) — first real external sealed datagram will close this item. **Rendezvous proven (2026-10-07)**: `fano_beacon.py` + `fano_dialect.py` (third dialect twin — Python, 3/3 golden vectors bit-exact) shipped to sheraton; sealed `FLEET-BEACON:sheraton` packet → digit's v6 edge → seal-verified → observed source `2607:fb91:…::e2b7` recorded in `rendezvous.json` → sealed `FLEET-ACK` returned. Identity is the seal; location is measured — the stun-less rendezvous model works between real machines over v6. **Relay tunnel (2026-10-07)**: `fano_relay_link.py` rides the Rations WS relay (`src/relay/server.js` — outbound-only fan-out hub): sheraton → `ws://digit:8100/ws` → sealed F1 frame → digit → UDP → node A inbox `valid:true`, and digit → relay → sheraton verified in return — **three transports, seal intact end-to-end, both peers outbound-only**. Only the relay needs a reachable address; carrier NAT becomes irrelevant wherever a hub can be hosted. Foreign/unsealed frames dropped at the F1+verify boundary |
| `mesh-edge` | S8W1 datagrams reach the ESP32 Fano_V1_6 mesh dialect byte-exact | **PROVEN — hardware-verified** (`fano-mesh-bridge.mjs`, 12 probes): 136-B firmware wire format ported and verified against its own golden vectors; spec8↔mesh coord offset (center 8→7) mapped; S8W1 tunneled in ≤62 B sealed fragments, reassembled bit-identical; seal forgery refused; live UDP IPv4-mesh/IPv6-fabric end-to-end. **M-07 on real silicon** (`FANO_NODE_IP=192.168.4.1`, node `qstar001` cell [7,7,7] phase 0): JS-built wire seals **byte-exact** under the on-device oracle (`/api/fano/seal`); corrupted-in-cover wire refused (`/api/fano/verify`); sealed packet RF-delivered over wlan1 UDP :7777 lands `valid:true` in the real inbox; forged packet stored `valid:false`; size policing asymmetric-honest — short datagrams → `plen:0xFF`, oversized → `recvfrom` truncation → seal-fail, both refused; firmware-built wire (`/api/fano/send`) verifies under the JS twin. **Field-proven additionally** (`rf-field-probe.mjs`, 10 probes on a live two-node AP): node↔node quantum comms verified bidirectionally — `qstar001`→`fano001` and back, sealed 136-B packets delivered over shared `qstar-mesh` RF and stored `valid:true` with correct phase stamps; 8-packet integrity run contiguous; burst pressure honestly ring-capped at 8; route-endpoint latency flat across hop counts (43h ≈ 12.3 ms, HTTP-dominated — per-hop decision O(1), no tables); interference oracle returns well-formed u256 amplitude. **Cluster-topology run (2026-10-07, full 10/10)**: `sheraton` (x86_64, `192.168.12.210`) delivered a sealed packet to node A's STA (`192.168.12.86:7777`) over LAN WiFi — third machine speaks the dialect end-to-end; host→STA cross-subnet path verified `valid:true`; node-initiated UDP captured at the host, seal-exact. Honest notes retained: node's `sta_ip` is last-known state (a dead association was once reported as live — staleness class, later ICMP-verified alive after LAN restore); the two-node device path traverses the shared AP (STA→AP→STA), not a raw peer link — true peer multi-hop remains `tools/mesh_test.sh`; multi-hop O(1) still needs >2 nodes |

## 6. Non-Claims

- O(1) delivery latency is NOT claimed — only O(1) resolution.
- No cryptographic security is conferred by the address format;
  signing/verification remain the existing dual-anchor discipline.
- The IPv6/Q128.128 bit-width rhyme is a design mirror, not a theorem.
