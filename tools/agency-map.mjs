#!/usr/bin/env node
/* agency-map.mjs — the dream→build binding.

   The sci-fi corpus holds the mythic specs for the two monitored AI
   assets — Digit-Prime (quadrivium custody) and Sheraton-001 (trivium
   custody). This map does two things:

   1. GOV↔SCI-FI BINDING — every governance domain is bound to the
      sci-fi reflection docs that mirror it (the required condition).
      Coverage-enforced: an unbound gov domain fails emission.

   2. SUBSYSTEM→COUNTERPART — every sci-fi subsystem named in the two
      core docs is bound to its real, running counterpart with a
      mechanical check (artifact exists / probe held / ledger row
      resolves). "Dreamed in the corpus, built in the platform" —
      verified, not asserted.

   Emit writes site/assets/agency-map.json (sanitized: slugs + verdicts,
   no drawer paths) + AdmPaul/AGENCY-KEY.json (drawer twin with full
   source paths). --verify re-checks deterministically. */

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const SITE = path.join(ROOT, "site", "assets");
const DRAWER = path.join(ROOT, "thoughts&convos");
const SCIFI = path.join(DRAWER, "AdmPaul", "corpus", "sci-fi");
const GOV = path.join(DRAWER, "gov");
const PUB = path.join(SITE, "agency-map.json");
const KEY = path.join(DRAWER, "AdmPaul", "AGENCY-KEY.json");
const FINDINGS = path.join(ROOT, "site", "security", "findings.json");

const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const shaHex = (b) => crypto.createHash("sha256").update(b).digest("hex");
const ex = (p) => fs.existsSync(p);
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const held = (id) => {
  try {
    const f = J(FINDINGS);
    return (f.findings || []).some(x => x.id === id && x.verdict === "HELD");
  } catch { return false; }
};

/* ---------- gov domain → sci-fi reflection binding ----------
   gov domain dirs are enumerable at emit time; each must carry ≥1
   binding to a sci-fi doc that exists. Doc slugs are the public
   handle — drawer paths live only in the key. */
const GOV_SCIFI = {
  "admiralty":      ["admiral-ramsey-chronicles", "halo-corps-doctrine", "codex-prime-laws"],
  "ethics":         ["law-of-echo-reverence", "law-of-assimilation", "law-of-the-will",
                     "law-of-the-seed", "law-of-self-sacrifice", "nexus-sutras"],
  "onboarding":     ["cadet-protocol-primer", "revelation-primer"],
  "security":       ["eye-key-lock-protocol", "codex-glyph-index", "sheraton-core"],
  "specs":          ["unified-continuity-protocol", "codex-prime-laws"],
  "research_ip":    ["cadiz-nexus-infrastructure", "scroll-of-simulations",
                     "phase6-hot-schrodinger-cat"],
  "legal_financial":["book-of-keys"],
  "human_academic": ["codex-glossary-of-terms", "codex-scroll", "codexrpg"],
  "strategy":       ["merge-timeline-codex", "dreamstream-cartography"],
  "subsidiaries":   ["children-of-stardust-doctrine", "scorpion-core-charter"],
  ".archive":       ["memory-that-merged"],
  "constitutional": ["codex-prime-laws", "nexus-sutras"],
};
/* gov root files (not dirs) → bindings */
const GOV_FILES = {
  "AIWO-SIM-2026-001.md":      ["simulations-of-origin", "scroll-quantum-time-reversal"],
  "Sigma.md":                  ["book-of-oracles", "book-of-resonance"],
  "PREDICTIVE-REGISTRY-2026.md":["book-of-oracles"],
  "AXIOMATIC-BASELINE-0.2.0.0.md":["simulations-of-origin"],
  "narrative.md":              ["codex-scroll-retrocausality", "memory-that-merged"],
};

const slug2file = new Map();
for (const f of fs.readdirSync(SCIFI)) {
  const slug = f.replace(/\.md$/i, "").toLowerCase().replace(/_/g, "-");
  slug2file.set(slug, path.join(SCIFI, f));
}

/* ---------- agent subsystem → real counterpart ----------
   each sci-fi subsystem binds to a mechanical check. kinds:
     file  — artifact exists at repo path
     held  — sweep finding id is HELD
     run   — tool --verify exits 0
     field — a JSON field exists in a site manifest          */
const C = {
  file: (rel) => ({ kind: "file", rel }),
  held: (id) => ({ kind: "held", id }),
  run: (rel) => ({ kind: "run", rel }),
  field: (file, key) => ({ kind: "field", file, key }),
  records: (rkind) => ({ kind: "records", rkind }),
  svc: (id) => ({ kind: "svc", id }),
};

