#!/usr/bin/env node
/* gov-metadata.mjs — mechanical binding for governance instrument metadata.

   The drawer registry is the amendment/annotation layer for sealed canonical
   instruments and the schema source for living SPECs. It never copies source
   article text into generated output. The public projection carries only
   identifiers, status/version metadata, evidence posture, and digests.

   Modes:
     bare       dry-run verification summary
     --emit     write security/out/gov-metadata.json + site/assets/gov-metadata.json
     --verify   require both emitted artifacts to be byte-identical to a fresh run
*/
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GOV = path.join(ROOT, "thoughts&convos", "gov");
const REGISTRY_PATH = path.join(GOV, "metadata", "GOVERNANCE-REGISTRY.json");
const OUT_DIR = path.join(ROOT, "security", "out");
const SITE_DIR = path.join(ROOT, "site", "assets");
const INTERNAL_OUT = path.join(OUT_DIR, "gov-metadata.json");
const PUBLIC_OUT = path.join(SITE_DIR, "gov-metadata.json");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const sha256 = data => crypto.createHash("sha256").update(data).digest("hex");
const read = file => fs.readFileSync(file, "utf8");
const isDate = s => /^\d{4}-\d{2}-\d{2}$/.test(s);
const isHex64 = s => /^[0-9a-f]{64}$/.test(s);
const isVersion = s => /^\d+\.\d+\.\d+(?:\+metadata\.\d+)?$/.test(s);

const REQUIRED = [
  "id", "source", "document_class", "title", "status", "version",
  "date_adopted", "maintainer", "ai_assistance", "approval",
  "admiralty_ratification", "signature_status", "external_review",
  "version_history", "known_findings",
];
const CLASSES = new Set([
  "canonical-spec", "living-spec", "constitutional", "admiralty-instrument",
]);
const STATUSES = new Set([
  "Active (Founding Phase)",
  "Draft (Pending Ratification)",
  "Provisional (Pending Admiralty Formation)",
]);
const RATIFICATION = new Set([
  "pending-formal-establishment",
  "not-applicable-founding-charter",
  "not-applicable-constitution-pending-ratification",
]);
const AI_POLICY = "advisory-only-no-approval-authority";
const HUMAN_AUTHORITY = /Fleet Admiral/;

function fail(errors, id, msg) {
  errors.push(`${id}: ${msg}`);
}

function parseFrontMatter(text) {
  if (!text.startsWith("---\n")) return null;
  const end = text.indexOf("\n---\n", 4);
  if (end < 0) return null;
  const meta = {};
  for (const line of text.slice(4, end).split("\n")) {
    const m = /^([A-Za-z0-9_]+):\s*(.*)$/.exec(line);
    if (!m) return { error: `unparseable metadata line: ${line}` };
    meta[m[1]] = m[2];
  }
  return { meta, body: text.slice(end + 5).replace(/^\n/, "") };
}

function validateRegistry(registry, errors) {
  if (registry.kind !== "OSTF-GOV-METADATA-v1")
    fail(errors, "registry", "kind must be OSTF-GOV-METADATA-v1");
  if (!isDate(registry.registry_date || ""))
    fail(errors, "registry", "registry_date must be YYYY-MM-DD");
  if (!registry.authority_model || registry.authority_model.ai_authority !== AI_POLICY)
    fail(errors, "registry", "authority_model.ai_authority must be advisory-only-no-approval-authority");
  if (!Array.isArray(registry.instruments) || registry.instruments.length === 0)
    fail(errors, "registry", "instruments must be a nonempty array");
}

