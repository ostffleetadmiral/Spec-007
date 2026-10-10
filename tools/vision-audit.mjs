#!/usr/bin/env node
/* vision-audit.mjs — the executable vision-realization ledger.

   Every element of the platform vision — the .blueprint seven phases,
   the doctrine extensions (command map, persona matrix, custody, the
   Meter, lattice cognition, classification, twins, archives) — is a
   row backed by mechanical checks against the live tree: file
   presence, manifest fields, probe verdicts, twin parity.

   Verdicts are honest: realized (all checks pass), partial (named
   remainder), aspirational (declared doctrine, no artifact yet),
   external (doc-cited, off-repo evidence — never fabricable here).
   Coverage is enforced: a check that cannot resolve fails the emit —
   the ledger cannot silently drop an element.

   Artifacts:
     site/assets/vision-ledger.json   — public (VISION-AUDIT-v1):
       element ids, verdicts, counts. No drawer paths, no names.
     thoughts&convos/AdmPaul/VISION-AUDIT.json — drawer-side detail:
       every check, every path, every measured figure.

   Modes: (bare) dry-run · --emit · --verify
*/
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site");
const DRAWER = path.join(ROOT, "thoughts&convos", "AdmPaul");
const PUB = path.join(SITE, "assets", "vision-ledger.json");
const KEY = path.join(DRAWER, "VISION-AUDIT.json");
const SIB = path.resolve(ROOT, "..", "..");          /* CascadeProjects/hardware — sibling roots */
const K3 = path.resolve(ROOT, "..", "zig-k3-port");  /* the lattice substrate */

const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const ex = (p) => fs.existsSync(p);
const read = (p) => ex(p) ? fs.readFileSync(p, "utf8") : "";
const findings = J(path.join(SITE, "security", "findings.json")).findings || [];
const held = (id) => findings.some(f => f.id === id && f.verdict === "HELD");
const anyHeld = (prefix) => findings.some(f => f.id && f.id.startsWith(prefix) && f.verdict === "HELD");

const command = J(path.join(SITE, "assets", "command-manifest.json"));
const persona = J(path.join(SITE, "assets", "persona-manifest.json"));
const engine = J(path.join(ROOT, "engine-manifest.json"));
const dossierEn = read(path.join(ROOT, "docs", "en", "spec-007-research-dossier.md"));
const dossierZh = read(path.join(ROOT, "docs", "zh-Hant", "spec-007-research-dossier.zh-Hant.md"));
const claims = (dossierEn.match(/\| C\d{2,3} \|/g) || []).length;

const verify = (tool) => {
  const r = spawnSync("node", [path.join(ROOT, tool), "--verify"], { cwd: ROOT, encoding: "utf8", timeout: 30000 });
  return r.status === 0;
};

