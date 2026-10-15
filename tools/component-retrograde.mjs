#!/usr/bin/env node
// component-retrograde.mjs — per-component reverse-engineering ledger.
// The census says every file exists; this ledger states how each file is
// actually bound: imports, tests, owners, manifests, and review status.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const CENSUS = path.join(ROOT, "docs", "component-census.json");
const PERF = path.join(ROOT, "security", "out", "component-performance.json");
const OUT = path.join(ROOT, "docs", "component-retrograde.json");
const DEBRIEF = path.join(ROOT, "docs", "component-retrograde.md");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const FULL_RETROGRADE = new Map([
  ["src/dhtd.zig", {
    decision: "bounded-hardened",
    archive: "spec007-dhtd-bounded-assembler-20261014",
  }],
  ["src/aiwo_chunk_checkpoint.zig", {
    decision: "durable-integrity-hardened",
    archive: "spec007-aiwo-checkpoint-v2-20261014",
  }],
  ["src/aiwo_dht.zig", {
    decision: "secure-key-bootstrap",
    archive: "spec007-aiwo-dht-key-bootstrap-20261014",
  }],
  ["src/dht_native.zig", {
    decision: "ownership-hardened",
    archive: "spec007-aiwo-dht-key-bootstrap-20261014",
  }],
  ["src/aiwo_cli.zig", {
    decision: "strict-argument-parser",
    archive: "spec007-aiwo-cli-parser-20261014",
  }],
  ["src/aiwo_state.zig", {
    decision: "durable-state-hardened",
    archive: "spec007-aiwo-state-durable-20261014",
  }],
  ["src/aiwo_policy.zig", {
    decision: "fail-closed-authority",
    archive: "spec007-aiwo-policy-failclosed-20261014",
  }],
  ["src/aiwo_cognitive.zig", {
    decision: "canonical-bounded-scaling",
    archive: "spec007-aiwo-cognitive-bounded-20261014",
  }],
  ["src/aiwo_directive.zig", {
    decision: "complete-context-directive-ids",
    archive: "spec007-aiwo-directive-bounded-20261014",
  }],
  ["src/aiwo_runtime.zig", {
    decision: "owned-runtime-lifecycle",
    archive: "spec007-aiwo-runtime-owned-20261014",
  }],
  ["src/aiwo_heartbeat.zig", {
    decision: "owned-heartbeat-lifecycle",
    archive: "spec007-aiwo-runtime-owned-20261014",
  }],
  ["src/aiwo_fano.zig", {
    decision: "cap-bound-full-authority-binding",
    archive: "spec008-seal-canonical-cap-20261014",
  }],
  ["src/aiwo_manifest.zig", {
    decision: "typed-manifest-validation",
    archive: "spec007-aiwo-manifest-typed-20261014",
  }],
  ["src/aiwo_model_observation.zig", {
    decision: "wide-integer-observation",
    archive: "spec007-aiwo-observation-bounded-20261014",
  }],
  ["src/aiwo_prompt.zig", {
    decision: "strict-token-prompt",
    archive: "spec007-aiwo-prompt-strict-20261014",
  }],
  ["src/aiwo_digit_model_probe.zig", {
    decision: "strict-probe-arguments",
    archive: "spec007-aiwo-digit-probe-args-20261014",
  }],
  ["src/aiwo_digit_bridge.zig", {
    decision: "bounded-digit-observation",
    archive: "spec007-aiwo-digit-bridge-boundary-20261014",
  }],
  ["src/aiwo_types.zig", {
    decision: "golden-digest-contract",
    archive: "spec007-aiwo-types-golden-20261014",
  }],
  ["src/spec007_q128.zig", {
    decision: "exact-ratio-rounding",
    archive: "spec007-spec007-q128-exact-ratio-20261014",
  }],
  ["src/spec007_compute.zig", {
    decision: "saturating-exported-abi",
    archive: "spec007-compute-abi-saturating-20261014",
  }],
  ["src/spec007_fixedpoint_prototype.zig", {
    decision: "exact-q32-ratio-rounding",
    archive: "spec007-fixedpoint-prototype-ratio-20261014",
  }],
  ["src/golden_emit.zig", {
    decision: "corrected-golden-ratio-boundary",
    archive: "spec007-golden-ratio-boundary-20261014",
  }],
  ["src/spec007_calculations.zig", {
    decision: "verified-conservation-baseline",
    archive: "spec007-calculations-conservation-20261014",
  }],
  ["src/spec007_verified_calculations.zig", {
    decision: "verified-claims-baseline",
    archive: "spec007-verified-calculations-20261014",
  }],
  ["src/spec007_expanded_calculations.zig", {
    decision: "saturating-screening-arithmetic",
    archive: "spec007-expanded-screening-20261014",
  }],
  ["src/spec007_drivetrain_calculations.zig", {
    decision: "saturating-drivetrain-screening",
    archive: "spec007-drivetrain-screening-20261014",
  }],
  ["src/spec007_manifold_calculations.zig", {
    decision: "exact-geometry-saturating-transport",
    archive: "spec007-manifold-screening-20261014",
  }],
  ["src/spec007_dynamics_calculations.zig", {
    decision: "signed-carry-thermal-step",
    archive: "spec007-dynamics-thermal-step-20261014",
  }],
  ["src/perf_baseline.zig", {
    decision: "bounded-measurement-harness",
    archive: "spec007-perf-baseline-boundary-20261014",
  }],
  ["src/spec007_alpha_probe.zig", {
    decision: "bounded-log-domain",
    archive: "spec007-alpha-log-domain-20261014",
  }],
  ["src/spec007_astrometric_probe.zig", {
    decision: "bounded-astrometric-domains",
    archive: "spec007-astrometric-domain-boundaries-20261014",
  }],
  ["src/spec007_checksum_audit.zig", {
    decision: "bounded-mobius-checksum",
    archive: "spec007-checksum-pole-20261014",
  }],
  ["src/spec007_ephemeris_probe.zig", {
    decision: "bounded-ephemeris-domains",
    archive: "spec007-ephemeris-domains-20261014",
  }],
  ["src/spec007_portal_probe.zig", {
    decision: "bounded-throat-domains",
    archive: "spec007-portal-domains-20261014",
  }],
  ["src/spec007_warp_probe.zig", {
    decision: "bounded-warp-domains",
    archive: "spec007-warp-domains-20261014",
  }],
  ["src/spec007_wow_shape_probe.zig", {
    decision: "bounded-plateau-tolerance",
    archive: "spec007-wow-shape-domains-20261014",
  }],
  ["src/spec007_ckm_probe.zig", {
    decision: "verified-ckm-baseline",
    archive: "spec007-ckm-baseline-20261014",
  }],
  ["src/spec007_coincidence_probe.zig", {
    decision: "bounded-probability-domains",
    archive: "spec007-coincidence-domains-20261014",
  }],
  ["src/spec007_q_toys.zig", {
    decision: "verified-field-toys-baseline",
    archive: "spec007-q-toys-baseline-20261014",
  }],
  ["src/fixed_point_q128.zig", {
    decision: "canonical-ratio-and-range-boundaries",
    archive: "spec007-q128-engine-domain-20261014",
  }],
  ["deps/digit/src/model_package.zig", {
    decision: "canonical-package-wire-boundaries",
    archive: "digit-model-package-boundaries-20261014",
  }],
  ["deps/digit/src/model_session.zig", {
    decision: "transactional-session-state-boundaries",
    archive: "digit-model-session-boundaries-20261014",
  }],
  ["deps/digit/src/graph_exec.zig", {
    decision: "resumable-checked-graph-execution-boundaries",
    archive: "digit-graph-execution-boundaries-20261015",
  }],
  ["deps/digit/src/tensor_upload.zig", {
    decision: "bounded-host-tensor-ingress-boundaries",
    archive: "digit-tensor-upload-boundaries-20261015",
  }],
  ["deps/digit/src/onnx_weights.zig", {
    decision: "bounded-onnx-weight-index-and-shard-boundaries",
    archive: "digit-onnx-weights-boundaries-20261015",
  }],
  ["deps/digit/src/onnx_graph.zig", {
    decision: "bounded-onnx-graph-parser-and-topological-order",
    archive: "digit-onnx-graph-boundaries-20261015",
  }],
  ["deps/digit/src/tensor_ops.zig", {
    decision: "checked-q128-tensor-kernel-domains",
    archive: "digit-tensor-ops-boundaries-20261015",
  }],
  ["tools/layer-map.mjs", {
    decision: "generated-evidence-boundary",
    archive: "spec007-layer-map-generated-boundary-20261014",
  }],
  ["src/spec008_medium_lattice.zig", {
    decision: "bounded-medium-lattice-domains",
    archive: "spec008-medium-lattice-boundaries-20261014",
  }],
  ["src/spec008_seal.zig", {
    decision: "canonical-payload-cap",
    archive: "spec008-seal-canonical-cap-20261014",
  }],
  ["src/spec008_seal_cli.zig", {
    decision: "strict-build-hex-boundary",
    archive: "spec008-seal-canonical-cap-20261014",
  }],
  ["src/spec008_qstar_archive.zig", {
    decision: "exact-archive-persistence-boundaries",
    archive: "spec008-qstar-archive-vfs-boundaries-20261014",
  }],
  ["src/spec008_qstar_carriage.zig", {
    decision: "multi-medium-transport-boundaries",
    archive: "spec008-qstar-carriage-boundaries-20261014",
  }],
  ["src/spec008_qstar_escrow.zig", {
    decision: "bounded-shamir-rs-envelopes",
    archive: "spec008-qstar-escrow-boundaries-20261014",
  }],
  ["src/spec008_qstar_fleet.zig", {
    decision: "exact-fleet-wire-ownership-boundaries",
    archive: "spec008-qstar-fleet-boundaries-20261014",
  }],
  ["src/spec008_qstar_mesh.zig", {
    decision: "exact-relay-ownership-boundaries",
    archive: "spec008-qstar-mesh-boundaries-20261014",
  }],
  ["src/spec008_qstar_parity.zig", {
    decision: "packet-bound-authenticated-wire-parity-causal-override",
    archive: "spec008-qstar-causality-override-20261015",
  }],
]);

