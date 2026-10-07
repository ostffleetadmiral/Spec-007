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
| `route-o1` | next-hop computed in bounded ops, no table scan | **PROVEN** (`route-o1.mjs`): max 14 instrumented ops over all 3375² pairs; monotone descent verified exhaustively → ≤42 hops; 502× vs early-exit table scan. Scope: resolution only. **Remote twin verified (2026-10-07)**: Python dialect `route()` on sheraton hardware walks the full ≤42-hop path in avg 13.9 µs (max-42-hop 46.7 µs), seal verify 49.3 µs/packet — bounded per-hop work on the peer's silicon. **Live WAN leg**: `fano-wan-gateway` on digit + `fano_beacon` on sheraton → 10/10 sealed FLEET-ACK round-trips over global v6, median RTT 2.5 ms (delivery physics, not resolution). **Ring-router boundary**: `routeToPeer` (Rations `src/p2p/routing.zig`, identical in qstar-mesh) is **O(local peer degree)** — direct-match + greedy nearest scan; benched (`src/p2p/route_bench.zig`): ~0.1 µs @ 10 peers → ~0.5 ms @ 50k. Flat vs network size — a node's peer table doesn't grow with the fleet — but a super-hub carrying tens of thousands of connections pays per-decision cost; architecture question, not a routing bug |
| `mtu-honesty` | 1266 B raw never claims one min-MTU datagram; `LATTICE-FULL-C` single-datagram only while compressed form fits | SPECIFIED (§3, amended OVR-02) |
| `staleness-detect` | digest-fragment mismatch → receiver flags | **PROVEN** (`staleness-detect.mjs`): in-sync accepted; single-cell wound, 2-cell permutation, truncation all flagged STALE; verdict position-agnostic across all 3375 receivers; 2⁻⁴⁴ collision bound — detects divergence, not forgery (auth stays with dual-anchor) |
| `wan-lab` | stream survives seeded impairment on the raw UDP wire | **PROVEN** (`spec008-wire.mjs`): 6/6 on ::1 — clean channel bit-identical; 15% drop → honest INCOMPLETE by seq gaps; reorder+dup → dedupe + bit-identical reassembly; stale fragment refused at header; LATTICE-FULL-C 299 B ≤ 1232 B single datagram alongside lawful 15-frame path; 495/500 token burst with exact seq↔payload match. Scope: tensor address as routing header — literal `fd53:5007::/48` bind is host-dependent. **WAN edge (2026-10-07)**: `qstar-llm.abrdns.com` DDNS write path verified — the on-box DynamicURL (`/usr/local/bin/qstar-dyndns-update.py`, cron */5min) updated the A record live (ns71 serving current WAN IP). IPv4 inbound remains CGNAT-blocked (T-Mobile `172.59.x` space — DDNS fixes bookkeeping, not reachability). **Real WAN key = IPv6**: digit holds global v6 `2607:fb91:3a11:bafb::/64` on wlan0; `fano-wan-gateway.mjs` binds `[::]` UDP, verifies the FNV-256 seal at the boundary, drops unsigned datagrams, forwards verified 136-B packets into the mesh (locally verified end-to-end: sealed→inbox `valid:true`, forged→dropped). **External v6 inbound: UNVERIFIED** — AAAA record pending (needs the record's own v6 DynamicURL or API creds; `ddns-update.mjs` reads `CLOUDNS_DYNURL_V6` or reuses the on-box v4 token). **DNS-bypass amendment (fleet order 2026-10-07)**: transport does not depend on public DNS — packets self-authenticate via FNV-256 seal, so the CA trust chain is decorative for the wire layer. `fleet-map.mjs` emits a probe-measured address book (digit edge `[2607:fb91:…]:9779`, sheraton v6+v4, both nodes' AP/STA) — rendezvous by measured binding, not asserted names. External checkers could not verify inbound v6 (check-host nodes can't resolve v6-literal zones; no out-of-fleet probe box) — first real external sealed datagram will close this item. **Rendezvous proven (2026-10-07)**: `fano_beacon.py` + `fano_dialect.py` (third dialect twin — Python, 3/3 golden vectors bit-exact) shipped to sheraton; sealed `FLEET-BEACON:sheraton` packet → digit's v6 edge → seal-verified → observed source `2607:fb91:…::e2b7` recorded in `rendezvous.json` → sealed `FLEET-ACK` returned. Identity is the seal; location is measured — the stun-less rendezvous model works between real machines over v6. **Relay tunnel (2026-10-07)**: `fano_relay_link.py` rides the Rations WS relay (`src/relay/server.js` — outbound-only fan-out hub): sheraton → `ws://digit:8100/ws` → sealed F1 frame → digit → UDP → node A inbox `valid:true`, and digit → relay → sheraton verified in return — **three transports, seal intact end-to-end, both peers outbound-only**. Only the relay needs a reachable address; carrier NAT becomes irrelevant wherever a hub can be hosted. Foreign/unsealed frames dropped at the F1+verify boundary. **Bulletin board (2026-10-07)**: `fleet-manifest.mjs` + `fleet_bootstrap.py` — ed25519-signed fleet manifest published via git push to the public repo, fetched by peers over `raw.githubusercontent.com` (globally replicated HTTPS — no server of ours, carrier-unblockable). sheraton fetched digit's current v6 binding, verified the signature against the pinned fleet pubkey, and populated rendezvous — the third rendezvous layer (mesh RF → sealed beacon → public bulletin). **Genesis trust root (2026-10-07)**: `fleet-genesis.json` — digit+sheraton dual-signed (2-of-2 ed25519) declaring the fleet's trust anchor: both pubkeys embedded, dialect contract sha256, SPEC-007 baseline sha256, quorum rule. `fleet_bootstrap.py` fetches genesis from the board, self-verifies all member sigs, TOFU-pins it locally, then requires every manifest to cite the pinned genesis AND be signed by a genesis member — proven live on sheraton (signer `digit`, 2/2 sigs, rendezvous populated). Board tampering → GENESIS CONFLICT or signer-rejection, fail-loud. Operational note: raw.githubusercontent CDN serves stale copies for minutes — bootstrap retries staleness before judging |
| `mesh-edge` | S8W1 datagrams reach the ESP32 Fano_V1_6 mesh dialect byte-exact | **PROVEN — hardware-verified** (`fano-mesh-bridge.mjs`, 12 probes): 136-B firmware wire format ported and verified against its own golden vectors; spec8↔mesh coord offset (center 8→7) mapped; S8W1 tunneled in ≤62 B sealed fragments, reassembled bit-identical; seal forgery refused; live UDP IPv4-mesh/IPv6-fabric end-to-end. **M-07 on real silicon** (`FANO_NODE_IP=192.168.4.1`, node `qstar001` cell [7,7,7] phase 0): JS-built wire seals **byte-exact** under the on-device oracle (`/api/fano/seal`); corrupted-in-cover wire refused (`/api/fano/verify`); sealed packet RF-delivered over wlan1 UDP :7777 lands `valid:true` in the real inbox; forged packet stored `valid:false`; size policing asymmetric-honest — short datagrams → `plen:0xFF`, oversized → `recvfrom` truncation → seal-fail, both refused; firmware-built wire (`/api/fano/send`) verifies under the JS twin. **Field-proven additionally** (`rf-field-probe.mjs`, 10 probes on a live two-node AP): node↔node quantum comms verified bidirectionally — `qstar001`→`fano001` and back, sealed 136-B packets delivered over shared `qstar-mesh` RF and stored `valid:true` with correct phase stamps; 8-packet integrity run contiguous; burst pressure honestly ring-capped at 8; route-endpoint latency flat across hop counts (43h ≈ 12.3 ms, HTTP-dominated — per-hop decision O(1), no tables); interference oracle returns well-formed u256 amplitude. **Cluster-topology run (2026-10-07, full 10/10)**: `sheraton` (x86_64, `192.168.12.210`) delivered a sealed packet to node A's STA (`192.168.12.86:7777`) over LAN WiFi — third machine speaks the dialect end-to-end; host→STA cross-subnet path verified `valid:true`; node-initiated UDP captured at the host, seal-exact. Honest notes retained: node's `sta_ip` is last-known state (a dead association was once reported as live — staleness class, later ICMP-verified alive after LAN restore); the two-node device path traverses the shared AP (STA→AP→STA), not a raw peer link — true peer multi-hop remains `tools/mesh_test.sh`; multi-hop O(1) still needs >2 nodes |

| `sentinel-sweep` | adversarial sweep of the public trust chain | **9 HELD + 1 NOTED** (`sentinel-sweep.mjs`, 10 probes against a live hostile board): cold-boot under a fully hostile board accepts a self-consistent attacker genesis — TOFU property, recorded NOTED (first-boot trust is whoever the board serves; defense = out-of-band pin shipping); pinned genesis refuses a foreign-but-valid genesis (GENESIS CONFLICT); non-genesis signer refused; replayed valid-sig manifest with 2020 ts **was** accepted → fixed: bootstrap now enforces a 168 h freshness horizon (`FLEET_MANIFEST_MAX_AGE_H`), warns past 24 h, rejects future-dated manifests beyond 24 h skew; gateway under 206-datagram flood — every forwarded datagram seal-verifies, zero covered-forgeries leaked, process alive; JS↔Python canon byte-match under unicode/escape/nesting stress; zero PEM private keys in the committed tree; 5 download artifacts hash-pinned inside the signed manifest; gh-pages fano.wasm bit-identical to the audited artifact; non-descending manifests retried (CDN staleness) then refused |
| `capstone-audit` | full-override sweep: twin parity, seal boundary, routing, genesis, public artifacts | **PROVEN** (`capstone-audit.mjs`, 25/25): A — C golden vectors verify under all four twins (C/JS/Python/Zig→WASM); identical build inputs produce **136/136 bit-exact** wire across JS↔Python and JS↔WASM. B — per-byte forgery sweep rejects every covered byte (86/86); wrong-size datagrams rejected (JS `verify` hardened to `len==136`, closing a parity gap vs the Python twin and firmware); seal computation mutates no input. Boundary finding, recorded honestly: the payload tail (`40+plen..104`) is **unauthenticated scratch by contract** — the seal covers header + `plen` payload bytes only; receivers must honor `plen`. C — per-hop route decision cost flat vs hop count; route enumeration is linear in hops (O(1) refers to the decision, never the walk); newest-8 ring retention verified under 24-burst. D — `fleet-genesis.json` dual-sig verified (digit+sheraton), manifest cites the pinned genesis hash, signer resolves to genesis member `digit`; tampered genesis and foreign-payload signatures rejected. E — `fano.wasm` bit-identical to the reproducible `zig build wasm` artifact; quine page + downloads serve; gh-pages branch on remote; classified tripwire clean. Deployment caveat: GitHub Pages must be enabled once in repo settings (Source → gh-pages) — the branch is staged, the toggle is the owner's click |
| `reset-doctrine` | flag-seat reset governance | **ENFORCED** (`fano-reset.js` + `admiralty-reset-token.mjs`): the flag desk is identified cryptographically — desk founding `pk_sha256` (raw 32-byte key hash, matching `fano-auth`'s stored form) matched against the `admiral` member's embedded pubkey in published genesis; the seat is the key, not the callsign. Guard modes: cluster-origin flag desk resets unilaterally (the sovereign cluster is the doctrine's exception); public-origin flag desk requires a `FANO-RESET-v1` token carrying EVERY genesis member's ed25519 sig over the canonical body — unanimous or refused; ordinary desks reset freely (no false lockout). Token bound to founding callsign and a 24 h decay window. Live dual-signed token minted (digit local + sheraton via ssh, private keys never travel) and verified end-to-end |
| `team-sweep-2` | consolidated RED/BLUE/BLACK/GRAY/COMM + SPEC-004 sweep | **31 HELD + 3 NOTED, 0 OPEN** (`team-sweep-2.mjs`, 34 probes): RED — forged/partial/stale/tampered Admiralty reset votes all refused; vote bound to founding callsign + 24 h decay (hardenings the sweep itself drove); guard modes verified per-origin. BLUE — desk server refuses PUT/DELETE/TRACE/PROPFIND, traversal 404, no dir listing, CSP/nosniff/frame headers on the reset surface. BLACK — wasm bit-identity vs build source; 5 manifest artifact pins live-verify; 133/133 site files bit-identical on gh-pages; zero key material in full git history. GRAY — self-issued flag certs and roster injection are desk-local theater (roster + published keys gate everything fleet-facing); forged flag appearance only locks the forger's own desk; unlocked-session `sk` exposure recorded as residual. COMM — envelope integrity under the Python twin; JS strict-len verify holds; vote canon byte-identical JS↔Python. DESK — roaming flag sign-in proven end-to-end: a `FANO-ROOT-v1` roaming authenticator (unbound, `sub:null`, minted in 7q → ROAMING PAPER) enrolls `ramsey 006` as FLEET-ADMIRAL on a foreign *founded* desk without claiming its founding — anchored by the fleet `admiral` member in published genesis (`bindFleetFlag`), never by desk-local rosters; attacker-issued authenticator refused; `FANO-DESK-v1` transfer roundtrip carries record+founding with the keystore still wrapped; post-sign tamper and foreign-genesis forgery both refused. SPEC004 — drawer never shipped (HEAD/gh-pages/history clean); 133 deployed files surname-clean; `SPEC-004-REGISTRY` sealed inside the drawer; 4 declassified copies surname-clean; drawer restored intact post-incident. **Incident recorded honestly**: the legacy gh-pages sync pattern (`git rm -rf` on the shared tree) committed the drawer to the public branch (commit `2476a50`, live for minutes) — remediated by a force-pushed clean rebuild; deploy is now `tools/deploy-pages.sh` (detached worktree — never touches the live checkout, the gitignore'd drawer, or serve.py's cwd). The leaky commit is unreachable on every ref; GitHub-side object GC timing is outside fleet control — drawer contents had a public exposure window and are treated accordingly |
| `qstar-deps` | exploit the eight vendored qstar-llm libraries (`deps/qstar-*`, pinned 2026-10-07) under `zig build test` — 799 dep tests + 41 harness assertions green | **EXPLOITED** (`src/spec008_qstar_{escrow,carriage,fleet,archive,mesh}.zig`): ESCROW — Shamir over the 32-B flag seed: 3-of-3 unanimous reconstruction byte-exact (mirrors the Admiralty reset-vote), 2-of-3 quorum covers a dark seat, lone share refuses; foreign-share forgery is caught by a sha256 commitment (Shamir itself carries no integrity tag). CARRIAGE — the 136-B envelope round-trips byte-exact through QR, OPTAR, audio, cassette, stega, polyglot-JAR, LoRa, and the ESP32 maypole WiFi↔LoRa bridge (oversize honestly refused at LORA_MTU=255; misaddressed frames refused `NotForUs`); paperback emits real 2-of-3 Shamir shares and a dropped page still recovers; a 2 KB desk token survives the JAR container. FLEET — canonical 25-E0 BootstrapSeed is deterministic, checksum-valid, all nodes inside 15³, serialize/tamper-verify clean; FaceQR derivation axis-stable; PoLW (sha256 over seed‖nonce‖E0-lattice mix) solves+verifies, forged/wrong-seed proofs refused; Möbius merge resolves cell-edit conflicts (lww, e-value priority, boundary twist); NAT taxonomy matrix honest. ARCHIVE — cell atomization byte-exact (6 portals/cell), full-lattice 3375→20250 portals, recursive QR nest round-trips 8 KB, RMSY container round-trips desk state, LatticePage serialize/pin/evict, agent-state save/load over 421-node pages, fleet node registry heartbeat liveness. MESH — p2p `Location` is u128 (integer, same width class as the SPEC-008 cell address) with symmetric ring distance; `PeerId` is [32]u8 (pk-hash width); real XChaCha20-Poly1305 seals the envelope (tamper + wrong-key refused); relay delivers/forwards/drops correctly, TTL-16 bounds the walk; empty peer table drops honestly. **Dep defects found and routed around, recorded honestly**: `entangle.rsEncode` parity is XOR-sum (g_p·⊕data), not Vandermonde RS — exactly one data erasure recoverable, implemented as `xorRecover` in the escrow harness; `entangle.rsReconstruct` emits a column-major transpose and is unusable (upstream ships no round-trip test) — replaced by `reassemble`; `transport_paperback.decode` requires the full 3-share container — threshold recovery is latent in the layout, proven via public `shamirReconstruct`; `compress` README config fields are stale (`use_gzip`/`use_lattice`/`use_tq` do not exist — actual: `lattice_level/use_dedup/qubit_config/use_turboquant/tq_bits`); `capacity()` registry slots return constants, not byte capacities. **f64 boundary**: `mesh.Location` ring, `merge` activation, `SeedNode.activation`, and all of `qstar-render` are f32/f64 internals consumed as sidecar semantics — they never enter wire bytes, hashes, or governance |

## 6. Non-Claims

- O(1) delivery latency is NOT claimed — only O(1) resolution.
- The O(1) bound applies to lattice *resolution*; the ring routers
  (`routeToPeer` in Rations and qstar-mesh) are O(local peer degree) —
  direct-match + greedy scans over the node's own connection table.
- No cryptographic security is conferred by the address format;
  signing/verification remain the existing dual-anchor discipline.
- The IPv6/Q128.128 bit-width rhyme is a design mirror, not a theorem.
- The 136-byte wire's payload tail (`40+plen..104`) is unauthenticated
  scratch space — the seal covers the header and `plen` payload bytes.
  Receivers MUST read only `plen` bytes; padding is don't-care.
- "Wasm64" in fleet comms refers to the dialect artifact's name, not a
  64-bit WASM target — `fano.wasm` is a verified wasm32 module (the only
  target Zig currently emits for this codebase).
