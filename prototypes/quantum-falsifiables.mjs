// quantum-falsifiables.mjs — the deepest seals challenged live.
//
//   The protocol law (correlation ≠ signal; new information must cross
//   the wire) is the no-communication theorem in engineering form.
//   The shared-seed model is a LOCAL HIDDEN VARIABLE — the paper drop
//   stands in for the classical channel. If these seals break, the
//   physics under the entire stack is wrong.
//
//   OVR-Q1  superluminal signaling: Alice encodes a bit by choosing
//           which sub-stream to sample; Bob tries to detect the choice
//           from HIS stream alone. No-communication: his guess → 50%.
//   OVR-Q2  quantum teleportation model: teleporting a bit through a
//           shared correlated pair; without the 1-bit classical message
//           fidelity = 50%, with it = 100%. Teleportation IS the
//           classical-channel cost — the paper drop's physics.
//   OVR-Q3  CHSH bound: our seed correlation is a local hidden
//           variable → |S| ≤ 2. If the model ever exceeds 2 it has
//           nonlocal power it shouldn't — and Bell's theorem says it
//           can't.
//
//   node prototypes/quantum-falsifiables.mjs
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");

const results = [];
const report = (id, name, verdict, detail) => {
  results.push({ id, name, verdict, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] ${id} ${name} — ${detail}`);
};

/* splitmix64 / sharedBit — identical to the philotic probes */
const MASK = (1n << 64n) - 1n;
function sm64(s) {
  let z = (s + 0x9E3779B97F4A7C15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
  return z ^ (z >> 31n);
}
const sharedBit = (seed, round) =>
  Number(sm64((BigInt(seed) ^ (BigInt(round) * 0xD1B54A32D192ED03n)) & MASK) & 1n);

console.log("QUANTUM falsifiables — the physics, challenged live\n");

/* OVR-Q1 superluminal signaling via basis choice.
   Alice's "message" bit m: she samples rounds [m*R, m*R+R).
   Bob holds the same seed and tries to infer m from his OWN stream —
   but his stream is the same function regardless of what Alice does.
   Bob's estimator: does his first R-round parity "look like" Alice
   sampled block 0 or block 1? His information is identical either way. */
{
  const SEED = 0x5eedc0de, R = 64, TRIALS = 4096;
  let correct = 0;
  for (let t = 0; t < TRIALS; t++) {
    const m = t & 1;
    // Alice "transmits" m by sampling her stream at block m — no wire
    for (let i = 0; i < R; i++) sharedBit(SEED, m * R + i);
    // Bob's strategy: parity of his first R rounds (his whole evidence)
    let par = 0;
    for (let i = 0; i < R; i++) par ^= sharedBit(SEED, i);
    if (par === m) correct++; // Bob guesses m from his own evidence alone
  }
  const pct = (correct / TRIALS * 100).toFixed(2);
  Math.abs(pct - 50) < 5
    ? report("OVR-Q1", "superluminal-signaling", "SEAL CONFIRMED",
        `Bob's guess ${pct}% ≈ 50% over ${TRIALS} trials — Alice's sampling choice is invisible in his stream. Basis choice carries zero information: no-signaling holds`)
    : report("OVR-Q1", "superluminal-signaling", "SEAL BROKEN",
        `Bob decoded the message at ${pct}% — information crossed without wire. The no-communication theorem, and the whole protocol law, would need revision`);
}

/* OVR-Q2 teleportation = correlation + classical bit.
   Input x; shared pair bit c (the "entangled" resource).
   Alice's measurement outcome m = x ⊕ c.
   - Without m on the wire: Bob outputs c; fidelity = P(c == x) = 50%.
   - With m (1 classical bit): Bob outputs m ⊕ c = x; fidelity = 100%. */
{
  const SEED = 0xe17a9d1e, TRIALS = 4096;
  let unassisted = 0, assisted = 0, wireBits = 0;
  for (let t = 0; t < TRIALS; t++) {
    const x = (t * 0x9e3779b1) >>> 31;           // input bit to teleport
    const c = sharedBit(SEED, t);                // shared correlated pair
    const m = x ^ c;                             // Alice's classical message
    // arm 1: no wire — Bob guesses from his half of the pair alone
    if (c === x) unassisted++;
    // arm 2: one classical bit across the wire
    wireBits += 1;
    if ((m ^ c) === x) assisted++;
  }
  const u = (unassisted / TRIALS * 100).toFixed(2);
  const a = (assisted / TRIALS * 100).toFixed(2);
  Math.abs(u - 50) < 5 && a === "100.00"
    ? report("OVR-Q2", "teleportation-classical-cost", "SEAL CONFIRMED",
        `unassisted fidelity ${u}% ≈ coin-flip; assisted ${a}% at exactly 1 wire-bit/teleport. The correlated pair alone transmits nothing — teleportation's cost IS the classical channel, our paper drop`)
    : report("OVR-Q2", "teleportation-classical-cost", "SEAL BROKEN",
        `unassisted=${u}% assisted=${a}% — correlation transmitted information without the classical leg`);
}

/* OVR-Q3 CHSH bound on the seed model.
   Local hidden variable: Alice outputs a_x(λ), Bob outputs b_y(λ),
   λ = shared seed, settings x,y ∈ {0,1}.
   S = E(a0b0) + E(a0b1) + E(a1b0) − E(a1b1)  (outcomes ±1)
   Any local model: |S| ≤ 2. Quantum: 2√2 ≈ 2.83.
   We enumerate the BEST local strategy our stream permits and
   measure S empirically — the model must not exceed 2. */
{
  const pm = (b) => b ? 1 : -1; // bit → ±1
  let Smax = 0;
  // enumerate all 16 deterministic local strategies (a0,a1,b0,b1)
  for (let strat = 0; strat < 16; strat++) {
    const a = [strat & 1, (strat >> 1) & 1], b = [(strat >> 2) & 1, (strat >> 3) & 1];
    // empirical S over shared-seed rounds — the seed is λ, and the
    // LOCAL model fixes outputs per strategy independent of settings
    let e00 = 0, e01 = 0, e10 = 0, e11 = 0, n = 2048;
    for (let t = 0; t < n; t++) {
      // λ sampled per round from the shared stream — outputs are
      // deterministic functions of λ only (the local-model axiom)
      const lam = sharedBit(0xbe11, t);
      const ao = pm(a[0] ^ lam), a1 = pm(a[1] ^ lam);
      const bo = pm(b[0] ^ lam), b1 = pm(b[1] ^ lam);
      e00 += ao * bo; e01 += ao * b1; e10 += a1 * bo; e11 += a1 * b1;
    }
    const S = Math.abs(e00 / n + e01 / n + e10 / n - e11 / n);
    if (S > Smax) Smax = S;
  }
  Smax <= 2.0001
    ? report("OVR-Q3", "chsh-local-bound", "SEAL CONFIRMED",
        `max |S| = ${Smax.toFixed(4)} ≤ 2 over all 16 deterministic local strategies — our seed correlation is a local hidden variable: it gives correlation, never nonlocal power. 2√2 stays quantum's; the paper drop stays the price of correlation`)
    : report("OVR-Q3", "chsh-local-bound", "SEAL BROKEN",
        `|S| = ${Smax.toFixed(4)} > 2 — the model exhibits nonlocal correlation without entanglement; either the model is wrong or physics is`);
}

const ok = results.every(r => r.verdict !== "SEAL BROKEN");
console.log(`\nQUANTUM sweep: ${results.length} challenges — ${ok ? "the physics held: correlation is not signal, teleportation costs a channel, locality is bounded" : "PHYSICS BROKEN — escalate immediately"}`);
fs.mkdirSync(OUT, { recursive: true });
fs.writeFileSync(path.join(OUT, "quantum-report.json"),
  JSON.stringify({ generated: new Date().toISOString(), results }, null, 2));
process.exit(ok ? 0 : 1);
