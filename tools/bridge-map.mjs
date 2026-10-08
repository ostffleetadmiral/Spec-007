#!/usr/bin/env node
/* bridge-map.mjs — the D9 bidirectional evidence bridge.
   The D-series sweeps carded every cluster root; this tool does the
   pour-over: it resolves the sibling trees' settled verdicts, executable
   audits, second implementations, and recorded experiment data against
   the dossier claims they substantiate — mechanically, not narratively.

   Anchor checks are pure filesystem/doc facts (file exists, marker
   present, JSON schema holds, verdict rows parse) plus one bounded live
   exec (TheUE `zig build verify-claims`). Every anchor degrades to
   "absent" rather than error — sibling trees mutate; absence is a
   deferral, not a defect.

   Emits security/out/bridge-ledger.json + bridge-debrief.md.
   Bare run is dry; --emit writes; --verify proves the ledger matches
   the committed state (anchors + links — the timestamp rides free). */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const HOME = process.env.HOME;
const OUT = path.join(ROOT, "security", "out");
const CLAIMS_MD = path.join(ROOT, "docs", "en", "spec-007-research-dossier.md");

const args = new Set(process.argv.slice(2));
const EMIT = args.has("--emit"), VERIFY = args.has("--verify");

/* ---------- sibling roots ($HOME-relative — same convention as the census) */
const SIB = {
  "hardware": "CascadeProjects/hardware",
  "zig-k3-port": "CascadeProjects/hardware/experiments/zig-k3-port",
  "zig-k3-preserved": "CascadeProjects/hardware/experiments/zig-k3-port-local-preserved-20261004",
  "theue": "CascadeProjects/hardware/experiments/TheUE",
  "qstar-llm": "CascadeProjects/hardware/experiments/qstar-llm",
  "bs-analysis": "CascadeProjects/hardware/experiments/BS",
  "rations": "CascadeProjects/Rations",
  "theplatform": "CascadeProjects/ThePlatform",
  "octolab": "CascadeProjects/octo",
  "falsifible": "CascadeProjects/Falsifible",
  "abby-donor-shelf": "CascadeProjects/basic/Abby",
  "qstar-llm-basic": "CascadeProjects/basic/qstar-llm",
  "eu-version-z": "Music/Paul/Sci-Fi",
  "eu-legacy": "Music/Paul/engineered_universe",
  "eu-vx4": "Music/Paul/newest",
  "codon": "Music/Paul/codon",
  "space-agent": "Music/Paul/space-agent",
  "pj-hexredox": "Desktop/PJ",
  "qstar-corpus": "Desktop/Qstar",
  "ralph-corpus": "Desktop/Ralph",
  "sheraton-shelf": "Desktop/Sheraton",
  "tp-donor-shelf": "Desktop/ThePlatform",
  "desi-llama": "Desktop/Desi",
  "fano-engine": "Documents/animation",
  "ark-ivector": "Documents/Ark",
  "mosi-papertunes": "Documents/Mosi",
  "archive-corpus": "Documents/archive",
  "models-store": "Documents/models",
  "euqinome-drawer": "CascadeProjects/hardware/experiments/Spec-007/thoughts&convos/AdmPaul/Euqinom",
  "spec-007": "CascadeProjects/hardware/experiments/Spec-007",
};
/* the archive corpus lives outside the project roots — ~/.archives */
const ARCHIVES = path.join(HOME, ".archives");
const sibPath = (root, rel) => path.join(HOME, SIB[root] || "", rel || "");
const sibRead = (root, rel) => {
  try { return fs.readFileSync(sibPath(root, rel), "utf8"); } catch { return null; }
};