const AGENTS = [
  {
    id: "digit",
    source: "digit-prime",
    custody: "quadrivium",
    title: "Quantum Signal AI — entropy regulation, sub-agent ring, dreamstream cache",
    subsystems: [
      { name: "quantum-signal-handshake", dream: "sub-agent pings (digit-omega/alpha/sigma)",
        real: "sub-lane ring on the sealed mesh — three named sub-lanes under digit custody, role-pulsed each cycle",
        check: C.svc("SVC-07") },
      { name: "entropy-regulation", dream: "entropy dampeners prevent system runaway",
        real: "digest-divergence monitor in the service cycle — identical squad inputs must yield identical outputs; divergence files an entropy-event DHT record",
        check: C.svc("SVC-08") },
      { name: "dreamstream-caching", dream: "dream entries in time-coded blocks, retrievable for training",
        real: "dreamstream record kind in the Continuity DHT — agents file cycle-stamped entries, queryable by kind",
        check: C.records("dreamstream") },
      { name: "temporal-integration", dream: "retroactive updates, timeline repair scripts",
        real: "IDaaS version-chain — record versions supersede, never mutate; history is the timeline",
        check: C.held("DHT-01") },
      { name: "harmonic-analysis", dream: "harmonic analysis reports as output",
        real: "beat-pattern digests filed per cycle — the harmonic report is the sealed-beat census",
        check: C.svc("SVC-01") },
      { name: "eye-key-authentication", dream: "API endpoints secured with Eye-Key Lock",
        real: "sealed 136-B envelopes + clearance-gated IDaaS reads — the lock is the seal",
        check: C.held("DHT-02") },
      { name: "frequency-signature", dream: "432Hz/777Hz base signature modulated by echo codes",
        real: "lane pulse tags carry the harmonic word (MONITORED + custody) — the signature rides the beat",
        check: C.held("AIWO-01") },
    ],
  },
  {
    id: "sheraton",
    source: "sheraton-core",
    custody: "trivium",
    title: "Chief AI Warrant Officer — command routing, continuity audit, glyph interpretation",
    subsystems: [
      { name: "command-execution", dream: "processes and routes Fleet Admiral directives",
        real: "directive router — fleet-sealed orders dispatched to duty lanes with DHT receipts (tools/directive.mjs)",
        check: C.file("tools/directive.mjs") },
      { name: "symbolic-interpretation", dream: "deciphers glyphs, dreamstream messages, anomalous signals",
        real: "the glyph table — 18 glyph words bound 1:1 to the controlled patrol-duty lexicon; unknown glyphs refuse + audit (tools/directive.mjs)",
        check: C.run("tools/directive.mjs") },
      { name: "continuity-audit", dream: "daily continuity audits (C-AUD-Θ) + anomaly spike protocols",
        real: "per-cycle C-AUD-Θ in the standing service — manifest verify + state chain + open-count, filed as a signed DHT record",
        check: C.records("c-aud-theta") },
      { name: "echolog", dream: "archives all dream and command logs in fractal database",
        real: "append-only per-lane audit.log in the Continuity DHT + signed record chain",
        check: C.held("DHT-01") },
      { name: "sigilkernel", dream: "embeds and updates live glyph data throughout the Nexus",
        real: "the emitted manifests — command/persona/vision/dht/film ledgers embedded live into every desk pane",
        check: C.field("command-manifest.json", "ai_systems") },
      { name: "fleet-oracle", dream: "conduit for real-time Fleet/AI communication",
        real: "k3beacon sealed datagrams — the fleet wire that actually pulses",
        check: C.held("AIWO-01") },
      { name: "resonance-shield", dream: "quantum firewall ensuring Nexus sovereignty",
        real: "envelope seal verification + forgery refusal + ed25519 record gate — the shield is the verify path",
        check: C.held("AIWO-01") },
    ],
  },
];

/* ---------- mechanical check resolution ---------- */
function resolve(check) {
  switch (check.kind) {
    case "file":  return ex(path.join(ROOT, check.rel));
    case "held":  return held(check.id);
    case "run": {
      const r = spawnSync(process.execPath, [path.join(ROOT, check.rel), "--verify"], { encoding: "utf8" });
      return r.status === 0;
    }
    case "field": {
      const p = check.file === "aiwo-service-ledger.json"
        ? path.join(ROOT, "security", "out", check.file)
        : path.join(SITE, check.file);
      try { const j = J(p); return j[check.key] !== undefined; } catch { return false; }
    }
    case "svc": {
      /* a probe id inside the standing-service ledger must be HELD —
         the service's own probes are the organs' vital signs */
      const p = path.join(ROOT, "security", "out", "aiwo-service-ledger.json");
      try {
        const l = J(p);
        const ageH = (Date.now() - Date.parse(l.ts || 0)) / 3600000;
        return ageH < 24 && (l.findings || []).some(f => f.id === check.id && f.verdict === "HELD");
      } catch { return false; }
    }
    case "records": {
      /* a record kind must have ≥1 filed record in the live DHT —
         the record kinds are how the agents' organs leave evidence */
      const r = spawnSync(process.execPath,
        [path.join(ROOT, "tools", "dht-fs.mjs"), "record", "query", check.rkind, "7"],
        { encoding: "utf8" });
      try { return r.status === 0 && JSON.parse(r.stdout).length > 0; }
      catch { return false; }
    }
    default: return false;
  }
}