const read = rel => { try { return fs.readFileSync(path.join(ROOT, rel), "utf8"); } catch { return ""; } };
const exists = rel => fs.existsSync(path.join(ROOT, rel));
const census = JSON.parse(fs.readFileSync(CENSUS, "utf8"));
const perf = exists(path.relative(ROOT, PERF)) ? JSON.parse(fs.readFileSync(PERF, "utf8")) : null;
const perfByComponent = new Map();
const perfSelectors = new Set();
const perfWorkstreams = new Set();
for (const m of perf?.measurements || []) {
  if (m.status !== "PASS") continue;
  for (const rel of m.bindings?.components || []) perfByComponent.set(rel, [...(perfByComponent.get(rel) || []), m.id]);
  if (m.bindings?.selector) perfSelectors.add(m.bindings.selector);
  for (const ws of m.bindings?.workstreams || []) if (ws !== "all") perfWorkstreams.add(ws);
}
const perfMeasurementsFor = c => {
  const ids = new Set(perfByComponent.get(c.component) || []);
  if (perfSelectors.has("unit-tested-zig") && c.tests.kind === "zig" && c.tests.blocks > 0 && c.tests.registered) ids.add("zig-build-test");
  if (perfSelectors.has("site-academy-generated") && c.component.startsWith("site/assets/academy/")) ids.add("academy-harvest-verify");
  return [...ids].sort();
};