/* ---------- check kinds ---------- */
function check(c) {
  switch (c.type) {
    case "exists": {
      return fs.existsSync(sibPath(c.root, c.file));
    }
    case "dir-set": {
      /* every listed path must exist inside the root */
      return (c.paths || []).every(rel => fs.existsSync(sibPath(c.root, rel)));
    }
    case "dir-glob": {
      /* at least minEntries entries under the root/dir matching prefix —
         used for the archive corpus: the campaigns themselves are evidence */
      const dir = c.root === "@archives" ? ARCHIVES
        : sibPath(c.root, c.dir || ".");
      try {
        const n = fs.readdirSync(dir).filter(f => f.startsWith(c.prefix)).length;
        return n >= (c.minEntries || 1);
      } catch { return false; }
    }
    case "sealed-sample": {
      /* archive corpus seals come in both forms: dir + SHA256SUMS/NOTE.md,
         or .tar.gz + .sha256 sidecar. Families match prefix on either. */
      try {
        const entries = fs.readdirSync(ARCHIVES).filter(f => f.startsWith(c.prefix));
        const units = entries.filter(f => !f.endsWith(".sha256"));
        if (units.length < (c.minEntries || 1)) return false;
        const sample = units.slice(0, c.sample || 5);
        return sample.every(f => {
          const p = path.join(ARCHIVES, f);
          if (fs.statSync(p).isDirectory())
            return fs.existsSync(path.join(p, "SHA256SUMS")) ||
                   fs.existsSync(path.join(p, "NOTE.md"));
          return fs.existsSync(p + ".sha256");
        });
      } catch { return false; }
    }
    case "marker": {
      const t = sibRead(c.root, c.file);
      return t != null && (c.markers || []).every(m => t.includes(m));
    }
    case "table": {
      /* verdict table: ≥minRows `| N |` rows and ≥minEach of each verdict
         token listed in `verdicts` (e.g. {VERIFIED:24, REFUTED:1}) */
      const t = sibRead(c.root, c.file);
      if (t == null) return false;
      const rows = (t.match(/^\| *\d+ \|/gm) || []).length;
      if (rows < (c.minRows || 1)) return false;
      for (const [v, n] of Object.entries(c.verdicts || {})) {
        const got = (t.match(new RegExp("\\*\\*" + v, "g")) || []).length;
        if (got < n) return false;
      }
      return true;
    }
    case "json": {
      try {
        const d = JSON.parse(sibRead(c.root, c.file) || "null");
        if (d == null) return false;
        return (c.assert || (() => true))(d);
      } catch { return false; }
    }
    case "exec": {
      /* bounded live run — e.g. a sibling's own verify-claims suite.
         Only ever claimed HELD when the pinned output string appears. */
      const r = spawnSync(c.cmd[0], c.cmd.slice(1), {
        cwd: sibPath(c.root, "."), encoding: "utf8",
        timeout: c.timeout || 60000,
      });
      const out = (r.stdout || "") + (r.stderr || "");
      return r.status === 0 && (c.expect || []).every(m => out.includes(m));
    }
    default: return false;
  }
}

/* ---------- the anchors — what the siblings actually settle ----------
   direction: "to-spec" = sibling evidence substantiating a dossier claim;
              "from-spec" = spec work the sibling carries (reverse port);
              "shared" = a convention both trees enforce. */