function validateInstrument(entry, errors) {
  const id = entry.id || "(missing id)";
  for (const key of REQUIRED) if (!(key in entry)) fail(errors, id, `missing ${key}`);
  if (!CLASSES.has(entry.document_class)) fail(errors, id, `bad document_class ${entry.document_class}`);
  if (!STATUSES.has(entry.status)) fail(errors, id, `bad status ${entry.status}`);
  if (!isVersion(entry.version || "")) fail(errors, id, `bad semver ${entry.version}`);
  if (!isDate(entry.date_adopted || "")) fail(errors, id, `bad adoption date ${entry.date_adopted}`);
  if (entry.ai_assistance !== AI_POLICY) fail(errors, id, "AI assistance must be advisory-only");
  if (!HUMAN_AUTHORITY.test(entry.approval || "")) fail(errors, id, "approval must name Fleet Admiral human authority");
  if (!RATIFICATION.has(entry.admiralty_ratification))
    fail(errors, id, `bad ratification state ${entry.admiralty_ratification}`);
  if (entry.signature_status !== "unsigned")
    fail(errors, id, "signature_status must remain unsigned until a human signature is filed");
  if (!String(entry.external_review || "").startsWith("pending-"))
    fail(errors, id, "external_review must be explicitly pending");
  if (!Array.isArray(entry.version_history) || entry.version_history.length === 0)
    fail(errors, id, "version_history must have at least one entry");
  else for (const [i, row] of entry.version_history.entries()) {
    if (!isVersion(row.version || "")) fail(errors, id, `version_history[${i}] bad version`);
    if (!isDate(row.date || "")) fail(errors, id, `version_history[${i}] bad date`);
    if (!HUMAN_AUTHORITY.test(row.author_maintainer || ""))
      fail(errors, id, `version_history[${i}] must name a human maintainer`);
    if (!row.change || !row.verification)
      fail(errors, id, `version_history[${i}] requires change and verification`);
  }
}

function instrumentReport(entry, errors) {
  const id = entry.id;
  const sourcePath = path.join(GOV, entry.source);
  if (!fs.existsSync(sourcePath)) {
    fail(errors, id, `missing source ${entry.source}`);
    return null;
  }
  const text = read(sourcePath);
  const fullHash = sha256(text);
  const rep = {
    id,
    document_class: entry.document_class,
    title: entry.title,
    status: entry.status,
    version: entry.version,
    date_adopted: entry.date_adopted,
    maintainer: entry.maintainer,
    ai_assistance: entry.ai_assistance,
    approval: entry.approval,
    admiralty_ratification: entry.admiralty_ratification,
    signature_status: entry.signature_status,
    external_review: entry.external_review,
    full_file_sha256: fullHash,
    known_findings: entry.known_findings,
  };

  if (entry.document_class === "living-spec") {
    const parsed = parseFrontMatter(text);
    if (!parsed || parsed.error) {
      fail(errors, id, parsed?.error || "missing metadata front matter");
      return rep;
    }
    const { meta, body } = parsed;
    const bodyHash = sha256(body);
    rep.body_sha256 = bodyHash;
    if (!isHex64(entry.body_sha256 || "")) fail(errors, id, "registry body_sha256 must be a 64-hex digest");
    else if (bodyHash !== entry.body_sha256) fail(errors, id, "registry body_sha256 drift");
    if (meta.sha256_digest !== bodyHash)
      fail(errors, id, "front-matter sha256_digest does not match normative body");
    const expected = {
      spec_id: entry.id,
      title: entry.title,
      status: entry.status,
      version: entry.version,
      date_adopted: entry.date_adopted,
      maintainer: entry.maintainer,
      ai_assistance: entry.ai_assistance,
      approval: entry.approval,
      admiralty_ratification: entry.admiralty_ratification,
      signature_status: entry.signature_status,
      instrument_class: "living-spec",
    };
    for (const [key, want] of Object.entries(expected))
      if (meta[key] !== want) fail(errors, id, `front-matter ${key} mismatch`);
    const requiredBody = [
      "Adoption and Authority",
      "executive authority of the Fleet Admiral",
      "Admiralty Ratification",
      "Pending formal establishment",
      "Document Version History",
      "not signed — awaiting human signature",
      "tools/gov-metadata.mjs --verify",
    ];
    for (const needle of requiredBody)
      if (!body.includes(needle)) fail(errors, id, `missing adoption/version marker: ${needle}`);
  } else {
    rep.canonical_sha256 = fullHash;
    if (!isHex64(entry.canonical_sha256 || "")) fail(errors, id, "registry canonical_sha256 must be a 64-hex digest");
    else if (fullHash !== entry.canonical_sha256) fail(errors, id, "sealed canonical source drifted");
  }
  return rep;
}

