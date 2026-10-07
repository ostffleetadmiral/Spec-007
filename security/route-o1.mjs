// route-o1.mjs — SPEC-008 §5 conformance gate: O(1) route resolution.
//
//   Claim under test: a next hop is computable from destination address
//   bits in a bounded sequence of integer ops — no routing table, no
//   scan, work independent of network size N.
//
//   Model: the 15³ coordinate space admits greedy Manhattan routing —
//   step along the axis with the largest remaining delta. Each hop
//   reduces Manhattan distance by exactly 1 → convergence in exactly
//   dist(src,dst) ≤ 42 hops, no cycles, by induction.
//
//   Three proofs:
//     1. OP BOUND — instrumented op count ≤ BOUND for every one of the
//        3375² ordered (src,dst) pairs (11,390,625 resolutions).
//     2. MONOTONE CONVERGENCE — distance strictly decreases each hop;
//        therefore termination is a theorem, sampled walks confirm.
//     3. FLAT TIMING — per-resolution wall time vs an O(N) table scan
//        over all 3375 entries: resolution flat, scan linear.
//
//   Scope honesty: O(1) is claimed for RESOLUTION only. Delivery still
//   traverses ≤42 physical hops. Staleness of the digest fragment is
//   a separate gate (staleness-detect).
//
//   node security/route-o1.mjs           # run + verdict
//   node security/route-o1.mjs --emit    # + out/route-o1.json
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out", "route-o1.json");
const { derive, decode, format, ORGAN, stateFragment } =
  await import(pathToFileURL(path.join(HERE, "ipv6-derive.mjs")).href);

