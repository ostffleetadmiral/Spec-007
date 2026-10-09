#!/usr/bin/env node
/* persona-map.mjs — the casting office ledger, three-tier matrix.

   Layer-2 doctrine: signers under restricted callsigns play cover roles
   while running real Academy training. This emitter turns the watch list
   in site/assets/fano-auth.js (the single source of truth for reserved
   names) plus the provisional-Admiralty onboarding packets in
   thoughts&convos/gov/onboarding/ into a deterministic manifest.

   The matrix, inside → out:
     tier 3 — constitutional offices (the provisional Admiralty's billets;
              seat held — the billet trains toward the seat, never holds it)
     tier 2 — Star Command / Academy corps billets (fleet ranks and staff
              posts; seat open — a real billet to train in)
     tier 1 — the MI6 cover pool (service posts, field agents, allies)

   The closed ledger: adversaries all report_to the archvillain — the
   Meter, the Scarcity Loop's architect (gov/ethics/Manifesto.md, already
   declassified as site/manifesto.html). Orgs, institutions, titles,
   honored dead, occupied seats and zh-mirrors are never cast.

   Coverage is enforced both ways: every RESTRICTED_NAMES entry must be
   classified here, and every Admiralty-assigned office in the onboarding
   packets must resolve to a restricted callsign — drift fails emission.

   Artifacts:
     site/assets/persona-manifest.json   — public (PERSONA-MAP-v2).
       Zero officer names — the emitter self-audits against the surname
       tripwire before writing.
     thoughts&convos/AdmPaul/ADMIRALTY-KEY.json + .md — drawer-side key:
       officer → billets → seat class. Never published (SPEC-004).

   Modes: (bare) dry-run · --emit · --verify (all three artifacts)
*/
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const AUTH = path.join(ROOT, "site", "assets", "fano-auth.js");
const MANIFEST = path.join(ROOT, "site", "assets", "persona-manifest.json");
const ACADEMY = path.join(ROOT, "site", "assets", "academy-manifest.json");
const ONBOARD = path.join(ROOT, "thoughts&convos", "gov", "onboarding");
const KEY_JSON = path.join(ROOT, "thoughts&convos", "AdmPaul", "ADMIRALTY-KEY.json");
const KEY_MD = path.join(ROOT, "thoughts&convos", "AdmPaul", "ADMIRALTY-KEY.md");

/* names that must never reach the public projection — built dynamically
   from the onboarding officer surnames (same set as the publish-check
   surname tripwire; literals never live in source) */

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

/* ---------- ingest the provisional Admiralty (drawer corpus) ---------- */
/* each officer packet carries "Assigned Roles": Primary/Secondary/Tertiary */
const officers = [];
if (fs.existsSync(ONBOARD)) {
  for (const dir of fs.readdirSync(ONBOARD, { withFileTypes: true })) {
    if (!dir.isDirectory()) continue;
    const readme = path.join(ONBOARD, dir.name, "README.md");
    if (!fs.existsSync(readme)) continue;
    const src = fs.readFileSync(readme, "utf8");
    const role = k => (src.match(new RegExp(`\\*\\*${k}:\\*\\*\\s*(.+)`)) || [])[1]?.trim();
    const officer = dir.name.replace(/_/g, " ");
    officers.push({
      officer,
      primary: role("Primary"), secondary: role("Secondary"), tertiary: role("Tertiary"),
      source: `gov/onboarding/${dir.name}/README.md`,
    });
  }
}
const errors = [];
/* the classified set — officer surnames derived from the packets */
const surnames = officers.map(o => o.officer.split(" ").pop());
const TRIPWIRE = new RegExp("\\b(" + surnames.join("|") + ")\\b");
const TRIPWIRE_LC = new RegExp("\\b(" + surnames.map(s => s.toLowerCase()).join("|") + ")\\b");
for (const o of officers)
  for (const k of ["primary", "secondary", "tertiary"])
    if (o[k] && !restricted.has(o[k].toLowerCase()))
      errors.push(`admiralty: ${o.officer}'s ${k} billet "${o[k]}" is not a restricted callsign`);

