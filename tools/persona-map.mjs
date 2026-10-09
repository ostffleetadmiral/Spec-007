#!/usr/bin/env node
/* persona-map.mjs — the casting office ledger.

   Layer-2 doctrine: signers under restricted callsigns play Bond-universe
   roles while running real Academy training. This emitter turns the watch
   list in site/assets/fano-auth.js (the single source of truth for reserved
   names) into a deterministic manifest: every restricted name lands in
   exactly one class — assignable persona (with cover role, academy track,
   suggested branch, flavor hook), an alias of one, or a non-assignable
   holding (adversary / org / fleet / title / zh-mirror).

   Coverage is enforced: a RESTRICTED_NAMES entry absent from the tables
   below fails emission — new watch-list names must be curated, never
   silently classified.

   Modes:
     (bare)      dry-run — prints the persona set it would emit
     --emit      write site/assets/persona-manifest.json
     --verify    pass iff the manifest equals a fresh regeneration
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTH = path.join(ROOT, "site", "assets", "fano-auth.js");
const MANIFEST = path.join(ROOT, "site", "assets", "persona-manifest.json");
const ACADEMY = path.join(ROOT, "site", "assets", "academy-manifest.json");

/* ---------- parse the auth module (source of truth) ---------- */
const authSrc = fs.readFileSync(AUTH, "utf8");
const rnBlock = authSrc.slice(
  authSrc.indexOf("RESTRICTED_NAMES = {"),
  authSrc.indexOf("};", authSrc.indexOf("RESTRICTED_NAMES = {")));