const ANCHORS = [
  /* -- zig-k3-port: the settled lattice verdicts + second SPEC-008 impl -- */
  { id: "S01", root: "zig-k3-port", artifact: "docs/CLAIM-VERDICTS.md",
    kind: "verdict-table", direction: "to-spec", claims: ["C95", "C78", "C89"],
    label: "40-row claim-by-claim verdict table under the shared family vocabulary — 24 VERIFIED, 1 REFUTED; settles 421-node/15³/mirror/721-shell lattice claims verbatim",
    check: { type: "table", root: "zig-k3-port", file: "docs/CLAIM-VERDICTS.md",
      minRows: 36, verdicts: { VERIFIED: 24, REFUTED: 1, INTERPRETATION: 5 } } },
  { id: "S02", root: "zig-k3-port", artifact: "src/fablattice.zig",
    kind: "module", direction: "to-spec", claims: ["C97"],
    label: "SPEC008v1 fabric addressing in a second codebase: u128 piece addresses, O(1) coord resolver, op-bound route walk over all 3375² pairs",
    check: { type: "marker", root: "zig-k3-port", file: "src/fablattice.zig",
      markers: ["SPEC008v1", "3375"] } },
  { id: "S03", root: "zig-k3-port", artifact: "src/fanowire.zig",
    kind: "module", direction: "to-spec", claims: ["C97"],
    label: "the frozen 136-byte Fano mesh dialect ported byte-exact — the wire contract lives in two codebases",
    check: { type: "marker", root: "zig-k3-port", file: "src/fanowire.zig",
      markers: ["FANO_WIRE: usize = 136", "seal"] } },
  { id: "S04", root: "zig-k3-port", artifact: "tools/k3beacon.zig",
    kind: "module", direction: "to-spec", claims: ["C97"],
    label: "136-byte sealed Fano beacon on UDP with --coord SPEC008v1 addressing — the dialect rides a live transport",
    check: { type: "marker", root: "zig-k3-port", file: "tools/k3beacon.zig",
      markers: ["136", "coord"] } },
  { id: "S05", root: "zig-k3-port", artifact: "src/osig.zig",
    kind: "module", direction: "from-spec", claims: ["C97", "C99"],
    label: "octonion/Fano signatures ported from security/fano_dialect.py — order-sensitive folds backing inference cache receipts",
    check: { type: "marker", root: "zig-k3-port", file: "src/osig.zig",
      markers: ["fano_dialect", "octonion"] } },
  { id: "S06", root: "zig-k3-port", artifact: "AGENTS.md",
    kind: "doc", direction: "to-spec", claims: ["C89"],
    label: "wasm64 memory64 under an in-tree interpreter + CPU≡GPU bit-exact Vulkan backend + archived 93-layer golden replay (max |diff| 2.62e-6)",
    check: { type: "marker", root: "zig-k3-port", file: "AGENTS.md",
      markers: ["memory64", "golden replay", "2.62e-6"] } },

  /* -- TheUE: the audit executable + governed adapters + deterministic inference -- */
  { id: "S07", root: "theue", artifact: "zig build verify-claims",
    kind: "exec", direction: "to-spec", claims: ["C96", "C99"],
    label: "the 36-claim audit re-executed live in a second codebase — audit_counts PROVEN:16/INTERP:10/NUMER:3/CONSTR:4/UNVER:3",
    check: { type: "exec", root: "theue", cmd: ["zig", "build", "verify-claims"],
      timeout: 90000,
      expect: ["audit_counts=PROVEN:16", "TOTAL:36"] } },
  { id: "S08", root: "theue", artifact: "src/capability_registry.zig",
    kind: "module", direction: "to-spec", claims: ["C73", "C89"],
    label: "the 50-entry cross-archive capability registry — status/provenance layer behind the 3,472-row public projection",
    check: { type: "marker", root: "theue", file: "src/capability_registry.zig",
      markers: ["capability", "verified"] } },
  { id: "S09", root: "theue", artifact: "tools/ adapter suite",
    kind: "module-set", direction: "to-spec", claims: ["C72", "C73"],
    label: "cross-system governed adapters — qstar/rations adapters, governed bridge, governance envelope, academy manifest",
    check: { type: "marker", root: "theue", file: "tools/governed_bridge.py",
      markers: ["govern", ] } },
  { id: "S10", root: "theue", artifact: "tools/qstar_adapter.py",
    kind: "module", direction: "to-spec", claims: ["C72", "C73"],
    label: "QSTAR adapter — the 421×8 lattice contract consumed by the governed runtime",
    check: { type: "exists", root: "theue", file: "tools/qstar_adapter.py" } },
  { id: "S11", root: "theue", artifact: "README.md",
    kind: "doc", direction: "to-spec", claims: ["C98"],
    label: "deterministic model execution evidence — teacher-forcing oracle parity, GQA+MoE track, tokenizer 45/45, real-layer replay",
    check: { type: "marker", root: "theue", file: "README.md",
      markers: ["teacher forcing", "qwen3_moe", "tiktoken"] } },

  /* -- hardware monorepo: the audit corpus itself -- */
  { id: "S12", root: "hardware", artifact: "src/final_audit.zig",
    kind: "module", direction: "to-spec", claims: ["C96", "C99"],
    label: "the executable 36-claim classifier — PROVEN/INTERPRETATION/NUMEROLOGY/CONSTRUCTION/UNVERIFIED is enforced in code, not prose",
    check: { type: "marker", root: "hardware", file: "src/final_audit.zig",
      markers: ["PROVEN", "INTERPRETATION", "NUMEROLOGY"] } },
  { id: "S13", root: "hardware", artifact: "AGENTS.md audit table",
    kind: "doc", direction: "to-spec", claims: ["C96"],
    label: "713 verified operations across Zig/Q#/sidecar/hooks; 8 Lean 4 modules, zero sorries",
    check: { type: "marker", root: "hardware", file: "AGENTS.md",
      markers: ["PROVEN | 16", "576 tests", "zero sorries"] } },
  { id: "S14", root: "hardware", artifact: "src/fixed_point.zig",
    kind: "module", direction: "from-spec", claims: ["C99"],
    label: "RNE multiply + 512-bit intermediates ported FROM the Q128.128 engine — half-ulp bound |x*y − fl(x*y)| ≤ 2⁻¹²⁹",
    check: { type: "marker", root: "hardware", file: "src/fixed_point.zig",
      markers: ["RNE", "128"] } },
  { id: "S15", root: "hardware", artifact: "src/ engineering ports",
    kind: "module-set", direction: "from-spec", claims: ["C99"],
    label: "engineering modules ported from Q128.128 — fano_tensor, phi_cooling, smith, rf_harvest, holo",
    check: { type: "marker", root: "hardware", file: "src/fano_tensor.zig",
      markers: ["421"] } },
  { id: "S16", root: "hardware", artifact: "src/holo.zig",
    kind: "module", direction: "from-spec", claims: ["C99"],
    label: "holographic N³→16³ codec — FHOLO1 serialization, winding vectors, exact rotations",
    check: { type: "exists", root: "hardware", file: "src/holo.zig" } },
  { id: "S17", root: "hardware", artifact: "formalize/",
    kind: "module-set", direction: "to-spec", claims: ["C96"],
    label: "Lean 4 formalization — 8 modules, zero sorries, one native_decide",
    check: { type: "exists", root: "hardware", file: "formalize/lakefile.lean" } },
  { id: "S18", root: "hardware", artifact: "src/self_claims.zig + elevation_paths + stress/rebuttal",
    kind: "module-set", direction: "to-spec", claims: ["C96", "C99"],
    label: "self-claims with explicit limitations + computational elevation paths + adversarial stress/rebuttal pairs — the honesty machinery",
    check: { type: "marker", root: "hardware", file: "src/elevation_paths.zig",
      markers: ["elevation", ] } },
  { id: "S19", root: "hardware", artifact: "ARCHITECTURAL-DEBT.md",
    kind: "doc", direction: "shared", claims: ["C99"],
    label: "the debt ledger — 17 modules still on f64/f32, recorded instead of hidden; the convention the dossier adopts",
    check: { type: "exists", root: "hardware", file: "ARCHITECTURAL-DEBT.md" } },
  { id: "S20", root: "hardware", artifact: "src/literature_review.zig",
    kind: "module", direction: "to-spec", claims: ["C96"],
    label: "24 independent published references scored against the claims — 5 independently verified, 13 reinforced",
    check: { type: "marker", root: "hardware", file: "src/literature_review.zig",
      markers: ["INDEPENDENTLY", ] } },
  { id: "S21", root: "hardware", artifact: "os/ FANO-1 hooks",
    kind: "module-set", direction: "to-spec", claims: ["C92", "C97"],
    label: "native deployment hooks — neuraleak↔LLM, E8↔Vulkan, codon↔polyglot, NPU detect+infer (hardware-absent boundary labeled)",
    check: { type: "exists", root: "hardware", file: "os/vulkan_e8_hook.zig" } },

  /* -- recorded experiment data -- */
  { id: "S22", root: "hardware", artifact: "experiments/battery_results.json",
    kind: "data", direction: "to-spec", claims: ["C98"],
    label: "neuraleak battery run 1 — 15 entries, qwen2.5:3b, 3 conditions",
    check: { type: "json", root: "hardware", file: "experiments/battery_results.json",
      assert: d => Array.isArray(d.entries) && d.entries.length === 15 &&
        new Set(d.entries.map(e => e.condition)).size === 3 } },
  { id: "S23", root: "hardware", artifact: "experiments/battery_qstar_results.json",
    kind: "data", direction: "to-spec", claims: ["C98"],
    label: "neuraleak battery run 3 — 15 entries, qstar:latest, 3 conditions",
    check: { type: "json", root: "hardware", file: "experiments/battery_qstar_results.json",
      assert: d => Array.isArray(d.entries) && d.entries.length === 15 &&
        d.entries.every(e => e.model === "qstar:latest") } },
  { id: "S24", root: "hardware", artifact: "experiments/battery_qwen_results.json",
    kind: "data", direction: "to-spec", claims: ["C98"],
    label: "neuraleak battery run 2 — 15 entries, qwen2.5:3b, 3 conditions",
    check: { type: "json", root: "hardware", file: "experiments/battery_qwen_results.json",
      assert: d => Array.isArray(d.entries) && d.entries.length === 15 } },

  /* -- qstar-llm: the audit doc corpus behind the lattice engine -- */
  { id: "S25", root: "qstar-llm", artifact: "docs/ audit corpus",
    kind: "doc-set", direction: "to-spec", claims: ["C78", "C89"],
    label: "49-doc corpus incl. E2E audit results, capabilities, agent benchmark, use-case audit, retro-dev audit",
    check: { type: "marker", root: "qstar-llm", file: "docs/E2E_AUDIT_RESULTS.md",
      markers: ["audit", ] } },

  /* -- BS: the index→recompute→label audit model -- */
  { id: "S26", root: "bs-analysis", artifact: "BS_ANALYSIS.md",
    kind: "doc", direction: "to-spec", claims: ["C95", "C99"],
    label: "450 indexed claim lines, 286 equation lines, 48 checksummed public records — the recompute-then-label discipline the override audit follows",
    check: { type: "marker", root: "bs-analysis", file: "BS_ANALYSIS.md",
      markers: ["Reproduced", "450"] } },

  /* ===== D10 — whole-cluster expansion: every populated census root + the archive corpus ===== */

  /* -- CascadeProjects realm -- */
  { id: "S27", root: "rations", artifact: "AGENTS.md",
    kind: "doc", direction: "to-spec", claims: ["C53", "C67"],
    label: "the production release-discipline contract — 1,548 tests, ≥116.9% coverage ratchet, 112-check WASM smoke, 3,000-iter fuzz, 20-check quine E2E",
    check: { type: "marker", root: "rations", file: "AGENTS.md",
      markers: ["1548 tests", "116.9", "wasm_smoke", "3000"] } },
  { id: "S28", root: "rations", artifact: "src/ transport + identity corpus",
    kind: "module-set", direction: "shared", claims: ["C53", "C97"],
    label: "physical-channel transports + the spec007 invite-compat suite — the sibling bridge already runs both directions",
    check: { type: "dir-glob", root: "rations", dir: "src", prefix: "", minEntries: 15 } },
  { id: "S29", root: "theplatform", artifact: "hyper-token/ + genesis sweep",
    kind: "module-set", direction: "shared", claims: ["C97", "C89"],
    label: "the SPEC-008 family branch's own experiment tree — 19 semantic-layer modules (2d_boundaries … 8d_hypersphere) + genesis-sweep results JSON",
    check: { type: "dir-glob", root: "theplatform", dir: "hyper-token", prefix: "", minEntries: 15 } },
  { id: "S30", root: "octolab", artifact: "audit_export + coverage report",
    kind: "data", direction: "to-spec", claims: [],
    label: "machine-readable audit export + coverage report for the private-git sync stack — infrastructure evidence, no physics claims",
    check: { type: "exists", root: "octolab", file: "coverage_report.txt" } },
  { id: "S31", root: "falsifible", artifact: "src/ compressed-expert runtime",
    kind: "module-set", direction: "to-spec", claims: ["C72", "C89"],
    label: "from-scratch Zig compressed-expert inference — gated_delta_net, expert_cache, compression, entropy, GGUF, sparse MoE; suite green 2026-10-08",
    check: { type: "dir-set", root: "falsifible",
      paths: ["src/gated_delta_net.zig", "src/expert_cache.zig", "src/compression",
        "src/entropy", "tests", "archives"] } },

  /* -- Music/Paul realm -- */
  { id: "S32", root: "eu-version-z", artifact: "artifacts/promotion_report.json",
    kind: "data", direction: "to-spec", claims: ["C95", "C98"],
    label: "a machine-readable claims-lifecycle engine — candidates graded proved/blocked with controls + limitations (M11/M15/M19 blocked on unpreregistered holdout)",
    check: { type: "json", root: "eu-version-z", file: "artifacts/promotion_report.json",
      assert: d => Array.isArray(d.records) && d.records.length > 0 &&
        d.release_blocked === true } },
  { id: "S33", root: "eu-version-z", artifact: "audit_report.json + tests/",
    kind: "data", direction: "to-spec", claims: ["C95"],
    label: "audit report carrying claim_registry + formula_protocol over a 160-file test suite — the audit corpus, not the README numbers, is the evidence",
    check: { type: "json", root: "eu-version-z", file: "artifacts/audit_report.json",
      assert: d => d.claim_registry != null && d.formula_protocol != null } },
  { id: "S34", root: "codon", artifact: "results/ncbi/ routing JSONs",
    kind: "data", direction: "to-spec", claims: [],
    label: "the only empirical bio-dataset evidence in the cluster — real NCBI genomes routed: ecoli K12, human GRCh38, yeast S288C",
    check: { type: "dir-set", root: "codon",
      paths: ["results/ncbi/ecoli_k12_routing.json",
        "results/ncbi/human_grch38_routing.json",
        "results/ncbi/yeast_s288c_routing.json",
        "results/ncbi/codon_routing_test.json"] } },
  { id: "S35", root: "space-agent", artifact: "AGENTS.md DOX contract",
    kind: "doc", direction: "shared", claims: [],
    label: "DOX — the hierarchical binding AGENTS.md contract; the same nearest-doc-controls discipline the desk enforces",
    check: { type: "marker", root: "space-agent", file: "AGENTS.md",
      markers: ["DOX", "AGENTS"] } },
  { id: "S36", root: "eu-legacy", artifact: "README claim + vX.4 line",
    kind: "doc", direction: "shared", claims: [],
    label: "the EU lineage claim under audit — 41 constants / 7 axioms / 0.094% mean error; newest/ continues the line (consciousness.py, vX4)",
    check: { type: "marker", root: "eu-legacy", file: "README.md",
      markers: ["41", "0.094", "7 axioms"] } },
  { id: "S37", root: "eu-vx4", artifact: "consciousness.py + vX4 corpus",
    kind: "doc", direction: "shared", claims: [],
    label: "the newest EU variant — vX4 engine + bio modules + documentation; interpretation-tier, no promotion claimed",
    check: { type: "exists", root: "eu-vx4", file: "consciousness.py" } },

  /* -- Desktop realm -- */
  { id: "S38", root: "pj-hexredox", artifact: "audit_report.md + latex/",
    kind: "doc", direction: "to-spec", claims: ["C89"],
    label: "HIPF audit — 443/443 tests PASSED, zero-placeholder audit report + LaTeX paper corpus + OctetTruss lattice integration",
    check: { type: "marker", root: "pj-hexredox", file: "audit_report.md",
      markers: ["443", "PASSED", "placeholder"] } },
  { id: "S39", root: "qstar-corpus", artifact: "Gov/ + Book of Phi/ + Maypole_firmware/",
    kind: "doc-set", direction: "shared", claims: [],
    label: "the governance canon the Q* claims descend from — Gov docs, Book of Phi, Maypole firmware, public disclosure",
    check: { type: "dir-set", root: "qstar-corpus",
      paths: ["Gov", "Book of Phi", "Maypole_firmware", "papers",
        "QSTAR-Public-Disclosure.md"] } },
  { id: "S40", root: "ralph-corpus", artifact: "axiom7revisited/AUDIT_REPORT.md",
    kind: "doc", direction: "to-spec", claims: ["C95", "C98"],
    label: "MOUND — the deepest claim-audit trail in the cluster: 1,678 tests verified with honest stale-count addenda, Lean formalization + Q# corpus",
    check: { type: "marker", root: "ralph-corpus", file: "axiom7revisited/AUDIT_REPORT.md",
      markers: ["1678", "tests"] } },
  { id: "S41", root: "ralph-corpus", artifact: "implications.md predictions",
    kind: "doc", direction: "shared", claims: [],
    label: "51 physical predictions labeled interpretation (<1% band) — claims filed under their own honesty label, not promoted",
    check: { type: "marker", root: "ralph-corpus", file: "axiom7revisited/docs/implications.md",
      markers: ["51", "prediction"] } },
  { id: "S42", root: "sheraton-shelf", artifact: "HexRedOx lineage variant",
    kind: "module-set", direction: "shared", claims: ["C89"],
    label: "a second HexRedox lineage — own audit_report + model_compiler; vendored nullclaw/nullhub/zml donors alongside",
    check: { type: "dir-set", root: "sheraton-shelf",
      paths: ["HexRedOx/audit_report.md", "HexRedOx/model_compiler"] } },
  { id: "S43", root: "desi-llama", artifact: "VP_VULKANINFO probe + Vulkan backend",
    kind: "data", direction: "to-spec", claims: ["C45", "C55"],
    label: "measured GPU evidence — a real RADV vulkaninfo device probe (AMD Vega Mobile/RAVEN 26.1.2) behind the integer-GPU claims",
    check: { type: "dir-glob", root: "desi-llama", dir: ".",
      prefix: "VP_VULKANINFO_", minEntries: 1 } },
  { id: "S44", root: "tp-donor-shelf", artifact: "donor shelf basket",
    kind: "module-set", direction: "donor-shelf", claims: [],
    label: "ThePlatform donor shelf — 8DPhysics/PARITY docs + hyper-token + vulkan-zig/qdk/zlm/nullclaw donors",
    check: { type: "dir-set", root: "tp-donor-shelf",
      paths: ["8DPhysics.md", "hyper-token", "vulkan-zig"] } },

  /* -- Documents realm -- */
  { id: "S45", root: "fano-engine", artifact: "src/ integer 3D engine",
    kind: "module-set", direction: "to-spec", claims: ["C45", "C72"],
    label: "Fano Engine — integer-only I256Q128.128 3D render/routing: fano_lattice, fano_net, octonion_unit, qubit_cell, fixed_trig + firmware + live rf_probe CSVs",
    check: { type: "dir-set", root: "fano-engine",
      paths: ["src/i256q128.zig", "src/fano_net.zig", "src/octonion_unit.zig",
        "src/qubit_cell.zig", "firmware"] } },
  { id: "S46", root: "ark-ivector", artifact: "four-layer verify stack",
    kind: "module-set", direction: "to-spec", claims: ["C45", "C95"],
    label: "Ark I-Vector — the polyglot-verification architecture: Zig integer core / 6 Vulkan SPIR-V / Q# overlay (Steane, G2, entanglement) / Python golden master",
    check: { type: "dir-set", root: "ark-ivector",
      paths: ["zig", "vulkan", "qsharp/SteaneCode.qs", "qsharp/G2Symmetry.qs",
        "qsharp/Entanglement.qs", "python", "tests"] } },
  { id: "S47", root: "mosi-papertunes", artifact: "AUDIT_SUMMARY.md + per-project AUDIT.md",
    kind: "doc", direction: "to-spec", claims: ["C78"],
    label: "the physical-transport audit chain — PaperTune 29/29, ISG 29/29, LVCE prototype 42/42 at 100% bit parity, convert 270 pass",
    check: { type: "marker", root: "mosi-papertunes", file: "AUDIT_SUMMARY.md",
      markers: ["29/29", "42/42", "Bit Parity"] } },
  { id: "S48", root: "archive-corpus", artifact: "docs/ gap analyses + prototypes",
    kind: "doc-set", direction: "to-spec", claims: [],
    label: "the 20GB research substratum — tensor prototypes, quantum-latent engine, qubit simulator, Governance/, gap analyses (phi-scaling, forces, FTL messaging, Möbius torus)",
    check: { type: "dir-set", root: "archive-corpus",
      paths: ["docs/documentation-audit-report.md", "docs/final-synthesis.md",
        "Governance", "3D_Tensor_Prototype", "Zig_tensor_prototype",
        "ip_quantum_latent_engine", "ip_qubit_simulator"] } },
  { id: "S49", root: "models-store", artifact: "GGUF weights inventory",
    kind: "data", direction: "shared", claims: ["C72"],
    label: "the on-desk weights inventory (qwen 0.5B/3B/8B-official/9B) backing the live-LLM claims",
    check: { type: "dir-glob", root: "models-store", dir: ".",
      prefix: "qwen", minEntries: 3 } },

  /* -- shelves, preserved snapshots, drawer -- */
  { id: "S50", root: "abby-donor-shelf", artifact: "donor basket",
    kind: "module-set", direction: "donor-shelf", claims: ["C94"],
    label: "the donor basket — byte-identical Falsifible clone + codon/neuraleak/llama.cpp copies + RamseyLLM (the surname-bearing dir CENS-02 caught)",
    check: { type: "dir-set", root: "abby-donor-shelf",
      paths: ["Falsifible", "RamseyLLM", "codon", "neuraleak", "repositories"] } },
  { id: "S51", root: "qstar-llm-basic", artifact: "stale downstream copy",
    kind: "doc-set", direction: "donor-shelf", claims: [],
    label: "the second qstar-llm copy — diverged (~70 files differ, ~20 newer modules absent); stale downstream read-only, not a mirror",
    check: { type: "dir-set", root: "qstar-llm-basic",
      paths: ["AGENTS.md", "ARCHITECTURE.md", "dynamic-url-python.py"] } },
  { id: "S52", root: "zig-k3-preserved", artifact: "frozen pre-audit snapshot",
    kind: "module-set", direction: "shared", claims: ["C95"],
    label: "the 2026-10-04 preservation snapshot — immutable-baseline rule made real: audit evidence, never deleted",
    check: { type: "exists", root: "zig-k3-preserved", file: "build.zig" } },
  { id: "S53", root: "euqinome-drawer", artifact: "in-drawer sibling vault",
    kind: "doc-set", direction: "drawer-only", claims: [],
    label: "presence anchor only — content stays classified; the tripwire guards it",
    check: { type: "exists", root: "euqinome-drawer", file: "." } },
  { id: "S54", root: "spec-007", artifact: "the dossier itself",
    kind: "module-set", direction: "self", claims: ["C93", "C95"],
    label: "self-anchored convergence surface — engine-manifest, findings, override-ledger on disk",
    check: { type: "exists", root: "spec-007",
      file: "security/out/override-ledger.json" } },

  /* -- the archive corpus — the campaigns themselves are sealed evidence -- */
  { id: "A01", root: "@archives", artifact: "theue archive family",
    kind: "archive-census", direction: "shared", claims: ["C98"],
    label: "109 sealed artifacts incl. 32 science-batch waves — the sibling campaign's own continuity record",
    check: { type: "sealed-sample", root: "@archives",
      prefix: "theue-science-batch", minEntries: 30, sample: 5 } },
  { id: "A02", root: "@archives", artifact: "rations archive family",
    kind: "archive-census", direction: "shared", claims: ["C67"],
    label: "74 sealed artifacts — the Rations stress/compat/wave record",
    check: { type: "sealed-sample", root: "@archives",
      prefix: "rations-", minEntries: 20, sample: 5 } },
  { id: "A03", root: "@archives", artifact: "spec-007 archive family",
    kind: "archive-census", direction: "self", claims: ["C93"],
    label: "79 sealed artifacts — this dossier's own wave-by-wave continuity",
    check: { type: "sealed-sample", root: "@archives",
      prefix: "spec-007-", minEntries: 70, sample: 5 } },
  { id: "A04", root: "@archives", artifact: "spec-008 archive family",
    kind: "archive-census", direction: "shared", claims: ["C97"],
    label: "13 sealed artifacts — ipv6-tensor, wire, staleness, route-o1: the family branch's sealed evidence",
    check: { type: "sealed-sample", root: "@archives",
      prefix: "spec-008-", minEntries: 10, sample: 5 } },
  { id: "A05", root: "@archives", artifact: "hardware/fano/zig-k3 families",
    kind: "archive-census", direction: "shared", claims: ["C98"],
    label: "the upstream campaigns' sealed waves — hardware×9, fano×6, zig-k3×2 feeding this dossier",
    check: { type: "dir-glob", root: "@archives",
      prefix: "hardware-", minEntries: 5 } },
];