/* ---------- the casting sheet — canonical personas by tier ---------- */
const PERSONAE = [
  /* ── tier 3 · constitutional offices (seat held by a provisional officer) ── */
  { cs: "vice admiral of stem initiatives", cls: "fleet", tier: 3, seat: "held",
    role: "constitutional_officer", track: "ai-literacy", branch: "human_academic",
    hook: "Oversight of Academy and research — the seat reviews what the curriculum teaches." },
  { cs: "rear admiral of entrepreneurship", cls: "fleet", tier: 3, seat: "held",
    role: "constitutional_officer", track: "campaign", branch: "strategy",
    hook: "Scaling Sallirreug Tech — deployment is the mandate." },
  { cs: "admiral of financial operations", cls: "fleet", tier: 3, seat: "held",
    role: "constitutional_officer", track: "systems", branch: "legal_financial",
    hook: "Treasury and audit — the equity model reports to this desk." },
  { cs: "commodore of ethics and equity", cls: "fleet", tier: 3, seat: "held",
    role: "constitutional_officer", track: "ethics", branch: "ethics",
    hook: "The ethics seat — equity is a protocol, not a mood." },
  { cs: "lead technical systems architect", cls: "fleet", tier: 3, seat: "held",
    role: "technical_seat", track: "systems", branch: "specs",
    hook: "The technical seat — validation of the whole stack." },
  { cs: "lead security and fabrication officer", cls: "fleet", tier: 3, seat: "held",
    role: "technical_seat", track: "security", branch: "security",
    hook: "Security validation — the fabricator answers to this desk." },
  { cs: "fleet captain", cls: "fleet", tier: 3, seat: "reserved",
    role: "command_seat", track: "campaign", branch: "admiralty",
    hook: "Flag-captain of the fleet — a seat reserved for OSTF board appointment; the name casts, the seat is appointed." },
  /* ── tier 2 · Star Command corps billets (seat open) ── */
  { cs: "admiral", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "campaign", branch: "admiralty",
    hook: "Fleet rank — strategy is the day job." },
  { cs: "vice admiral", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "campaign", branch: "admiralty",
    hook: "Second seat of the line — a flag rank without the office." },
  { cs: "rear admiral", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "campaign", branch: "admiralty",
    hook: "The junior flag — squadrons answer to it." },
  { cs: "commodore", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "systems", branch: "admiralty",
    hook: "Squadron command — more than one hull answers." },
  { cs: "captain", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "security", branch: "admiralty",
    hook: "Command of a vessel — the ledger gets heavier." },
  { cs: "commander", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "security", branch: "security",
    hook: "Command of a section — accountability included." },
  { cs: "lieutenant", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "orientation", branch: "security",
    hook: "Line officer — the billet that runs the deck." },
  { cs: "ensign", cls: "fleet", tier: 2, seat: "open",
    role: "line_officer", track: "orientation", branch: "security",
    hook: "First stripe, first watch." },
  { cs: "midshipman", cls: "fleet", tier: 2, seat: "open",
    role: "corps", track: "orientation", branch: "human_academic",
    hook: "The cadet rung — every flag officer was one." },
  { cs: "warrant officer", cls: "fleet", tier: 2, seat: "open",
    role: "specialist", track: "systems", branch: "security",
    hook: "The specialist's stripe — depth over breadth." },
  { cs: "chief warrant officer", cls: "fleet", tier: 2, seat: "open",
    role: "specialist", track: "systems", branch: "security",
    hook: "The senior specialist — the tools answer to this billet." },
  { cs: "chief of staff", cls: "fleet", tier: 2, seat: "open",
    role: "staff", track: "communications", branch: "admiralty",
    hook: "The office that makes meetings produce orders." },
  { cs: "research lead", cls: "fleet", tier: 2, seat: "open",
    role: "staff", track: "ai-literacy", branch: "research_ip",
    hook: "The lab's senior hand — evidence first." },
  { cs: "chief of lifesupport", cls: "fleet", tier: 2, seat: "open",
    role: "staff", track: "ethics", branch: "human_academic",
    hook: "Life support answers to the crew, not the hull." },
  /* ── tier 1 · the MI6 cover pool ── */
  { cs: "m", cls: "service", tier: 1, role: "station_chief", track: "systems", branch: "admiralty",
    hook: "In committee. M is always in committee." },
  { cs: "q", cls: "service", tier: 1, role: "q_branch", track: "systems", branch: "specs",
    hook: "The Quartermaster does not sign up through a form." },
  { cs: "boothroyd", cls: "service", tier: 1, role: "q_branch", track: "systems", branch: "specs",
    hook: "The original armourer — the post predates the letter." },
  { cs: "quartermaster", cls: "service", tier: 1, role: "q_branch", track: "systems", branch: "specs",
    hook: "The stores are signed for. All of them." },
  { cs: "mallory", cls: "service", tier: 1, role: "station_chief", track: "systems", branch: "admiralty",
    hook: "The chairman reads every file, including this one." },
  { cs: "charles robinson", cls: "service", tier: 1, role: "operator", track: "communications", branch: "admiralty",
    hook: "Chief of staff — the message lands where it should." },
  { cs: "tanner", cls: "service", tier: 1, role: "operator", track: "systems", branch: "strategy",
    hook: "Chief of staff — every plan survives contact with him." },
  { cs: "moneypenny", cls: "service", tier: 1, role: "operator", track: "orientation", branch: "human_academic",
    hook: "The desk is already spoken for — the duty is real." },
  { cs: "station chief", cls: "service", tier: 1, role: "operator", track: "communications", branch: "security",
    hook: "The foreign station head — the wire's other end." },
  { cs: "bond", cls: "agent", tier: 1, role: "field_agent", track: "security", branch: "security",
    hook: "The name is taken. The file on it is longer than yours." },
  { cs: "leiter", cls: "ally", tier: 1, role: "field_agent", track: "communications", branch: "security",
    hook: "The liaison — allied service, same wire." },
  { cs: "quarrel", cls: "ally", tier: 1, role: "field_agent", track: "security", branch: "security",
    hook: "The boat captain who asks the right questions." },
  { cs: "mathis", cls: "ally", tier: 1, role: "field_agent", track: "identity", branch: "security",
    hook: "The contact who vouches — identity is his trade." },
  { cs: "jack wade", cls: "ally", tier: 1, role: "field_agent", track: "communications", branch: "security",
    hook: "The other agency's man — brings gifts." },
  { cs: "mary goodnight", cls: "ally", tier: 1, role: "operator", track: "orientation", branch: "human_academic",
    hook: "Field support — the file says competent, the record says loyal." },
  { cs: "jock campbell", cls: "ally", tier: 1, role: "operator", track: "orientation", branch: "human_academic",
    hook: "Air support — he flies what you ask." },
  { cs: "wai lin", cls: "ally", tier: 1, role: "field_agent", track: "security", branch: "security",
    hook: "Colonel of an allied service — the parallel ledger, not a civilian." },
  { cs: "nomi", cls: "ally", tier: 1, role: "field_agent", track: "security", branch: "security",
    hook: "The number moved; the seat held." },
  { cs: "paloma", cls: "ally", tier: 1, role: "field_agent", track: "identity", branch: "security",
    hook: "Three weeks training. Still better briefed than you." },
  { cs: "jinx", cls: "ally", tier: 1, role: "field_agent", track: "security", branch: "security",
    hook: "Allied service, parallel ledger — she signs her own reports." },
  { cs: "pam bouvier", cls: "ally", tier: 1, role: "field_agent", track: "security", branch: "security",
    hook: "Pilot. Army. The file says do not underestimate." },
  { cs: "tatiana romanova", cls: "ally", tier: 1, role: "operator", track: "identity", branch: "security",
    hook: "The cipher clerk — identity work, literally." },
  { cs: "solitaire", cls: "ally", tier: 1, role: "operator", track: "ai-literacy", branch: "research_ip",
    hook: "Reads what has not happened — pattern work, filed honestly." },
  { cs: "octopussy", cls: "ally", tier: 1, role: "field_agent", track: "communications", branch: "legal_financial",
    hook: "Runs a floating ledger — logistics with jewels." },
  { cs: "pussy galore", cls: "ally", tier: 1, role: "field_agent", track: "communications", branch: "legal_financial",
    hook: "Runs a crew, not a solo act — organization is the skill." },
  { cs: "tiffany case", cls: "ally", tier: 1, role: "operator", track: "communications", branch: "legal_financial",
    hook: "The courier — she knows every route that never declared." },
  { cs: "honey ryder", cls: "ally", tier: 1, role: "operator", track: "ethics", branch: "human_academic",
    hook: "Self-educated off an encyclopedia — the Academy's whole thesis." },
  { cs: "kara milovy", cls: "ally", tier: 1, role: "operator", track: "orientation", branch: "human_academic",
    hook: "The cellist — notice what she notices." },
  { cs: "stacey sutton", cls: "ally", tier: 1, role: "operator", track: "systems", branch: "research_ip",
    hook: "State geologist — the ground truth is literal." },
  { cs: "christmas jones", cls: "ally", tier: 1, role: "operator", track: "systems", branch: "research_ip",
    hook: "Nuclear physicist — the joke is the name, not the degree." },
  { cs: "madeleine swann", cls: "ally", tier: 1, role: "operator", track: "ethics", branch: "human_academic",
    hook: "The psychiatrist — she reads the file on the reader." },
  { cs: "tracy", cls: "ally", tier: 1, role: "operator", track: "orientation", branch: "human_academic",
    hook: "The only one who ever held the title — the ledger remembers." },
];

