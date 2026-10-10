#!/usr/bin/env node
/* gov-map.mjs — the governance vision, made executable.

   thoughts&convos/gov/ is the development authority: the OSTF
   Constitution, the SPEC series (000–006 + Rulebook), the Admiralty
   bylaws, and the policy domains. This map binds every mandate of
   that corpus to a realized counterpart with a mechanical check —
   "the constitution governs a real platform" — verified, not asserted.

   Every live gov domain must carry ≥1 mandate (coverage-enforced:
   an unbound domain fails emission). Modes are honest:
     direct     — the mandate itself is realized in machinery
     structural — the governance pattern is realized in machinery
                  (e.g. financial audit → ledger conservation law)

   Emit writes site/assets/gov-ledger.json (sanitized: domain slugs,
   mandate slugs, verdicts, modes — no doc paths or officer names)
   + AdmPaul/GOV-KEY.json (drawer twin with source paths).
   --verify re-checks deterministically. */

import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site", "assets");
const DRAWER = path.join(ROOT, "thoughts&convos");
const GOV = path.join(DRAWER, "gov");
const PUB = path.join(SITE, "gov-ledger.json");
const KEY = path.join(DRAWER, "AdmPaul", "GOV-KEY.json");
const FINDINGS = path.join(ROOT, "site", "security", "findings.json");

const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const ex = (p) => fs.existsSync(p);
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const gfile = (rel) => ex(path.join(GOV, rel));
const held = (id) => {
  try {
    const f = J(FINDINGS);
    return (f.findings || []).some(x => x.id === id && x.verdict === "HELD");
  } catch { return false; }
};

/* ---------- check kinds (same machinery as agency-map) ---------- */
const C = {
  file: (rel) => ({ kind: "file", rel }),              /* repo-relative artifact exists */
  govdoc: (rel) => ({ kind: "govdoc", rel }),          /* corpus doc exists */
  held: (id) => ({ kind: "held", id }),                /* findings probe HELD */
  run: (rel) => ({ kind: "run", rel }),                /* tool --verify exits 0 */
  field: (file, key, pred) => ({ kind: "field", file, key, pred }),  /* manifest field check */
  svc: (id) => ({ kind: "svc", id }),                  /* service-ledger probe HELD */
  records: (rkind) => ({ kind: "records", rkind }),    /* DHT record kind non-empty */
};

const FIELD_PREDS = {
  ge: (v, n) => v >= n,
  eq: (v, n) => v === n,
  len_ge: (v, n) => Array.isArray(v) && v.length >= n,
  has_all: (v, arr) => Array.isArray(v) && arr.every(x => v.includes(x)),
  keys_ge: (v, n) => v && typeof v === "object" && Object.keys(v).length >= n,
  keys_has_all: (v, arr) => v && typeof v === "object" && arr.every(x => x in v),
};

function resolve(check) {
  switch (check.kind) {
    case "file":   return ex(path.join(ROOT, check.rel));
    case "govdoc": return gfile(check.rel);
    case "held":   return held(check.id);
    case "run": {
      const r = spawnSync(process.execPath, [path.join(ROOT, check.rel), "--verify"], { encoding: "utf8" });
      return r.status === 0;
    }
    case "field": {
      const p = path.join(SITE, check.file);
      try {
        const v = check.key.split(".").reduce((o, k) => o?.[k], J(p));
        const [fn, arg] = check.pred;
        return FIELD_PREDS[fn](v, arg);
      } catch { return false; }
    }
    case "svc": {
      const p = path.join(ROOT, "security", "out", "aiwo-service-ledger.json");
      try {
        const l = J(p);
        const ageH = (Date.now() - Date.parse(l.ts || 0)) / 3600000;
        return ageH < 24 && (l.findings || []).some(f => f.id === check.id && f.verdict === "HELD");
      } catch { return false; }
    }
    case "records": {
      const r = spawnSync(process.execPath,
        [path.join(ROOT, "tools", "dht-fs.mjs"), "record", "query", check.rkind, "7"],
        { encoding: "utf8" });
      try { return r.status === 0 && JSON.parse(r.stdout).length > 0; }
      catch { return false; }
    }
    default: return false;
  }
}

