// seed-drop.mjs — the paper leg of the philotic fabric.
//
// The bifurcation invariant requires O(N) pairwise seed drops delivered
// out-of-band. This tool mints those drops as Rations-compatible invite
// tokens (src/invite/token.zig wire format, byte-exact): the philotic
// seed rides in the token's shard field, so a printed QR / optar shard /
// FSK burst IS the seed — air-gapped, hand-deliverable, physics-honest.
//
//   node seed-drop.mjs           # mint drops for every pair in the plan
//   node seed-drop.mjs --audit   # verify coverage + signatures + hashes
//
// Discipline:
//   - Seeds are u32, matching the fleet `SEED:` wire convention and the
//     sharedBit(seed, round) model used by every philotic probe.
//   - The Rations signature covers version‖nid‖endpoint‖role‖expiry —
//     the shard is unsigned by design, so the SEED BINDING is anchored
//     here: seedHash + tokenHash enter the ledger and the fabric audit
//     chain; --audit recomputes both from the payload artifact.
//   - Raw seeds never touch the ledger or stdout. They exist only in
//     out/seed-payloads/<dropId>.txt (0600) — the printable artifact.
//   - Endianness replicated exactly: endpoint_len/shard_len u16 BE,
//     expiry u64 LE (per token.zig serialize).
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out");
const PLAN = path.join(HERE, "seed-pairs.json");
const LEDGER = process.env.SEED_LEDGER || path.join(OUT, "seed-drops.json");
const KEYFILE = path.join(OUT, "seed-signer.jwk");
const PAYLOADS = process.env.SEED_PAYLOADS || path.join(OUT, "seed-payloads");
const MAGIC = Buffer.from("PHSEED01"); // shard tag — philotic seed v1
const AUDIT = process.argv.includes("--audit");

const sha256 = (b) => crypto.createHash("sha256").update(b).digest();
const b64u = (b) => Buffer.from(b).toString("base64url");
const ub64 = (s) => Buffer.from(s, "base64url");
const readJSON = (p) => { try { return JSON.parse(fs.readFileSync(p, "utf8")); } catch { return null; } };

// ---- persistent drop signer: one ed25519 identity for the fabric ----
function signer() {
  fs.mkdirSync(OUT, { recursive: true });
  let jwk;
  try { jwk = JSON.parse(fs.readFileSync(KEYFILE, "utf8")); }
  catch {
    const { privateKey } = crypto.generateKeyPairSync("ed25519");
    jwk = privateKey.export({ format: "jwk" });
    fs.writeFileSync(KEYFILE, JSON.stringify(jwk), { mode: 0o600 });
  }
  return {
    priv: crypto.createPrivateKey({ key: jwk, format: "jwk" }),
    pubRaw: ub64(jwk.x),
    pubJwk: jwk.x,
  };
}

// ---- token.zig-compatible wire build ----
// wire: v(1) nid(32) ep_len(2,BE) ep pub(32) sig(64) role(1) exp(8,LE) has_shard(1) sh_len(2,BE) shard
function buildToken({ networkId, endpoint, pubRaw, priv, expiry, shard }) {
  const version = 1, role = 2; // Role.user
  const ep = Buffer.from(endpoint, "utf8");
  const expLE = Buffer.alloc(8); expLE.writeBigUInt64LE(BigInt(expiry));
  const pre = Buffer.concat([Buffer.from([version]), networkId, ep, Buffer.from([role]), expLE]);
  const sig = crypto.sign(null, pre, priv);
  const epLen = Buffer.alloc(2); epLen.writeUInt16BE(ep.length);
  const shLen = Buffer.alloc(2); shLen.writeUInt16BE(shard.length);
  return Buffer.concat([
    Buffer.from([version]), networkId, epLen, ep, pubRaw, sig,
    Buffer.from([role]), expLE, Buffer.from([1]), shLen, shard,
  ]);
}

// ---- parse the same wire layout back (audit path) ----
function parseToken(buf) {
  let p = 0;
  const take = (n) => { const s = buf.subarray(p, p + n); if (s.length < n) throw new Error("token short"); p += n; return s; };
  const version = take(1)[0];
  const networkId = take(32);
  const epLen = take(2).readUInt16BE(0);
  const endpoint = take(epLen);
  const signerPub = take(32);
  const signature = take(64);
  const role = take(1)[0];
  const expiry = Number(take(8).readBigUInt64LE(0));
  const hasShard = take(1)[0];
  const shard = hasShard ? take(take(2).readUInt16BE(0)) : null;
  return { version, networkId, endpoint, signerPub, signature, role, expiry, shard };
}