const WORKSTREAM = [
  [/^src\/aiwo_|^src\/dht_native\.zig$/, "native-aiwo-dht"],
  [/^deps\/digit\//, "digit-model-donor"],
  [/^deps\/qstar-|^deps\/VENDORED\.md$/, "qstar-donor"],
  [/^src\/spec008_/, "spec008-wire"],
  [/^src\/fixed_point_q128\.zig$|^src\/spec007_q128\.zig$/, "q128-arithmetic"],
  [/^src\//, "spec007-core"],
  [/^security\//, "security-lab"],
  [/^tools\//, "governance-tools"],
  [/^firmware\//, "firmware"],
  [/^apps\//, "application-artifacts"],
  [/^admiralty-desk\//, "desk-shell"],
  [/^site\/assets\//, "published-surface"],
];
const workstream = rel => (WORKSTREAM.find(([re]) => re.test(rel)) || [null, "unclassified"])[1];

const HOT_PATH = /aiwo|digit|model|graph|tensor|dht|seal|fixed_point|q128|fano|academy|manifest|publish|team-sweep|desktop/i;
const MARKER_RE = new RegExp(`\\b(?:${["TO"+"DO", "FIX"+"ME", "ST"+"UB", "PLACE"+"HOLDER"].join("|")})\\b`, "g");
const OPT_IN = new Set([
  "admiralty-desk/package-lock.json",
  "admiralty-desk/preload.js",
]);

const sourceTexts = new Map();
for (const c of census.components) {
  if (c.contract.generated) continue;
  const text = read(c.component);
  if (text && text.length <= 2_000_000) sourceTexts.set(c.component, text);
}
const sourceIndex = [...sourceTexts.entries()];

const stem = rel => path.basename(rel, path.extname(rel));
const fileName = rel => path.basename(rel);
const sha256Text = text => crypto.createHash("sha256").update(text).digest("hex");
const lineCount = text => {
  if (text.length === 0) return 0;
  let lines = 1;
  for (let i = 0; i < text.length; i += 1) if (text.charCodeAt(i) === 10) lines += 1;
  return lines;
};

function importsFor(rel, text) {
  const out = new Set();
  const patterns = [
    /@import\("([^"]+)"\)/g,
    /(?:from|require\()\s*["']([^"']+)["']\)?/g,
    /import\s+[^"']*from\s*["']([^"']+)["']/g,
  ];
  for (const re of patterns) for (const m of text.matchAll(re)) out.add(m[1]);
  return [...out].sort();
}

function referencedBy(rel) {
  const file = fileName(rel);
  const base = stem(rel);
  const hits = [];
  for (const [other, text] of sourceIndex) {
    if (other === rel) continue;
    if (text.includes(rel) || text.includes(file) || (base.length >= 5 && text.includes(base))) hits.push(other);
    if (hits.length === 16) break;
  }
  return hits;
}

function statusFor(c, source, referenced) {
  if (!exists(c.component)) return "MISSING";
  if (c.contract.generated) {
    if (c.contract.manifest_bound || c.contract.owner) return "GENERATED_ARTIFACT_BOUND";
    return "GENERATED_ARTIFACT_PENDING";
  }
  if (c.tests.kind === "zig") {
    if (c.tests.blocks > 0 && c.tests.registered) return "UNIT_TESTED";
    if (c.tests.registered) return "BUILD_GRAPH_COVERED";
    if (referenced.length) return "DEPENDENCY_COVERED";
    return "PENDING_COMPONENT_REVIEW";
  }
  if (c.tests.kind === "script") {
    if (c.tests.referenced) return "SCRIPT_HARNESS_BOUND";
    if (referenced.length) return "SCRIPT_REFERENCED";
    return "PENDING_COMPONENT_REVIEW";
  }
  if (c.contract.mapped || c.documentation.component_map_mapped || OPT_IN.has(c.component)) return "DOCUMENTED_COMPONENT";
  return "PENDING_COMPONENT_REVIEW";
}

const components = census.components.map(c => {
  const abs = path.join(ROOT, c.component);
  const stat = fs.existsSync(abs) ? fs.statSync(abs) : null;
  const source = stat && !c.contract.generated
    ? (sourceTexts.has(c.component) ? sourceTexts.get(c.component) : read(c.component))
    : "";
  const refs = referencedBy(c.component);
  const imports = source ? importsFor(c.component, source) : [];
  const todo_markers = source ? (source.match(MARKER_RE) || []).length : 0;
  const status = statusFor(c, source, refs);
  const measurements = perfMeasurementsFor(c);
  const fullRetrograde = FULL_RETROGRADE.get(c.component);
  return {
    component: c.component,
    workstream: workstream(c.component),
    status,
    reverse_engineering: {
      sha256: stat && !c.contract.generated ? sha256Text(source) : null,
      bytes: stat && !c.contract.generated ? stat.size : 0,
      lines: source ? lineCount(source) : null,
      imports,
      referenced_by: refs,
      todo_markers,
      public_surface: source ? (source.match(/\bpub\s+(?:const|fn|var)\b|\bexport\s+fn\b|\bexport\s+(?:const|function|default)\b|\bmodule\.exports\b/g) || []).length : 0,
    },
    contract: {
      mapped: c.contract.mapped,
      generated: c.contract.generated,
      owner: c.contract.owner,
      owner_basis: c.contract.owner_basis,
      manifest_bound: c.contract.manifest_bound,
      source_zone: c.contract.source_zone,
    },
    verification: {
      kind: c.tests.kind,
      test_blocks: c.tests.blocks ?? 0,
      registered: c.tests.registered ?? c.tests.referenced ?? true,
      documentation_mapped: c.documentation.basename_mapped || c.documentation.component_map_mapped,
    },
    optimization: {
      hot_path: HOT_PATH.test(c.component),
      measured: measurements.length > 0 || /latency|throughput|benchmark|measured|profile|performance|speed/i.test(source),
      measurements,
      workstream_measured: perfWorkstreams.has(workstream(c.component)),
      completed: !!fullRetrograde,
      archive: fullRetrograde?.archive || null,
      decision: fullRetrograde?.decision || "baseline-only",
    },
  };
});

const count = pred => components.filter(pred).length;
const statusCounts = Object.fromEntries([...new Set(components.map(c => c.status))].sort().map(s => [s, count(c => c.status === s)]));
const workstreamCounts = Object.fromEntries([...new Set(components.map(c => c.workstream))].sort().map(w => [w, count(c => c.workstream === w)]));
const summary = {
  schema: "SPEC007-COMPONENT-RETROGRADE-v1",
  census_components: census.summary.total_components,
  components: components.length,
  status_counts: statusCounts,
  workstreams: workstreamCounts,
  unit_tested: count(c => c.status === "UNIT_TESTED"),
  generated_bound: count(c => c.status === "GENERATED_ARTIFACT_BOUND"),
  pending_review: count(c => c.status === "PENDING_COMPONENT_REVIEW"),
  todo_markers: components.reduce((n, c) => n + c.reverse_engineering.todo_markers, 0),
  hot_path_candidates: components.filter(c => c.optimization.hot_path).map(c => c.component),
  measured_components: count(c => c.optimization.measured),
  workstream_measured_components: count(c => c.optimization.workstream_measured),
  performance_baseline: perf ? {
    schema: perf.schema,
    measurements: perf.summary?.measurements ?? 0,
    bound_components: perf.summary?.bound_components ?? 0,
    selectors: perf.summary?.selectors ?? [],
  } : null,
  completed_full_retrograde: count(c => c.optimization.completed),
};
const result = { schema: summary.schema, summary, components };
const json = JSON.stringify(result, null, 2) + "\n";
const pending = components.filter(c => c.status === "PENDING_COMPONENT_REVIEW").map(c => c.component);
const md = `# Spec-007 component retrograde ledger\n\n` +
  `- Components: ${summary.components}\n` +
  `- Unit-tested Zig surfaces: ${summary.unit_tested}\n` +
  `- Generated artifacts bound: ${summary.generated_bound}\n` +
  `- Pending component review: ${summary.pending_review}\n` +
  `- Deferred-work markers: ${summary.todo_markers}\n` +
  `- Performance-measured components: ${summary.measured_components}\n` +
  `- Workstream-measured components: ${summary.workstream_measured_components}\n` +
  `- Fully retrograded/optimized: ${summary.completed_full_retrograde}\n\n` +
  `## Status counts\n\n` +
  Object.entries(statusCounts).map(([k, v]) => `- ${k}: ${v}`).join("\n") +
  `\n\n## Workstreams\n\n` +
  Object.entries(workstreamCounts).map(([k, v]) => `- ${k}: ${v}`).join("\n") +
  `\n\n## Pending review\n\n` +
  (pending.length ? pending.map(p => `- \`${p}\``).join("\n") : "- none") +
  `\n\nThis ledger is a reverse-engineering baseline, not a completion claim. ` +
  `A component is fully retrograded only after its isolated verification, ` +
  `documentation, performance measurement, optimization decision, and archive row land.\n`;

if (EMIT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, json);
  fs.writeFileSync(DEBRIEF, md);
  console.log(`component retrograde → ${OUT} (${components.length} components)`);
  process.exit(0);
}
if (VERIFY) {
  if (!fs.existsSync(OUT)) { console.error("component retrograde verify FAIL — emit first"); process.exit(1); }
  const old = JSON.parse(fs.readFileSync(OUT, "utf8"));
  const stableOld = JSON.stringify({ summary: old.summary, components: old.components });
  const stableNew = JSON.stringify({ summary, components });
  if (stableOld !== stableNew) { console.error("component retrograde verify FAIL — ledger drift"); process.exit(1); }
  console.log(`component retrograde verify GREEN — ${components.length} components stable`);
  process.exit(0);
}
console.log(JSON.stringify(summary, null, 2));