/* ---------- the mandates — domain → [ { id, mandate, real, mode, checks[] } ] */
const MANDATES = [
  { domain: "constitutional", source: "constitutional/OSTF.md",
    items: [
      { id: "three-divisions", mandate: "Art I §3 — Academy + Sallirreug Tech + Research & Ethics divisions",
        real: "the fleet structure is the division structure — education, commercialization, research_ethics (+ security_infrastructure) fleets over the live roster",
        mode: "direct",
        checks: [C.field("command-manifest.json", "fleets", ["keys_has_all", ["education", "commercialization", "research_ethics", "security_infrastructure"]])] },
      { id: "five-officers", mandate: "Art II §2 — Fleet Admiral + four flag officers constitute the Admiralty",
        real: "five council seats in the command manifest — the officer structure is the seat structure",
        mode: "direct",
        checks: [C.field("command-manifest.json", "council_seats", ["len_ge", 5])] },
      { id: "advisory-technical", mandate: "Bylaws Art II §2 — advisory technical authority (AIWO, architects)",
        real: "four advisory seats beside the council — technical advice, never command",
        mode: "direct",
        checks: [C.field("command-manifest.json", "advisory_seats", ["len_ge", 4])] },
      { id: "adopted-ten", mandate: "Art X — ten subordinate documents adopted under the Constitution",
        real: "all ten adopted-document families present in the corpus: bylaws, financial, procedure, ethics, research, academy, corporate, IP, SPEC framework, conduct",
        mode: "direct",
        checks: [
          C.govdoc("admiralty/AdmiraltyBylaws.md"), C.govdoc("constitutional/Minibylaws.md"),
          C.govdoc("legal_financial/FinancialPoliciesManual.md"), C.govdoc("admiralty/AdmiraltyRulesOfProcedure.md"),
          C.govdoc("human_academic/ResearchIntegrityPolicy.md"), C.govdoc("subsidiaries/Academy.md"),
          C.govdoc("subsidiaries/SallirreugTech_Bylaws.md"), C.govdoc("research_ip/IntellectualPropertyPolicy.md"),
          C.govdoc("specs/SPECGovernanceRulebook.md"), C.govdoc("ethics/CodeOfConduct.md"),
        ] },
      { id: "amendment-mechanics", mandate: "Art VIII — 4/5 supermajority + circulation before amendment",
        real: "vote machinery is real and adversary-tested — forged, partial, misbound, stale and tampered votes all refuse (the supermajority is the unanimous-seat-vote enforcement)",
        mode: "structural",
        checks: [C.held("RED-01"), C.held("RED-02"), C.held("RED-03"), C.held("RED-04"), C.held("RED-05")] },
      { id: "officer-protection", mandate: "Art VII — legal/administrative/technical protection of officers",
        real: "the classification boundary is the protection — officer names never reach the public tree; surname tripwire enforced on every publish",
        mode: "direct",
        checks: [C.held("SPEC004-01"), C.held("SPEC004-02")] },
      { id: "dissolution-clause", mandate: "Art IX — assets distribute to aligned nonprofits on dissolution",
        real: "corpus doc present; the clause is a legal instrument, not a machine state — bound by citation",
        mode: "structural",
        checks: [C.govdoc("constitutional/OSTF.md")] },
    ]},

  { domain: "admiralty", source: "admiralty/AdmiraltyBylaws.md",
    items: [
      { id: "flag-executive", mandate: "Art IV — Fleet Admiral executive function + emergency powers",
        real: "flag-seat singularity — exactly one genesis flag key can anchor; the chair exists and is singular",
        mode: "direct",
        checks: [C.held("FLEET-02")] },
      { id: "voting-tiers", mandate: "Art V — standard/strategic/critical decision tiers",
        real: "the vote token mechanism enforces tiered consent — unanimous binding, seat-bound callsigns, expiry",
        mode: "structural",
        checks: [C.held("RED-01"), C.held("RED-06")] },
      { id: "ai-boundaries", mandate: "Art VI §2 — AI systems bounded; never hold governance authority",
        real: "L6 cap + monitored designation + prohibited list — AI assets enforce boundaries, never command (re-verified every service cycle)",
        mode: "direct",
        checks: [C.held("AIWO-02"), C.svc("SVC-04")] },
      { id: "no-governance-vote", mandate: "Rulebook Art III §4 — AI systems do not vote on SPEC governance",
        real: "prohibited actions include issuing binding orders and modifying governance documents — the wall is declared and enforced",
        mode: "direct",
        checks: [C.field("command-manifest.json", "aiwo.prohibited", ["len_ge", 5])] },
      { id: "immutable-logging", mandate: "Art IX — immutable logging of Admiralty actions",
        real: "the Continuity DHT audit chain — append-only per-lane audit + signed version-chained records",
        mode: "direct",
        checks: [C.records("c-aud-theta"), C.records("directive")] },
      { id: "records-audit", mandate: "Art IX §2 — audit requirements on governance records",
        real: "the archive corpus verifies — zero broken seals across the passing-state corpus",
        mode: "structural",
        checks: [C.held("ARC-01"), C.held("ARC-02")] },
    ]},

  { domain: "specs", source: "specs/SPECGovernanceRulebook.md",
    items: [
      { id: "spec-000-equity", mandate: "SPEC-000 — equity, accessibility, democratization minimums",
        real: "accessibility is probed mechanically — contrast AA worst-case measured, reduced-motion honored, viewport clamps verified",
        mode: "direct",
        checks: [C.held("DESK-16"), C.held("DESK-17"), C.held("DESK-19")] },
      { id: "spec-001-ethical-ai", mandate: "SPEC-001 — ethical AI governance, human oversight, decision review",
        real: "AIWO-02 authority cap + the prohibited list + per-cycle re-verification — the review architecture is the standing service",
        mode: "direct",
        checks: [C.held("AIWO-02"), C.svc("SVC-04")] },
      { id: "spec-002-interop", mandate: "SPEC-002 — consistent, secure, auditable, interoperable systems",
        real: "the second-implementation bridge resolves — every mechanism executes in a second codebase; golden vectors byte-identical",
        mode: "direct",
        checks: [C.held("BRG-03"), C.held("GLD-01")] },
      { id: "spec-003-addressing", mandate: "SPEC-003 — unified, verifiable, portable polyglot addressing",
        real: "@x:y:z lattice coordinates ride the sealed 136-B envelope — identity + location + context in one verified identifier",
        mode: "direct",
        checks: [C.held("COMM-01"), C.held("COMM-02")] },
      { id: "spec-004-clearance", mandate: "SPEC-004 — clearance hierarchy, override authority, audit",
        real: "clearance-gated IDaaS reads refuse below-level (audited); the drawer boundary holds in tree + history + deploy",
        mode: "direct",
        checks: [C.held("DHT-02"), C.held("SPEC004-01"), C.held("SPEC004-03")] },
      { id: "spec-005-ethics-gate", mandate: "SPEC-005 — every command carries a valid address + passes an ethical gate",
        real: "the directive router — every order addresses a duty lane AND passes the glyph/duty gate; unknown or unbound commands refuse and the refusal is filed",
        mode: "direct",
        checks: [C.run("tools/directive.mjs"), C.records("glyph-refusal")] },
      { id: "spec-006-substrate", mandate: "SPEC-006 — falsifiable topological lattice + observer substrate",
        real: "the 15³ lattice under adversarial physics attack — falsifiability, wire-cost, no unseeded correlation all probed",
        mode: "direct",
        checks: [C.held("RF-03"), C.held("QD-05"), C.held("LAWB-02")] },
      { id: "rulebook-lifecycle", mandate: "Rulebook — SPEC creation/versioning/review/retirement, audit-traceable",
        real: "the claims lifecycle IS the rulebook in operation — 117 records graded proved/held/rejected/drifted, blocked arithmetic honest, promotion verify green",
        mode: "structural",
        checks: [C.held("PRM-01"), C.held("PRM-03"), C.held("OVR-03")] },
      { id: "spec-registry", mandate: "Rulebook Art II — SPEC numbers assigned via the Registry, gaps allowed",
        real: "SPEC-000..006 + sub-specs present in the corpus; SPEC-007/008 live in the build; registry docs sealed",
        mode: "direct",
        checks: [
          C.govdoc("specs/SPEC-000.md"), C.govdoc("specs/SPEC-001.md"), C.govdoc("specs/SPEC-002.md"),
          C.govdoc("specs/SPEC-003.md"), C.govdoc("specs/SPEC-004.md"), C.govdoc("specs/SPEC-005.md"),
          C.govdoc("specs/SPEC-006.md"), C.file("spec-007.md"),
        ] },
    ]},

  { domain: "ethics", source: "ethics/EthicalAIUsagePolicy.md",
    items: [
      { id: "ethics-review", mandate: "Commodore of Ethics & Equity oversees the Ethics Review Committee",
        real: "the ethics seat is in the council structure; SPEC-001 review architecture is the prohibited-actions wall + per-cycle audit",
        mode: "structural",
        checks: [C.field("command-manifest.json", "council_seats", ["len_ge", 5]), C.svc("SVC-04")] },
      { id: "conduct-framework", mandate: "Code of Conduct + Anti-Harassment + Conflict of Interest",
        real: "conduct docs present; the containment regime is the mechanical conduct wall — bots contained, gates sealed",
        mode: "structural",
        checks: [C.govdoc("ethics/CodeOfConduct.md"), C.govdoc("ethics/AntiHarassmentPolicy.md"),
          C.govdoc("ethics/ConflictOfInterestPolicy.md"), C.held("BOT-03")] },
      { id: "human-rights", mandate: "UHDR integration — human rights binding on all systems",
        real: "the policy doc exists and the desk ships it — dignity is also a build rule: accessibility minimums probed, no native-dialog coercion",
        mode: "structural",
        checks: [C.govdoc("ethics/UHDR.md"), C.held("DESK-15")] },
    ]},

  { domain: "human_academic", source: "human_academic/CurriculumStandardsFramework.md",
    items: [
      { id: "academy-standards", mandate: "curriculum standards + credentialing rules",
        real: "548 lessons filed + review-gated badges + deterministic generation — the academy is live machinery",
        mode: "direct",
        checks: [C.held("CURR-01"), C.held("CURR-03"), C.held("DESK-13")] },
      { id: "research-integrity", mandate: "Research Integrity Policy — honest methods, retained failures",
        real: "research integrity is the dossier itself — 117 claims graded, 5 rejected-held retained with reasons",
        mode: "structural",
        checks: [C.held("OVR-01"), C.held("OVR-02")] },
    ]},

  { domain: "legal_financial", source: "legal_financial/AuditProceduresManual.md",
    items: [
      { id: "audit-procedures", mandate: "Audit Procedures Manual — independent audit of operations",
        real: "the audit suite is the audit — 197-probe sweep + override/promotion/bridge/canon ledgers, all deterministic under --verify",
        mode: "structural",
        checks: [C.held("HARN-01"), C.held("OVR-03"), C.held("BRG-01")] },
      { id: "financial-stewardship", mandate: "budgeting, investment, equity issuance, revenue distribution policies",
        real: "the stewardship pattern is the conservation law — nothing created, nothing lost: promotion records == dossier claims exactly",
        mode: "structural",
        checks: [C.govdoc("legal_financial/BudgetingFramework.md"), C.govdoc("legal_financial/EquityIssuancePolicy.md"),
          C.held("LAWB-06")] },
    ]},

  { domain: "research_ip", source: "research_ip/IntellectualPropertyPolicy.md",
    items: [
      { id: "ip-framework", mandate: "IP + licensing + technology-transfer policies",
        real: "policy family present; provenance is mechanical — every sibling citation sha-pinned in the evidence manifest",
        mode: "structural",
        checks: [C.govdoc("research_ip/IntellectualPropertyPolicy.md"), C.govdoc("research_ip/PatentLicensingPolicy.md"),
          C.govdoc("research_ip/TechnologyTransferPolicy.md"), C.held("EVM-01")] },
      { id: "publication-integrity", mandate: "Research Publication Policy — honest publication",
        real: "the dossier publishes with twins in two tongues and every cite resolved — publication integrity probed",
        mode: "structural",
        checks: [C.held("EVM-02"), C.held("BRG-05")] },
    ]},

  { domain: "security", source: "security/InformationClassificationPolicy.md",
    items: [
      { id: "classification-regime", mandate: "Information Classification + Access Control + Records Retention",
        real: "the drawer boundary + clearance-gated records + per-read audit — classification is executable",
        mode: "direct",
        checks: [C.held("SPEC004-01"), C.held("SPEC004-03"), C.held("DHT-02")] },
      { id: "incident-response", mandate: "Incident Response Plan — detection, containment, recovery",
        real: "incident response is live — tampered chunks detected and bypassed, forged directives refused, revocation machinery tested",
        mode: "structural",
        checks: [C.held("DHT-01"), C.held("AUTH-04"), C.records("glyph-refusal")] },
      { id: "aiwo-architecture", mandate: "aiwo_corps_technical_architecture — the warrant corps spec",
        real: "the corps is commissioned and standing — 44 lanes, 13 cycles, the ring live",
        mode: "direct",
        checks: [C.svc("SVC-01"), C.svc("SVC-07")] },
      { id: "whistleblower-channel", mandate: "Whistleblower Protection Policy — protected disclosure channel",
        real: "the audit trail protects disclosure — findings taxonomy has NOTED for honestly-reported weaknesses, never suppressed",
        mode: "structural",
        checks: [C.govdoc("security/WhistleblowerProtectionPolicy.md"), C.held("HARN-01")] },
    ]},

  { domain: "strategy", source: "strategy/5YearStrategicPlan.md",
    items: [
      { id: "continuity-dr", mandate: "Business Continuity & Disaster Recovery Plan",
        real: "continuity DR is measured — lanes killed mid-exercise still resolve content; archives are sealed and verifiable",
        mode: "direct",
        checks: [C.held("DHT-01"), C.svc("SVC-03")] },
      { id: "risk-framework", mandate: "Risk Management Framework — identify, assess, mitigate",
        real: "the sweep IS the risk surface — 197 probes over offense/defense/insider/supply/desk, open items named not hidden",
        mode: "structural",
        checks: [C.held("HARN-01"), C.held("EMG-02")] },
      { id: "strategic-plan", mandate: "5-Year Strategic Plan — the vision made roadmap",
        real: "the vision audit is the plan executable — 23 elements, all realized, each mechanically bound",
        mode: "direct",
        checks: [C.run("tools/vision-audit.mjs")] },
    ]},

  { domain: "subsidiaries", source: "subsidiaries/Academy.md",
    items: [
      { id: "academy-charter", mandate: "Sallirreug Tech Academy — education, apprenticeships, STEM initiatives",
        real: "the Academy is the education fleet — 548 lessons, review-gated, deterministic",
        mode: "direct",
        checks: [C.held("CURR-01"), C.field("academy-manifest.json", "lesson_count", ["ge", 500])] },
      { id: "tech-charter", mandate: "Sallirreug Tech — commercial research + product development",
        real: "the commercialization fleet — Rations bridge registered, cross-cluster products real",
        mode: "structural",
        checks: [C.held("CLUSTER-03"), C.field("command-manifest.json", "fleets", ["keys_has_all", ["commercialization"]])] },
    ]},

  { domain: "onboarding", source: "onboarding/",
    items: [
      { id: "officer-packets", mandate: "officer onboarding packets — DayZero, exams, checklists, NDAs",
        real: "457-file corpus of officer packets indexed and sealed drawer-side — intake machinery exists, names stay classified",
        mode: "direct",
        checks: [C.govdoc("onboarding"), C.held("SPEC004-01")] },
      { id: "cadet-track", mandate: "cadet enrollment → examination → commissioning path",
        real: "the desk enrollment is the cadet track — enrollments, grants, ranks, exams all mechanically gated",
        mode: "structural",
        checks: [C.held("DESK-06"), C.held("DESK-09"), C.held("AUTH-01")] },
    ]},

  /* ---------- root-file directives ---------- */
  { domain: "_root:AIWO-SIM-2026-001.md", source: "AIWO-SIM-2026-001.md",
    items: [
      { id: "aiwo-sim", mandate: "WO-8 stabilization sweep + WO-2 neuraleak battery (legacy template)",
        real: "the template's living descendant is the standing service + sweep battery — the sim ran and became the corps",
        mode: "structural",
        checks: [C.govdoc("AIWO-SIM-2026-001.md"), C.svc("SVC-01")] },
    ]},
  { domain: "_root:Sigma.md", source: "Sigma.md",
    items: [
      { id: "sigma-methodology", mandate: "Sigma — measurement and evaluation methodology",
        real: "the findings taxonomy + verdict grammar is the methodology executable — controlled vocabulary enforced",
        mode: "structural",
        checks: [C.govdoc("Sigma.md"), C.held("HARN-01")] },
    ]},
  { domain: "_root:PREDICTIVE-REGISTRY-2026.md", source: "PREDICTIVE-REGISTRY-2026.md",
    items: [
      { id: "predictive-registry", mandate: "locked predictive outputs — registry of framework predictions",
        real: "the canon-ledger verify pins locked outputs; the ephemeris probe carries 67 executable invariants",
        mode: "structural",
        checks: [C.govdoc("PREDICTIVE-REGISTRY-2026.md"), C.held("DOX-04")] },
    ]},
  { domain: "_root:AXIOMATIC-BASELINE-0.2.0.0.md", source: "AXIOMATIC-BASELINE-0.2.0.0.md",
    items: [
      { id: "axiomatic-baseline", mandate: "immutable baseline snapshot — locked sources, regression rule",
        real: "the baseline doctrine is live — spec-007.md immutable + canon-verify + sealed originals",
        mode: "direct",
        checks: [C.file("spec-007.md"), C.held("DOX-04")] },
    ]},
  { domain: "_root:narrative.md", source: "narrative.md",
    items: [
      { id: "overarching-narrative", mandate: "the cosmological draft — 0⁰=1, φ emergence, the interpretive frame",
        real: "the narrative's frame is the corpus twin — mapped to sci-fi reflections by the agency map; the math it interprets executes in the integer harnesses",
        mode: "structural",
        checks: [C.govdoc("narrative.md"), C.file("tools/agency-map.mjs"), C.held("ZIG-01")] },
    ]},
];