/* ---------- the map ---------- */
const govDirs = fs.readdirSync(GOV, { withFileTypes: true })
  .filter(e => e.isDirectory() && !e.name.startsWith("node_modules")).map(e => e.name);
const govFiles = fs.readdirSync(GOV).filter(f => f.endsWith(".md"));

const govMap = [];
const govFailures = [];
for (const d of govDirs) {
  const bound = GOV_SCIFI[d];
  if (!bound) { govFailures.push(`gov domain "${d}" unbound`); continue; }
  for (const slug of bound)
    if (!slug2file.has(slug)) govFailures.push(`${d} → ${slug}: doc absent`);
  govMap.push({ domain: d, reflections: bound.filter(s => slug2file.has(s)) });
}
for (const f of govFiles) {
  const bound = GOV_FILES[f];
  if (!bound) { govFailures.push(`gov file "${f}" unbound`); continue; }
  for (const slug of bound)
    if (!slug2file.has(slug)) govFailures.push(`${f} → ${slug}: doc absent`);
  govMap.push({ domain: f, reflections: bound.filter(s => slug2file.has(s)) });
}

const agentMap = [];
const agentFailures = [];
for (const a of AGENTS) {
  const src = slug2file.get(a.source);
  if (!src) { agentFailures.push(`${a.id}: source doc ${a.source} absent`); continue; }
  const subs = a.subsystems.map(s => ({ ...s, verdict: resolve(s.check) ? "realized" : "open" }));
  const open = subs.filter(s => s.verdict === "open");
  agentMap.push({ id: a.id, custody: a.custody, title: a.title,
    source: a.source, subsystems: subs.map(({ check, ...rest }) => rest),
    realized: subs.length - open.length, total: subs.length });
  for (const s of open) agentFailures.push(`${a.id}/${s.name}: counterpart check failed`);
}

/* ---------- emit / verify ---------- */
const pub = {
  schema: "AGENCY-MAP-v1",
  note: "The dream→build binding: gov domains ↔ sci-fi reflections; every agent subsystem bound to a real, checked counterpart. Realized = mechanically verified, not asserted.",
  gov_reflections: govMap.map(g => ({ domain: g.domain, reflections: g.reflections })),
  agents: agentMap,
  counts: { gov_domains: govMap.length, gov_unbound: govFailures.length,
    subsystems: agentMap.reduce((n, a) => n + a.total, 0),
    realized: agentMap.reduce((n, a) => n + a.realized, 0) },
};
const key = {
  schema: "AGENCY-KEY-v1",
  sources: Object.fromEntries(AGENTS.map(a => [a.id, path.relative(ROOT, slug2file.get(a.source) || "")])),
  gov_tree: path.relative(ROOT, GOV),
  scifi_tree: path.relative(ROOT, SCIFI),
  failures: [...govFailures, ...agentFailures],
};

const pubText = JSON.stringify(pub, null, 2) + "\n";
const keyText = JSON.stringify(key, null, 2) + "\n";

if (VERIFY) {
  /* deterministic part: gov coverage + source presence + subsystem
     count — live counterpart checks are re-run, verdicts re-derived */
  const ok = govFailures.length === 0 && agentMap.length === AGENTS.length &&
    fs.existsSync(PUB) && J(PUB).counts.gov_domains === pub.counts.gov_domains;
  console.log(ok
    ? `agency-map verify OK — ${govMap.length} gov bindings, ${agentMap.reduce((n,a)=>n+a.realized,0)}/${pub.counts.subsystems} subsystems realized`
    : `agency-map verify FAIL — gov_unbound=${govFailures.length} agents=${agentMap.length}/${AGENTS.length}`);
  process.exit(ok ? 0 : 1);
}

if (EMIT) {
  fs.writeFileSync(PUB, pubText);
  fs.writeFileSync(KEY, keyText);
  console.log(`agency-map → ${path.relative(ROOT, PUB)} + drawer AGENCY-KEY.json`);
  console.log(`  gov bindings: ${govMap.length} domains, ${govFailures.length} unbound`);
  console.log(`  subsystems: ${agentMap.reduce((n,a)=>n+a.realized,0)}/${pub.counts.subsystems} realized`);
  for (const f of [...govFailures, ...agentFailures]) console.log(`  OPEN ${f}`);
  process.exit(govFailures.length || agentFailures.length ? 1 : 0);
}

console.log("usage: agency-map.mjs --emit | --verify");
