# FANO-1 Operations Manual — Workstation & Fleet Canon

**Status:** IN EFFECT · **Date:** 2026-10-07
**Scope:** everything the desk does that is not written down anywhere else — identity, roaming, transfer, reset, the Electron workstation, fleet canon, and the sweep runbook. Where this doc and a sweep disagree, the sweep wins; file the doc patch, not an excuse.

---

## 1. Identity

- **Keypair:** Ed25519, expanded from a 32-byte seed. `sha256(pk)` is your
  fingerprint everywhere — genesis hints, roster entries, covenant lines.
- **Keystore:** the seed is wrapped by AES-256-GCM under a key derived from
  your passphrase via PBKDF2. The unwrapped `session.sk` exists only in page
  memory for the duration of the unlocked session — reload = re-unlock by
  design (see Limits).
- **TOTP:** RFC6238 second factor (Google-Authenticator-class). Optional at
  enrollment; once set, required. Clock-bound; the secret is shown exactly
  once during setup.
- **Unlock throttle:** persisted exponential backoff
  (`fano1.auth.fail`) across reloads. Depth, not a wall — a local attacker can
  wipe localStorage; the throttle defends the honest path.
- **Covenant:** enrollment proves pk continuity and signs the founding
  covenant; the desk's founding is a hash-committed fact, not a UI label.
- **Founding ≠ flag rank.** The first enrollment on an unfounded desk
  writes the genesis record — but FLEET-ADMIRAL comes only from the
  pinned callsign (`ramsey 006`) claiming genesis, or a fleet-anchored
  grant (roaming). Any other first enrollment founds the desk as a
  **CADET** (the base tier — what the code still calls `field_agent`).
  A fresh desk is a recruit, not an admiralty. Before 2026-10-07 any
  first enrollment self-anointed FLEET-ADMIRAL (found-and-fixed defect:
  a `marcus` signup on the public deployment took the flag seat;
  DESK-06/07 now hold the boundary). Elevation enters only by grant
  from a rostered STATION-CHIEF+ issuer or the fleet anchor — never by
  being first through the door.
- **OSTF offices are posts, not names.** The Strategic Command seats —
  council titles (vice/rear admiral offices, commodore of ethics and
  equity, admiral of financial operations), advisory authorities
  (lead technical systems architect, lead security and fabrication
  officer, chief warrant officer, research lead), chief-of offices, and
  every rank-prefixed callsign (`admiral <name>`, `captain <name>`,
  `commander …`) — sit on the watch list: enrollment refuses them
  without a grant token from a STATION-CHIEF+ issuer. A granted office
  still lands as a CADET — **a title is a name, not a clearance**
  (DESK-08/09 hold both sides; the grant claims the seat once).
- **Positions are applied for, not claimed.** Duty inside the OSTF
  goes through the branch chain: `request-branch <division>` signs a
  FANO-BRANCH-REQ-v1 with the applicant's own key → the token travels
  any channel → the Fleet Admiral approves or denies in the Command
  suite → approval mints a signed FANO-BRANCH-v1 cert. `branchOf`
  verifies signature + rostered issuer + expiry. Callsign grants name
  the officer; branch certs seat the office.
- **Bots are cadets in containment.** `detectAutomation()` flags
  automation-shaped enrollments (webdriver, selenium/phantom/cdc_
  globals, headless/bot UA as strong signals; missing languages,
  plugins, or human entropy as weak pairs). A flagged identity pins to
  CADET and stamps `rec.contained` — even a bot claiming the pinned
  callsign lands cadet. Contained sessions are sealed from every
  privilege gate (grants, credentials, roaming, branch, roster, TOTP,
  export), the wire (connect/presence/send/invite), and the governed
  bridge; the desk boots academy.os only. Release is human
  adjudication: a STATION-CHIEF+ or the fleet flag signs a
  `FANO-CONTAIN-v1` promotion paper bound to the subject pk — the
  contained desk presents it via `promotion <token>` or the notice
  field. The Command suite's CONTAINMENT panel lists every flag with
  its evidence. Detection is heuristic — it gates desk privileges, it
  is not a proof of humanity; false-positive humans get the same
  adjudication path. The WAN edge logs bad-seal and machine-rate
  sources to `bot-ledger.json` as evidence, never silent drops.

## 2. Origins