const restricted = new Set();
for (const m of rnBlock.matchAll(/(?:^|[{,])\s*(?:"([^"]+)"|([A-Za-z_][A-Za-z0-9_]*)):\s*1/gm))
  restricted.add((m[1] || m[2]).toLowerCase());
const brBlock = authSrc.slice(
  authSrc.indexOf("var BRANCHES = ["),
  authSrc.indexOf("];", authSrc.indexOf("var BRANCHES = [")));
const BRANCHES = [...brBlock.matchAll(/"([^"]+)"/g)].map(m => m[1]);

const academy = JSON.parse(fs.readFileSync(ACADEMY, "utf8"));
const TOPICS = new Set((academy.lessons || []).map(l => l.topic));

/* ---------- the casting sheet (canonical personas) ---------- */
/* cs, cls, role, track, branch, hook — assignable: true by definition here */
const PERSONAE = [
  /* the service — posts are issued, not picked */
  { cs: "m", cls: "service", role: "station_chief", track: "systems", branch: "admiralty",
    hook: "In committee. M is always in committee." },
  { cs: "q", cls: "service", role: "q_branch", track: "systems", branch: "specs",
    hook: "The Quartermaster does not sign up through a form." },
  { cs: "boothroyd", cls: "service", role: "q_branch", track: "systems", branch: "specs",
    hook: "The original armourer — the post predates the letter." },
  { cs: "quartermaster", cls: "service", role: "q_branch", track: "systems", branch: "specs",
    hook: "The stores are signed for. All of them." },
  { cs: "mallory", cls: "service", role: "station_chief", track: "systems", branch: "admiralty",
    hook: "The chairman reads every file, including this one." },
  { cs: "charles robinson", cls: "service", role: "operator", track: "communications", branch: "admiralty",
    hook: "Chief of staff — the message lands where it should." },
  { cs: "tanner", cls: "service", role: "operator", track: "systems", branch: "strategy",
    hook: "Chief of staff — every plan survives contact with him." },
  { cs: "moneypenny", cls: "service", role: "operator", track: "orientation", branch: "human_academic",
    hook: "The desk is already spoken for — the duty is real." },
  { cs: "station chief", cls: "service", role: "operator", track: "communications", branch: "security",
    hook: "The foreign station head — the wire's other end." },
  /* the agent himself */
  { cs: "bond", cls: "agent", role: "field_agent", track: "security", branch: "security",
    hook: "The name is taken. The file on it is longer than yours." },
  /* allies and assets — people with files of their own */
  { cs: "leiter", cls: "ally", role: "field_agent", track: "communications", branch: "security",
    hook: "The liaison — allied service, same wire." },
  { cs: "quarrel", cls: "ally", role: "field_agent", track: "security", branch: "security",
    hook: "The boat captain who asks the right questions." },
  { cs: "mathis", cls: "ally", role: "field_agent", track: "identity", branch: "security",
    hook: "The contact who vouches — identity is his trade." },
  { cs: "jack wade", cls: "ally", role: "field_agent", track: "communications", branch: "security",
    hook: "The other agency's man — brings gifts." },
  { cs: "mary goodnight", cls: "ally", role: "operator", track: "orientation", branch: "human_academic",
    hook: "Field support — the file says competent, the record says loyal." },
  { cs: "jock campbell", cls: "ally", role: "operator", track: "orientation", branch: "human_academic",
    hook: "Air support — he flies what you ask." },
  { cs: "wai lin", cls: "ally", role: "field_agent", track: "security", branch: "security",
    hook: "Colonel of an allied service — the parallel ledger, not a civilian." },
  { cs: "nomi", cls: "ally", role: "field_agent", track: "security", branch: "security",
    hook: "The number moved; the seat held." },
  { cs: "paloma", cls: "ally", role: "field_agent", track: "identity", branch: "security",
    hook: "Three weeks training. Still better briefed than you." },
  { cs: "jinx", cls: "ally", role: "field_agent", track: "security", branch: "security",
    hook: "Allied service, parallel ledger — she signs her own reports." },
  { cs: "pam bouvier", cls: "ally", role: "field_agent", track: "security", branch: "security",
    hook: "Pilot. Army. The file says do not underestimate." },
  { cs: "tatiana romanova", cls: "ally", role: "operator", track: "identity", branch: "security",
    hook: "The cipher clerk — identity work, literally." },
  { cs: "solitaire", cls: "ally", role: "operator", track: "ai-literacy", branch: "research_ip",
    hook: "Reads what has not happened — pattern work, filed honestly." },
  { cs: "octopussy", cls: "ally", role: "field_agent", track: "communications", branch: "legal_financial",
    hook: "Runs a floating ledger — logistics with jewels." },
  { cs: "pussy galore", cls: "ally", role: "field_agent", track: "communications", branch: "legal_financial",
    hook: "Runs a crew, not a solo act — organization is the skill." },
  { cs: "tiffany case", cls: "ally", role: "operator", track: "communications", branch: "legal_financial",
    hook: "The courier — she knows every route that never declared." },
  { cs: "honey ryder", cls: "ally", role: "operator", track: "ethics", branch: "human_academic",
    hook: "Self-educated off an encyclopedia — the Academy's whole thesis." },
  { cs: "kara milovy", cls: "ally", role: "operator", track: "orientation", branch: "human_academic",
    hook: "The cellist — notice what she notices." },
  { cs: "stacey sutton", cls: "ally", role: "operator", track: "systems", branch: "research_ip",
    hook: "State geologist — the ground truth is literal." },
  { cs: "christmas jones", cls: "ally", role: "operator", track: "systems", branch: "research_ip",
    hook: "Nuclear physicist — the joke is the name, not the degree." },
  { cs: "madeleine swann", cls: "ally", role: "operator", track: "ethics", branch: "human_academic",
    hook: "The psychiatrist — she reads the file on the reader." },
  { cs: "tracy", cls: "ally", role: "operator", track: "orientation", branch: "human_academic",
    hook: "The only one who ever held the title — the ledger remembers." },
];

/* ---------- alias resolutions (second spelling → canonical persona) ---------- */
const ALIASES = {
  "james bond": "bond", "miss moneypenny": "moneypenny", "bill tanner": "tanner",
  "gareth mallory": "mallory", "major boothroyd": "boothroyd",
  "felix leiter": "leiter", "rene mathis": "mathis", "goodnight": "mary goodnight",
  "honeychile rider": "honey ryder", "jinx johnson": "jinx",
  "countess tracy": "tracy", "teresa di vicenzo": "tracy", "miss case": "tiffany case",
};

/* ---------- non-assignable holdings ---------- */
const NONPERSONAE = {
  /* the other side of the ledger — lore, not billets */
  "blofeld": "adversary", "ernst stavro blofeld": "adversary", "franz oberhauser": "adversary",
  "goldfinger": "adversary", "auric goldfinger": "adversary", "oddjob": "adversary",
  "jaws": "adversary", "trevelyan": "adversary", "alec trevelyan": "adversary",
  "janus": "adversary", "scaramanga": "adversary", "francisco scaramanga": "adversary",
  "dr no": "adversary", "dr. no": "adversary", "dr julius no": "adversary",
  "le chiffre": "adversary", "mr big": "adversary", "drax": "adversary", "hugo drax": "adversary",
  "rosa klebb": "adversary", "klebb": "adversary", "red grant": "adversary", "donald grant": "adversary",
  "largo": "adversary", "emilio largo": "adversary", "stromberg": "adversary", "karl stromberg": "adversary",
  "kananga": "adversary", "dr kananga": "adversary", "zorin": "adversary", "max zorin": "adversary",
  "whitaker": "adversary", "general ourumov": "adversary", "ourumov": "adversary",
  "onatopp": "adversary", "xenia onatopp": "adversary", "renard": "adversary", "victor zokas": "adversary",
  "mr white": "adversary", "raoul silva": "adversary", "tiago rodriguez": "adversary",
  "safin": "adversary", "lyutsifer safin": "adversary", "dominic greene": "adversary",
  "mr wint": "adversary", "mr kidd": "adversary", "general gogol": "adversary", "dr alvarez": "adversary",
  "elektra king": "adversary", "miranda frost": "adversary",
  /* the honored dead — the file closed badly */
  "vesper": "honored", "vesper lynd": "honored",
  /* organizations — nobody joins by asking */
  "spectre": "org", "smersh": "org", "quantum": "org", "the union": "org",
  "mi6": "org", "sis": "org", "the service": "org", "q-branch": "org", "q branch": "org",
  "universal exports": "org", "vauxhall cross": "org",
  /* designations and titles, not persons */
  "double-oh": "title", "double oh": "title",
  /* the fleet's own — real offices move through the grant chain, not casting */
  "fleet admiral": "fleet", "the fleet admiral": "fleet", "admiral": "fleet", "commodore": "fleet",
  "captain": "fleet", "ramsey": "fleet", "the meter": "fleet", "meter": "fleet",
  "sigma": "fleet", "aiwo": "fleet", "the admiralty": "fleet", "day zero": "fleet",
  "axiomatic baseline": "fleet", "vice admiral": "fleet", "rear admiral": "fleet",
  "vice admiral of stem initiatives": "fleet", "rear admiral of entrepreneurship": "fleet",
  "admiral of financial operations": "fleet", "commodore of ethics and equity": "fleet",
  "lead technical systems architect": "fleet", "lead security and fabrication officer": "fleet",
  "chief warrant officer": "fleet", "warrant officer": "fleet", "research lead": "fleet",
  "chief of staff": "fleet", "chief of lifesupport": "fleet", "commander": "fleet",
  "lieutenant": "fleet", "ensign": "fleet", "midshipman": "fleet",
  "ostf": "fleet", "open sentience technology foundation": "fleet",
  "sallirreugtech": "fleet", "sallirreug tech": "fleet", "sallirreugtech academy": "fleet",
  "sallirreug academy": "fleet",
  /* zh faces of the same watch list */
  "龐德": "zh-mirror", "詹姆斯龐德": "zh-mirror", "詹姆斯·龐德": "zh-mirror", "情報員": "zh-mirror",
  "軍需官": "zh-mirror", "錢班霓": "zh-mirror", "金手指": "zh-mirror", "布洛菲": "zh-mirror",
  "魔鬼黨": "zh-mirror", "海軍上將": "zh-mirror", "ｑ": "zh-mirror", "ｍ": "zh-mirror",
};

/* ---------- build ---------- */
const canon = new Map(PERSONAE.map(p => [p.cs, p]));
const errors = [];

/* every alias must resolve to a canonical persona */
for (const [a, t] of Object.entries(ALIASES))
  if (!canon.has(t)) errors.push(`alias "${a}" → "${t}" has no canonical persona`);

/* every assignable row must carry valid track/branch */
for (const p of PERSONAE) {
  if (!restricted.has(p.cs)) errors.push(`persona "${p.cs}" is not a restricted callsign`);
  if (!TOPICS.has(p.track)) errors.push(`persona "${p.cs}" track "${p.track}" not in academy topics`);
  if (!BRANCHES.includes(p.branch)) errors.push(`persona "${p.cs}" branch "${p.branch}" not in BRANCHES`);
}

/* full coverage: every restricted name classified */
const rows = [];
for (const cs of [...restricted].sort()) {
  if (canon.has(cs)) {
    const p = canon.get(cs);
    rows.push({ assignable: true, branch: p.branch, callsign: cs, class: p.cls,
      cover_role: p.role, hook: p.hook, track: p.track });
  } else if (ALIASES[cs]) {
    rows.push({ assignable: true, alias_of: ALIASES[cs], callsign: cs, class: "alias" });
  } else if (NONPERSONAE[cs]) {
    rows.push({ assignable: false, callsign: cs, class: NONPERSONAE[cs] });
  } else {
    errors.push(`restricted name "${cs}" is unclassified — curate it into PERSONAE, ALIASES, or NONPERSONAE`);
  }
}

if (errors.length) {
  console.error("persona-map: coverage failures\n  " + errors.join("\n  "));
  process.exit(1);
}

const manifest = {
  schema: "PERSONA-MAP-v1",
  note: "Layer-2 casting office. Personas are cover, not authority — issuance rides the FANO-CALLSIGN-v1 grant chain. Regex-gated designations (00x, rank prefixes, WO-n, the admiralty) are covered by fano-auth.js RESTRICTED_RE, outside this literal table.",
  persona_count: rows.length,
  assignable_count: rows.filter(r => r.assignable).length,
  tracks: [...TOPICS].sort(),
  branches: [...BRANCHES].sort(),
  personas: rows,
};
const bytes = JSON.stringify(manifest, null, 2) + "\n";

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";

if (mode === "dry") {
  console.log(`persona-map — dry-run (${rows.length} names, ${manifest.assignable_count} assignable, writes nothing)`);
  rows.filter(r => r.assignable && !r.alias_of)
    .forEach(r => console.log(`  ${r.callsign.padEnd(22)} ${r.class}/${r.cover_role} → ${r.track} → ${r.branch}`));
  process.exit(0);
}
if (mode === "verify") {
  let cur = null;
  try { cur = fs.readFileSync(MANIFEST, "utf8"); } catch (e) {}
  const ok = cur === bytes;
  console.log(ok
    ? `persona-map verify OK — ${rows.length} names deterministic, ${manifest.assignable_count} assignable`
    : "persona-map verify FAIL — manifest does not match regeneration; run --emit");
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(MANIFEST, bytes);
console.log(`persona-map → ${path.relative(ROOT, MANIFEST)} (${rows.length} names, ${manifest.assignable_count} assignable)`);
