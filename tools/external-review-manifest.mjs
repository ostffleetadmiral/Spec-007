#!/usr/bin/env node
/* external-review-manifest.mjs — bounded packages for gates the code
   cannot close. Every lane carries the public evidence bundle an outside
   authority would review, the exact acceptance evidence required, and a
   pending status. --emit writes the deterministic manifest; --verify
   reproduces it byte-for-byte and checks the pending boundary. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const OUT = path.join(ROOT, "site", "assets", "external-review.json");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const LANES = [
  {
    id: "cryptographic-review",
    authority: "independent cryptographic reviewer",
    acceptance: "signed report covering Ed25519/X25519/AES-GCM use, v3 envelopes, relay authentication, downgrade gates, and memory wiping",
    evidence: [
      "site/apps/rations/rations.wasm",
      "site/apps/rations/rations.wasm.sha256",
      "site/apps/rations/js/transport.js",
      "site/assets/fano-auth.js",
      "security/harness.mjs",
      "security/hydra-node.mjs",
      "tools/wasm-memory-hygiene.mjs",
    ],
  },
  {
    id: "security-review",
    authority: "independent application-security reviewer",
    acceptance: "signed penetration-review report covering desk trust, relay isolation, downgrade resistance, containment, and residual session exposure",
    evidence: [
      "security/README.md",
      "security/team-sweep-2.mjs",
      "security/xploit-sweep.mjs",
      "security/officer-mesh.mjs",
      "tools/relay-isolation-audit.mjs",
      "tools/native-dialog-audit.mjs",
    ],
  },
  {
    id: "scientific-review",
    authority: "independent scientific reviewer",
    acceptance: "signed assessment separating verified arithmetic, simulation output, interpretation, and unverified physical claims",
    evidence: [
      "spec-007.md",
      "docs/en/spec-007-research-dossier.md",
      "docs/zh-Hant/spec-007-research-dossier.zh-Hant.md",
      "docs/en/spec-007-science-coverage.en.md",
      "docs/zh-Hant/spec-007-science-coverage.zh-Hant.md",
    ],
  },
  {
    id: "legal-review",
    authority: "qualified counsel",
    acceptance: "written legal opinion covering license posture, publication boundaries, export/regulatory exposure, and operational disclaimers",
    evidence: [
      "LICENSE",
      "SECURITY.md",
      "docs/en/spec-007-public.en.md",
      "docs/zh-Hant/spec-007-public.zh-Hant.md",
      "docs/en/spec-007-protocol.en.md",
      "docs/zh-Hant/spec-007-protocol.zh-Hant.md",
    ],
  },
  {
    id: "human-signature",
    authority: "authorized human signatory",
    acceptance: "detached signature or witnessed approval bound to the reviewed artifact digest",
    evidence: [
      "fleet-genesis.json",
      "site/fleet-genesis.json",
      "fleet-manifest.json",
      "site/fleet-manifest.json",
    ],
  },
  {
    id: "admiralty-ratification",
    authority: "fleet governance authority",
    acceptance: "ratification record citing the governed manifest, scope, effective date, and dissent/reservation evidence",
    evidence: [
      "fleet-manifest.json",
      "site/fleet-manifest.json",
      "docs/en/spec-007-governance-gap-analysis.en.md",
      "docs/zh-Hant/spec-007-governance-gap-analysis.zh-Hant.md",
    ],
  },
  {
    id: "clean-room-rebuild",
    authority: "independent clean-room team",
    acceptance: "from-source rebuild log proving byte-reproducible artifacts or documenting every accepted divergence",
    evidence: [
      "build.zig",
      "tools/publish-check.sh",
      "site/apps/rations/rations.wasm.sha256",
      "docs/en/spec-007-component-map.en.md",
      "docs/zh-Hant/spec-007-component-map.zh-Hant.md",
    ],
  },
  {
    id: "physical-bench-validation",
    authority: "hardware bench operator",
    acceptance: "signed bench report on real hardware, radio paths, power/thermal limits, and physical backup media",
    evidence: [
      "security/rf-field-probe.mjs",
      "security/philotic-cluster.mjs",
      "security/pack-density.mjs",
      "docs/en/spec-008-ipv6-tensor.en.md",
      "docs/zh-Hant/spec-008-ipv6-tensor.zh-Hant.md",
    ],
  },
  {
    id: "customer-pilot",
    authority: "pilot operator and named acceptance owner",
    acceptance: "pilot report with enrollment, failure modes, support burden, data handling, and go/no-go criteria",
    evidence: [
      "site/index.html",
      "site/assets/fano-auth.js",
      "docs/en/spec-007-economic-assessment.en.md",
      "docs/zh-Hant/spec-007-economic-assessment.zh-Hant.md",
    ],
  },
  {
    id: "production-deployment",
    authority: "release authority with live-environment access",
    acceptance: "post-deploy live HTTP, rollback, monitoring, incident, and provenance evidence for the exact published digest",
    evidence: [
      "tools/deploy-pages.sh",
      "tools/publish-check.sh",
      "site/apps/rations/js/dom-dialog.js",
      "site/apps/rations/js/transport.js",
      "site/apps/rations/rations.wasm.sha256",
    ],
  },
];

function fileEntry(rel) {
  const full = path.join(ROOT, rel);
  if (!fs.existsSync(full)) throw new Error(`missing evidence file: ${rel}`);
  const bytes = fs.readFileSync(full);
  return { path: rel, bytes: bytes.length, sha256: crypto.createHash("sha256").update(bytes).digest("hex") };
}

function manifest() {
  return {
    schema: "external-review-v1",
    purpose: "bounded evidence packages for authorities outside executable verification",
    status_rule: "a lane is closed only by the acceptance evidence named in that lane; package generation never promotes the lane",
    lanes: LANES.map((lane) => ({
      id: lane.id,
      status: "pending_external_evidence",
      authority: lane.authority,
      acceptance: lane.acceptance,
      evidence: lane.evidence.map(fileEntry),
    })),
  };
}

const report = manifest();
const pretty = JSON.stringify(report, null, 2) + "\n";
const pending = report.lanes.every((l) => l.status === "pending_external_evidence");

if (VERIFY) {
  const same = fs.existsSync(OUT) && fs.readFileSync(OUT, "utf8") === pretty;
  console.log(same && pending
    ? `external-review: ${report.lanes.length} lanes packaged · all pending_external_evidence`
    : "external-review: drift or promoted lane");
  if (!same || !pending) process.exit(1);
} else if (EMIT) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, pretty);
  console.log(`external-review: emitted ${report.lanes.length} pending lanes → ${path.relative(ROOT, OUT)}`);
} else {
  console.log(`external-review: ${report.lanes.length} lanes packaged · all pending_external_evidence`);
}
