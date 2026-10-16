#!/usr/bin/env node
// component-census.mjs — exhaustive Spec-007 component→contract→tests→docs→artifacts map.
// This is a census instrument, not a semantic proof: every row is inspected
// by the retrograde ledger before promotion to a stronger claim.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const OUT = path.join(ROOT, "docs", "component-census.json");
const DEBRIEF = path.join(ROOT, "docs", "component-census.md");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const ZONES = [
  ["src", [".zig"]], ["deps", [".zig", ".md"]], ["security", [".mjs", ".js", ".py", ".sh"]],
  ["tools", [".mjs", ".js", ".py", ".sh"]], ["firmware", [".c", ".h"]],
  ["apps", [".html", ".wasm", ".c", ".zig"]], ["admiralty-desk", [".js", ".json", ".sh"]],
  ["site/assets", [".js", ".json", ".wasm"]],
];
const SKIP = new Set(["node_modules", ".zig-cache", "zig-out", "out", ".git"]);
const generated = p => p.startsWith("security/out/") || p.endsWith("/findings.json") || p.includes("/site/assets/academy/");
const OWNER_BY_PATH = new Map([
  ["admiralty-desk/package-lock.json", { owner: "admiralty-desk/package.json", basis: "npm dependency lockfile" }],
  ["admiralty-desk/package.json", { owner: "admiralty-desk/main.js", basis: "Electron package manifest" }],
  ["admiralty-desk/preload.js", { owner: "admiralty-desk/main.js", basis: "Electron context bridge" }],
  ["apps/fano/fano.wasm", { owner: "apps/fano/index.html", basis: "vendored Fano quine artifact" }],
  ["site/assets/academy-pedagogy.json", { owner: "tools/academy-grade.mjs", basis: "deterministic pedagogy ledger" }],
  ["site/assets/academy-review.json", { owner: "tools/academy-review.mjs", basis: "deterministic review ledger" }],
  ["site/assets/agency-map.json", { owner: "tools/agency-map.mjs", basis: "agency projection" }],
  ["site/assets/cluster-registry.json", { owner: "tools/cluster-census.mjs", basis: "sanitized cluster projection" }],
  ["site/assets/curriculum-map.json", { owner: "tools/curriculum-map.mjs", basis: "curriculum coverage projection" }],
  ["site/assets/device-ledger.json", { owner: "tools/device-ledger.mjs", basis: "sanitized capability projection" }],
  ["site/assets/dht-manifest.json", { owner: "tools/dht-fs.mjs", basis: "DHT ledger projection" }],
  ["site/assets/external-review.json", { owner: "tools/external-review-manifest.mjs", basis: "external-authority package projection" }],
  ["site/assets/gov-metadata.json", { owner: "tools/gov-metadata.mjs", basis: "governance adoption projection" }],
]);
const OWNER_FOR = rel => {
  if (OWNER_BY_PATH.has(rel)) return OWNER_BY_PATH.get(rel);
  if (rel.startsWith("site/assets/academy/"))
    return { owner: "tools/academy-harvest.mjs", basis: "deterministic Academy projection" };
  if (rel === "site/assets/spec-registry.json")
    return { owner: "tools/engine-manifest.mjs", basis: "signed engine-manifest artifact" };
  return null;
};

function walk(abs, rel, exts, rows) {
  let entries;
  try { entries = fs.readdirSync(abs, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (SKIP.has(entry.name)) continue;
    const childAbs = path.join(abs, entry.name);
    const childRel = path.posix.join(rel, entry.name);
    if (entry.isDirectory()) walk(childAbs, childRel, exts, rows);
    else if (exts.includes(path.extname(entry.name)) && !generated(childRel)) rows.push({ path: childRel });
  }
}

function read(rel) { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return ""; } }
const corpus = ["AGENTS.md", "README.md", "docs/en/spec-007-component-map.en.md", "docs/zh-Hant/spec-007-component-map.zh-Hant.md", "docs/native-donor-manifest.json", "build.zig", "security/team-sweep-2.mjs", "tools/publish-check.sh"].map(read).join("\n");
const manifestCorpus = [
  "engine-manifest.json", "site/engine-manifest.json",
  "site/assets/academy-manifest.json", "site/assets/fano-desktop.js",
  "tools/engine-manifest.mjs", "tools/academy-harvest.mjs",
].map(read);
const basename = p => path.basename(p, path.extname(p));
const GENERIC_STEMS = new Set(["app", "build", "client", "config", "index", "main", "module", "package", "readme", "server", "style", "test"]);
const hasMention = (name, text = corpus) => !GENERIC_STEMS.has(name) && text.includes(name);
const hasPathMention = (rel, text = corpus) =>
  text.includes(rel) || text.includes(path.basename(rel)) || hasMention(basename(rel), text);