One origin = one device under the doctrine. `localhost` and `::1` bounce to
`127.0.0.1` — the canonical host — so a store can never silently fork across
loopback spellings.

| Origin | Desk |
|---|---|
| `http://127.0.0.1:8080` | Browser desk (served by `tools/serve.py`) |
| `http://127.0.0.1:8901` | Electron Admiralty Desk (embedded server, `persist:admiralty` partition) |
| `http://127.0.0.1:8902` | Hardened test desk used by the KALI surface probes |

The browser desk and the Electron desk are **different devices** even on the
same machine. Records do not sync; they move by desk transfer (§4) or are
re-enrolled.

## 3. Roaming — FANO-ROOT-v1

Two instruments, signed `FANO-ROOT-v1` grants verified against an issuer key:

| Instrument | `sub` | Lifetime | Use |
|---|---|---|---|
| **Bound authenticator** | your pk hex | 365 days | A second desk you own — only *your* key can claim it |
| **ROAMING PAPER** | `null` (unbound) | 30 days | Any desk on the fleet — enroll as you without founding it |

Roaming paper is minted at `7q` → FLAG AUTHENTICATOR → **ROAMING PAPER** by
the pinned flag seat only (`fleet_admiral` role required). To enroll on a
foreign desk: covenant → enroll `ramsey 006` → paste the paper into the
**grant token** field. The desk calls `bindFleetFlag`, resolves the
`admiral`/`flag-seat` member in published `fleet-genesis.json`, and verifies
the grant signature against that public key. You land as FLEET-ADMIRAL; the
host desk's founding is untouched.

**Bearer-instrument warning — read this once:** `sub:null` means whoever
holds the paper holds the seat. A roaming paper in an inbox, a screenshot, a
clipboard history is a flag seat with legs. Mint it, use it, let it die.
Thirty days is the leash.

### 3a. Trust internals — what the desk verifies (wave-2 retro-pass)

The cert and grant machinery was unwound component-by-component; these
invariants now hold and are probed (AUTH-01..09):

- **Role bound.** `verifyCert` refuses any cert whose role isn't an
  integer in `0..5` — a perfectly signed `role:99` dies at the bound,
  signature notwithstanding (AUTH-02).
- **Flag trust derives, it isn't stored.** An elevated cert on the
  pinned callsign requires the stored grant to *re-verify* at unlock —
  roster-or-fleet issuer, live expiry, unrevoked. The old code trusted a
  persisted `_fleet` marker that the `importGrant` path never wrote
  (AUTH-08).
- **Claims don't touch the signature.** `claimGrant` records
  `g.claimed` instead of rewriting `g.sub` — the old rewrite
  invalidated roaming-grant signatures post-claim. `verifyGrant`
  accepts the legacy representation by re-verifying the unbound body
  (AUTH-08 proves the new path; COMM-19/20/21 hold the lifecycle).
- **Roster mutation is privileged.** `addIssuer`/`removeIssuer`
  require a STATION-CHIEF+ session — the ungated API path let any
  session roster a self-minted cert's issuer. The founding key can't be
  removed (AUTH-01, AUTH-06). Genesis seeding, legacy unlock, and desk
  import use the internal raw path.
- **Dead paper sweeps itself.** `grants()` prunes expired entries on
  read — a lapsed roaming paper lapses the seat it anchored (AUTH-03).
- **Revocation exists.** `revokeCallsign` (STATION-CHIEF+, Command
  suite REVOKE) records the rescission; the grant stays filed as
  evidence but `verifyGrant`/`checkCallsign` refuse it. Desk-local and
  permanent (AUTH-04).
- **TOTP shares the throttle.** Wrong six-digit codes bump the same
  counter as bad passphrases — five misses lock (AUTH-05).
- **Secrets die at lock.** `lock()` zero-fills the unwrapped seed
  before clearing the session; `burn()` locks first, then resets the
  throttle counter for the next life (AUTH-07). Keystore stays
  PBKDF2×100k + AES-GCM — no change.

### 3b. Wire internals — what comms.os verifies (wave-3 retro-pass)

`fano-comms.js` got the same unwind; these invariants now hold and are
probed (WIRE-01..07):

- **Reported lengths are clamped.** Every WASM output read caps `n`
  at the buffer it fills — an oversized `n` can no longer pull
  adjacent heap into a decoded string (WIRE-01).