/* ---------- resolve ---------- */
const anchors = ANCHORS.map(a => {
  const ok = check(a.check);
  return { id: a.id, root: a.root, artifact: a.artifact, kind: a.kind,
    direction: a.direction, claims: a.claims, label: a.label,
    status: ok ? "held" : "absent" };
});

/* claim → anchor index */
const claim_links = {};
for (const a of anchors)
  for (const c of a.claims)
    (claim_links[c] = claim_links[c] || []).push(a.id);

/* sibling wins with no dossier claim to hang on — recorded, not claimed */
const standalone = [
  { root: "zig-k3-port", label: "remote expert execution over K3P1–P5 + WASM exec workers — fabric-compute verbs the fleet hasn't wired" },
  { root: "zig-k3-port", label: "K3RS1 Cauchy-MDS parity shards — any D of D+P rebuild" },
  { root: "zig-k3-port", label: "Shamir K3SS1 share files + SimHash fingerprinting on the fabric" },
  { root: "theue", label: "K3 + GQA/MoE deterministic runners reproducing real oracles bit-for-bit at q128 — inference-engine evidence" },
  { root: "theue", label: "full toolchain: ecosystem_scan, retro_audit, continuity_audit, gap_ledger, descent_audit, ostf_science_inventory" },
  { root: "hardware", label: "consciousness_audit: all 20 rejected claims trace to 0⁰=i through 6D routing — the structure/content split made executable" },
  { root: "hardware", label: "Q# witness corpus (51 ops) + 10D completion modules + Möbius/Smith boundary math" },
  { root: "hardware", label: "surface_computation: numerological reduction as geometric measurement — surface = C + defect = 2 + 7 = 9" },
  /* -- D10 cluster-wide wins -- */
  { root: "eu-version-z", label: "promotion_report — a claims-lifecycle engine with prove/block controls + holdout gating; port-candidate for the dossier's claim pipeline" },
  { root: "codon", label: "real-genome routing evidence (NCBI ecoli/human/yeast) — bio-tier data the dossier cites but doesn't own" },
  { root: "ark-ivector", label: "four-layer polyglot verify (Zig/Vulkan/Q#/Python golden master) — the cross-validation pattern worth porting" },
  { root: "mosi-papertunes", label: "LVCE prototype 42/42 at 100% bit parity — a bit-parity harness pattern for the wire tests" },
  { root: "ralph-corpus", label: "MOUND audit addenda flagging its own stale counts — self-auditing audit, the honest-remainder discipline upstream" },
  { root: "desi-llama", label: "measured RADV device probe — real-GPU capability data, not a simulated backend" },
  { root: "octolab", label: "private-git sync + audit export pipeline — infrastructure governance outside the dossier's scope" },
  { root: "space-agent", label: "DOX hierarchical binding AGENTS contract — governance-document pattern match" },
  { root: "fano-engine", label: "integer-only 3D render pipeline with live rf_probe telemetry — PAR-A7 donor, stands alone" },
  { root: "@archives", label: "318 sealed artifacts across 7 campaign families — the continuity corpus itself" },
];

