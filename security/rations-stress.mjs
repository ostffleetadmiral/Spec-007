// rations-stress.mjs — RATIONS team: the paper leg under dissociation.
//
// Where K3BRAIN hammered the organ, RATIONS hammers the air gap: the
// dual-anchor contract. The token signature attests identity+endpoint;
// the fabric seedHash/tokenHash attests the SEED BINDING. Every class
// of desynchronization between those two anchors must halt correlation.
//
// Runs seed-drop.mjs --audit against tampered copies via SEED_LEDGER /
// SEED_PAYLOADS env overrides — the live ledger and payloads are
// never touched.
//
//   node rations-stress.mjs
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const OUT = path.join(HERE, "out");
const WORK = path.join(OUT, "ratstress");
const SEED_DROP = path.join(HERE, "seed-drop.mjs");
const LIVE_LEDGER = path.join(OUT, "seed-drops.json");
const LIVE_PAYLOADS = path.join(OUT, "seed-payloads");
const MAGIC = Buffer.from("PHSEED01");

const findings = [];
let n = 0;
function f(name, verdict, detail, severity) {
  n++;
  findings.push({ id: `RAT-${String(n).padStart(2, "0")}`, team: "RATIONS", name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] RAT-${String(n).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
}
const held = (name, d) => f(name, "HELD", d, "info");
const noted = (name, d) => f(name, "NOTED", d, "info");
const open_ = (name, d) => f(name, "OPEN", d, "high");
const ub64 = (s) => Buffer.from(s, "base64url");
const b64u = (b) => Buffer.from(b).toString("base64url");
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

/* stage a tampered copy of the live ledger+payloads; mutate via fn */
function stage(mutate) {
  const dir = fs.mkdtempSync(path.join(WORK, "stage-"));
  const led = JSON.parse(fs.readFileSync(LIVE_LEDGER, "utf8"));
  fs.mkdirSync(path.join(dir, "payloads"));
  for (const d of led.drops) {
    const src = path.join(LIVE_PAYLOADS, d.dropId + ".txt");
    if (fs.existsSync(src)) fs.copyFileSync(src, path.join(dir, "payloads", d.dropId + ".txt"));
  }
  mutate(led, path.join(dir, "payloads"));
  fs.writeFileSync(path.join(dir, "ledger.json"), JSON.stringify(led, null, 2));
  return { ledger: path.join(dir, "ledger.json"), payloads: path.join(dir, "payloads") };
}

/* run the real audit binary against a staged world */
function audit({ ledger, payloads }) {
  try {
    const out = execFileSync("node", [SEED_DROP, "--audit"], {
      env: { ...process.env, SEED_LEDGER: ledger, SEED_PAYLOADS: payloads },
      encoding: "utf8", timeout: 30_000 });
    return { exit: 0, out };
  } catch (e) {
    return { exit: e.status ?? 1, out: (e.stdout || "") + (e.stderr || "") };
  }
}

/* flip one byte at wire-offset `pos` inside drop i's payload */
function flipPayload(payloads, dropId, pos) {
  const p = path.join(payloads, dropId + ".txt");
  const raw = ub64(fs.readFileSync(p, "utf8").trim());
  raw[pos] ^= 0xa5;
  fs.writeFileSync(p, b64u(raw) + "\n");
}

// wire offsets (176-byte fixture token): sig=[88..152), shard=[164..176)
const SIG_POS = 100, SHARD_POS = 170, ROLE_POS = 152;

fs.rmSync(WORK, { recursive: true, force: true });
fs.mkdirSync(WORK, { recursive: true });
if (!fs.existsSync(LIVE_LEDGER)) { console.error("no live ledger — run run-seed-drop first"); process.exit(1); }
const liveDrops = JSON.parse(fs.readFileSync(LIVE_LEDGER, "utf8")).drops;
console.log(`RATIONS stress — ${liveDrops.length} live drops, staged tamper worlds\n`);

/* RAT-00 baseline: the untouched world must pass — any failure here
   means the live fabric is already desynced. */
{
  const st = stage(() => {});
  const r = audit(st);
  r.exit === 0 && r.out.includes("verified")
    ? held("baseline-clean", `untouched ledger+payloads → ${r.out.trim().split("\n").pop()}`)
    : open_("baseline-clean", `clean world failed audit: ${r.out.trim()} — live fabric desynced?`);
}

/* RAT-01 signed-region wound: flip a signature byte → parseable token,
   verify() fails → audit must flag corrupt and halt. */
{
  const st = stage((led, pl) => flipPayload(pl, led.drops[0].dropId, SIG_POS));
  const r = audit(st);
  r.exit !== 0 && r.out.includes("corrupt")
    ? held("signature-wound", `sig byte flipped → audit flags corrupt, refuses coverage: ${r.out.trim().split("\n").pop()}`)
    : open_("signature-wound", `wounded signature passed audit (exit=${r.exit}) — correlation would proceed on a forged token`);
}

/* RAT-02 shard wound: flip a PHSEED01 byte → verify() PASSES (shard is
   unsigned by design) but seedHash mismatches → the fabric anchor must
   catch what the signature cannot. */
{
  const st = stage((led, pl) => flipPayload(pl, led.drops[0].dropId, SHARD_POS));
  const r = audit(st);
  r.exit !== 0 && r.out.includes("corrupt")
    ? held("shard-wound-anchor", `unsigned shard mutated — sig still valid, but seedHash mismatch halts: ${r.out.trim().split("\n").pop()}`)
    : open_("shard-wound-anchor", `mutated seed passed audit (exit=${r.exit}) — the fabric anchor is blind to unsigned wounds`);
}

/* RAT-03 cross-drop shard swap: swap two drops' shard regions — both
   signatures remain valid (shards unsigned), both seedHashes desync.
   The dual-anchor must detect dissociation on BOTH. */
{
  const st = stage((led, pl) => {
    if (led.drops.length < 2) return;
    const [a, b] = led.drops;
    const pa = ub64(fs.readFileSync(path.join(pl, a.dropId + ".txt"), "utf8").trim());
    const pb = ub64(fs.readFileSync(path.join(pl, b.dropId + ".txt"), "utf8").trim());
    const sa = Buffer.from(pa.subarray(164)), sb = Buffer.from(pb.subarray(164));
    sa.copy(pb, 164); sb.copy(pa, 164);
    fs.writeFileSync(path.join(pl, a.dropId + ".txt"), b64u(pa) + "\n");
    fs.writeFileSync(path.join(pl, b.dropId + ".txt"), b64u(pb) + "\n");
  });
  const r = audit(st);
  r.exit !== 0 && (r.out.match(/corrupt/g) || []).length
    ? held("cross-drop-dissociation", `shards swapped — both sigs valid, both seedHashes desync, audit halts: ${r.out.trim().split("\n").pop()}`)
    : open_("cross-drop-dissociation", `swapped shards passed (exit=${r.exit}) — seed transplant undetected`);
}

/* RAT-04 foreign signer: mint a valid ed25519 token under a DIFFERENT
   key — self-consistent signature, but tokenHash/seedHash ≠ ledger. */
{
  const st = stage((led, pl) => {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    const jwk = privateKey.export({ format: "jwk" });
    const pubRaw = ub64(jwk.x);
    const d = led.drops[0];
    const raw = ub64(fs.readFileSync(path.join(pl, d.dropId + ".txt"), "utf8").trim());
    // rebuild preimage: v‖nid‖endpoint‖role‖expiry from the original
    const epLen = raw.readUInt16BE(33);
    const ep = raw.subarray(35, 35 + epLen);
    const expLE = Buffer.alloc(8); expLE.writeBigUInt64LE(BigInt(d.expiry));
    const pre = Buffer.concat([Buffer.from([1]), raw.subarray(1, 33), ep, Buffer.from([2]), expLE]);
    const sig = crypto.sign(null, pre, privateKey);
    const forged = Buffer.concat([
      Buffer.from([1]), raw.subarray(1, 33),
      (() => { const b = Buffer.alloc(2); b.writeUInt16BE(ep.length); return b; })(), ep,
      pubRaw, sig, Buffer.from([2]), expLE, Buffer.from([1]),
      (() => { const b = Buffer.alloc(2); b.writeUInt16BE(12); return b; })(),
      raw.subarray(164, 176), // same shard — a faithful-looking clone
    ]);
    fs.writeFileSync(path.join(pl, d.dropId + ".txt"), b64u(forged) + "\n");
  });
  const r = audit(st);
  r.exit !== 0 && r.out.includes("corrupt")
    ? held("foreign-signer", `valid signature under foreign key → tokenHash desync halts: ${r.out.trim().split("\n").pop()}`)
    : open_("foreign-signer", `foreign-signed token passed (exit=${r.exit}) — signer substitution undetected`);
}

/* RAT-05 ledger desync: token is pristine, but the fabric chain's
   seedHash entry is tampered — the chain-side anchor broke. */
{
  const st = stage((led) => { led.drops[0].seedHash = "0".repeat(64); });
  const r = audit(st);
  r.exit !== 0 && r.out.includes("corrupt")
    ? held("ledger-side-desync", `pristine token vs tampered seedHash entry → audit halts: ${r.out.trim().split("\n").pop()}`)
    : open_("ledger-side-desync", `desynced ledger passed (exit=${r.exit}) — chain tamper invisible to the audit`);
}

/* RAT-06 expiry boundary (two cases):
   a) expire ONE drop of a pair — its sibling still covers. The pair
      stays covered: correct by design, expired drops leave the live set.
   b) expire ALL drops of a pair — the pair must report `expired`,
      never `covered`. A dead seed is not a valid correlation. */
{
  const pair = liveDrops[0].pair.map(String).sort().join("↔");
  const stA = stage((led) => {
    const ds = led.drops.filter(d => d.pair.map(String).sort().join("↔") === pair);
    ds[0].expiry = 1; // first sibling only
  });
  const rA = audit(stA);
  const stB = stage((led) => {
    for (const d of led.drops.filter(d => d.pair.map(String).sort().join("↔") === pair)) d.expiry = 1;
  });
  const rB = audit(stB);
  const aOk = rA.exit === 0; // sibling covers — legal
  const bOk = rB.exit !== 0 && rB.out.includes("expired");
  aOk && bOk
    ? held("expiry-boundary", `single-expiry covered by sibling (legal); all-expired pair reported expired: ${rB.out.trim().split("\n").pop()}`)
    : open_("expiry-boundary", `single=${rA.exit} (want 0 — sibling covers), all-expired=${rB.exit} expired-in-output=${rB.out.includes("expired")} — dead seed counted`);
}

/* RAT-07 missing artifact: the ledger says a drop exists but the paper
   was lost — audit must flag corrupt, not imagine the payload. */
{
  const st = stage((led, pl) => { fs.rmSync(path.join(pl, led.drops[0].dropId + ".txt")); });
  const r = audit(st);
  r.exit !== 0 && r.out.includes("corrupt")
    ? held("lost-paper", `payload artifact gone → audit flags corrupt, halts: ${r.out.trim().split("\n").pop()}`)
    : open_("lost-paper", `missing payload passed (exit=${r.exit})`);
}

const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nRATIONS sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);
console.log(tally.OPEN ? "  fractures found — the air gap leaks" : "  no fractures — the dual anchor held");

const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = {
  generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter((x) => x.team !== "RATIONS"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
process.exit(tally.OPEN ? 1 : 0);