/* ---------- alias resolutions (second spelling → canonical row) ---------- */
const ALIASES = {
  "james bond": "bond", "miss moneypenny": "moneypenny", "bill tanner": "tanner",
  "gareth mallory": "mallory", "major boothroyd": "boothroyd",
  "felix leiter": "leiter", "rene mathis": "mathis", "goodnight": "mary goodnight",
  "honeychile rider": "honey ryder", "jinx johnson": "jinx",
  "countess tracy": "tracy", "teresa di vicenzo": "tracy", "miss case": "tiffany case",
  "meter": "the meter", "the fleet admiral": "fleet admiral",
};

/* ---------- non-assignable holdings ---------- */
const NONPERSONAE = {
  /* the archvillain — the Scarcity Loop's architect. Every adversary
     reports here; the office is never cast. */
  "the meter": { cls: "archvillain",
    note: "The Meter was never a man. Men can be shot. A billing table cannot. Every adversary on the closed ledger reports to the Meter." },
  /* the adversary corps — lore, not billets; all report to the Meter */
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
  /* occupied seats — the chairs are taken */
  "fleet admiral": "seat", "ramsey": "seat",
  /* institutions — doctrines and bodies, not personas */
  "sigma": "institution", "aiwo": "institution", "the admiralty": "institution",
  "day zero": "institution", "axiomatic baseline": "institution",
  "ostf": "institution", "open sentience technology foundation": "institution",
  "sallirreugtech": "institution", "sallirreug tech": "institution",
  "sallirreugtech academy": "institution", "sallirreug academy": "institution",
  /* zh faces of the same watch list */
  "龐德": "zh-mirror", "詹姆斯龐德": "zh-mirror", "詹姆斯·龐德": "zh-mirror", "情報員": "zh-mirror",
  "軍需官": "zh-mirror", "錢班霓": "zh-mirror", "金手指": "zh-mirror", "布洛菲": "zh-mirror",
  "魔鬼黨": "zh-mirror", "海軍上將": "zh-mirror", "ｑ": "zh-mirror", "ｍ": "zh-mirror",
};