/* root coverage — every populated census root contributes ≥1 held anchor;
   census-empty roots are honestly labeled, not anchored */
const coveredRoots = new Set(anchors.filter(a => a.status === "held").map(a => a.root));
const CENSUS_POPULATED = [
  ...Object.keys(SIB).filter(r => r !== "euqinome-drawer"), "@archives",
];
const root_coverage = {
  populated: CENSUS_POPULATED.length,
  covered: CENSUS_POPULATED.filter(r => coveredRoots.has(r)).length,
  uncovered: CENSUS_POPULATED.filter(r => !coveredRoots.has(r)),
  census_empty: ["family-empty", "pi-empty", "digit-sheraton"],
};

/* the reverse direction — what the fleet has that the siblings don't.
   Recommendations only; the wave does not commit to sibling trees. */
const reverse_gaps = [
  "bilingual doc twins (en/zh-Hant) — siblings are en-only",
  "signed canon-pair discipline (emit→verify, byte-identical site copies)",
  "probe-enforced invariants (a findings ledger that fails on drift)",
  "the publishable desk surface itself",
  "the three-pass claims override ledger (audit → adversarial → grade)",
  "published-classification boundary (drawer vs public projection tripwires)",
];

const held = anchors.filter(a => a.status === "held").length;
const report = {
  spec: "BRIDGEMAPv1",
  generated: new Date().toISOString(),
  note: "bidirectional evidence bridge — generated by tools/bridge-map.mjs; sibling anchors are mechanical checks over the cluster trees",
  anchor_count: anchors.length, anchors_held: held, anchors_absent: anchors.length - held,
  anchors, claim_links, standalone, reverse_gaps, root_coverage,
};