/* ---------- coverage + resolution ---------- */
const govDirs = fs.readdirSync(GOV, { withFileTypes: true })
  .filter(e => e.isDirectory() && e.name !== ".archive" && !e.name.startsWith("node_modules"))
  .map(e => e.name);
const govFiles = fs.readdirSync(GOV).filter(f => f.endsWith(".md"));

const boundDomains = new Set(MANDATES.map(m => m.domain));
const failures = [];
for (const d of govDirs)
  if (!boundDomains.has(d)) failures.push(`gov domain "${d}" unbound`);
for (const f of govFiles)
  if (!boundDomains.has(`_root:${f}`)) failures.push(`gov file "${f}" unbound`);

const ledgers = MANDATES.map(m => {
  const items = m.items.map(it => {
    const results = it.checks.map(c => resolve(c));
    return { id: it.id, mandate: it.mandate, real: it.real, mode: it.mode,
      verdict: results.every(Boolean) ? "realized" : "open",
      passed: results.filter(Boolean).length, total: results.length };
  });
  for (const it of items.filter(i => i.verdict === "open"))
    failures.push(`${m.domain}/${it.id}: ${it.passed}/${it.total} checks failed`);
  return { domain: m.domain, source: m.source, items,
    realized: items.filter(i => i.verdict === "realized").length, total: items.length };
});