- **The dialer is ws/wss only.** `connect` refuses every other scheme
  plus short/non-hex peer ids before WASM is touched; the same
  `pkOf` 64-hex gate fronts `addContact`, `sendMsg`, and the invite
  network id (WIRE-02, WIRE-06).
- **Invites were dead — now they're realigned.** The old call passed
  a phantom `network_id_len` into `rations_invite_create`, shifting
  every later argument (and passing `u64` expiry as a Number — the
  WASM ABI wants BigInt). The signature is correct now, and the role
  field is the network enum `0=admin 1=moderator 2=user`, not desk
  clearance: issuance needs STATION-CHIEF+, and admin invites are
  flag-seat only (WIRE-03).
- **Presence can't borrow a rank.** Unsigned presence text stops
  being a contact name when it's pinned or restricted — a peer
  calling itself "fleet admiral" renders as `peer-<id>` (WIRE-04).
- **Shamir bounds exist.** k/n/secret/share-set caps refuse absurd
  allocations before the GF(256) work starts (WIRE-05).
- **No `prompt()` anywhere.** MSG composes inline — the Electron desk
  has no native dialogs to throw (WIRE-07).

### 3c. Desk internals — what the glass renders (wave-4 retro-pass)

`fano-desktop.js`/`fano-reset.js`/`fano-i18n.js` unwound the same way
(DESK-10..15):

- **The desk renders entities, not markup.** Every dynamic string
  reaching `innerHTML` passes `esc()` — window titles, the unlock
  ident block, folder rows, icon labels. A callsign carrying tags
  displays as text (DESK-10).
- **The burn sweeps the whole ledger.** The reset census covers all
  16 `fano1.*` keys the desk writes — containment, revocations,
  branch ledgers, the throttle counter, directives, desk save, lang
  pref. One adjudication, no orphans (DESK-11).
- **The twins are exact.** 160 i18n keys each side, probe-enforced —
  a dead key is a merge fault, not a translation (DESK-12).
- **The academy count is honest.** 530 claimed = 530 filed, every
  lesson fully formed; the pane verifies the count against the array
  and says so when they disagree (DESK-13).
- **Verdicts arm before they fire.** Containment BURN is a two-click
  act (DESK-14); the whole desk carries zero native dialogs — every
  confirmation is a DOM widget (DESK-15).

### 3d. Livery & language — what the desk passes (wave-5 retro-pass)

`fano-desktop.css`/`dossier.css`/`fano-i18n.js` unwound next
(DESK-16..20):

- **Every livery clears AA.** All five palettes measure ≥4.5:1 ink
  contrast (worst now 4.66); `desk-dim` and WHITEHALL's accent were
  below and have been retuned (DESK-16).
- **Motion is a courtesy.** `prefers-reduced-motion` stills the
  spinning plane, boot fade, and every transition (DESK-17).
- **The file prints like paper.** `@media print` strips nav,
  watermark, taskbar and icons; dossier pages keep break discipline
  (DESK-18).
- **Narrow desks stay desks.** Under 50rem the chart table wraps,
  status LEDs cede the taskbar, the start menu clamps to 92vw
  (DESK-19).
- **The desk speaks both tongues.** ~200 chrome literals — toasts,
  suite sections, POST lines, manual, sysmon, achievements, eggs —
  route through `t()`; dictionaries hold 356 keys per side, exact
  parity (DESK-20). Residual: the terminal command corpus and
  ANOMALY_LORE remain EN-canon pending the twin audit.

### 3e. Wire internals — what the core refuses (wave-6 retro-pass)

`deps/qstar-transport` and the `src/spec008_*` harnesses unwound
(ZIG-01..03):

- **The paperback decoder is memory-safe under OOM.** Share bodies
  free only what was filled — the old `defer` outran the data and
  touched undefined slots.
- **Crafted shares refuse.** Duplicate x-coords and zero-x shares
  hit `InvalidShare`; mismatched y lengths hit `MismatchedShares` —
  Lagrange denominators can no longer divide by zero silently
  (ZIG-02).
- **Every decoder survives the mutation battery.** 288 seeded
  truncations and corruptions across QR, audio, paperback, stega,
  and polyglot — errors or clean decodes, never a panic or leak
  (ZIG-03).
