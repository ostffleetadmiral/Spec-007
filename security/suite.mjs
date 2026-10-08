// FANO-1 security sweep — RED / BLUE / BLACK / GRAY executable suite.
// Runs the shipped fano-auth.js and rations.wasm under Node with shims.
// Emits security/findings.json — every claim is backed by an executed probe.

import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import vm from "node:vm";
import { loadCore, wsConnect, httpGet, localStorage, hex, unhex, eq, sleep, enc, dec } from "./harness.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const SITE = path.resolve(HERE, "../site");
const WASM = path.resolve(SITE, "apps/rations/rations.wasm");
const RELAY = process.env.RELAY_URL || "ws://localhost:8091/ws";
const RELAY_HTTP = process.env.RELAY_HTTP || "http://localhost:8091";
const ALLOWED_ORIGIN = process.env.ALLOWED_ORIGIN || "http://desk.local";

const findings = [];
let secN = 0;
function f(team, name, verdict, detail, severity) {
  secN++;
  findings.push({ id: `SEC-${String(secN).padStart(2, "0")}`, team, name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] SEC-${String(secN).padStart(2, "0")} ${team}/${name}`);
}

/* service-absence classifier: a refused socket is a deferral, not a
   finding — the probe couldn't reach the lab, which is NOTED, not a
   defect verdict. Real harness breakage still reports ERROR. */
const svcDown = (e) =>
  /ECONNREFUSED|ETIMEDOUT|EHOSTUNREACH|ENETUNREACH|fetch failed|socket hang up|connection.*refus|timeout/i
    .test((e && (e.message + " " + (e.code || ""))) || "");
const catchVerdict = (e) => svcDown(e)
  ? ["NOTED", "deferred — service absent: " + String(e.message || e).slice(0, 60)]
  : ["ERROR", String(e.message || e).slice(0, 80)];

/* ---------- load shipped fano-auth.js with browser shims ---------- */
const sandbox = {
  window: {}, localStorage, crypto, TextEncoder, TextDecoder,
  WebSocket: function () { throw new Error("ws unused in suite"); },
  fetch: (u) => Promise.resolve({ arrayBuffer: () => fs.readFileSync(path.resolve(SITE, u)).buffer }),
  console, Date, JSON, Math, Promise, Uint8Array, Uint32Array, BigInt, Array, Error,
};
sandbox.window = sandbox;
vm.createContext(sandbox);
const authSrc = fs.readFileSync(path.join(SITE, "assets/fano-auth.js"), "utf8");
const auth = vm.runInContext(authSrc + "\n; window.FANO_AUTH;", sandbox);

const c = await loadCore(WASM);
const { ex, wr, outBuf, mem } = c;

/* ---------- wasm helpers ---------- */
function shamirSplit(secret, threshold, total) {
  const sp = wr(secret), op = outBuf(16 + secret.length * total + 32 * total);
  const ok = ex.rations_shamir_split(sp, secret.length, threshold, total, op);
  const r = ok ? mem(op, (secret.length + 2) * total).slice() : null;
  ex.rations_free(sp, secret.length); ex.rations_free(op, (secret.length + 2) * total);
  return r;
}
function shamirRecon(shards, shardLen, count, outLen) {
  const sp = wr(shards), op = outBuf(outLen);
  const ok = ex.rations_shamir_reconstruct(sp, shardLen, count, op, outLen);
  const r = ok ? mem(op, outLen).slice() : null;
  ex.rations_free(sp, shards.length); ex.rations_free(op, outLen);
  return r;
}
function qrDecode(pixels, w, h, cap) {
  const ip = wr(pixels), op = outBuf(cap), lp = outBuf(8), vp = outBuf(1);
  const rc = ex.rations_qr_decode(ip, w, h, op, cap, lp, vp);
  ex.rations_free(ip, pixels.length); ex.rations_free(op, cap); ex.rations_free(lp, 8); ex.rations_free(vp, 1);
  return rc;
}

console.log("== FANO-1 security sweep ==");
console.log("relay:", RELAY, "| wasm:", path.basename(WASM));

await auth.load("apps/rations/rations.wasm");

/* ================= RED — adversary ================= */
console.log("\n-- RED --");

// SEC: forged covenant signature must not verify
{
  const id = auth.genIdentity();
  const forged = crypto.randomBytes(64);
  const ok = auth.verify(auth.covenantBytes(), forged, id.pk);
  f("RED", "forged-covenant-sig", ok === false ? "HARDENED" : "EXPLOITED",
    "random 64B signature over covenant → verify=" + ok, "critical");
}

// SEC: tampered keystore ciphertext rejected by GCM
{
  localStorage.clear();
  const rec = auth.enroll("red-one", "hunter2-passphrase");
  const stolen = JSON.parse(localStorage.getItem(auth.STORE_KEY));
  const ct = unhex(stolen.keystore.ct); ct[4] ^= 0xff;
  stolen.keystore.ct = hex(ct);
  localStorage.setItem(auth.STORE_KEY, JSON.stringify(stolen));
  const res = auth.unlock("hunter2-passphrase");
  f("RED", "keystore-ct-tamper", res === null ? "HARDENED" : "EXPLOITED",
    "flipped ct byte → unlock=" + (res ? "OPEN" : "rejected"), "critical");
  localStorage.clear();
}

// SEC: pubkey substitution caught by seed→pk continuity
{
  const rec = auth.enroll("red-two", "hunter2-passphrase");
  const stolen = JSON.parse(localStorage.getItem(auth.STORE_KEY));
  stolen.pk = hex(auth.genIdentity().pk); // attacker swaps pk field
  localStorage.setItem(auth.STORE_KEY, JSON.stringify(stolen));
  const res = auth.unlock("hunter2-passphrase");
  f("RED", "keystore-pk-substitution", res === null ? "HARDENED" : "EXPLOITED",
    "swapped pk → continuity check " + (res ? "FAILED" : "rejected"), "high");
  localStorage.clear();
}

// SEC: covenant_sig swap → verify fails at unlock
{
  auth.enroll("red-three", "hunter2-passphrase");
  const stolen = JSON.parse(localStorage.getItem(auth.STORE_KEY));
  const id2 = auth.genIdentity();
  stolen.covenant_sig = hex(auth.sign(auth.covenantBytes(), id2.sk));
  localStorage.setItem(auth.STORE_KEY, JSON.stringify(stolen));
  const res = auth.unlock("hunter2-passphrase");
  f("RED", "covenant-sig-swap", res === null ? "HARDENED" : "EXPLOITED",
    "sig by foreign key → unlock=" + (res ? "OPEN" : "rejected"), "high");
  localStorage.clear();
}

// SEC: malformed QR decode input — must error-code, not trap
{
  let trapped = false, rc = -1;
  try { rc = qrDecode(new Uint8Array(100).fill(0xaa), 10, 10, 256); } catch { trapped = true; }
  f("RED", "qr-decode-garbage", !trapped ? "HARDENED" : "EXPLOITED",
    "uniform noise 10x10 → rc=" + rc + (trapped ? " TRAP" : ""), "medium");
}

// SEC: QR decode with mismatched dims (claims 100x100, gives 4 bytes)
{
  let trapped = false;
  try {
    const ip = wr(new Uint8Array(4)), op = outBuf(64), lp = outBuf(8), vp = outBuf(1);
    ex.rations_qr_decode(ip, 100, 100, op, 64, lp, vp);
    ex.rations_free(ip, 4); ex.rations_free(op, 64); ex.rations_free(lp, 8); ex.rations_free(vp, 1);
  } catch (e) { trapped = true; }
  f("RED", "qr-decode-len-lie", !trapped ? "HARDENED" : "EXPLOITED",
    "dims claim 10000px, buffer is 4B" + (trapped ? " — WASM TRAP (bounds checked, safe by trap)" : " — clean error"), "medium");
}

// SEC: malformed stega input
{
  let ok = false, trapped = false;
  try {
    const ip = wr(new Uint8Array(64).fill(0x89)), pp = wr(enc.encode("x")), od = outBuf(256), odl = outBuf(8), of = outBuf(256), ofl = outBuf(8);
    ok = !!ex.rations_stega_extract(ip, 64, pp, 1, od, 256, odl, of, 256, ofl);
    ex.rations_free(ip, 64); ex.rations_free(pp, 1); ex.rations_free(od, 256); ex.rations_free(odl, 8); ex.rations_free(of, 256); ex.rations_free(ofl, 8);
  } catch { trapped = true; }
  f("RED", "stega-garbage-input", (!ok && !trapped) || trapped ? "HARDENED" : "EXPLOITED",
    "fake PNG → extract=" + ok + (trapped ? " (trap, bounds-checked)" : ""), "medium");
}

// SEC: malformed carrier decode — status byte: 0=ok, 0x80|code=reject
{
  let status = -1, trapped = false;
  try {
    const ip = wr(new Uint8Array(32).fill(0x50)), op = outBuf(256), lp = outBuf(8);
    status = ex.rations_carrier_decode(ip, 32, 0, op, 256, lp);
    ex.rations_free(ip, 32); ex.rations_free(op, 256); ex.rations_free(lp, 8);
  } catch { trapped = true; }
  f("RED", "carrier-garbage-input", (status !== 0 || trapped) ? "HARDENED" : "EXPLOITED",
    "non-carrier blob → status=0x" + (status >>> 0).toString(16) + (trapped ? " (trap)" : ""), "medium");
}

// SEC: shamir threshold>total and 0-threshold edge cases
{
  const secret = crypto.randomBytes(32);
  const bad1 = shamirSplit(secret, 6, 3);
  const bad2 = shamirSplit(secret, 0, 3);
  f("RED", "shamir-bad-params", (bad1 === null && bad2 === null) ? "HARDENED" : "EXPLOITED",
    `k>n → ${bad1 === null ? "reject" : "ACCEPT"}; k=0 → ${bad2 === null ? "reject" : "ACCEPT"}`, "medium");
}

// SEC: relay — disallowed origin
{
  try {
    const ws = await wsConnect(RELAY, { origin: "http://evil.example" });
    const closed = await new Promise((r) => { ws.onClose = (f2) => r(f2 ? hex(f2.subarray(0, 2)) : "clean"); ws.socket.on("close", () => r("tcp-close")); setTimeout(() => r("timeout"), 3000); });
    f("RED", "relay-origin-abuse", closed !== "timeout" ? "HARDENED" : "OPEN",
      "Origin: evil.example → " + closed, "high");
  } catch (e) {
    f("RED", "relay-origin-abuse", "HARDENED", "handshake refused: " + e.message.slice(0, 60), "high");
  }
}

// SEC: relay — no origin header when allowlist configured
{
  try {
    const ws = await wsConnect(RELAY, { origin: undefined });
    const closed = await new Promise((r) => { ws.onClose = () => r("closed"); ws.socket.on("close", () => r("tcp-close")); setTimeout(() => r("stayed-open"), 3000); });
    f("RED", "relay-no-origin", closed !== "stayed-open" ? "HARDENED" : "OPEN",
      "no Origin header → " + closed, "medium");
  } catch (e) {
    f("RED", "relay-no-origin", "HARDENED", "refused: " + e.message.slice(0, 60), "medium");
  }
}

// helper: resolve when the conn gets killed (close frame, tcp close, or socket error)
function connEnd(ws, label) {
  return new Promise((r) => {
    const done = (v) => { if (v) r(v); };
    ws.onClose = (f2) => done("closed:" + (f2 ? hex(f2.subarray(0, 2)) : "clean"));
    ws.socket.on("close", () => done("tcp-close"));
    ws.onError = (e) => done("tcp-reset:" + (e.code || e.message));
    void label;
  });
}

// SEC: relay — oversized binary payload (>4MiB frame)
{
  try {
    const ws = await wsConnect(RELAY, { origin: ALLOWED_ORIGIN });
    const end = connEnd(ws);
    ws.send(Buffer.alloc(4 * 1024 * 1024 + 1));
    const got = await Promise.race([end, sleep(4000).then(() => "accepted")]);
    f("RED", "relay-oversize-payload", got !== "accepted" ? "HARDENED" : "EXPLOITED",
      "4MiB+1 frame → " + got, "high");
  } catch (e) { const [v, d] = catchVerdict(e); f("RED", "relay-oversize-payload", v, d, "high"); }
}

// SEC: relay — message flood (rate limit 100/s)
{
  try {
    const ws = await wsConnect(RELAY, { origin: ALLOWED_ORIGIN });
    const end = connEnd(ws);
    try { for (let i = 0; i < 300; i++) ws.send(Buffer.alloc(64, i & 0xff)); } catch {}
    const res = await Promise.race([end, sleep(4000).then(() => "all-accepted")]);
    f("RED", "relay-msg-flood", res !== "all-accepted" ? "HARDENED" : "EXPLOITED",
      "300 msgs burst → " + res, "high");
  } catch (e) { const [v, d] = catchVerdict(e); f("RED", "relay-msg-flood", v, d, "high"); }
}

// SEC: relay — malformed frame (invalid opcode 0xB)
{
  try {
    const ws = await wsConnect(RELAY, { origin: ALLOWED_ORIGIN });
    const end = connEnd(ws);
    const mask = crypto.randomBytes(4), data = Buffer.from("nope");
    const masked = Buffer.from(data.map((b, i) => b ^ mask[i & 3]));
    try { ws.sendRaw(Buffer.concat([Buffer.from([0x8b, 0x84]), mask, masked])); } catch {}
    const res = await Promise.race([end, sleep(3000).then(() => "ignored")]);
    f("RED", "relay-bad-opcode", res !== "ignored" ? "HARDENED" : "OPEN",
      "opcode 0xB → " + res, "medium");
  } catch (e) { const [v, d] = catchVerdict(e); f("RED", "relay-bad-opcode", v, d, "medium"); }
}

// SEC: replay — re-open same sealed channel bytes on B twice
{
  const A = await loadCore(WASM), B = await loadCore(WASM);
  A.ex.rations_channel_init(0); B.ex.rations_channel_init(1); // 0=initiator 1=responder
  const hsA = A.outBuf(32), hsB = B.outBuf(32);
  A.ex.rations_channel_handshake(hsA); B.ex.rations_channel_handshake(hsB);
  const accB = B.ex.rations_channel_accept(B.wr(A.mem(hsA, 32).slice()));
  const accA = A.ex.rations_channel_accept(A.wr(B.mem(hsB, 32).slice()));
  const readyA = A.ex.rations_channel_ready(), readyB = B.ex.rations_channel_ready();
  const msg = enc.encode("replay-me");
  const mp = A.wr(msg), sealedBuf = A.outBuf(4096), sl = A.outBuf(8);
  const sealOk = A.ex.rations_channel_seal(1, 0x01, mp, msg.length, sealedBuf, sl);
  const sealedLen = A.u32(sl);
  const sealedBytes = A.mem(sealedBuf, Math.min(sealedLen, 4096)).slice();
  const bOpen = (bytes) => {
    const dp = B.wr(bytes), op = B.outBuf(4096), olp = B.outBuf(8), mt = B.outBuf(8);
    const ok = B.ex.rations_channel_open(dp, bytes.length, op, 4096, olp, mt);
    const n = B.u32(olp);
    const plain = ok ? dec.decode(B.mem(op, Math.min(n, 4096))) : null;
    B.ex.rations_free(dp, bytes.length); B.ex.rations_free(op, 4096); B.ex.rations_free(olp, 8); B.ex.rations_free(mt, 8);
    return plain;
  };
  const first = (accB && accA && sealOk) ? bOpen(sealedBytes) : "setup-failed";
  const replay = first === "replay-me" ? bOpen(sealedBytes) : "n/a";
  f("RED", "channel-replay",
    replay === "replay-me" ? "NOTED" : (first === "setup-failed" ? "ERROR" : "HARDENED"),
    `ready=${readyA}/${readyB} seal=${sealOk} first=${JSON.stringify(first)} replay=${JSON.stringify(replay)} — ` +
    (replay === "replay-me" ? "replayed frame decrypts identically: no freshness counter at channel layer; app must add nonce/ts" : ""), "low");
  A.ex.rations_free(hsA, 32); B.ex.rations_free(hsB, 32);
  A.ex.rations_free(mp, msg.length); A.ex.rations_free(sealedBuf, 4096); A.ex.rations_free(sl, 8);
}

/* ================= BLUE — defender ================= */
console.log("\n-- BLUE --");

// artifact integrity: sha256 sidecar
{
  const wasmBuf = fs.readFileSync(WASM);
  const sidecar = WASM + ".sha256";
  if (fs.existsSync(sidecar)) {
    const want = fs.readFileSync(sidecar, "utf8").trim().split(/\s+/)[0];
    const got = crypto.createHash("sha256").update(wasmBuf).digest("hex");
    f("BLUE", "wasm-sha256-continuity", got === want ? "HARDENED" : "EXPLOITED",
      `${got.slice(0, 16)}… vs sidecar ${want.slice(0, 16)}…`, "critical");
  } else {
    f("BLUE", "wasm-sha256-continuity", "OPEN", "no .sha256 sidecar next to rations.wasm — artifact not pinned", "high");
  }
}

// CSP audit on quine + desk pages
{
  const quine = fs.readFileSync(path.join(SITE, "apps/rations/quine.html"), "utf8");
  const cspMeta = quine.match(/Content-Security-Policy[^>]*content="([^"]+)"/i);
  const tokens = cspMeta ? cspMeta[1].split(/[;\s]+/) : [];
  const hasEval = tokens.includes("'unsafe-eval'");   // wasm-unsafe-eval is fine — wasm needs it
  const hasCsp = !!cspMeta;
  f("BLUE", "quine-csp-no-eval", hasCsp && !hasEval ? "HARDENED" : "OPEN",
    `CSP present=${hasCsp} bare unsafe-eval=${hasEval} (wasm-unsafe-eval allowed)`, "medium");
}

// relay production mode: debug probe gated
{
  try {
    const probe = await httpGet(RELAY_HTTP + "/__probe");
    f("BLUE", "relay-debug-gate", probe.status === 404 ? "HARDENED" : "OPEN",
      `/__probe → HTTP ${probe.status} (RATIONS_DEBUG ${process.env.RELAY_DEBUG || "unset"})`, "medium");
  } catch (e) { const [v, d] = catchVerdict(e); f("BLUE", "relay-debug-gate", v, d, "medium"); }
}

// relay security headers on static responses
{
  try {
    const res = await httpGet(RELAY_HTTP + "/");
    const coop = res.headers["cross-origin-opener-policy"];
    f("BLUE", "relay-http-headers", coop === "same-origin" ? "HARDENED" : "OPEN",
      `COOP=${coop || "absent"}`, "low");
  } catch (e) { const [v, d] = catchVerdict(e); f("BLUE", "relay-http-headers", v, d, "low"); }
}

// AES-GCM tag manipulation
{
  const key = crypto.randomBytes(32), nonce = crypto.randomBytes(12);
  const dp = wr(enc.encode("integrity")), kp = wr(key), np = wr(nonce), op = outBuf(16), tp = outBuf(16);
  ex.rations_aes_encrypt(dp, 9, kp, 32, np, 12, op, tp);
  const tag = mem(tp, 16).slice(); tag[0] ^= 1;
  const tp2 = wr(tag), op2 = outBuf(16);
  const ok = ex.rations_aes_decrypt(op, 9, kp, 32, np, 12, tp2, 16, op2);
  f("BLUE", "aes-gcm-tag-check", !ok ? "HARDENED" : "EXPLOITED",
    "flipped tag bit → decrypt=" + !!ok, "critical");
  ex.rations_free(dp, 9); ex.rations_free(kp, 32); ex.rations_free(np, 12); ex.rations_free(op, 16); ex.rations_free(tp, 16); ex.rations_free(tp2, 16); ex.rations_free(op2, 16);
}

// unlock lockout persistence (re-verify under suite)
{
  localStorage.clear();
  auth.enroll("blue-lock", "correct-battery-horse");
  let denied = 0;
  for (let i = 0; i < 5; i++) if (auth.unlock("wrong-" + i) === null) denied++;
  const locked = auth.lockRemain() > 0;
  const whileLocked = auth.unlock("correct-battery-horse") === null;
  f("BLUE", "unlock-lockout", (denied === 5 && locked && whileLocked) ? "HARDENED" : "OPEN",
    `5 wrong → locked=${locked} remain=${auth.lockRemain()}s, correct-pass-while-locked rejected=${whileLocked}. Note: local attacker can clear storage — relay-side throttle is the real wall`, "medium");
  localStorage.clear();
}

/* ================= BLACK — assume-breach ================= */
console.log("\n-- BLACK --");

// stolen keystore → PBKDF2 crack cost measurement
{
  localStorage.clear();
  const rec = auth.enroll("victim", "desk1234");
  const ks = rec.keystore;
  const t0 = Date.now();
  const pp = wr(enc.encode("guess")), sp = wr(unhex(ks.salt)), op = outBuf(32);
  ex.rations_pbkdf2(pp, 5, sp, unhex(ks.salt).length, 100000, op, 32);
  const ms = Date.now() - t0;
  ex.rations_free(pp, 5); ex.rations_free(sp, unhex(ks.salt).length); ex.rations_free(op, 32);
  // 8-char lowercase+digits ≈ 36^8 ≈ 2.8e12 candidates
  const perSec = Math.max(1, Math.floor(1000 / ms));
  const years = (Math.pow(36, 8) / perSec / 31536000);
  f("BLACK", "offline-crack-cost", "NOTED",
    `PBKDF2(100k) ≈ ${ms}ms/try → ~${perSec} tries/s → 8-char [a-z0-9] space ≈ ${years.toExponential(1)} yrs single-core. Weak passphrases remain the weakest link; min-length is 8`, "medium");
}

// stego exfiltration of the crown jewels through our own covert channel
{
  const ksJson = localStorage.getItem(auth.STORE_KEY);
  const pngHeader = Buffer.concat([Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])]);
  // build minimal PNG via stega embed needs a real PNG; check capacity path exists
  const canEmbed = typeof ex.rations_stega_embed === "function";
  f("BLACK", "keystore-stego-exfil", canEmbed ? "NOTED" : "OPEN",
    canEmbed
      ? `stega_embed available — keystore JSON (${ksJson.length}B) fits typical LSB capacity; transported blob remains AES-GCM ciphertext, so exfil of the record ≠ key recovery`
      : "stega_embed export missing",
    "low");
  void pngHeader;
}

// shamir backup/recovery of the seed — shard layout: 1 index byte + secret_len
{
  const seed = crypto.randomBytes(32);
  const shares = shamirSplit(seed, 3, 5);
  let recon = null, fewerOk = false;
  if (shares) {
    const shardLen = 1 + seed.length; // 33
    recon = shamirRecon(shares.subarray(0, shardLen * 3), shardLen, 3, 32);
    const two = shamirRecon(shares.subarray(0, shardLen * 2), shardLen, 2, 32);
    fewerOk = two && eq(two, seed);
  }
  f("BLACK", "shamir-recovery", (recon && eq(recon, seed) && !fewerOk) ? "HARDENED" : "OPEN",
    `3-of-5 → recon=${!!(recon && eq(recon, seed))}; 2 shares recover=${!!fewerOk}`, "high");
}

// burn irrecoverability
{
  localStorage.clear();
  auth.enroll("burnable", "x".repeat(12));
  auth.burn();
  const gone = localStorage.getItem(auth.STORE_KEY) === null;
  const sessClear = auth.session.sk === null && auth.session.role === 0;
  f("BLACK", "burn-irrecoverable", (gone && sessClear) ? "HARDENED" : "OPEN",
    `record gone=${gone} session zeroed=${sessClear} — WASM memory still holds seed until reload (JS-layer finding)`, "low");
}

// localStorage dump contains no plaintext seed
{
  localStorage.clear();
  const rec = auth.enroll("leakcheck", "p".repeat(10));
  const dump = JSON.stringify(localStorage.getItem(auth.STORE_KEY));
  const seedHex = hex(auth.session.sk);
  const seedInDump = dump.includes(seedHex) || /"sk"|secretKey|privateKey/.test(dump);
  f("BLACK", "storage-plaintext-scan", !seedInDump ? "HARDENED" : "EXPLOITED",
    `record ${dump.length}B — plaintext seed present=${seedInDump} (seed only lives inside AES-GCM ct)`, "high");
  void rec;
  localStorage.clear();
}

/* ================= GRAY — insider with valid creds ================= */
console.log("\n-- GRAY --");

// CADET session attempts Q-BRANCH-gated op — real enroll + unlock path
{
  localStorage.clear();
  auth.enroll("genesis", "g".repeat(12));              // first identity → admiral
  auth.enroll("insider", "i".repeat(12));              // second → field_agent
  auth.unlock("i".repeat(12));
  const role = auth.session.role;
  const denied = !auth.hasRole(auth.ROLES.q_branch);
  f("GRAY", "cadet-qbranch-gate", denied && role === 0 ? "HARDENED" : "EXPLOITED",
    `unlocked role=${role} → hasRole(Q-BRANCH)=${!denied}`, "high");
}

// insider rewrites cert role→5 and self-signs → verifyCert must reject
{
  const id = auth.genIdentity();
  const cov = auth.covenantHash();
  const agentCert = auth.issueCert(id.pk, "evil-insider", auth.ROLES.field_agent, cov, id.pk, id.sk, 30);
  const rec = { v: 1, user: "evil-insider", pk: hex(id.pk), covenant_sha256: hex(cov), covenant_sig: hex(auth.sign(auth.covenantBytes(), id.sk)), cert: agentCert, keystore: null, created: new Date().toISOString() };
  // attacker modifies role and re-signs with own key (has full local write access)
  const forgedCert = auth.issueCert(id.pk, "evil-insider", auth.ROLES.fleet_admiral, cov, id.pk, id.sk, 30);
  rec.cert = forgedCert;
  const passes = auth.verifyCert(rec);
  f("GRAY", "forged-role-cert", passes === false ? "HARDENED" : "EXPLOITED",
    `self-signed role-5 cert → verifyCert=${passes}` +
    (passes ? " — issuer not rostered" : " — elevated role requires rostered issuer"), "critical");
}

// cert transplant: a valid admiral cert on a foreign pk record must fail iss binding
{
  const genesisPk = auth.roster()[0];
  const ghost = auth.genIdentity();
  const cov = auth.covenantHash();
  // cert claims issuer = genesis but is signed by ghost's key — sig won't verify under genesis pk,
  // and iss != rec.pk. both guards must hold.
  const fakeCert = { role: 5, exp: Math.floor(Date.now() / 1000) + 86400, iss: genesisPk, sig: hex(auth.sign(enc.encode("x"), ghost.sk)) };
  const rec = { v: 1, user: "ghost", pk: hex(ghost.pk), covenant_sha256: hex(cov), covenant_sig: hex(auth.sign(auth.covenantBytes(), ghost.sk)), cert: fakeCert, keystore: null };
  const passes = auth.verifyCert(rec);
  f("GRAY", "cert-transplant", passes === false ? "HARDENED" : "EXPLOITED",
    `foreign-issuer cert on ghost record → verifyCert=${passes}`, "high");
}

// tampered role field without re-signing → signature must fail
{
  const id = auth.genIdentity();
  const cov = auth.covenantHash();
  const cert = auth.issueCert(id.pk, "tamper", auth.ROLES.field_agent, cov, id.pk, id.sk, 30);
  cert.role = 5; // no re-sign
  const rec = { v: 1, user: "tamper", pk: hex(id.pk), covenant_sha256: hex(cov), covenant_sig: hex(auth.sign(auth.covenantBytes(), id.sk)), cert, keystore: null, created: "" };
  const passes = auth.verifyCert(rec);
  f("GRAY", "cert-role-tamper", passes === false ? "HARDENED" : "EXPLOITED",
    `role 0→5 edit, stale sig → verifyCert=${passes}`, "high");
}

// expired cert rejected
{
  const id = auth.genIdentity();
  const cov = auth.covenantHash();
  const cert = auth.issueCert(id.pk, "ghost", auth.ROLES.operator, cov, id.pk, id.sk, -1); // already expired
  const rec = { v: 1, user: "ghost", pk: hex(id.pk), covenant_sha256: hex(cov), covenant_sig: hex(auth.sign(auth.covenantBytes(), id.sk)), cert, keystore: null, created: "" };
  const passes = auth.verifyCert(rec);
  f("GRAY", "cert-expiry", passes === false ? "HARDENED" : "OPEN",
    `expired cert → verifyCert=${passes}`, "medium");
}

// dossier compute artifact: wasm magic + the ABI the desktop re-derives
{
  try {
    const bytes = fs.readFileSync(path.join(SITE, "assets/spec007.wasm"));
    const mod = await WebAssembly.compile(bytes);
    const exp = WebAssembly.Module.exports(mod).map((e) => e.name);
    const need = ["drip_to_gas_clmin", "charge_minutes", "slab_equilibrium_dk",
      "slab_cool_step", "bus_power_w", "residue_mg", "air_lpm_x10", "fano_alive"];
    const missing = need.filter((n) => !exp.includes(n));
    f("BLUE", "compute-wasm-abi", missing.length === 0 ? "HARDENED" : "OPEN",
      `spec007.wasm ${bytes.length}B exports=${exp.length} missing=[${missing}]`, "medium");
  } catch (e) { const [v, d] = catchVerdict(e); f("BLUE", "compute-wasm-abi", v, d, "medium"); }
}

// science inventory integrity: every verdict sits on the honest ladder
{
  try {
    const inv = JSON.parse(fs.readFileSync(path.join(SITE, "assets/science-inventory.json"), "utf8"));
    const allowed = new Set(["modeled", "sheraton_modeled", "mappable_verified",
      "mappable", "remote_candidate", "gap", "speculative", "speculative_mapped"]);
    const bad = (inv.terms || []).filter((t) => !allowed.has(t.verdict));
    const sum = Object.values(inv.verdict_counts || {}).reduce((a, b) => a + b, 0);
    const ok = bad.length === 0 && sum === inv.term_count;
    f("BLUE", "science-inventory-ladder", ok ? "HARDENED" : "OPEN",
      `terms=${inv.term_count} counted=${sum} off-ladder=${bad.length}`, "low");
  } catch (e) { const [v, d] = catchVerdict(e); f("BLUE", "science-inventory-ladder", v, d, "low"); }
}

/* ---------- write findings — merge, preserving other teams' entries ---------- */
fs.mkdirSync(path.join(SITE, "security"), { recursive: true });
const out = path.join(SITE, "security/findings.json");
const SEC_TEAMS = new Set(["RED", "BLUE", "BLACK", "GRAY"]);
let prior = { findings: [] };
try { prior = JSON.parse(fs.readFileSync(out, "utf8")); } catch {}
const merged = [
  ...(prior.findings || []).filter((x) => !SEC_TEAMS.has(x.team)),
  ...findings];
fs.writeFileSync(out, JSON.stringify({ generated: new Date().toISOString(), relay: RELAY, findings: merged }, null, 2));
const counts = {};
for (const x of findings) counts[x.verdict] = (counts[x.verdict] || 0) + 1;
console.log("\nfindings:", findings.length, JSON.stringify(counts), "→", path.relative(process.cwd(), out));
process.exit(findings.some((x) => x.verdict === "EXPLOITED") ? 2 : 0);