function verifyToken(tok) {
  const expLE = Buffer.alloc(8); expLE.writeBigUInt64LE(BigInt(tok.expiry));
  const pre = Buffer.concat([Buffer.from([tok.version]), tok.networkId, tok.endpoint, Buffer.from([tok.role]), expLE]);
  const pub = crypto.createPublicKey({ key: { kty: "OKP", crv: "Ed25519", x: b64u(tok.signerPub) }, format: "jwk" });
  return crypto.verify(null, pre, pub, tok.signature);
}

// ---- mint ----
function generate(plan) {
  const { priv, pubRaw, pubJwk } = signer();
  const nid = plan.networkIdHex ? Buffer.from(plan.networkIdHex, "hex") : sha256(Buffer.from("spec-007-philotic-fabric"));
  if (nid.length !== 32) { console.error("networkIdHex must be 32 bytes"); process.exit(1); }
  const now = Math.floor(Date.now() / 1000);
  const ttl = plan.ttlSeconds ?? 90 * 86400;
  const drops = [];
  fs.mkdirSync(PAYLOADS, { recursive: true });
  for (const [a, b] of plan.pairs) {
    const seed = crypto.randomBytes(4); // u32 — the fleet SEED convention
    const shard = Buffer.concat([MAGIC, seed]);
    const expiry = now + ttl;
    const token = buildToken({ networkId: nid, endpoint: plan.endpoint, pubRaw, priv, expiry, shard });
    const dropId = sha256(token).toString("hex").slice(0, 16);
    fs.writeFileSync(path.join(PAYLOADS, dropId + ".txt"), b64u(token) + "\n", { mode: 0o600 });
    drops.push({
      dropId, pair: [a, b],
      seedHash: sha256(shard).toString("hex"),
      tokenHash: sha256(token).toString("hex"),
      expiry,
    });
    console.log(`drop|${a}↔${b}|id=${dropId}|seedHash=${sha256(shard).toString("hex").slice(0, 16)}…|expires=${new Date(expiry * 1000).toISOString()}`);
  }
  // hash-only ledger — the chain anchors it; the paper carries the secret
  const prior = readJSON(LEDGER);
  const ledger = {
    issued: new Date().toISOString(),
    signerPub: pubJwk,
    networkId: nid.toString("hex"),
    drops: [...(prior?.drops ?? []), ...drops],
  };
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2));
  console.log(`seed-drop: ${drops.length} drop(s) minted → out/seed-payloads/ (0600) + hash-only ledger`);
}

// ---- coverage + integrity audit ----
function audit(plan) {
  const ledger = readJSON(LEDGER);
  if (!ledger) { console.error("seed-coverage: no ledger — run run-seed-drop first"); process.exit(1); }
  const now = Math.floor(Date.now() / 1000);
  const want = plan.pairs.map(([a, b]) => [a, b].sort().join("↔"));
  let covered = 0, verified = 0;
  const missing = [], expired = [], corrupt = [];
  for (const pairKey of want) {
    const live = ledger.drops.filter((d) => [d.pair[0], d.pair[1]].sort().join("↔") === pairKey && d.expiry > now);
    if (!live.length) {
      const dead = ledger.drops.some((d) => [d.pair[0], d.pair[1]].sort().join("↔") === pairKey);
      (dead ? expired : missing).push(pairKey);
      continue;
    }
    covered++;
    for (const d of live) {
      try {
        const tok = parseToken(ub64(fs.readFileSync(path.join(PAYLOADS, d.dropId + ".txt"), "utf8").trim()));
        const okSig = verifyToken(tok);
        const okSeed = tok.shard?.subarray(0, 8).equals(MAGIC) && sha256(tok.shard).toString("hex") === d.seedHash;
        const okTok = sha256(ub64(fs.readFileSync(path.join(PAYLOADS, d.dropId + ".txt"), "utf8").trim())).toString("hex") === d.tokenHash;
        if (okSig && okSeed && okTok) verified++; else corrupt.push(d.dropId);
      } catch { corrupt.push(d.dropId); }
    }
  }
  const ok = covered === want.length && corrupt.length === 0;
  console.log(`seed-coverage: pairs=${want.length} covered=${covered} verified=${verified}/${ledger.drops.length}` +
    (missing.length ? ` missing=[${missing}]` : "") + (expired.length ? ` expired=[${expired}]` : "") +
    (corrupt.length ? ` corrupt=[${corrupt}]` : ""));
  process.exit(ok ? 0 : 1);
}

const plan = readJSON(PLAN);
if (!plan?.pairs?.length) { console.error("seed-drop: seed-pairs.json missing or declares no pairs"); process.exit(1); }
AUDIT ? audit(plan) : generate(plan);