- **The core stays integer-only.** `src/*.zig` holds zero
  unannotated float; render/mesh f32 reads are marked sidecar
  boundary assertions (ZIG-01).

### 3f. The battery itself — what the sweeps now prove (wave-7 retro-pass)

The probe infrastructure unwound this wave; the battery now
audits its own evidence:

- **Absent service ≠ defect.** A refused socket marks the probe
  NOTED (deferred) across `suite.mjs`'s eight relay/edge catches;
  only genuine harness breakage reports ERROR.
- **The flag seat is singular.** `bindFleetFlag` counts distinct
  flag-seat keys in the genesis document — two claimants refuse
  to bind at all (SENT-14). Previously the last member in the
  array won silently.
- **Promotion paper carries the same leash as manifests.**
  SENT-11..14: flag-signed FANO-CONTAIN-v1 releases a contained
  desk; expired and signature-tampered paper refuse.
- **The lossy-edge flake is closed.** COMM-06 resends on a
  bounded budget — fire-and-forget carries no delivery
  guarantee, so one dropped frame can no longer flip the verdict.
- **The ledger vocabulary is controlled.** HARN-01 validates
  every findings row against the codified verdict/severity sets;
  HARN-02 treats `fleet-map.json` like a manifest — FLEETMAPv1,
  fresh under 24h, every member measured.
- **The superpowers ledger is current.** 34/34 PROVEN; the
  admiral member is live in genesis, so roaming-anchor
  verification runs end-to-end.

### 3g. Fleet canon — emit and load discipline (wave-8 retro-pass)

The signed bulletin and genesis tools now carry the same
gate-before-write discipline as the desk:

- **Emit is opt-in.** `fleet-manifest.mjs` bare prints the
  unsigned payload and writes nothing; `--emit` signs; `--push`
  stages BOTH halves of the canon pair (`fleet-manifest.json`
  and `site/fleet-manifest.json`) — the old path committed one
  and left the parity gate red.
- **Load has a gate.** `--verify` checks spec, signature over
  canon(payload), genesis lineage, pubkey hint, timestamp, and
  root↔site parity — six live checks before the bulletin is
  trusted (FLEET-01).
- **Sightings age out.** Rendezvous peers older than 24h leave
  the signed doc; the ledger keeps them as evidence. Beacon
  source ports emit as `observed_port` — observed, not dialable.
- **The flag seat stays singular.** `fleet-genesis-update.mjs`
  removes any flag-seat claimant (name OR role) before seating
  the new admiral, self-verifies every collected signature over
  canon before writing, and warns on single-sig emits.
  Ambiguity is hostile — desks refuse to bind it (SENT-14).

### 3h. The cluster — what the family shelf proves (wave-9 retro-pass)

The sibling projects are family files, not marketing — every number on
the FAMILY shelf must trace verbatim to that tree's own README/AGENTS
(CLUSTER-01 enforces it by reading the docs live). Evidence classes:

- **Locally proven.** The Rations bridge is real code upstream
  (`e932053`): SPEC-007 invite-token wire compatibility and
  degraded-medium/acoustic stress suites registered in `tests.zig`
  (CLUSTER-03), plus the public capability projection — 3,472 rows ×
  18 domains, count-consistent, no absolute paths or key material
  (CLUSTER-02).
- **Doc-affidavit.** qstar-llm (2,610+ tests), zig-k3-port
  (token-identical), TheUE (50-entry registry), ThePlatform (Q#
  parity), euz (6,372+ tests), Rations (116.9% ratchet) — cited from
  their own docs, not rebuilt. If a sibling tree is absent the probe
  defers, never fabricates.
- **Boundary kept.** Neighbor-repo WIP is untouched — dirty paths in
  the experiments monorepo are their owners' work, not the campaign's.

### 3i. Both tongues, one canon (wave-10 twin audit)

The last EN-only corpora are closed. The anomaly codex carries a full
zh twin (`ANOMALY_LORE_ZH` — 139/139 entries plus both fallbacks,
verdict register preserved), the terminal help is line-for-line
(`TERM_HELP_ZH`), and `termZh()` fronts the exec boundary with a zh
map for prose answers and a prefix table for label framing. Lines
carrying live identifiers — fingerprints, hex keys, grant subjects —
stay command-canon: translating the envelope of a key is a lie.
DESK-21/22 enforce the parity by measurement.