const manifestBound = rel => {
  const siteRel = rel.startsWith("site/") ? rel.slice("site/".length) : rel;
  return manifestCorpus.some(text => text.includes(rel) || text.includes(siteRel));
};
const testInfo = rel => {
  const source = read(rel);
  if (rel.endsWith(".zig")) return { kind: "zig", blocks: (source.match(/\btest\s+\"/g) || []).length, registered: corpus.includes(rel) || corpus.includes(path.basename(rel)) };
  if (rel.startsWith("security/") || rel.startsWith("tools/")) return { kind: "script", referenced: corpus.includes(path.basename(rel)) };
  return { kind: "artifact", registered: true };
};
const contract = rel => {
  const owner = OWNER_FOR(rel);
  const generated = rel.endsWith(".json") || rel.endsWith(".wasm") || rel.startsWith("site/assets/academy/");
  const manifest_bound = manifestBound(rel);
  const mapped = hasPathMention(rel) || manifest_bound || owner !== null;
  return {
    mapped,
    source_zone: rel.split("/")[0],
    generated,
    owner: owner?.owner ?? null,
    owner_basis: owner?.basis ?? null,
    manifest_bound,
  };
};

const rows = [];
for (const [zone, exts] of ZONES) walk(path.join(ROOT, zone), zone, exts, rows);
rows.sort((a, b) => a.path.localeCompare(b.path));
const components = rows.map(r => {
  const c = contract(r.path);
  return {
    component: r.path,
    contract: c,
    tests: testInfo(r.path),
    documentation: {
      basename_mapped: hasPathMention(r.path),
      component_map_mapped: hasPathMention(r.path, read("docs/en/spec-007-component-map.en.md")),
      manifest_bound: c.manifest_bound,
      owner: c.owner,
    },
    artifacts: {
      generated: c.generated,
      likely_projection: c.generated || r.path.startsWith("site/"),
      owner: c.owner,
      owner_basis: c.owner_basis,
    },
    retrograde_status: "PENDING_COMPONENT_REVIEW",
  };
});
const summary = {
  schema: "SPEC007-COMPONENT-CENSUS-v1",
  zones: Object.fromEntries(ZONES.map(([z]) => [z, components.filter(c => c.component === z || c.component.startsWith(z + "/")).length])),
  total_components: components.length,
  source_components: components.filter(c => !c.contract.generated).length,
  generated_components: components.filter(c => c.contract.generated).length,
  mapped_basename: components.filter(c => c.documentation.basename_mapped).length,
  mapped_contract: components.filter(c => c.contract.mapped).length,
  manifest_bound: components.filter(c => c.contract.manifest_bound).length,
  owner_bound: components.filter(c => c.contract.owner !== null).length,
  unmapped_basename: components.filter(c => !c.documentation.basename_mapped).map(c => c.component),
  unmapped_contract: components.filter(c => !c.contract.mapped).map(c => c.component),
  native_zig: components.filter(c => c.tests.kind === "zig").length,
};
const result = { schema: summary.schema, summary, components };
const json = JSON.stringify(result, null, 2) + "\n";
if (EMIT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  fs.writeFileSync(DEBRIEF, `# Spec-007 component census\n\n- Components: ${summary.total_components}\n- Source: ${summary.source_components}\n- Generated: ${summary.generated_components}\n- Basename mapped: ${summary.mapped_basename}\n- Contract mapped: ${summary.mapped_contract}\n- Manifest bound: ${summary.manifest_bound}\n- Owner bound: ${summary.owner_bound}\n- Unmapped contract: ${summary.unmapped_contract.length}\n- Pending component review: ${summary.total_components}\n\nThis census is an inventory; retrograde completion requires a component ledger row and passing verification.\n`);
  console.log(`component census → ${OUT} (${summary.total_components} components)`);
  process.exit(0);
}
if (VERIFY) {
  if (!fs.existsSync(OUT)) { console.error("component census verify FAIL — emit first"); process.exit(1); }
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const stableOld = JSON.stringify({ summary: old.summary, components: old.components });
  const stableNew = JSON.stringify({ summary, components });
  if (stableOld !== stableNew) { console.error("component census verify FAIL — inventory drift"); process.exit(1); }
  console.log(`component census verify GREEN — ${summary.total_components} components stable`);
  process.exit(0);
}
console.log(JSON.stringify(summary, null, 2));
