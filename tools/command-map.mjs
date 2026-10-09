#!/usr/bin/env node
/* command-map.mjs — the command-structure ledger.

   Implements gov/admiralty/Admiralty_Strategic_20Command_.pdf_2.md and
   gov/security/AICommand.pdf_2.md against the live fleet: the OSTF
   command chain (Fleet Admiral → Admiralty Council → advisory technical
   authorities → AIWO Corps), the four fleets, the AI Warrant Officer
   rank ladder, the monitored-AI register (genesis members are fleet
   machines, and AI assets answer to the Corps), and the security-team
   roster — every team-sweep-2 prefix categorized under an Article VI.1
   patrol duty.

   Coverage is enforced: a sweep team or genesis member without a
   command designation fails emission — the ledger cannot silently
   drift from the fleet or the test corpus.

   Artifacts:
     site/assets/command-manifest.json — public (COMMAND-MAP-v1):
       billets, chains, duties, asset classes. Zero officer names.
     thoughts&convos/AdmPaul/COMMAND-KEY.json — drawer-side key:
       seat → officer (from the Admiralty packets), full mapping.
       Never published (SPEC-004).

   Modes: (bare) dry-run · --emit · --verify
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const GENESIS = path.join(ROOT, "fleet-genesis.json");
const FLEETM = path.join(ROOT, "fleet-manifest.json");
const SWEEP = path.join(ROOT, "security", "team-sweep-2.mjs");
const MANIFEST = path.join(ROOT, "site", "assets", "command-manifest.json");
const KEY = path.join(ROOT, "thoughts&convos", "AdmPaul", "COMMAND-KEY.json");
const ADMKEY = path.join(ROOT, "thoughts&convos", "AdmPaul", "ADMIRALTY-KEY.json");

const errors = [];

/* ---------- the command chain (admiralty strategic command, art. II) ── */
const CHAIN = [
  { seat: "fleet admiral", clearance: 7, scope: "supreme command — emergency override, 7Q activation, founding-phase final authority" },
  { seat: "admiralty council", clearance: 6, scope: "strategic governance — five principal officers, votes 3/5 · 4/5 · 5/5" },
  { seat: "advisory technical authorities", clearance: 6, scope: "non-voting — lead technical systems architect, lead security and fabrication officer, chief warrant officer, research leads" },
  { seat: "chief warrant officer", clearance: [6, 7], scope: "AIWO corps command — reports to the lead security and fabrication officer" },
  { seat: "warrant officers", clearance: [3, 6], scope: "AIWO operational enforcement — WO1/WO2/WO3 bands" },
];

const COUNCIL = [ /* the five voting seats (art. II.2) */
  "fleet admiral", "vice admiral of stem initiatives",
  "rear admiral of entrepreneurship", "admiral of financial operations",
  "commodore of ethics and equity",
];
const ADVISORY = [ /* non-voting technical seats (art. II.3) */
  "lead technical systems architect", "lead security and fabrication officer",
  "chief warrant officer", "research lead",
];

const FLEETS = {
  education: { lead: "vice admiral of stem initiatives",
    mission: "academy, curriculum, apprenticeship, equity programs" },
  commercialization: { lead: "rear admiral of entrepreneurship",
    mission: "product, partnerships, revenue, technology transfer" },
  research_ethics: { lead: "vice admiral of stem initiatives + commodore of ethics and equity",
    mission: "standards, safety/ethics research, SPEC framework, research governance" },
  security_infrastructure: { lead: "lead security and fabrication officer",
    mission: "clearance enforcement, AI monitoring, incident response, infrastructure" },
};

/* ---------- the AIWO corps (ai command, art. III + VI) ---------- */
const WO_RANKS = [
  { rank: "WO1", title: "warrant officer first class", clearance: [3, 4], scope: "entry enforcement + monitoring" },
  { rank: "WO2", title: "warrant officer second class", clearance: [4, 5], scope: "specialized operations + investigations" },
  { rank: "WO3", title: "warrant officer third class", clearance: [5, 6], scope: "senior technical leadership + cross-system coordination" },
  { rank: "CWO", title: "chief warrant officer", clearance: [6, 7], scope: "corps command + strategic oversight" },
];
/* Art. VI.1 patrol duties — every security team files under one */
const PATROL_DUTIES = [
  "offense_testing", "defense_posture", "supply_chain_integrity",
  "insider_audit", "comms_integrity", "identity_assurance",
  "clearance_enforcement", "core_integrity", "audit_integrity",
  "claims_audit", "custody", "canon_integrity", "federation_audit",
  "content_integrity", "curriculum_integrity", "discovery_integrity",
  "anomaly_watch", "physics_falsification",
];