function run() {
  const errors = [];
  if (!fs.existsSync(REGISTRY_PATH)) {
    console.error(`gov-metadata: missing registry ${REGISTRY_PATH}`);
    process.exit(1);
  }
  const registryText = read(REGISTRY_PATH);
  const registry = JSON.parse(registryText);
  validateRegistry(registry, errors);

  const seen = new Set();
  const reports = [];
  for (const entry of registry.instruments || []) {
    validateInstrument(entry, errors);
    if (seen.has(entry.id)) fail(errors, entry.id, "duplicate registry id");
    seen.add(entry.id);
    const rep = instrumentReport(entry, errors);
    if (rep) reports.push(rep);
  }

  const specDir = path.join(GOV, "specs");
  for (const file of fs.readdirSync(specDir).filter(f => f.endsWith(".md")).sort()) {
    const id = file.replace(/\.md$/, "");
    if (!seen.has(id)) fail(errors, id, "SPEC document missing from governance registry");
  }

  const internal = {
    kind: "GOVMETADATAv1",
    registry_sha256: sha256(registryText),
    instrument_count: reports.length,
    sealed_sources: reports.filter(r => r.document_class !== "living-spec").length,
    living_specs: reports.filter(r => r.document_class === "living-spec").length,
    authority_model: registry.authority_model,
    digest_rules: registry.digest_rules,
    instruments: reports.map(r => ({ ...r, source: registry.instruments.find(e => e.id === r.id)?.source })),
  };
  const publicProjection = {
    kind: "GOVMETADATAv1-PUBLIC",
    registry_sha256: registryText && sha256(registryText),
    instrument_count: internal.instrument_count,
    sealed_sources: internal.sealed_sources,
    living_specs: internal.living_specs,
    authority_model: {
      governing_authority: "Fleet Admiral (founding phase)",
      ai_authority: AI_POLICY,
      signature_state: "unsigned-until-human-signature-filed",
      external_review: "pending-independent-review",
    },
    instruments: reports.map(r => ({
      id: r.id,
      document_class: r.document_class,
      title: r.title,
      status: r.status,
      version: r.version,
      date_adopted: r.date_adopted,
      digest: r.body_sha256 || r.canonical_sha256,
      digest_kind: r.body_sha256 ? "body_sha256" : "canonical_sha256",
      approval: r.approval,
      admiralty_ratification: r.admiralty_ratification,
      signature_status: r.signature_status,
      external_review: r.external_review,
      known_findings: r.known_findings,
    })),
  };
  const internalText = JSON.stringify(internal, null, 2) + "\n";
  const publicText = JSON.stringify(publicProjection, null, 2) + "\n";

  if (VERIFY) {
    for (const [file, want] of [[INTERNAL_OUT, internalText], [PUBLIC_OUT, publicText]]) {
      if (!fs.existsSync(file) || read(file) !== want)
        errors.push(`${path.basename(file)}: emitted artifact absent or stale`);
    }
  }

  if (errors.length) {
    console.log(`gov-metadata: FAIL — ${errors.length} finding(s)`);
    for (const e of errors.slice(0, 40)) console.log(`  ${e}`);
    process.exit(1);
  }

  if (EMIT) {
    fs.mkdirSync(OUT_DIR, { recursive: true });
    fs.mkdirSync(SITE_DIR, { recursive: true });
    fs.writeFileSync(INTERNAL_OUT, internalText);
    fs.writeFileSync(PUBLIC_OUT, publicText);
    console.log(`gov-metadata → security/out/gov-metadata.json + site/assets/gov-metadata.json (${internal.instrument_count} instruments)`);
    return;
  }

  console.log(`gov-metadata: GREEN — ${internal.instrument_count} instruments (${internal.sealed_sources} sealed, ${internal.living_specs} living), 0 drift`);
}

run();