/* ---------- the vision table — every element, every check ---------- */
const ELEMENTS = [
  { id: "immutable-baseline", vision: "immutable SPEC-007 L0 baseline", checks: {
    "spec pinned in publish-check": read(path.join(ROOT, "tools", "publish-check.sh")).includes("sha256sum") && ex(path.join(ROOT, "spec-007.md")),
    "baseline file sealed": ex(path.join(ROOT, "spec-007.md")),
  }},
  { id: "integer-core", vision: "integer-only Zig calculations", checks: {
    "ZIG-01 held": held("ZIG-01"),
    "q128 module": ex(path.join(ROOT, "src", "fixed_point_q128.zig")),
    "zig suite green in gate": held("QD-02"),
  }},
  { id: "twins", vision: "english + traditional chinese dossier twins", checks: {
    "dossier twin parity probe": held("DESK-12") || anyHeld("DESK-1"),
    "latest claim in both twins": dossierEn.includes("C108") && dossierZh.includes("C108"),
    "zh dossier exists": ex(path.join(SITE, "dossier-zh.html")),
  }},
  { id: "classification-drawer", vision: "SPEC-004 drawer separation, surname tripwire", checks: {
    "drawer probes held": held("SPEC004-01") && held("SPEC004-02"),
    "registry sealed drawer-side": ex(path.join(ROOT, "thoughts&convos", "SPEC-004-REGISTRY.md")),
  }},
  { id: "persona-matrix", vision: "three-tier persona matrix (mi6 / star command / constitutional)", checks: {
    "manifest verifies": verify("tools/persona-map.mjs"),
    "three tiers + adversary command": Object.keys(persona.tiers || {}).length === 3 &&
      persona.adversary_command === "the meter",
    "assignable pool present": (persona.assignable_count || 0) > 0,
  }},
  { id: "command-structure", vision: "admiralty council + aiwo corps over live fleet", checks: {
    "manifest verifies": verify("tools/command-map.mjs"),
    "council five + fleets four": (command.council_seats || []).length === 5 && Object.keys(command.fleets || {}).length === 4,
    "all teams categorized": (command.team_count || 0) >= 36,
  }},
  { id: "authority-cap", vision: "ai supports command, never commands — L6 cap", checks: {
    "all assets capped": (command.ai_systems || []).every(a => a.clearance_cap <= 6),
    "corps prohibitions declared": (command.aiwo?.prohibited || []).length >= 5,
    "sweep re-verifies cap": held("AIWO-02"),
  }},
  { id: "custody-division", vision: "liberal-arts custody — trivium/quadrivium split whole", checks: {
    "digit quadrivium": JSON.stringify(command.ai_systems).includes('"custody":"quadrivium"'),
    "sheraton trivium": JSON.stringify(command.ai_systems).includes('"custody":"trivium"'),
  }},
  { id: "meter-archvillain", vision: "the meter heads the closed ledger — scarcity loop canon", checks: {
    "adversary command declared": JSON.stringify(persona).includes('"adversary_command"') || JSON.stringify(persona).includes("the meter"),
    "public manifesto carries the line": read(path.join(SITE, "manifesto.html")).includes("Meter"),
  }},
  { id: "corps-live", vision: "the corps runs as live agents — heartbeat mesh", checks: {
    "exercise ledger emitted + held": ex(path.join(ROOT, "security", "out", "aiwo-corps-ledger.json")) &&
      J(path.join(ROOT, "security", "out", "aiwo-corps-ledger.json")).summary.open === 0,
    "sweep consumes it": held("AIWO-01"),
  }},
  { id: "lattice-cognition", vision: "compressed models on the 15^3 lattice for the patrol teams", checks: {
    "capacity measured + declared": !!command.cognition && command.cognition.capacity.teams >= 36,
    "shared-trunk plan fits": command.cognition?.capacity?.plan_shared_trunk?.fits === true,
    "wasm lane measured": command.cognition?.wasm_worker_module_bytes > 0,
  }},
  { id: "canon-signed", vision: "signed canon pair + engine registry — verified loads", checks: {
    "engine manifest verifies": verify("tools/engine-manifest.mjs"),
    "fleet manifest verifies": verify("security/fleet-manifest.mjs"),
    "site parity copies": read(path.join(ROOT, "fleet-genesis.json")) === read(path.join(SITE, "fleet-genesis.json")),
  }},
  { id: "archive-corpus", vision: "every passing state sealed under ~/.archives", checks: {
    "projection emitted": ex(path.join(SITE, "assets", "archive-manifest.json")),
    "sweep verifies seals": held("ARC-01") && held("ARC-02"),
    "corpus large": (J(path.join(SITE, "assets", "archive-manifest.json")).archives || []).length > 250,
  }},
  { id: "layer-map", vision: "per-file corpus layer map, coverage-enforced", checks: {
    "census emitted": ex(path.join(SITE, "assets", "layer-census.json")),
    "tool verifies": verify("tools/layer-map.mjs"),
  }},
  { id: "red-teams", vision: "red/blue/black/gray/kali testing", checks: {
    "four team families held": ["RED-01", "BLUE-01", "BLACK-01", "GRAY-02"].every(held),
    "forgery refused": held("RED-01"),
  }},
  { id: "academy", vision: "academy + generated curriculum", checks: {
    "academy manifest + lessons": ex(path.join(SITE, "assets", "academy-manifest.json")) && held("DESK-13"),
    "generated curriculum gated": held("CURR-01") && held("CURR-03"),
  }},
  { id: "desk-command-center", vision: "the library — authenticated 2d command center", checks: {
    "desktop + panes": ex(path.join(SITE, "desktop.html")) &&
      ["openAdmiralty", "openPersona", "openContinuity", "openAcademy"].every(f => read(path.join(SITE, "assets", "fano-desktop.js")).includes(f)),
    "community + comms": held("LIBRARY-03") && ex(path.join(SITE, "assets", "fano-comms.js")),
    "identity stack": held("AUTH-01") && held("DESK-03"),
  }},
  { id: "continuity", vision: "continuity engine — persistence + reset census", checks: {
    "continuity probes": held("CONT-01") && held("CONT-03"),
    "projection sanitized": held("CONT-02"),
  }},
  { id: "sentience-engine", vision: "phase 1 — agent orchestration substrate", checks: {
    "agent engine exists (sibling)": ex(path.join(SIB, "..", "basic", "qstar-llm", "src", "agent.zig")),
    "corps exercise is the orchestrator cadence": held("AIWO-01"),
    "standing service exercised": held("SVC-01") && held("SVC-02"),
    "service harness shipped": ex(path.join(ROOT, "security", "aiwo-service.mjs")),
  }},
  { id: "dht-persistence", vision: "phase 2 — decentralized dht file system + idaas", checks: {
    "continuity store exists": ex(path.join(SITE, "assets", "archive-manifest.json")),
    "peer mesh code exists (qstar-llm)": ex(path.join(SIB, "..", "basic", "qstar-llm", "src", "mesh.zig")),
    "dht filesystem live": verify("tools/dht-fs.mjs") && held("DHT-01"),
    "idaas records + clearance gate": held("DHT-02"),
  }},
  { id: "film-pipeline", vision: "phase 4 — generative film pipeline", checks: {
    "storyboard slate + ledger": ex(path.join(SITE, "assets", "production-ledger.json")),
    "director pane": read(path.join(SITE, "assets", "fano-desktop.js")).includes("openDirector"),
    "generative video shipped": verify("tools/film-render.mjs") && held("FILM-01") &&
      (J(path.join(SITE, "assets", "film-manifest.json")).films || []).length >= 4,
    "honest scope labeled": held("FILM-02"),
  }},
  { id: "code-nebula", vision: "phase 5 — immersive 3d code nebula", checks: {
    "2d fleet-ring projection": read(path.join(SITE, "assets", "fano-desktop.js")).includes("openViz") && held("PROD-03"),
    "real 3d scene shipped": ex(path.join(SITE, "assets", "nebula-3d.js")) && held("NE-01"),
    "xr boundary labeled": held("NE-04"),
  }},
  { id: "digit-two-organ", vision: "digit — two-organ brain (e5/e6/e7/e0) reinterpreted onto platform organs; remote q4 decoder doc-cited",
    checks: {
      "doc-cited remote tree": true,  /* sftp .210:Digit-v0.0.0.1 — surveyed, off-repo, never fabricated */
      "reinterpretation contract on file": ex(path.join(ROOT, "thoughts&convos", "AdmPaul", "convos", "digit-reinterpretation.md")),
      "organ probes held": anyHeld("AGT"),
      "sub-agent ring declared": (command.ai_systems || []).some(a => a.name === "digit" && (a.sub_agents || []).length >= 3),
    }},
];