### 3j. The blueprint audit (sentience program, opening wave)

A unified seven-phase development plan entered the drawer and was
graded phase-by-phase against the fleet — the audit reads the plan
against the desk, not the desk against the plan. The security phase is
already promoted outright: this battery is that phase. The intelligence,
persistence, command-center, and curriculum phases each stand partially —
the governed provider bridge, the sealed archive chain, the desk itself,
and the academy already exist; their named gaps become governed desk
surfaces in the following waves. Generative film and immersive 3D are
declared boundaries: the desk will carry a storyboard slate and a 2D
projection, never fake capability. The plan's external donor projects
are survey citations only — nothing is vendored. C91 records the audit;
the drawer keeps the map.

### 3k. engine.os — the signed roster (sentience w2)

The blueprint's first gap is closed: `tools/engine-manifest.mjs` signs a
single ENGINEMANIFESTv1 registry of every runtime the desk may trust —
the governance bridge, all three Ollama providers, both WASM cores
(spec007, rations — rations' hash must also agree with its own published
sidecar), the five asset registries, and the security battery pinned by
its sweep's anchor hash. Same canon discipline as the fleet bulletin:
`--emit` signs root+site, `--verify` is the load gate (spec, signature,
genesis lineage, key hint, timestamp, parity, **inventory** — every
signed sha256 must still match the file on disk), bare run writes
nothing. The `engine` terminal command (and the engine.os icon) opens a
pane that groups runtimes by kind and labels each by evidence —
verified-here, bridge-mediated, doc-cited — never promised reachable.
ENG-01..04 probe it.

### 3l. continuity.os — the persistence surface (sentience w3)

The blueprint's second gap is closed. `tools/archive-projection.mjs`
projects the `~/.archives` corpus into `site/assets/archive-manifest.json`
— basenames and seal states only; the raw corpus never leaves the
machine, and unsealed entries are listed, not hidden. The
`continuity` command (and the continuity.os icon) opens the pane: the
sealed archive roster on top, a desk-local records store underneath —
documents, projects, and task cards filed under `fano1.continuity`,
declared in the reset census so reset doctrine sweeps it like every
other desk store. CONT-01..03 probe the projection against the live
corpus (names, seals, counts) and the store's census membership.

### 3m. editor.os — the in-desk typewriter (sentience w4)

The blueprint's third phase wanted a 2D command center with an
in-platform IDE; the desk was already the command center and comms.os
was already the hub — what was missing was the editor. `editor.os` is a
plain-text document surface over the continuity store: records of kind
`document` are created, edited, and destroyed here, with a live
line/char meter and zero remote sync. No eval, no transpiler, nothing
pretending to be a compiler — the CSP rule is itself probed (LIB-02).
`edit` opens it. The community-hub role stays documented where it
belongs: comms.os (LIB-03).

### 3n. director.os + the nebula — production and projection (sentience w5)

The blueprint's film and immersive phases land as honest bounded ports.
`tools/slate-ledger.mjs` cuts `site/assets/production-ledger.json` —
the desk's real canon inventory (91 claims, 139 codex entries, 32
pages, 8 family, 8 viz — 278 assets), regenerated per wave so the slate
never drifts from the dossier (PROD-01). `director.os` is the
storyboard surface: canon assets drop onto a desk-local shot list
(`fano1.slate`, swept by the reset census — PROD-02) annotated with
take counts and verdicts, with zero claims of render, upload, or XR.
The `nebula` visualization is the blueprint's immersive surface made
honest: a 2D projection of the real capability domains and family
roster, tagged ILLUSTRATIVE where the deck's truth tags require it —
the arrangement is schematic, the data is real (PROD-03). `director`
and `nebula` commands open both; both surfaces wear bilingual chrome.

### 3o. course-gen — the generated curriculum (sentience w6)

