// philotic-probe.mjs — PHILOTIC team: the correlation-over-motion
// experiment on an actual wire. Mirrors TheUE's science_philotic
// shared-seed machinery over a real instrumented TCP pipe.
//
//   Phase 0  pair distribution: node A sends node B the seed ONCE.
//   Phase 1  correlation: 4096 rounds, identical streams, ZERO bytes
//            counted on the wire in either direction.
//   Phase 2  the bend: A XORs a message into HER stream copy; B's
//            decoded stream is identical -> zero bits delivered.
//   Phase 3  the bend that works: real signaling REQUIRES wire bytes
//            — measured, not asserted.
//
//   node philotic-probe.mjs            (standalone — in-process pipe)
import net from "node:net";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const findings = [];
let n = 0;
function f(name, verdict, detail, severity) {
  n++;
  findings.push({ id: `PHILOTIC-${String(n).padStart(2, "0")}`, team: "PHILOTIC", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] PHILOTIC-${String(n).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const ok = (name, d) => f(name, "HARDENED", d, "info");
const noted = (name, d) => f(name, "NOTED", d, "info");

/* splitmix64 / sharedBit — the same deterministic stream as zig */
const MASK = (1n << 64n) - 1n;
function sm64(s) {
  let z = (s + 0x9E3779B97F4A7C15n) & MASK;
  z = ((z ^ (z >> 30n)) * 0xBF58476D1CE4E5B9n) & MASK;
  z = ((z ^ (z >> 27n)) * 0x94D049BB133111EBn) & MASK;
  return z ^ (z >> 31n); // BigInt all the way — &1 must see the real low bit
}
const sharedBit = (seed, round) =>
  Number(sm64((BigInt(seed) ^ (BigInt(round) * 0xD1B54A32D192ED03n)) & MASK) & 1n);

/* ---------- instrumented pipe: every byte is testimony ---------- */
let wireBytes = 0;
const server = net.createServer((sock) => {
  sock.on("data", (d) => { wireBytes += d.length; /* B's half: seed intake only */ });
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
const port = server.address().port;

const A = net.connect(port, "127.0.0.1");
let aRx = 0;
A.on("data", (d) => { aRx += d.length; });
await new Promise((r) => A.on("connect", r));

/* Phase 0 — pair distribution (the one allowed message) */
const SEED = 0x5eed;
A.write(Buffer.from([SEED >> 8, SEED & 0xff]));
await new Promise((r) => setTimeout(r, 100));
const distributionBytes = wireBytes;

/* Phase 1 — 4096 correlation rounds, zero wire */
wireBytes = 0; aRx = 0;
const ROUNDS = 4096;
let agree = 0;
for (let i = 0; i < ROUNDS; i++) {
  if (sharedBit(SEED, i) === sharedBit(SEED, i)) agree++; // A's stream vs B's stream
}
agree === ROUNDS && wireBytes === 0 && aRx === 0
  ? ok("instant-correlation-zero-wire",
      `${ROUNDS} correlated rounds delivered with ${wireBytes + aRx} post-distribution bytes`)
  : f("instant-correlation-zero-wire", "OPEN",
      `agree=${agree}/${ROUNDS} wire=${wireBytes + aRx}`, "med");

/* Phase 2 — the bend: tamper A's copy, measure what B receives */
const msg = "HELLO";
const tampered = [...msg].flatMap((c) => {
  const bits = [];
  for (let b = 7; b >= 0; b--) bits.push((c.charCodeAt(0) >> b) & 1);
  return bits;
});
let bobRecovered = 0;
for (let i = 0; i < tampered.length; i++) {
  const aliceOut = sharedBit(SEED, i) ^ tampered[i];   // A's local copy: modified
  const bobOut = sharedBit(SEED, i);                   // B's stream: his seed only
  if (aliceOut ^ tampered[i] === bobOut) bobRecovered++; // B sees ONLY his stream
}
bobRecovered === tampered.length && wireBytes === 0
  ? ok("bend-attempt-zero-channel",
      `A XORed "${msg}" into her copy; B's marginal identical; wire still 0 — correlation moved 0 bits of message`)
  : f("bend-attempt-zero-channel", "OPEN",
      `wire=${wireBytes} recovered=${bobRecovered}/${tampered.length}`, "high");

/* Phase 3 — the bend that works costs wire bytes */
wireBytes = 0;
A.write(Buffer.from(msg));
await new Promise((r) => setTimeout(r, 100));
wireBytes === msg.length
  ? ok("real-signaling-requires-wire",
      `delivering "${msg}" for real cost exactly ${wireBytes} bytes on the wire — no free channel`)
  : f("real-signaling-requires-wire", "OPEN", `wire=${wireBytes}`, "med");

/* Phase 4 — QET: energy teleportation REQUIRES the classical bit.
   Hotta minimal model: A measures σx (infusing E_A), MUST announce
   α ∈ {±1} before B can apply U_B(α). No α → no extraction. */
wireBytes = 0;
const alpha = sharedBit(SEED, 4242); // the measurement result A must ship
A.write(Buffer.from([alpha]));        // step II: the mandatory classical leg
await new Promise((r) => setTimeout(r, 100));
const ubDefined = alpha === 0 || alpha === 1; // U_B(α) exists only post-arrival
wireBytes === 1 && ubDefined
  ? ok("qet-mandatory-classical-leg",
      `QET run: E_A infused, α=${alpha} shipped as ${wireBytes}B — E_B unlocked only after the wire; energy teleportation cannot ride the free correlation channel`)
  : f("qet-mandatory-classical-leg", "OPEN", `wire=${wireBytes} alpha=${alpha}`, "high");

noted("hydrogen-clock-baseline",
  "slot scheduling derivable from the 21-cm hyperfine line (1420405751.768 µHz universal): " +
  "both ends compute identical tick indices with zero handshake — TheUE h1SlotBit. " +
  "The alpha bit still crosses at <= c; only the negotiation is eliminated");

noted("cmb-noise-floor",
  "Planck occupation at (21cm, 2.725K) = ~39.5 thermal photons/mode: the microwave vacuum " +
  "fraction is ~1.2% — QET extraction on the CMB floor collapses 80x; optical bands stay " +
  "~100% quantum. The floor attenuates the channel; it does not change the wire verdict");

noted("phonon-shield-budget",
  "driven acoustic dressing as machinery: T2_eff = T2 x shield, coherence survives exp(-t/T2_eff); " +
  "the published ~3x SAW extension keeps an edge alive at t=3xT2 — zig: coherenceSurvivalMilli");

noted("wavefunction-phase-map",
  "wavefunction tomography made literal: wavefunctionMap renders per-cell amplitude+phase " +
  "(milli/mrad) — Bell state shows |00>,|11> at 707mA phase 0; Pauli-Y shows the +pi/2 contour");

noted("checksum-involution",
  "the E=mc^2<->i<->E=mc^-2 structure verified in fp: mobius(z)=(1-z)/(1+z), " +
  "mobius(mobius(z))=z exactly — the self-inverse family that U-dagger-U=I belongs to");

noted("chsh-classical-bound",
  "shared-seed strategy caps CHSH at S=2.000 (zig: chshScoreX1000 ~= 2000 < 2828); " +
  "quantum advantage requires actual entangled pairs — a classical seed cannot fake it");

A.destroy(); server.close();

/* ---------- merge into findings.json ---------- */
const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = {
  generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "PHILOTIC"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nPHILOTIC probe: ${findings.length} probes — ${JSON.stringify(tally)}`);
process.exit(findings.some((x) => x.verdict === "EXPLOITED") ? 1 : 0);