/* team prefix → patrol duty + fleet it serves */
const TEAM_MAP = {
  RED:     { duty: "offense_testing",        fleet: "security_infrastructure" },
  BLUE:    { duty: "defense_posture",        fleet: "security_infrastructure" },
  BLACK:   { duty: "supply_chain_integrity", fleet: "security_infrastructure" },
  GRAY:    { duty: "insider_audit",          fleet: "security_infrastructure" },
  COMM:    { duty: "comms_integrity",        fleet: "security_infrastructure" },
  WIRE:    { duty: "comms_integrity",        fleet: "security_infrastructure" },
  PAR:     { duty: "comms_integrity",        fleet: "security_infrastructure" },
  DESK:    { duty: "identity_assurance",     fleet: "security_infrastructure" },
  CONT:    { duty: "identity_assurance",     fleet: "security_infrastructure" },
  AUTH:    { duty: "clearance_enforcement",  fleet: "security_infrastructure" },
  BOT:     { duty: "clearance_enforcement",  fleet: "security_infrastructure" },
  SPEC004: { duty: "clearance_enforcement",  fleet: "security_infrastructure" },
  ZIG:     { duty: "core_integrity",         fleet: "security_infrastructure" },
  HARN:    { duty: "audit_integrity",        fleet: "security_infrastructure" },
  GLD:     { duty: "audit_integrity",        fleet: "security_infrastructure" },
  LAWB:    { duty: "audit_integrity",        fleet: "security_infrastructure" },
  ARC:     { duty: "custody",                fleet: "security_infrastructure" },
  DOX:     { duty: "custody",                fleet: "security_infrastructure" },
  DEV:     { duty: "custody",                fleet: "security_infrastructure" },
  FLEET:   { duty: "canon_integrity",        fleet: "security_infrastructure" },
  ENGINE:  { duty: "canon_integrity",        fleet: "security_infrastructure" },
  CENS:    { duty: "federation_audit",       fleet: "security_infrastructure" },
  CLUSTER: { duty: "federation_audit",       fleet: "security_infrastructure" },
  OVR:     { duty: "claims_audit",           fleet: "research_ethics" },
  PRM:     { duty: "claims_audit",           fleet: "research_ethics" },
  EVM:     { duty: "claims_audit",           fleet: "research_ethics" },
  BRG:     { duty: "federation_audit",       fleet: "research_ethics" },
  PARA:    { duty: "discovery_integrity",    fleet: "research_ethics" },
  SCI:     { duty: "discovery_integrity",    fleet: "research_ethics" },
  EMG:     { duty: "anomaly_watch",          fleet: "research_ethics" },
  RF:      { duty: "physics_falsification",  fleet: "research_ethics" },
  QD:      { duty: "physics_falsification",  fleet: "research_ethics" },
  AST:     { duty: "physics_falsification",  fleet: "research_ethics" },
  LIBRARY: { duty: "content_integrity",      fleet: "education" },
  PROD:    { duty: "content_integrity",      fleet: "education" },
  CURR:    { duty: "curriculum_integrity",   fleet: "education" },
  AIWO:    { duty: "comms_integrity",        fleet: "security_infrastructure" },
};

/* ---------- live fleet parse ---------- */
const genesis = JSON.parse(fs.readFileSync(GENESIS, "utf8"));
const fleetm = JSON.parse(fs.readFileSync(FLEETM, "utf8"));
const members = (genesis.payload && genesis.payload.members) || [];
const mroles = (fleetm.payload && fleetm.payload.members) || {};

/* genesis members → command designations. flag-seat = the human chair
   (L7); genesis-root machines = monitored AI assets under AIWO patrol
   (L6 cap — art. IV: AI systems never hold command authority). */
const aiSystems = [], commandSeats = [];
for (const m of members) {
  const live = mroles[m.name] || {};
  if (m.role === "flag-seat") {
    commandSeats.push({ name: m.name, designation: "flag_seat", clearance: 7,
      note: "The human chair — fleet trust anchor, not a Corps asset." });
  } else {
    aiSystems.push({ name: m.name, designation: "monitored_ai_asset",
      clearance_cap: 6, fleet_role: live.role || m.role,
      oversight: "aiwo_corps",
      note: "Monitored AI agent — Art. V.3: enforces boundaries, never commands." });
  }
}
if (!commandSeats.length) errors.push("no flag-seat member in genesis — the chair must exist");
for (const m of members)
  if (!commandSeats.concat(aiSystems).some(x => x.name === m.name))
    errors.push(`genesis member "${m.name}" has no command designation`);