The blueprint's final phase closes the loop the campaign itself
documents: `tools/course-gen.mjs` reads the wave reports under
`security/out/` — the primary record of what was actually built and
verified — and emits academy lessons deterministically. Bare run is a
dry-run; `--emit` merges into `academy-manifest.json`; `--verify`
proves the filed generated set reproduces byte-exact (CURR-01).
Generated lessons are labeled, not laundered: `origin:"generated"`
(badged in the academy pane), `evidence:"wave_report"` with every
source path resolving under the repo (CURR-02), `assessment:
"deterministic_review_required"` and an honest `language:["en"]` — no
reviewed zh twin is claimed for machine-derived text (CURR-03). The
manifest now files 546 lessons: 530 human/spec corpus + 16 generated
campaign modules. With this wave all seven blueprint phases stand
PROMOTED or explicitly BOUNDARY-labeled — `BLUEPRINT-MAP.md` carries
the post-port grades, and C92 records the state.

### 3p. cluster-census — every root carded (debrief d0)

The debrief opens with inventory: `tools/cluster-census.mjs` walks the
canonical root list — **33 project roots**: 26 first-party, 3
donor-vendored shelves, 3 empty/broken slots, 1 asset store — and emits
`site/assets/cluster-registry.json`, a sanitized projection carrying
codenames, realms, roles, and evidence classes only. Source paths stay
`$HOME`-relative inside the tool; the artifact holds no absolute paths,
no key material, no officer names (CENS-02 — it caught an owner-named
donor directory before landing). `--verify` checks identity-level
consistency — names, presence, class, evidence — while `file_count` is
explicitly a snapshot label, since the census file itself lives inside
a counted root (CENS-01, CENS-03). The full cards — absolute paths,
git heads, dirty counts — live drawer-side in `CLUSTER-CENSUS.md`.

### 3q. d1 retro-pass — hardware family + the desk itself

