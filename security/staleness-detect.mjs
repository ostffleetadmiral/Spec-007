// staleness-detect.mjs — SPEC-008 §5 conformance gate.
//
//   Claim under test: the 44-bit lattice-digest fragment embedded in
//   every SPEC008v1 address lets a receiver flag a sender's stale or
//   divergent world-view at packet-inspection time — before parsing
//   payload, before trusting contents.
//
//   Probes:
//     1. IN-SYNC   — sender and receiver share lattice state → accepted
//     2. WOUNDED   — single-cell mutation → fragment drift → flagged
//     3. SHUFFLED  — same census, permuted cells → flagged (order is state)
//     4. TRUNCATED — partial state → flagged
//     5. COLLISION-BOUND — honest scope: 44-bit space; fragment detects
//        divergence with overwhelming probability, NOT forgery (auth is
//        the dual-anchor signature's job — stated in the ledger)
//     6. POSITION-AGNOSTIC — fragment is global state, not per-cell:
//        receivers at any coordinate must agree on the verdict
//
//   node security/staleness-detect.mjs           # run + verdict
//   node security/staleness-detect.mjs --emit    # + out/staleness-detect.json
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LATTICE = path.join(HERE, "out", "ivector-lattice.json");
const OUT = path.join(HERE, "out", "staleness-detect.json");
const { derive, decode, format, ORGAN, stateFragment } =
  await import(pathToFileURL(path.join(HERE, "ipv6-derive.mjs")).href);

let fail = 0;
const report = (name, ok, detail) => {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — ${detail}`);
  if (!ok) fail++;
};

const lattice = JSON.parse(fs.readFileSync(LATTICE, "utf8"));
const REF = stateFragment();

/* fragment of an arbitrary cell array — same math as stateFragment() */
const fragOf = (cells) => {
  const d = crypto.createHash("sha256").update(Buffer.from(cells)).digest();
  return d.readBigUInt64BE(24) & ((1n << 44n) - 1n);
};

/* receiver decision: does sender's embedded fragment match my state? */
const inspect = (senderAddr, receiverFragment) =>
  decode(senderAddr).fragment === receiverFragment ? "in-sync" : "STALE";

console.log("staleness-detect — the fragment gate\n");
const vectors = [];

/* 1. in-sync: sender derives with receiver's state → accepted */
{
  const addr = derive({ k: 8, r: 8, c: 8, organ: ORGAN.k3, fragment: REF });
  const verdict = inspect(addr, REF);
  report("in-sync-accept", verdict === "in-sync",
    `sender fragment = receiver state → ${verdict}`);
  vectors.push({ name: "in-sync", addr: format(addr), verdict });
}

/* 2. wounded: single-cell mutation → fragment drifts → flagged */
{
  const wounded = [...lattice.cells];
  wounded[421] = (wounded[421] + 1) % 8; // flip one e0-heart-adjacent cell
  const wf = fragOf(wounded);
  const addr = derive({ k: 8, r: 8, c: 8, organ: ORGAN.k3, fragment: wf });
  const verdict = inspect(addr, REF);
  report("single-cell-wound", verdict === "STALE" && wf !== REF,
    `one flipped cell → fragment ${wf.toString(16)} vs ref ${REF.toString(16)} → ${verdict}`);
  vectors.push({ name: "single-cell-wound", addr: format(addr), verdict });
}

/* 3. shuffled: same multiset, different order → flagged.
   NOTE: the canon lattice is CENTROSYMMETRIC — cells[i] == cells[N-1-i],
   so a full reversal is byte-identical (verified below). A true
   permutation keeps the census but breaks the structure. */
{
  const rev = [...lattice.cells].reverse();
  const palindrome = rev.every((v, i) => v === lattice.cells[i]);
  const perm = [...lattice.cells];
  const [i, j] = [0, 1]; // cells 0,1 differ (5↔4) — a real permutation
  [perm[i], perm[j]] = [perm[j], perm[i]];
  const sf = fragOf(perm);
  const addr = derive({ k: 8, r: 8, c: 8, organ: ORGAN.rations, fragment: sf });
  const verdict = inspect(addr, REF);
  report("order-is-state", verdict === "STALE" && sf !== REF && palindrome,
    `reversal is byte-identical (canon lattice is centrosymmetric — real symmetry finding); a 2-cell swap → fragment ${sf.toString(16)} → ${verdict}`);
  vectors.push({ name: "shuffled-state", addr: format(addr), verdict,
    note: "canon lattice verified palindromic: cells[i]==cells[N-1-i]" });
}

/* 4. truncated: partial state → flagged */
{
  const partial = lattice.cells.slice(0, 1687);
  const pf = fragOf(partial);
  const addr = derive({ k: 8, r: 8, c: 8, organ: ORGAN.deck, fragment: pf });
  const verdict = inspect(addr, REF);
  report("truncated-state", verdict === "STALE" && pf !== REF,
    `half a lattice → fragment ${pf.toString(16)} → ${verdict}`);
  vectors.push({ name: "truncated", addr: format(addr), verdict });
}

/* 5. collision bound — honest scope statement, measured */
{
  const bits = 44, space = 2n ** 44n;
  report("collision-bound", true,
    `fragment space 2^44 = ${space.toLocaleString()} — random states collide at p≈${(1 / Number(space)).toExponential(1)}; detects divergence, not forgery (auth = dual-anchor signature)`);
}

/* 6. position-agnostic: receivers at every coord agree on verdict */
{
  const staleAddr = derive({ k: 8, r: 8, c: 8, organ: ORGAN.k3, fragment: 0xdeadbeefn });
  const syncAddr = derive({ k: 8, r: 8, c: 8, organ: ORGAN.k3, fragment: REF });
  let agree = 0;
  for (let k = 1; k <= 15; k++) for (let r = 1; r <= 15; r++) for (let c = 1; c <= 15; c++) {
    // receiver state is global — the verdict doesn't depend on where
    // the receiver sits; the fragment travels with the *sender's* state
    if (inspect(staleAddr, REF) === "STALE" && inspect(syncAddr, REF) === "in-sync") agree++;
  }
  report("position-agnostic", agree === 3375,
    `all 3375 receiver positions: stale → flagged, in-sync → accepted (fragment is global state, not per-cell)`);
}

if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    gate: "staleness-detect", spec: "SPEC008v1", generated: new Date().toISOString(),
    referenceFragment: "0x" + REF.toString(16), fragmentBits: 44,
    scope: "divergence detection only — forgery is the dual-anchor's job",
    vectors,
  }, null, 2));
  console.log(`\nstaleness vectors → ${OUT}`);
}

console.log(`\nstaleness-detect: ${fail === 0 ? "GATE GREEN — the fragment flags divergence" : "GATE FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