/* ---------- sweep-team roster (source of truth: the sweep itself) ── */
const sweepSrc = fs.readFileSync(SWEEP, "utf8");
const teams = [...new Set([...sweepSrc.matchAll(/(?:held|open_|noted)\("([A-Z0-9]+)"/g)].map(m => m[1]))].sort();
for (const t of teams) {
  if (!TEAM_MAP[t]) errors.push(`sweep team "${t}" is not categorized under an AIWO patrol duty`);
}
const roster = teams.map(t => ({
  team: t, duty: TEAM_MAP[t] && TEAM_MAP[t].duty, fleet: TEAM_MAP[t] && TEAM_MAP[t].fleet,
}));

/* ---------- invariants ---------- */
for (const s of aiSystems) if (s.clearance_cap > 6)
  errors.push(`AI asset "${s.name}" clearance cap ${s.clearance_cap} exceeds the L6 AI bound`);
for (const r of roster) if (r.duty && !PATROL_DUTIES.includes(r.duty))
  errors.push(`team "${r.team}" duty "${r.duty}" is not a patrol duty`);
const duties_used = new Set(roster.map(r => r.duty).filter(Boolean));
/* no declared patrol duty may sit empty — a duty with no team is a hole */
for (const d of ["clearance_enforcement", "offense_testing", "defense_posture",
  "supply_chain_integrity", "insider_audit", "comms_integrity", "audit_integrity"])
  if (!duties_used.has(d)) errors.push(`core patrol duty "${d}" has no assigned team`);

if (errors.length) {
  console.error("command-map: coverage failures\n  " + errors.join("\n  "));
  process.exit(1);
}

/* ---------- drawer key — seats ↔ officers (from the admiralty key) ── */
let admkey = null;
if (fs.existsSync(ADMKEY)) admkey = JSON.parse(fs.readFileSync(ADMKEY, "utf8"));
const seatHolders = {};
if (admkey) {
  seatHolders[admkey.chair.office] = admkey.chair.holder;
  for (const o of admkey.officers)
    for (const k of ["primary", "secondary", "tertiary"])
      if (o.billets[k] && !seatHolders[o.billets[k].toLowerCase()])
        seatHolders[o.billets[k].toLowerCase()] = o.officer;
}
const commandKey = {
  schema: "COMMAND-KEY-v1",
  note: "OSTF command structure — seat→officer binding under SPEC-004. Billets publish; names stay in the drawer. Sources: Admiralty_Strategic_20Command, AICommand, gov/onboarding packets.",
  generated_by: "tools/command-map.mjs",
  chain: CHAIN.map(c => ({ ...c, holder: seatHolders[c.seat] || null })),
  council: COUNCIL.map(s => ({ seat: s, holder: seatHolders[s] || null })),
  advisory: ADVISORY.map(s => ({ seat: s, holder: seatHolders[s] || null })),
  fleets: Object.fromEntries(Object.entries(FLEETS).map(([k, f]) => [k, { ...f, holder: seatHolders[f.lead] || null }])),
  ai_systems: aiSystems,
  security_roster: roster,
};

/* ---------- cognition capacity (k3 lattice, measured 2026-10-10) ──
   How the 30+ patrol teams get a cognition layer: the Rations ONNX
   registry pattern adapted to the integer substrate — ONNX Runtime Web
   is replaced by k3 packed trunks fanned across k3wexec wasm64 lanes.
   Figures are integers; "measured" = this machine's probe run,
   "derived" = arithmetic from measured constants (see drawer doc
   convos/lattice-cognition.md). */
const LANE_BYTES = 5300000;         /* measured: 21,176,320 B peak RSS / 4 wasm lanes */
const TRUNK_I4 = 280000000;         /* derived: 0.5B params × 0.56 B/param int4 trunk */
const TEAM_STATE = 32000000;        /* derived: conservative per-team KV+state slot */
const NODE_BUDGET = 14900000000;    /* measured: free RAM on the probe node (~14.9 GB) */
const TEAMS = roster.length;
const planShared = TRUNK_I4 + TEAMS * TEAM_STATE + 4 * LANE_BYTES;
const planDedi = TEAMS * TRUNK_I4 + 4 * LANE_BYTES;
const cognition = {
  runtime: "k3 packed trunk + k3wexec wasm64 lanes (integer-only; ONNX adapts at the registry layer)",
  wasm_worker_module_bytes: 1366906,
  probe: { lanes: 4, peak_rss_bytes: 21176320, seconds_per_token_milli: 392,
    expert_requests: 163, expert_drops: 0, status: "measured" },
  quantization_ladder_bp: [
    { name: "bf16 trunk", milli_bytes_per_param: 2000 },
    { name: "int8 (rations onnx parity)", milli_bytes_per_param: 1060 },
    { name: "int4 qdq draft", milli_bytes_per_param: 560 },
  ],
  node_budget_bytes: NODE_BUDGET,
  capacity: {
    resident_i4_models_per_node: Math.floor((NODE_BUDGET - 4 * LANE_BYTES) / TRUNK_I4),
    plan_shared_trunk: { bytes: planShared, fits: planShared <= NODE_BUDGET,
      note: "one verified trunk + per-team carried state — the doctrine form" },
    plan_dedicated: { bytes: planDedi, fits: planDedi <= NODE_BUDGET,
      note: "36 separate int4 instances — possible, wasteful" },
    teams: TEAMS,
  },
};

/* ---------- public manifest (billets only — never names) ---------- */
const manifest = {
  schema: "COMMAND-MAP-v1",
  note: "OSTF command structure — the real chain over the fleet. Seats publish; names stay drawer-side. AI assets are monitored by the AIWO Corps at a hard L6 cap; no AI system issues binding orders. The Meter sits on the closed ledger — command exists to outrun it.",
  chain: CHAIN,
  council_seats: COUNCIL,
  advisory_seats: ADVISORY,
  fleets: FLEETS,
  aiwo: {
    corps: "AI Warrant Officer Corps",
    reports_to: "lead security and fabrication officer",
    ranks: WO_RANKS,
    patrol_duties: PATROL_DUTIES,
    prohibited: ["override fleet admiral or admiralty", "modify governance documents",
      "self-elevate clearance", "authorize L7/7Q operations",
      "irreversible action without human authorization", "issue binding orders"],
  },
  ai_systems: aiSystems.map(s => ({ name: s.name, designation: s.designation,
    clearance_cap: s.clearance_cap, fleet_role: s.fleet_role, oversight: s.oversight })),
  command_seats: commandSeats.map(s => ({ designation: s.designation, clearance: s.clearance })),
  security_roster: roster,
  team_count: roster.length,
  cognition,
};
const mapBytes = JSON.stringify(manifest, null, 2) + "\n";
const keyBytes = JSON.stringify(commandKey, null, 2) + "\n";

/* boundary self-audit — officer surnames never reach the public ledger */
let surnames = [];
if (admkey) surnames = admkey.officers.map(o => o.officer.split(" ").pop());
if (surnames.length && new RegExp("\\b(" + surnames.join("|") + ")\\b").test(mapBytes)) {
  console.error("command-map: BOUNDARY FAIL — an officer surname would reach the public manifest");
  process.exit(1);
}

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";

if (mode === "dry") {
  console.log(`command-map — dry-run (${roster.length} teams, ${aiSystems.length} monitored AI assets, writes nothing)`);
  console.log("  chain: " + CHAIN.map(c => c.seat).join(" → "));
  for (const [f, v] of Object.entries(FLEETS))
    console.log(`  fleet ${f} — lead: ${v.lead} — ${roster.filter(r => r.fleet === f).length} teams`);
  const byDuty = {};
  roster.forEach(r => { (byDuty[r.duty] = byDuty[r.duty] || []).push(r.team); });
  for (const [d, ts] of Object.entries(byDuty).sort()) console.log(`  duty ${d}: ${ts.join(", ")}`);
  console.log("  monitored AI: " + aiSystems.map(s => s.name + " (cap L" + s.clearance_cap + ")").join(", "));
  process.exit(0);
}
if (mode === "verify") {
  const ok = fs.existsSync(MANIFEST) && fs.existsSync(KEY) &&
    fs.readFileSync(MANIFEST, "utf8") === mapBytes &&
    fs.readFileSync(KEY, "utf8") === keyBytes;
  console.log(ok
    ? `command-map verify OK — ${roster.length} teams categorized, ${aiSystems.length} AI assets monitored, deterministic`
    : "command-map verify FAIL — artifacts stale or absent; run --emit");
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(MANIFEST, mapBytes);
fs.writeFileSync(KEY, keyBytes);
console.log(`command-map → ${path.relative(ROOT, MANIFEST)} + drawer COMMAND-KEY.json (${roster.length} teams, ${aiSystems.length} AI assets)`);