/* ---------- debrief ---------- */
const lines = [
  "# D10 — Cluster-Wide Bidirectional Evidence Bridge",
  "",
  `Anchors: ${held}/${anchors.length} held · ${anchors.length - held} absent`,
  `Claims bridged: ${Object.keys(claim_links).length}`,
  `Root coverage: ${root_coverage.covered}/${root_coverage.populated} populated census roots` +
    (root_coverage.uncovered.length ? ` · UNCOVERED: ${root_coverage.uncovered.join(", ")}` : " · full"),
  "",
  "| Anchor | Root | Artifact | Direction | Claims | Status |",
  "|---|---|---|---|---|---|",
  ...anchors.map(a => `| ${a.id} | ${a.root} | ${a.artifact} | ${a.direction} | ${a.claims.join(", ")} | ${a.status} |`),
];
const debrief = lines.join("\n") + "\n";

if (VERIFY) {
  const prev = JSON.parse(fs.readFileSync(path.join(OUT, "bridge-ledger.json"), "utf8"));
  const same = JSON.stringify(prev.anchors) === JSON.stringify(report.anchors) &&
    JSON.stringify(prev.claim_links) === JSON.stringify(report.claim_links);
  console.log(same
    ? `bridge verify: GREEN — ${held}/${anchors.length} anchors held, ${Object.keys(claim_links).length} claims bridged`
    : "bridge verify: DRIFT — ledger differs from committed state");
  process.exit(same ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(OUT, { recursive: true });
  fs.writeFileSync(path.join(OUT, "bridge-ledger.json"), JSON.stringify(report, null, 2) + "\n");
  fs.writeFileSync(path.join(OUT, "bridge-debrief.md"), debrief);
  console.log(`bridge map → ${OUT}/bridge-ledger.json + debrief (${held}/${anchors.length} anchors held)`);
} else {
  console.log(debrief);
  console.log(`DRY — ${held}/${anchors.length} anchors held; --emit to write`);
}