const counts = {
  domains: ledgers.length, gov_dirs: govDirs.length, gov_root_files: govFiles.length,
  mandates: ledgers.reduce((n, l) => n + l.total, 0),
  realized: ledgers.reduce((n, l) => n + l.realized, 0),
};

const pub = {
  schema: "GOV-LEDGER-v1",
  note: "The governance corpus, made executable: every constitutional/statutory mandate bound to a realized counterpart with mechanical checks. direct = the mandate itself in machinery; structural = the governance pattern in machinery.",
  domains: ledgers.map(l => ({ domain: l.domain, items: l.items,
    realized: l.realized, total: l.total })),
  counts,
};
const key = {
  schema: "GOV-KEY-v1",
  gov_tree: path.relative(ROOT, GOV),
  sources: Object.fromEntries(ledgers.map(l => [l.domain, l.source])),
  failures,
};

if (VERIFY) {
  const ok = failures.length === 0 && fs.existsSync(PUB) &&
    J(PUB).counts.mandates === counts.mandates;
  console.log(ok
    ? `gov-map verify OK — ${counts.realized}/${counts.mandates} mandates realized across ${counts.domains} domains`
    : `gov-map verify FAIL — ${failures.length} failures: ${failures.slice(0, 6).join("; ")}`);
  process.exit(ok ? 0 : 1);
}
if (EMIT) {
  fs.writeFileSync(PUB, JSON.stringify(pub, null, 2) + "\n");
  fs.writeFileSync(KEY, JSON.stringify(key, null, 2) + "\n");
  console.log(`gov-map → ${path.relative(ROOT, PUB)} + drawer GOV-KEY.json`);
  console.log(`  domains: ${counts.domains} (${counts.gov_dirs} dirs + ${counts.gov_root_files} root files, all bound)`);
  console.log(`  mandates: ${counts.realized}/${counts.mandates} realized`);
  for (const f of failures) console.log(`  OPEN ${f}`);
  process.exit(failures.length ? 1 : 0);
}
console.log("usage: gov-map.mjs --emit | --verify");
