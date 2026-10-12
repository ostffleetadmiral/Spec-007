# SPEED-AUDIT — Spec-007 speed discoveries (2026-10-11)

Documentation-only audit. Crawled this tree plus `../qstar-llm` (server,
serve step, 2026-10-11 bench sweep numbers). No code changed. Every item
lists the mechanism, the evidence path, the fix, and the honest bound.

---

## 1. The live lanes pay a node cold-start per evidence record — THE hot path

`tools/dht-fs.mjs` exports `recordPut`, `recordGet`, `recordQuery`,
`closest`, `knownLanes` and guards its CLI behind an `invoked` check
(~line 320). It was built to be imported — but every consumer spawns it
as a subprocess:

| Consumer | Site | Cost |
|---|---|---|
| `security/agentzero-watch.mjs` | `dhtRecord()` ~line 91 | `spawnSync("node", [DHT, "record", "put", ...])` **per A0 event** — every digit-a0/sheraton-a0 action or violation folded through a ~60–120ms node cold start |
| `tools/receipt-bridge.mjs` | `dhtRecord()` ~line 55 | same spawn **per sched-emit JSONL line** — a k3serve trajectory of N tokens = N cold spawns |
| `security/aiwo-service.mjs` | `dhtRecord`/`dhtChain`/`--verify` ~lines 129–262 | ~4+ node spawns **every service cycle** — corps-state, dreamstream, entropy-event, audit verify |
| `security/dht-sweep.mjs` | `run` helper ~line 53 | spawn per DHT op across the whole sweep |
| `security/team-sweep-2.mjs` | ~48 spawnSync/execSync sites | `node <tool>.mjs --verify` per probe + `node dht-fs.mjs record query` per kind (~line 3745) |

**Fix (uniform, zero semantic change):** `import { recordPut } from
"../tools/dht-fs.mjs"` — same function, same store layout, same
audit.log writes, same fleet-service ed25519 signing, same
`FANO_DHT_ROOT` resolution. ~100ms → <1ms per record. On
receipt-bridge this is `N × ~100ms → N × ~0ms`; on aiwo-service it
removes ~4 process spawns per beat.

**Bound:** `recordPut(lane, kind, name, body, clearance, lanes =
knownLanes())` — imported callers get the live lane set per call,
identical to the CLI path. No behavior change, no isolation loss (the
spawn was synchronous anyway — an in-process throw propagates exactly
like a nonzero exit code surfaced through the `status === 0` check).

---

## 2. `recordQuery` is O(lanes × records) with an ed25519 verify per record — grows forever

`tools/dht-fs.mjs:278` — `recordQuery(kind, readerClearance, lanes)`
walks every lane's `records/` directory, reads and signature-verifies
the head JSON of **every** record, then filters by kind. The Continuity
DHT accumulates a record for every A0 action, every corps beat, every
k3 receipt — so every query gets slower forever, on a curve set by
ledger growth.

**Fix (wave-2 discovery pattern — kind → record-id index, honest
fallback):** maintain `<store>/<lane>/records/kind-index.json` at
`recordPut` (append the record id under its kind). On index-write
failure the index is flagged stale and `recordQuery` falls back to the
existing full scan — degraded speed, never wrong answers. With a live
index, `recordQuery` reads the matching id list and verifies only those
heads — the verify-on-read integrity posture is preserved exactly,
scoped to the matching set. `team-sweep-2`'s `record query` calls
inherit the speedup through the CLI automatically.

---

## 3. publish-check runs ~20 serial `zig test` spawns the build graph could parallelize

`tools/publish-check.sh` — the release gate ("ALL of it, every time")
is fully serial:

- `for f in src/spec007_*.zig: zig test "$f"` — ~20 standalone zig
  compilations, each cold. `zig build test` already exists but covers
  only `deps/*` + `src/spec008_*` harnesses — the spec007_*.zig files
  are **not in the build graph** (verified: `grep spec007 build.zig`
  → zero hits).
- ~15 serial `node <tool>.mjs --verify` spawns.
- ~80 serial `node --check` spawns (js syntax gate).
- `python3 build.py` site render.

**Fix:** add the testable `src/spec007_*.zig` files to `build.zig`'s
test step via `depTest` (respecting publish-check's existing skip list —
`q128`/`compute`/`prototype` are library/mirror modules exercised via
importers) → parallel compile + zig cache makes repeat gates
near-instant. The shell loop collapses to the existing
`zig build test` line. The `node --verify` groups are independent
read-only ledger checks — publish-check only ever verifies, never
emits, so there are no ordering hazards; they parallelize with
`&`/`wait` behind a fail latch. Same for the `node --check` loop
(`xargs -P`).

---

## 4. `:11435 "ollama-qstar"` is stock Ollama — the lattice-native lane doesn't exist yet

Live state (verified 2026-10-11):

