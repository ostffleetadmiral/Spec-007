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
const corpus = ["AGENTS.md", "README.md", "docs/en/spec-007-component-map.en.md", "docs/zh-Hant/spec-007-component-map.zh-Hant.md", "build.zig", "security/team-sweep-2.mjs", "tools/publish-check.sh"].map(read).join("\n");
const basename = p => path.basename(p, path.extname(p));
const hasMention = (name, text = corpus) => text.includes(name);
const testInfo = rel => {
  const source = read(rel);
  if (rel.endsWith(".zig")) return { kind: "zig", blocks: (source.match(/\btest\s+\"/g) || []).length, registered: corpus.includes(rel) || corpus.includes(path.basename(rel)) };
  if (rel.startsWith("security/") || rel.startsWith("tools/")) return { kind: "script", referenced: corpus.includes(path.basename(rel)) };
  return { kind: "artifact", registered: true };
};
const contract = rel => {
  const name = basename(rel);
  const mapped = hasMention(name);
  const generated = rel.startsWith("site/") || rel.endsWith(".json") || rel.endsWith(".wasm");
  return { mapped, source_zone: rel.split("/")[0], generated };
};

const rows = [];
for (const [zone, exts] of ZONES) walk(path.join(ROOT, zone), zone, exts, rows);
rows.sort((a, b) => a.path.localeCompare(b.path));
const components = rows.map(r => ({
  component: r.path,
  contract: contract(r.path),
  tests: testInfo(r.path),
  documentation: { basename_mapped: hasMention(basename(r.path)), component_map_mapped: hasMention(basename(r.path), read("docs/en/spec-007-component-map.en.md")) },
  artifacts: { generated: contract(r.path).generated, likely_projection: contract(r.path).generated || r.path.startsWith("site/") },
  retrograde_status: "PENDING_COMPONENT_REVIEW",
}));
const summary = {
  schema: "SPEC007-COMPONENT-CENSUS-v1",
  zones: Object.fromEntries(ZONES.map(([z]) => [z, components.filter(c => c.component === z || c.component.startsWith(z + "/")).length])),
  total_components: components.length,
  source_components: components.filter(c => !c.contract.generated).length,
  generated_components: components.filter(c => c.contract.generated).length,
  mapped_basename: components.filter(c => c.documentation.basename_mapped).length,
  unmapped_basename: components.filter(c => !c.documentation.basename_mapped).map(c => c.component),
  native_zig: components.filter(c => c.tests.kind === "zig").length,
};
const result = { schema: summary.schema, summary, components };
const json = JSON.stringify(result, null, 2) + "\n";
if (EMIT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  fs.writeFileSync(DEBRIEF, `# Spec-007 component census\n\n- Components: ${summary.total_components}\n- Source: ${summary.source_components}\n- Generated: ${summary.generated_components}\n- Basename mapped: ${summary.mapped_basename}\n- Pending component review: ${summary.total_components}\n\nThis census is an inventory; retrograde completion requires a component ledger row and passing verification.\n`);
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