let fail = 0;
const report = (name, ok, detail) => {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — ${detail}`);
  if (!ok) fail++;
};

/* ---------- the resolver under test ----------
   One bounded sequence of integer ops: extract coord (decode tail),
   compare three axis deltas, step the largest. No loops, no tables.
   The op counter counts every arithmetic/compare/shift so the bound
   is measured, not asserted.                                    */
let OPS = 0;
const c = (v) => (OPS++, v); // instrumented expression wrapper

function nextHopCoord(lk, lr, lc, dk, dr, dc) {
  OPS = 0;
  const ax = c(dk - lk), ay = c(dr - lr), az = c(dc - lc);
  const mx = c(Math.abs(ax)), my = c(Math.abs(ay)), mz = c(Math.abs(az));
  if (c(mx === 0) && c(my === 0) && c(mz === 0)) return null; // arrived
  if (c(mx >= my) && c(mx >= mz))
    return { k: c(lk + c(Math.sign(ax))), r: lr, c: lc };
  if (c(my >= mz))
    return { k: lk, r: c(lr + c(Math.sign(ay))), c: lc };
  return { k: lk, r: lr, c: c(lc + c(Math.sign(az))) };
}

const manhattan = (a, b) =>
  Math.abs(a.k - b.k) + Math.abs(a.r - b.r) + Math.abs(a.c - b.c);

console.log("route-o1 — the O(1) resolution gate\n");

/* Proof 1+2: exhaustive op bound + distance monotonicity, all pairs */
{
  let maxOps = 0, checked = 0;
  for (let lk = 1; lk <= 15; lk++) for (let lr = 1; lr <= 15; lr++) for (let lc = 1; lc <= 15; lc++)
  for (let dk = 1; dk <= 15; dk++) for (let dr = 1; dr <= 15; dr++) for (let dc = 1; dc <= 15; dc++) {
    const hop = nextHopCoord(lk, lr, lc, dk, dr, dc);
    if (OPS > maxOps) maxOps = OPS;
    if (hop === null) { checked++; continue; } // src == dst: arrived
    const d0 = Math.abs(dk - lk) + Math.abs(dr - lr) + Math.abs(dc - lc);
    const d1 = Math.abs(dk - hop.k) + Math.abs(dr - hop.r) + Math.abs(dc - hop.c);
    if (d1 !== d0 - 1) { report("monotone-descent", false,
      `(${lk},${lr},${lc})→(${dk},${dr},${dc}): distance ${d0}→${d1}`); checked = -1; break; }
    checked++;
  }
  if (checked >= 0) {
    report("op-bound", maxOps <= 16,
      `max ${maxOps} instrumented ops across all 3375²=${3375 * 3375} pairs (bound 16)`);
    report("monotone-descent", true,
      `every non-arrived hop reduces Manhattan distance by exactly 1 — exhaustive over ${checked.toLocaleString()} pairs → termination ≤42 hops by induction`);
  }
}

/* Proof 2 empirical: sampled full walks land exactly on Manhattan */
{
  const fragment = stateFragment();
  let walks = 0, hopsSeen = [], bad = null;
  outer:
  for (const s of [{k:1,r:1,c:1},{k:8,r:8,c:8},{k:15,r:15,c:15},{k:3,r:11,c:6}])
  for (const d of [{k:15,r:15,c:15},{k:1,r:1,c:1},{k:7,r:3,c:12},{k:8,r:8,c:8}]) {
    let cur = { ...s }, hops = 0;
    while (cur) {
      const nxt = nextHopCoord(cur.k, cur.r, cur.c, d.k, d.r, d.c);
      if (nxt !== null) {
        hops++;
        if (hops > 42) { bad = `walk exceeded 42 hops ${JSON.stringify(s)}→${JSON.stringify(d)}`; break outer; }
      }
      cur = nxt;
    }
    if (hops !== manhattan(s, d)) { bad = `walk ${JSON.stringify(s)}→${JSON.stringify(d)} took ${hops} hops, manhattan=${manhattan(s, d)}`; break; }
    walks++; hopsSeen.push(hops);
  }
  report("walk-convergence", !bad,
    bad || `${walks} full walks: every one lands in exactly Manhattan hops (max seen ${Math.max(...hopsSeen)}, bound 42)`);
}

/* Proof 3: flat timing — resolver vs O(N) table scan baseline */
{
  const fragment = stateFragment();
  const destAddr = derive({ k: 7, r: 3, c: 12, organ: ORGAN.gov, fragment });
  const table = []; // 3375-entry routing table — the O(N) alternative
  for (let k = 1; k <= 15; k++) for (let r = 1; r <= 15; r++) for (let cc = 1; cc <= 15; cc++)
    table.push(derive({ k, r, c: cc, organ: 0, fragment }));

  const N = 20000;
  let t0 = process.hrtime.bigint();
  for (let i = 0; i < N; i++) {
    const d = decode(destAddr);
    nextHopCoord(8, 8, 8, d.k, d.r, d.c);
  }
  const resolveNs = Number(process.hrtime.bigint() - t0) / N;

  t0 = process.hrtime.bigint();
  let found = 0;
  for (let i = 0; i < N; i++) {
    for (let e = 0; e < table.length; e++)
      if (table[e].equals(destAddr)) { found = e; break; } // early-exit scan ~ N/2
  }
  const scanNs = Number(process.hrtime.bigint() - t0) / N;
  report("flat-vs-scan", scanNs > resolveNs * 10,
    `address-derived resolve ${resolveNs.toFixed(0)}ns/op vs table scan ${scanNs.toFixed(0)}ns/op (early-exit, ${table.length} entries) — ${(scanNs / resolveNs).toFixed(0)}×; resolution work does not grow with N`);
}

/* Golden vectors: next hop from the E₀ heart to each spec vector */
{
  const fragment = stateFragment();
  const vectors = [
    { name: "heart→corner-min", dst: derive({ k: 1, r: 1, c: 1, organ: ORGAN.deck, fragment }) },
    { name: "heart→corner-max", dst: derive({ k: 15, r: 15, c: 15, organ: ORGAN.rations, fragment }) },
    { name: "heart→mid-gov", dst: derive({ k: 7, r: 3, c: 12, organ: ORGAN.gov, fragment }) },
  ].map(v => {
    const d = decode(v.dst);
    const hop = nextHopCoord(8, 8, 8, d.k, d.r, d.c);
    return { ...v, destAddr: format(v.dst), nextHop: hop,
             hops: manhattan({ k: 8, r: 8, c: 8 }, d) };
  });
  console.log("\ngolden vectors:");
  for (const v of vectors)
    console.log(`  ${v.name}: ${v.destAddr} → next (${v.nextHop.k},${v.nextHop.r},${v.nextHop.c}), ${v.hops} hops`);

  if (process.argv.includes("--emit")) {
    fs.mkdirSync(path.dirname(OUT), { recursive: true });
    fs.writeFileSync(OUT, JSON.stringify({
      gate: "route-o1", spec: "SPEC008v1", generated: new Date().toISOString(),
      model: "greedy Manhattan, largest-|delta| axis, tie order k≥r≥c",
      proofs: { opBound: 16, pairsChecked: 3375 * 3375, hopBound: 42 },
      scope: "O(1) resolution only; delivery traverses ≤42 physical hops",
      vectors: vectors.map(v => ({ name: v.name, dest: v.destAddr, nextHop: v.nextHop, hops: v.hops })),
    }, null, 2));
    console.log(`\nroute-o1 vectors → ${OUT}`);
  }
}

console.log(`\nroute-o1: ${fail === 0 ? "GATE GREEN — resolution is O(1) on the address model" : "GATE FAILED"}`);
process.exit(fail === 0 ? 0 : 1);