- `docker ps`: `digit-a0` (frdel/agent-zero-run) on `127.0.0.1:50081`.
- Container provider config (`/a0/tmp/settings.json`):
  - `chat_model`: `OTHER → http://host.docker.internal:11435/v1`,
    model `qwen2.5:3b`, kwargs include
    `response_format: {"type":"json_schema", "a0_tool_response"}` —
    **structured tool-call JSON required every turn**.
  - `util_model`: same endpoint/model, kwargs = timeout only —
    **no response_format**.
  - `embed_model`: `openai/nomic-embed-text-v2-moe:latest`, same endpoint.
  - `browser_model`: same endpoint/model.
- `curl :11435/api/version` → `{"version":"0.34.2"}` — **stock Ollama**,
  a second instance with its own store. `engine-manifest.json` labels
  this endpoint `ollama-qstar` with note "lattice-native inference
  sibling — qstar-llm" — **overclaimed**: nothing on :11435 is
  lattice-native today.
- qstar-llm `src/server.zig` implements the full surface
  (`/api/generate`, `/api/chat`, `/api/tags`, `/api/version`,
  `/api/embeddings`, `/v1/chat/completions`, `/v1/completions`,
  `/v1/models`, `/v1/embeddings`) and `main.zig` documents
  `qstar serve` defaulting to **port 11435** — the port was designed
  for exactly this sibling.
- Bench evidence (qstar-llm `bench_logs/20261011`): Qstar serve
  ~57.8µs TTFT vs Ollama ~331ms (~5700×); throughput ~79k tok/s vs
  ~16 tok/s (~5000×); state footprint 23.5KB vs 986MB.

**Gate:** chat + embed can't move — `json_schema` constrained decoding
and nomic-embed parity are stock-Ollama features qstar serve doesn't
implement (its `/api/embeddings` returns a 421-dim lattice-activation
vector — self-consistent but not nomic).

**Recommended shape:** keep :11435 stock Ollama for chat+embed. Run
`zig-out/bin/serve` on a **new** loopback port (e.g.
`127.0.0.1:11436`), declare it in `engine-manifest.json` as a real
`llm-upstream` (`ollama-qstar-native`, bridge-mediated, honest note:
"lattice-native, non-schema responses; util-lane provider"), extend
`LANES["digit-a0"].providers` in `agentzero-watch.mjs`, then repoint
digit-a0's `util_model_api_base` to it. Util calls (memory/summary
side-queries — the per-action latency multiplier) drop ~330ms→~58µs
TTFT, ~16→~79k tok/s. This also makes the "lattice-native sibling"
claim *true* — currently it is not.

**Bound:** repointing a monitored asset's provider is an operator
decision (Art. V.3 custody); the endpoint + manifest + watch
declaration can ship alone and the repoint applied whenever. If util
calls ever expect parseable structure, the bound is already written in
the manifest note.

---

## 5. team-sweep-2 is serial end-to-end — bounded parallelism is safe

`security/team-sweep-2.mjs` — 188-probe consolidated gate, ~48
spawnSync/execSync sites, strictly serial. The probe set is almost
entirely `--verify` re-checks against already-emitted ledgers —
independent reads, no emit→verify hazards inside the sweep itself.

**Fix:** bounded worker pool (~4 concurrent `spawn` calls) over the
independent probe invocations, keeping each probe's own subprocess
isolation (that isolation is a feature — a crashing probe can't kill
the sweep), keeping findings attributed per-probe. Inside the sweep's
own process, the `node dht-fs.mjs record query` spawns become
in-process `recordQuery` calls (item 1).

**Bound:** wall-time drops toward `max(probe)` instead of `sum(probes)`;
output interleaving is cosmetic — the ledger is per-finding.

---

## 6. Secondary / leave-alone list

- `dht-sweep.mjs` ~line 65 runs `zig build test` on the vfs dep inside
  the sweep — heavy but legitimately the probe; leave.
- `ddns-update.mjs` — 9 spawnSyncs, all network-bound (`dig`/`curl`);
  spawn overhead is noise. Leave.
- `site/build.py` — re-renders all ~30 md→html pages per publish; a
  content-hash skip would save seconds. Low priority.
- `academy-harvest`/`doc-census` — full corpus re-crawl per run
  (~34k docs); mtime-incremental possible, batch cadence makes it low
  priority.
- `admiralty-desk` (297M, node_modules-heavy) — desk is a static DOM
  app; the compute hot paths are the services above, not the shell.

## Rules observed in this audit

`spec-007.md` immutable; integer-only Zig core untouched; `security/out/`
treated as generated evidence; drawer paths cited, never contents;
no dossier/twin docs added — this file is a root-level engineering note.

## Proposed wave order (when implementation is approved)

1. `dht-fs.mjs` kind index + query fallback
2. in-process folds (watch, receipt-bridge, aiwo-service, dht-sweep)
3. team-sweep-2: import queries + bounded probe pool
4. build.zig spec007 migration + publish-check parallelization
5. `ollama-qstar-native` endpoint + manifest + LANES declaration
6. wave close: publish-check + `team-sweep-2 --emit` (wall_ms deltas
   become the evidence) → `~/.archives/spec-007-speed-wave-*`

The ledger itself measures the win — `wall_ms` is already recorded per
sweep; honest deltas, not estimates.