/* ---------- ingest the fleet roster (AdmPaul corpus — codex 0302) ---------- */
/* The drawer holds the U.S.S. Zotron high-command roster: named officers,
   ranks, billets across eleven divisions. These names are fiction-layer
   casting, not authority — they enter the manifest as open personas
   (cast:"open") that any desk can hold; no grant chain is involved. */
const ROSTER = path.join(ROOT, "thoughts&convos", "AdmPaul", "corpus",
  "sci-fi", "CodexRPG", "codex_entries",
  "0302-below-is-a-comprehensive-roster-and.md");
const RANK_ALT = ["fleet admiral", "vice admiral", "rear admiral",
  "lieutenant colonel", "lieutenant commander", "chief warrant officer",
  "warrant officer", "commodore", "captain", "commander", "lieutenant",
  "ensign", "midshipman", "dr\\.", "engineer"].join("|");
/* billet text → academy track + suggested branch (ordered, first match wins) */
const LANES = [
  [/intelligence|espionage|recon|covert|stealth|classified|special warfare/, ["identity", "security"]],
  [/defen|tactical|sentinel|armament|weapon|combat|battalion|warfare/, ["security", "security"]],
  [/communication|information system|network/, ["communications", "strategy"]],
  [/medic|bio|life.?support|psych|health|morale|counsel/, ["ethics", "human_academic"]],
  [/colon|civil|social|habitat|population/, ["orientation", "human_academic"]],
  [/supply|logistic|resource|material|inventor|maintenance|repair|depot/, ["systems", "legal_financial"]],
  [/\bai\b|cybernetic|drone|robot|\bdata\b|simulation|autonomous/, ["ai-literacy", "research_ip"]],
  [/quantum|engineer|propulsion|builder|architect|technolog|system/, ["systems", "specs"]],
  [/research|science|theoretic|development/, ["systems", "research_ip"]],
  [/operation|command|staff|fleet|strategy|planning/, ["campaign", "admiralty"]],
];
const corpusOfficers = [], corpusAI = [], redacted = [], reservedHits = [];
if (fs.existsSync(ROSTER)) {
  const src = fs.readFileSync(ROSTER, "utf8");
  const seen = new Set();
  for (const raw of src.split(/[•⸻\u2028]/)) {
    const chunk = raw.replace(/\r/g, " ").replace(/\s+/g, " ").trim();
    if (!chunk) continue;
    const ai = chunk.match(/(?:^|\b)A?I\b[^“"]*[“"]([^”"]+)[”"]/);
    let m, billet, rank, name;
    if ((m = chunk.match(new RegExp(`^(.+?)\\s*[–—-]\\s*(${RANK_ALT})\\s+(.+?)\\s*(?:Role|Responsibilities)\\s*:`, "i")))) {
      billet = m[1]; rank = m[2]; name = m[3];
    } else if ((m = chunk.match(new RegExp(`^(${RANK_ALT})\\s+(.+?)\\s*(?:Role\\s*:|Responsibilities\\s*:|$|:)`, "i")))) {
      rank = m[1]; name = m[2]; billet = m[1];
    } else if (ai) {
      corpusAI.push(ai[1].trim()); continue;
    } else if ((m = chunk.match(/([A-Z][A-Za-z'’\-]+(?:\s+[A-Z][A-Za-z'’\-]+){1,2})\s+Responsibilities\s*:/))) {
      rank = "officer"; name = m[1]; billet = "division officer";  /* salvage — source text damaged */
    } else continue;
    name = name.toLowerCase().replace(/[“"]([^”"]+)[”"]/g, "")
      .replace(/^(dr\.?|engineer)\s+/i, "").replace(/[^a-z'’\-. ]/g, "")
      .replace(/\s+/g, " ").trim();
    if (!name || name.split(" ").length < 2) continue;
    if (name === "paul phillip ramsey" || restricted.has(name)) { reservedHits.push(name); continue; }
    if (TRIPWIRE_LC.test(name)) { redacted.push(name); continue; }
    if (seen.has(name)) continue;
    seen.add(name);
    const lane = LANES.find(([re]) => re.test((billet + " " + chunk).toLowerCase()));
    const slug = billet.toLowerCase().replace(/[^a-z0-9]+/g, "_").replace(/^_+|_+$/g, "");
    corpusOfficers.push({
      cs: name, cls: "fleet", tier: 2, seat: "open", cast: "open",
      role: slug || "officer",
      track: lane ? lane[1][0] : "orientation",
      branch: lane ? lane[1][1] : "narrative",
      hook: `${rank.replace(/\.$/, "")} — ${billet.replace(/\s+/g, " ").toLowerCase()}.`,
    });
  }
}
/* the roster must yield a real corps — a moved or damaged source fails emission */
if (corpusOfficers.length < 40)
  errors.push(`corpus roster yielded ${corpusOfficers.length} officers (floor 40) — check ${path.relative(ROOT, ROSTER)}`);

/* ---------- open billets — academy corps + constitutional offices ---------- */
/* gov/human_academic + gov/constitutional name real billets that are not on
   the restricted watch list — open casting for the corps, never authority. */
const OPEN_BILLETS = [
  /* tier 2 — academy corps (gov/human_academic corpus) */
  { cs: "instructor", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "academy_instructor", track: "orientation", branch: "human_academic",
    hook: "Faculty line — the lesson plan is the operation." },
  { cs: "faculty", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "faculty", track: "orientation", branch: "human_academic",
    hook: "The teaching line — evidence graded, competence certified." },
  { cs: "mentor", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "mentor", track: "orientation", branch: "human_academic",
    hook: "One desk over — the apprenticeship is real." },
  { cs: "apprentice", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "apprentice", track: "orientation", branch: "human_academic",
    hook: "The entry rung — the handbook is the contract." },
  { cs: "program lead", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "program_lead", track: "campaign", branch: "human_academic",
    hook: "Credentials are proposed here — the framework is the authority." },
  { cs: "academy director", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "academy_officer", track: "systems", branch: "human_academic",
    hook: "Certifies the awards — the transcript is the ledger." },
  { cs: "credentialing officer", cls: "corps", tier: 2, seat: "open", cast: "open",
    role: "credentialing", track: "identity", branch: "human_academic",
    hook: "Issues and revokes — paper that verifies." },
  /* tier 3 — constitutional offices (gov/constitutional corpus, seat open) */
  { cs: "treasurer", cls: "fleet", tier: 3, seat: "open", cast: "open",
    role: "constitutional_officer", track: "systems", branch: "legal_financial",
    hook: "Keeper of the ledger — audit is doctrine, not mood." },
  { cs: "steward", cls: "fleet", tier: 3, seat: "open", cast: "open",
    role: "constitutional_officer", track: "ethics", branch: "constitutional",
    hook: "Custody of the institution itself — held in trust, never owned." },
];

/* ---------- build ---------- */
const canon = new Map(PERSONAE.map(p => [p.cs, p]));

/* every alias must resolve to a canonical row (assignable or not) */
const nonCanon = new Set(Object.keys(NONPERSONAE));
for (const [a, t] of Object.entries(ALIASES))
  if (!canon.has(t) && !nonCanon.has(t)) errors.push(`alias "${a}" → "${t}" has no canonical row`);

/* every assignable row must carry valid track/branch/tier */
for (const p of PERSONAE) {
  if (!restricted.has(p.cs)) errors.push(`persona "${p.cs}" is not a restricted callsign`);
  if (!TOPICS.has(p.track)) errors.push(`persona "${p.cs}" track "${p.track}" not in academy topics`);
  if (!BRANCHES.includes(p.branch)) errors.push(`persona "${p.cs}" branch "${p.branch}" not in BRANCHES`);
  if (![1, 2, 3].includes(p.tier)) errors.push(`persona "${p.cs}" missing tier`);
  if (p.tier >= 2 && !p.seat) errors.push(`persona "${p.cs}" tier≥2 missing seat status`);
}

/* full coverage: every restricted name classified */
const rows = [];
for (const cs of [...restricted].sort()) {
  if (canon.has(cs)) {
    const p = canon.get(cs);
    const row = { assignable: true, branch: p.branch, callsign: cs, cast: "grant",
      class: p.cls, cover_role: p.role, hook: p.hook, tier: p.tier, track: p.track };
    if (p.seat) row.seat = p.seat;
    rows.push(row);
  } else if (ALIASES[cs]) {
    rows.push({ assignable: false, alias_of: ALIASES[cs], callsign: cs, class: "alias" });
  } else if (NONPERSONAE[cs]) {
    const np = NONPERSONAE[cs];
    const row = { assignable: false, callsign: cs,
      class: typeof np === "string" ? np : np.cls };
    if (typeof np === "object" && np.note) row.note = np.note;
    if (row.class === "adversary") row.reports_to = "the meter";
    rows.push(row);
  } else {
    errors.push(`restricted name "${cs}" is unclassified — curate it into PERSONAE, ALIASES, or NONPERSONAE`);
  }
}

/* the open pool — corps billets + corpus officers + academy/constitutional
   offices. Open casting: the desk holds the file, no grant needed, never
   authority. Collisions with the restricted list are coverage errors. */
for (const p of [...OPEN_BILLETS, ...corpusOfficers]) {
  if (restricted.has(p.cs)) errors.push(`open billet "${p.cs}" collides with a restricted callsign — curate it into PERSONAE`);
  if (!TOPICS.has(p.track)) errors.push(`open billet "${p.cs}" track "${p.track}" not in academy topics`);
  if (!BRANCHES.includes(p.branch)) errors.push(`open billet "${p.cs}" branch "${p.branch}" not in BRANCHES`);
  rows.push({ assignable: true, branch: p.branch, callsign: p.cs, cast: "open",
    class: p.cls, cover_role: p.role, hook: p.hook, tier: p.tier, track: p.track,
    ...(p.seat ? { seat: p.seat } : {}) });
}
/* fleet AI units — machines, never cast */
for (const unit of corpusAI)
  rows.push({ assignable: false, callsign: unit.toLowerCase(), class: "ai_unit",
    note: "Fleet AI unit — a machine aboard the Zotron, not a billet. Never cast." });

/* sanity: every tier-3 seat-held office is actually staffed in the packets */
const staffed = new Set(officers.flatMap(o => [o.primary, o.secondary, o.tertiary].filter(Boolean).map(s => s.toLowerCase())));
for (const p of PERSONAE.filter(p => p.seat === "held"))
  if (!staffed.has(p.cs)) errors.push(`seat-held persona "${p.cs}" has no officer assignment in gov/onboarding`);

if (errors.length) {
  console.error("persona-map: coverage failures\n  " + errors.join("\n  "));
  process.exit(1);
}

/* ---------- the admiralty key (drawer-side — real names stay sealed) ── */
const CORE4 = new Set(["vice admiral of stem initiatives", "rear admiral of entrepreneurship",
  "admiral of financial operations", "commodore of ethics and equity"]);
const admiralKey = {
  schema: "ADMIRALTY-KEY-v1",
  note: "The provisional Admiralty key — officer → billet mapping under SPEC-004. The chair is the Fleet Admiral (founding record, not a packet). Drawer-side only; the public manifest carries billets, never names.",
  generated_by: "tools/persona-map.mjs",
  chair: { office: "fleet admiral", holder: "P. P. Ramsey", basis: "genesis record — founding seat" },
  officers: officers.map(o => ({
    officer: o.officer,
    seat_class: CORE4.has((o.primary || "").toLowerCase()) ? "core-four" : "technical",
    billets: { primary: o.primary, secondary: o.secondary, tertiary: o.tertiary },
    source: o.source,
  })),
  corpus_roster: {
    source: path.relative(ROOT, ROSTER),
    officers: corpusOfficers.length,
    ai_units: corpusAI.length,
    redacted: redacted.sort(),   /* tripwire collisions — name withheld from casting */
    reserved: reservedHits.sort(), /* names that collide with restricted callsigns */
    manifest: corpusOfficers.map(o => ({
      callsign: o.cs, rank: o.hook.split(" — ")[0], billet: o.role,
      track: o.track, branch: o.branch,
    })),
  },
};
const admiralKeyMd = [
  "# ADMIRALTY-KEY — the provisional Admiralty billet map",
  "",
  "<!-- Drawer-side (SPEC-004). Officer names are classified; the public",
  "     projection is site/assets/persona-manifest.json — billets only. -->",
  "",
  `Chair: **${admiralKey.chair.office}** — ${admiralKey.chair.holder} (${admiralKey.chair.basis})`,
  "",
  "| Officer | Seat class | Primary | Secondary | Tertiary |",
  "|---|---|---|---|---|",
  ...admiralKey.officers.map(o =>
    `| ${o.officer} | ${o.seat_class} | ${o.billets.primary || "—"} | ${o.billets.secondary || "—"} | ${o.billets.tertiary || "—"} |`),
  "",
  `Source: \`${officers[0] ? officers[0].source.replace(/[^/]+\/README\.md$/, "*/README.md") : "gov/onboarding"}\` — generated by tools/persona-map.mjs`,
  "",
].join("\n");

/* ---------- manifests ---------- */
const manifest = {
  schema: "PERSONA-MAP-v2",
  note: "The casting office — three-tier matrix. tier 3 constitutional offices and tier 2 Star Command / Academy corps billets train toward real seats; tier 1 is the MI6 cover pool. Restricted callsigns are grant-cast (FANO-CALLSIGN-v1); open billets are corps casting — the desk holds the file. Personas are cover, never authority. The closed ledger reports to the Meter.",
  adversary_command: "the meter",
  tiers: { 1: "MI6 cover pool", 2: "Star Command / Academy corps", 3: "constitutional offices" },
  persona_count: rows.length,
  assignable_count: rows.filter(r => r.assignable).length,
  tracks: [...TOPICS].sort(),
  branches: [...BRANCHES].sort(),
  personas: rows,
};
const mapBytes = JSON.stringify(manifest, null, 2) + "\n";
const keyBytes = JSON.stringify(admiralKey, null, 2) + "\n";

/* boundary self-audit — a surname in the public projection fails emission */
if (TRIPWIRE.test(mapBytes)) {
  console.error("persona-map: BOUNDARY FAIL — an officer surname would reach the public manifest");
  process.exit(1);
}

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify" : "dry";

if (mode === "dry") {
  console.log(`persona-map — dry-run (${rows.length} names, ${manifest.assignable_count} assignable, ${officers.length} officers keyed, writes nothing)`);
  for (const tier of [3, 2, 1]) {
    const t = rows.filter(r => r.assignable && r.tier === tier);
    if (!t.length) continue;
    console.log(`  tier ${tier} — ${manifest.tiers[tier]} (${t.length})`);
    t.forEach(r => console.log(`    ${r.callsign.padEnd(38)} ${r.cast === "open" ? "open " : ""}${r.class}/${r.cover_role}${r.seat ? " · seat:" + r.seat : ""} → ${r.track} → ${r.branch}`));
  }
  const closed = rows.filter(r => !r.assignable);
  console.log(`  closed ledger (${closed.length}) — ${[...new Set(closed.map(r => r.class))].sort().join(" · ")} — command: the meter`);
  process.exit(0);
}
if (mode === "verify") {
  const ok = fs.existsSync(MANIFEST) && fs.existsSync(KEY_JSON) && fs.existsSync(KEY_MD) &&
    fs.readFileSync(MANIFEST, "utf8") === mapBytes &&
    fs.readFileSync(KEY_JSON, "utf8") === keyBytes &&
    fs.readFileSync(KEY_MD, "utf8") === admiralKeyMd;
  console.log(ok
    ? `persona-map verify OK — ${rows.length} names, ${manifest.assignable_count} assignable, ${officers.length} officers keyed, deterministic`
    : "persona-map verify FAIL — artifacts stale or absent; run --emit");
  process.exit(ok ? 0 : 1);
}
fs.writeFileSync(MANIFEST, mapBytes);
fs.writeFileSync(KEY_JSON, keyBytes);
fs.writeFileSync(KEY_MD, admiralKeyMd);
console.log(`persona-map → ${path.relative(ROOT, MANIFEST)} + drawer ADMIRALTY-KEY.{json,md} (${rows.length} names, ${manifest.assignable_count} assignable, ${officers.length} officers)`);