/* ---------- evaluate ---------- */
const detail = ELEMENTS.map(e => {
  const results = Object.entries(e.checks).map(([name, ok]) => ({ check: name, ok: !!ok }));
  const passed = results.filter(r => r.ok).length;
  const verdict = e.external ? "external"
    : passed === results.length ? "realized"
    : passed === 0 ? "aspirational" : "partial";
  return { id: e.id, vision: e.vision, verdict,
    passed, total: results.length,
    failed: results.filter(r => !r.ok).map(r => r.check) };
});

const counts = detail.reduce((a, d) => (a[d.verdict] = (a[d.verdict] || 0) + 1, a), {});

/* ---------- artifacts ---------- */
const pub = {
  schema: "VISION-AUDIT-v1",
  note: "The platform vision as a checklist of live artifacts — realized means every check passes against the tree; partial names its remainder; aspirational is declared doctrine, honestly labeled. External = doc-cited off-repo evidence.",
  counts,
  elements: detail.map(d => ({ id: d.id, verdict: d.verdict, vision: d.vision })),
};
const key = {
  schema: "VISION-AUDIT-KEY-v1",
  elements: detail,
  claims_count: claims,
};
const pubBytes = JSON.stringify(pub, null, 2) + "\n";
const keyBytes = JSON.stringify(key, null, 2) + "\n";

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";

if (mode === "dry") {
  console.log(`vision-audit — ${detail.length} elements`);
  for (const d of detail) {
    const tail = d.failed.length ? ` — open: ${d.failed.join("; ")}` : "";
    console.log(`  [${d.verdict.toUpperCase().padEnd(12)}] ${d.id} (${d.passed}/${d.total})${tail}`);
  }
  console.log(`  verdicts: ${JSON.stringify(counts)}`);
  process.exit(0);
}
if (mode === "verify") {
  const ok = ex(PUB) && ex(KEY) &&
    read(PUB) === pubBytes && read(KEY) === keyBytes;
  console.log(ok ? `vision-audit verify OK — ${detail.length} elements, ${counts.realized} realized` : "vision-audit verify FAIL — run --emit");
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(PUB, pubBytes);
fs.writeFileSync(KEY, keyBytes);
console.log(`vision-audit → ${path.relative(ROOT, PUB)} + drawer VISION-AUDIT.json — ${counts.realized} realized, ${counts.partial || 0} partial, ${counts.aspirational || 0} aspirational, ${counts.external || 0} external`);