The first debrief sweep runs the ten-step retro-development protocol on
the hardware monorepo: **qstar-llm** (lattice-native inference — the
Sentience Engine's compute layer; `fixed_point.zig` module test green),
**zig-k3-port** (integer Q128.128 port of kimi-k3-in-c; `zig build test`
quiet-green; carries the wasm64-memory64 finding — only the in-tree `k3w`
interpreter runs it), the **preserved pre-port fork** (frozen evidence —
never rebuilt, never deleted), **TheUE** (deterministic ChiralMath core;
`audit-capabilities` conformance fixtures all green — the same tool that
projects `zig-capability-registry.json`), **BS** (Wow!-signal claims
audit — its index→recompute→label ledger is the model for the d6 claims
override), and a **self-pass on Spec-007**.

The self-pass found real drift: the i18n discipline landed in wave-5+
panes but was never retrofitted to the pre-i18n surfaces — the governed
bridge, academy, engine tagline, Q-branch, sysmon, start-menu tiles,
unlock flow, containment notice, and the flag command suite carried
roughly a hundred English literals DESK-20's audit didn't reach
(mid-concat strings, `btn()/inp()` helper calls, innerHTML text nodes,
`copyText` labels). All of it now routes through `t()` — ~96 new keys
each side, 520==520 parity, `t()` generalized to variadic `%s`, and the
anomaly-detail inline conditionals normalized into the dict. **DESK-23**
ratchets the residual pool to exactly the identifier allowlist — product
names and the terminal prompt; window titles stay English by convention
since they double as `openWins` identity keys. Full cards:
`thoughts&convos/CLUSTER-CENSUS.md` §D1.

## 4. Desk transfer — FANO-DESK-v1

`export-desk` / `import-desk` in the covenant terminal, or the DOM import
path on the transfer screen (Electron-safe — no `prompt()` anywhere in the
auth path). The bundle carries the wrapped keystore record + founding state,
signed by the exporting desk's key. Private key material is wrapped for the
entire trip; the importing desk refuses bundles onto already-founded desks
and refuses foreign-founding forgeries. Both directions work:
browser↔Electron either way. On mint/export the token is pushed to the
system clipboard automatically where a bridge exists (§6).

## 5. Reset doctrine

`reset.html` is the burn path. It shows a **census first** — callsign, pk
fingerprint, genesis-flag status, TOTP-required, fail counter, desk-state
presence — then burns the record and sweeps the sibling loopback origins'
records in the same chain (one decision, all stores).

Guard modes, proven in team-sweep-2 RED/GRAY:

- **Ordinary desk** — resets freely. Your desk, your call; no false lockout.
- **Flag desk on its cluster origin** — unilateral. The sovereign cluster is
  the doctrine's own exception.
- **Flag desk on a foreign origin** — requires a `FANO-RESET-v1` token
  carrying **every genesis member's** Ed25519 signature over the canonical
  body; bound to the founding callsign, 24-hour decay window. Forged,
  partial, stale, or callsign-tampered tokens are all refused.
  `security/admiralty-reset-token.mjs` mints the dual-signed token (digit
  local + sheraton via ssh — private keys never travel).

## 6. Electron Admiralty Desk — the workstation

Launch: `admiralty-desk/desk.sh` (it strips `ELECTRON_RUN_AS_NODE`, which the
dev shell leaks). The app embeds the site at `http://127.0.0.1:8901`, sandboxed
renderer (`contextIsolation`, `sandbox`, `nodeIntegration: false`), identity
in the `persist:admiralty` partition — Electron nuking or reinstall never
touches the browser desk and vice versa.

**Window controls** (`before-input-event`, window-scoped):

| Key | Action |
|---|---|
| F11 | Toggle full-screen |
| Esc | Exit full-screen (the desk UI doesn't bind Esc) |
| Ctrl+M | Minimize |
| Ctrl+Shift+Q | Quit the workstation |
| Alt+F4 | Native quit |

The Start menu carries the same shell items via the `ADMIRALTY_DESK` IPC
bridge (`desk:quit` / `desk:minimize` / `desk:fullscreen`).

**OS input stack** — the desk behaves like a real OS surface:

- **Edit accelerators** — a hidden native Edit menu provides real roles:
  Ctrl+C/X/V/A work in every field on every page.
- **Right-click menu** — native context menu: cut/copy/paste/select-all on
  editable fields, copy on any selection.
- **Clipboard bridge** — `ADMIRALTY_DESK.clipboard.{write,read}` → system
  clipboard via IPC. `copyText()` in `desk.js` prefers the bridge and falls
  back to `navigator.clipboard`, so it also works in the browser desk.
- **Auto-copy** — `export-desk`, authenticator mint/refresh/export, and
  roaming-paper mint all push the token straight to the system clipboard.
  GENESIS SEAT carries a **COPY PK** button (the full 64-hex public key,
  not the 16-hex fingerprint — the fingerprint is for humans, the key is
  for genesis).
- **Mouse capture** — `pointerLock` permission granted to the desk origin
  only; games and sandboxes can grab the cursor, everything else is denied.
- **Selectable content** — `.win-body` contents are text-selectable like a
  real OS; window chrome (titlebars, icons, taskbar) stays locked.

**Suite theming** — `.cmdsuite` renders on the ops-dark console palette
(`--console-bg`, phosphor inks). It lives *inside* `.win-body`, which paints
`--win-paper` (cream) for dossier pages — the dark-on-light wash that made
the suite unreadable was the suite inheriting paper paper. Fixed; the split
is intentional: suites are consoles, dossier pages are paper.

## 7. Fleet canon — genesis, manifest, rendezvous

### Genesis (`fleet-genesis.json`)

The fleet's trust root: canonical JSON, Ed25519-signed by the genesis roots
(`digit`, `sheraton`). Members are endorsed, not signers — the `admiral`
flag-seat member is *in* genesis but does not sign it. Current shape:
3 members, payload `sha256:95f5b05a…`.

**Amending:** `security/fleet-genesis-update.mjs --pk <64-hex>` admits a
member, re-canonicalizes, re-signs through both roots (digit local,
sheraton over ssh), and writes **both** `fleet-genesis.json` and
`site/fleet-genesis.json`. publish-check gates the two copies byte-for-byte
so they cannot drift again.

**TOFU re-pin:** desks pin the first genesis they fetch. A deliberate
amendment therefore surfaces as **GENESIS CONFLICT** on pinned desks — that
is the guard working, not a bug. The re-pin path is deliberate and manual:
verify the new payload's member sigs (the bootstrap already does this before
reporting the conflict), then retire the stale pin
(`~/.config/fleet/genesis.json` on Linux desks). Never auto-overwrite a
conflict.

### Manifest (`fleet-manifest.json` + `fleet_bootstrap.py`)

The bulletin board: an ed25519-signed manifest published via git push,
fetched by peers over `raw.githubusercontent.com`. `fleet-manifest.mjs
--emit` regenerates it citing the current genesis hash and writes both the
root and `site/` copies (same canon gate). `fleet_bootstrap.py` verifies the
pinned genesis, requires the manifest to cite that exact genesis hash AND be
signed by a genesis member, then populates rendezvous. Board tampering →
GENESIS CONFLICT or signer rejection, fail-loud. Note:
raw.githubusercontent CDN serves stale copies for minutes after a push —
bootstrap retries staleness before judging.

### Rendezvous (`fleet-map.mjs`)

Probe-measured address book, not asserted names: digit's v6 edge, sheraton
v4+v6, mesh node AP/STA bindings. Identity is the seal; location is
measured. Unreachable hosts are reported, not smoothed over (HTTP timeout
handling patched 2026-10-07 — dead mesh IPs defer fast instead of hanging).

### Seed drops (`seed-drop.mjs`)

One-time-pad seed drops for desk pairs. The minted plan creates **one drop
per pair** — sibling coverage is a mint-time redundancy decision, not an
assumption the verifier should make (RAT-07 documents this boundary;
`rations-stress.mjs` now stages a real sibling for the single-expiry case).
`--audit` reads a plan without minting.

## 8. Sweep runbook

Order matters — several suites consume artifacts or ports that earlier
steps produce:

```sh
# 1. Generate the lattice artifact gov-stress consumes
node security/lattice-probe.mjs          # writes out/ivector-lattice.json
node security/gov-stress.mjs

# 2. Mint drops, then stress them
node security/seed-drop.mjs
node security/rations-stress.mjs

# 3. The consolidated team sweep (RED/BLUE/BLACK/GRAY/COMM/DESK/SPEC004)
node security/team-sweep-2.mjs

# 4. Point-in-time audits
node security/sentinel-sweep.mjs
node security/superpowers-audit.mjs      # live-verifies genesis sigs
node security/capstone-audit.mjs

# 5. KALI surface — needs the docker lab + a desk target
export HYDRA_TOKEN=… WAN_TOKEN=…         # compose refuses ungated start
docker compose -f security/docker-compose.wan.yml up -d
python3 tools/serve.py --port 8902 &     # hardened desk target
node security/kali-sweep.mjs             # absent services → NOTED, not crash
RELAY_URL=ws://localhost:18081/ws RELAY_HTTP=http://localhost:18081 \
    node security/suite.mjs
docker compose -f security/docker-compose.wan.yml down

# 6. Canon + deploy gate (surname tripwire, genesis/manifest parity, tests)
./tools/publish-check.sh
```

Or let `comms-suite.mjs` stand the lab up for you: it generates per-run
tokens and passes them to compose — **but pass `--keep`** (an argv flag;
`KEEP=1` env is ignored) or it tears the lab down on exit.

**Verdict vocabulary:** `HELD`/`HARDENED` = tested and resisted;
`NOTED`/`BOUNDARY` = observed or architecturally limited (documented);
`OPEN`/`EXPLOITED`/`FRACTURE` = a real hole — do not ship.

**`out/findings.json` is generated** — rewritten on every suite run. It's
evidence, not source: exempt from gh-pages byte-parity, never hand-edited.

## 9. Honest limits

Recorded, not excused:

1. `session.sk` lives in page memory while unlocked — reload = re-unlock;
   a page-level compromise of an unlocked session is a key compromise.
2. Roster injection is desk-local theater — it changes what your screen
   shows, not what the fleet trusts (published genesis gates everything).
3. Wire replay/dedup is WASM-side — the JS inbox shows the phone layer's
   queue; a relay that replays envelopes is a core question, not a UI one.
4. External IPv6 inbound to the WAN edge is unverified — IPv4 is CGNAT-
   blocked, AAAA/record-side verification pending.
5. TOFU cold-boot: a desk's first genesis fetch can still be served a
   self-consistent attacker board until an out-of-band pin exists.
6. `capacity()` in the stega/carriage deps returns registry slots, not byte
   counts — round-trip empirically, don't budget from it.
7. ESP32 mesh nodes report unreachable when unpowered — that's the probe
   telling the truth, not a fault.
8. The 136-byte envelope's payload tail is unauthenticated scratch —
   receivers must honor `plen`.

---

*Twins: `docs/zh-Hant/fano-1-operations.zh-Hant.md`. Ledger rows this doc
summarizes live in `spec-008-ipv6-tensor` and `fleet-superpowers`; capability
claims live in `fleet-superpowers` (28/28 live-verified).*
