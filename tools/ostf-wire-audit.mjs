#!/usr/bin/env node
// ostf-wire-audit.mjs — executable gate for the desk-side NAM1 twin.
// Verifies site/assets/ostf.js against the Jizo-emitted NAM1-GOLDEN-v1
// fixture (golden/nam1-vectors.txt): parse, canonical-name law, field
// parity, Ed25519 signature verify through the same rations.wasm the
// desk ships, build bit-exactness, and the directory's supersede/
// conflict semantics. A name record is a self-authenticating claim —
// the Ed25519 lane is real; conflicts surface, never resolve silently.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SITE_MODULE = path.join(ROOT, "site", "assets", "ostf.js");
const FIXTURE = path.join(ROOT, "golden", "nam1-vectors.txt");
const RATIONS_WASM = path.join(ROOT, "site", "apps", "rations", "rations.wasm");
const OUT = path.join(ROOT, "security", "out", "ostf-wire-audit.json");
const require = createRequire(import.meta.url);
require(SITE_MODULE);
const O = globalThis.OSTF;

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};
const bytesEqual = (a, b) => a && b && a.length === b.length &&
  a.every((v, i) => v === b[i]);
const FAR = (1n << 64n) - 1n;

console.log("ostf-wire audit — desk twin of Jizo ostf_name.zig + ostf_dir.zig (NAM1)\n");

check("OSTF-00 module-boundary", !!O &&
  O.VERSION === 1 && O.HEADER_LEN === 56 && O.ENDPOINT_LEN === 28 &&
  O.MAX_RECORD === 224 && O.MAX_PACKET === 224 && O.MAX_ENDPOINTS === 2 &&
  O.MAX_NAME === 48 && O.ZONE === "ostf.un" && O.MAX_RECORD <= 232,
  "global OSTF exports the frozen NAM1 contract (224B max record — under JZD1's 232 ESP-NOW floor)");

{
  const src = fs.readFileSync(SITE_MODULE, "utf8");
  const banned = ["require(", "localStorage", "indexedDB", "document.", "fetch(", "WebSocket("]
    .filter(k => src.includes(k));
  if (/\bBuffer\b/.test(src)) banned.push("Buffer");
  check("OSTF-01 dependency-free", banned.length === 0,
    banned.length ? `forbidden host dependency token(s): ${banned.join(",")}`
                  : "typed-array implementation carries no Buffer/DOM/storage/network dependency");
}

/* ── golden fixture ── */
const fixtureSrc = fs.readFileSync(FIXTURE, "utf8");
const head = /^# NAM1-GOLDEN-v1 pubkey=([0-9a-f]{64})/m.exec(fixtureSrc);
const vectors = [...fixtureSrc.matchAll(/^(\S+) kind=(\w+) seq=(\d+) service=([0-9a-f]+) endpoints=(\d+) len=(\d+) hex=([0-9a-f]+)$/gm)]
  .map(m => ({ label: m[1], kind: m[2], seq: Number(m[3]), service: parseInt(m[4], 16),
               endpoints: Number(m[5]), len: Number(m[6]), hex: m[7] }));
const selfcheckPass = /^SELFCHECK PASS$/m.test(fixtureSrc);

check("OSTF-02 fixture-integrity", !!head && vectors.length === 5 && selfcheckPass &&
  vectors.every(v => v.hex.length === v.len * 2),
  head ? `NAM1-GOLDEN-v1: 5 vectors, SELFCHECK PASS, pubkey ${head[1].slice(0, 16)}…`
       : "fixture header malformed or missing");

/* ── rations.wasm Ed25519 lane (the desk's real crypto) ── */
const memory = new WebAssembly.Memory({ initial: 2048, maximum: 16384 });
const mem = (p, n) => new Uint8Array(memory.buffer, p, n);
let ex;
try {
  const wasm = fs.readFileSync(RATIONS_WASM);
  const instance = await WebAssembly.instantiate(wasm, {
    env: {
      memory,
      js_random_bytes: (p, n) => crypto.getRandomValues(mem(p, n)),
      js_time_now: () => BigInt(Date.now()),
      js_ws_connect: () => -1,
      js_ws_send: () => 0,
      js_ws_close: () => {},
      js_ws_state: () => 0,
      js_console_log: () => {},
      js_dom_set_text: () => {},
      js_dom_get_value: () => 0,
      js_local_storage_set: () => 0,
      js_local_storage_get: () => 0,
    },
  });
  ex = instance.instance.exports;
} catch (e) { ex = null; }

check("OSTF-03 wasm-ed25519-lane", !!ex && typeof ex.rations_ed25519_verify === "function" &&
  typeof ex.rations_ed25519_sign === "function" &&
  typeof ex.rations_ed25519_keypair_seed === "function",
  ex ? "rations.wasm exports the Ed25519 sign/verify/keypair ABI the desk runs"
     : "rations.wasm unavailable — signature checks cannot run");

const wr = b => { const p = ex.rations_alloc(b.length || 1); mem(p, b.length).set(b); return p; };
const wasmVerify = (pub, msg, sig) => {
  const mp = wr(msg), sp = wr(sig), pp = wr(pub);
  const ok = ex.rations_ed25519_verify(mp, msg.length, sp, 64, pp, 32);
  ex.rations_free(mp, msg.length); ex.rations_free(sp, sig.length); ex.rations_free(pp, pub.length);
  return !!ok;
};
const expandSeed = seed => {
  const sp = wr(seed), pp = ex.rations_alloc(32), sp2 = ex.rations_alloc(64);
  const ok = ex.rations_ed25519_keypair_seed(sp, seed.length, pp, sp2);
  const r = ok ? { pk: mem(pp, 32).slice(), sk64: mem(sp2, 64).slice() } : null;
  ex.rations_free(sp, seed.length); ex.rations_free(pp, 32); ex.rations_free(sp2, 64);
  return r;
};
const wasmSign = (sk64, msg) => {
  const mp = wr(msg), sp = wr(sk64), op = ex.rations_alloc(64);
  const ok = ex.rations_ed25519_sign(mp, msg.length, sp, 64, op);
  const sig = ok ? mem(op, 64).slice() : null;
  ex.rations_free(mp, msg.length); ex.rations_free(sp, 64); ex.rations_free(op, 64);
  return sig;
};

const GOLDEN_SEED = "NAM1-GOLDEN-V1-SEED--00000000001"; // 32B emitter seed
const NAMES = {
  "register-reboot-seed": "reboot.ostf.un",
  "register-dir-full": "dir.ostf.un",
  "register-long-name": "recovery-portal-desk.ostf.un",
  "query-seed": "seed.ostf.un",
  "register-max-name": "a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.ostf.un",
};

/* ── golden vectors: parse + field parity + real signature verify ── */
{
  let ok = !!ex, detail = "";
  const pub = head && O.fromHex(head[1]);
  for (const v of vectors) {
    const wire = O.fromHex(v.hex);
    const p = wire && O.parse(wire, 1n);
    if (!p || !p.valid || p.sequence !== v.seq || p.kind_name !== v.kind ||
        p.service !== v.service || p.endpoints.length !== v.endpoints ||
        p.expires_at !== FAR || !bytesEqual(p.node_id, pub) ||
        p.name !== NAMES[v.label] ||
        !O.verify(wire, 1n, wasmVerify)) {
      ok = false; detail = `vector ${v.label} diverged`; break;
    }
  }
  check("OSTF-04 golden-verify", ok,
    ok ? "5/5 Jizo-emitted records parse, match fields, and verify under rations.wasm Ed25519" : detail);
}

/* ── canonical-name law ── */
{
  let ok = true;
  const accepts = [
    ["reboot", "reboot.ostf.un"],
    ["SEED.OSTF.UN", "seed.ostf.un"],
    ["a.b.ostf.un", "a.b.ostf.un"],
    ["Dir", "dir.ostf.un"],
  ];
  for (const [input, want] of accepts) {
    try { if (O.normalizeName(input) !== want) { ok = false; break; } }
    catch (e) { ok = false; break; }
  }
  const refuses = ["", "x".repeat(60), "x.ostf.un.", "x..ostf.un", "x.ostf.com",
    "x_underscore.ostf.un", "-lead.ostf.un", "trail-.ostf.un", "a.b.c", "ostf.un."];
  if (ok) for (const bad of refuses) {
    try { O.normalizeName(bad); ok = false; break; }
    catch (e) { if (!(e instanceof RangeError)) { ok = false; break; } }
  }
  check("OSTF-05 canonical-name-law", ok,
    ok ? "bare labels zone-join, case folds, sub-labels pass; malformed/out-of-zone all refuse"
       : "normalization diverged from the Zig codec");
}

/* ── desk-side build round-trip through the same WASM lane ── */
{
  let ok = !!ex, detail = "";
  const kp = ex && expandSeed(new TextEncoder().encode(GOLDEN_SEED));
  if (kp && head && bytesEqual(kp.pk, O.fromHex(head[1]))) {
    const signer = { publicKey: kp.pk, sign: m => wasmSign(kp.sk64, m) };
    const epTcp = (ip, port) => ({ medium: 6, address_len: 4, port, expires_at: FAR,
      address: (() => { const a = new Uint8Array(16); a.set(ip); return a; })() });
    const epUdp = (ip, port) => ({ medium: 1, address_len: 4, port, expires_at: FAR,
      address: (() => { const a = new Uint8Array(16); a.set(ip); return a; })() });
    const cases = [
      () => O.claim("reboot.ostf.un", signer, O.SERVICE.SEED_HTTP | O.SERVICE.GATE, 1, FAR,
        [epTcp([192, 168, 12, 210], 8080)]),
      () => O.ask("seed.ostf.un", signer, O.SERVICE.SEED_HTTP, 4, FAR,
        [epUdp([192, 168, 12, 162], 44110)]),
      () => O.claim("a1b2c3d4e5f6g7h8i9j0k1l2m3n4o5p6.ostf.un", signer, O.SERVICE.DAEMON, 5, FAR,
        [epTcp([203, 0, 113, 9], 8443), epUdp([203, 0, 113, 9], 31318)]),
    ];
    const idxs = [0, 3, 4];
    for (let i = 0; i < cases.length; i++) {
      const built = cases[i]();
      const golden = O.fromHex(vectors[idxs[i]].hex);
      if (!bytesEqual(built, golden) || !O.verify(built, 1n, wasmVerify)) {
        ok = false; detail = `build ${vectors[idxs[i]].label} diverged from golden bytes`; break;
      }
    }
  } else { ok = false; detail = "seed expansion did not reproduce the fixture pubkey"; }
  check("OSTF-06 build-bit-exact", ok,
    ok ? "desk twin builds register + query + max-name bit-exact to Jizo's bytes via rations.wasm sign" : detail);
}

/* ── hostile boundaries: every truncation + every bit mutation fails closed ── */
{
  const wire = O.fromHex(vectors[4].hex); /* the 216B max-name register */
  let ok = true;
  for (let cut = 0; cut < wire.length; cut++) {
    if (O.verify(wire.slice(0, cut), 1n, wasmVerify) || O.parse(wire.slice(0, cut), 1n).valid) { ok = false; break; }
  }
  if (ok) for (let i = 0; i < wire.length && ok; i++) {
    for (let bit = 0; bit < 8; bit++) {
      const d = wire.slice(); d[i] ^= 1 << bit;
      if (O.verify(d, 1n, wasmVerify)) { ok = false; break; }
    }
  }
  check("OSTF-07 hostile-fail-closed", ok,
    "every truncated prefix and every single-bit mutation of the 216B record is refused — structure, name-law, or signature");
}

/* ── encode-side law ── */
{
  const kp = ex && expandSeed(new Uint8Array(32).fill(0x11));
  const signer = kp && { publicKey: kp.pk, sign: m => wasmSign(kp.sk64, m) };
  const addr = new Uint8Array(16); addr.set([10, 0, 0, 1]);
  const ep = (m, port) => ({ medium: m, address_len: 4, port, expires_at: FAR, address: addr });
  let refused = 0;
  const tries = [
    () => O.claim("x.ostf.un", signer, 1, 1, FAR, [ep(6, 0)]),                        // tcp port 0
    () => O.claim("x.ostf.un", signer, 1, 1, FAR, [ep(2, 9)]),                        // bt port nonzero
    () => O.claim("x.ostf.un", signer, 1, 1, FAR, [{ ...ep(6, 1), address_len: 0 }]), // addr_len 0
    () => O.claim("x.ostf.un", signer, 1, 1, FAR, [ep(6, 1), ep(6, 2), ep(6, 3)]),    // 3 endpoints
    () => O.claim("x.ostf.com", signer, 1, 1, FAR, []),                               // wrong zone
    () => O.claim("x.ostf.un", signer, 1, 1, 0n, []),                                 // zero expiry
    () => O.ask("x.ostf.un", { publicKey: kp.pk, sign: m => m }, 0, 1, FAR, []),      // sig not 64B
  ];
  for (const f of tries) { try { f(); } catch (e) { if (e instanceof RangeError) refused++; } }
  check("OSTF-08 encode-side-law", refused === tries.length,
    "port semantics, endpoint bound, zone law, nonzero expiry, and signature length all fail closed at build");
}

/* ── typed boundaries ── */
{
  let badArgs = 0;
  for (const fn of [
    () => O.verify(new Uint8Array(200), 1n),
    () => O.verify(new Uint8Array(200), 1n, "not a function"),
    () => O.claim("x.ostf.un", null, 0, 1, FAR, []),
    () => O.normalizeName(42),
  ]) {
    try { fn(); } catch (e) { if (e instanceof TypeError || e instanceof RangeError) badArgs++; }
  }
  const refused = O.parse("not bytes", 1n).valid === false;
  check("OSTF-09 typed-argument-boundaries", badArgs === 4 && refused,
    "missing verifier/signer and bad name type throw TypeError/RangeError; malformed input parses to a typed refusal — never coerce silently");
}

/* ── wrong-key forgery ── */
{
  let ok = !!ex;
  const wire = O.fromHex(vectors[0].hex);
  const p = O.parse(wire, 1n);
  const alien = ex && expandSeed(new Uint8Array(32).fill(0x77));
  if (alien) {
    const forged = wire.slice();
    forged.set(wasmSign(alien.sk64, wire.slice(0, p.signedLen)), p.signedLen);
    ok = !O.verify(forged, 1n, wasmVerify) && O.verify(wire, 1n, wasmVerify);
  }
  check("OSTF-10 forgery-refused", ok,
    "re-signing register-reboot-seed under an alien Ed25519 key verifies false against the claimed node identity");
}

/* ── directory law: supersede / stale / conflict / mask / expiry ── */
{
  let ok = true, detail = "";
  const mkRec = (name, pkBytes, svc, seq, exp) => ({
    kind: O.KIND.register, node_id: pkBytes, service: svc, sequence: seq,
    expires_at: BigInt(exp), name, endpoints: [],
  });
  const a = expandSeed(new Uint8Array(32).fill(0xa1));
  const b = expandSeed(new Uint8Array(32).fill(0xb2));
  const d = O.makeDirectory();
  const P = d.put;
  if (P.call(d, mkRec("x.ostf.un", a.pk, 1, 1, 9000), 100) !== "stored") { ok = false; detail = "first put"; }
  if (ok && P.call(d, mkRec("x.ostf.un", a.pk, 1, 1, 9000), 101) !== "stale") { ok = false; detail = "same-seq stale"; }
  if (ok && P.call(d, mkRec("x.ostf.un", a.pk, 9, 0, 9000), 102) !== "stale") { ok = false; detail = "lower-seq stale"; }
  if (ok && P.call(d, mkRec("x.ostf.un", a.pk, 9, 2, 9000), 103) !== "superseded") { ok = false; detail = "supersede"; }
  if (ok && d.get("x.ostf.un", 104).rec.service !== 9) { ok = false; detail = "superseded value"; }
  if (ok && P.call(d, mkRec("x.ostf.un", b.pk, 1, 3, 9000), 105) !== "conflict_rival") { ok = false; detail = "rival"; }
  if (ok && d.resolve("x.ostf.un", 0, 200).result !== "conflict") { ok = false; detail = "resolve conflict"; }
  if (ok) {
    const q = { ...mkRec("x.ostf.un", a.pk, 1, 9, 9000), kind: O.KIND.query };
    if (P.call(d, q, 106) !== "stale") { ok = false; detail = "query bypass"; }
  }
  if (ok && d.sweep(9999) !== 1) { ok = false; detail = "expiry sweep"; }
  check("OSTF-11 directory-law", ok,
    ok ? "same-key seq supersedes, stale no-ops, rival keys surface as conflict, mask resolves who-serves, expiry sweeps, queries never store"
       : `directory diverged: ${detail}`);
}

/* ── cross-tree freshness (JIZO_ROOT set → live regen parity) ── */
{
  const jizoRoot = process.env.JIZO_ROOT;
  if (!jizoRoot) {
    results.push({ id: "OSTF-12 cross-tree-regen", ok: true, noted: true,
      detail: "JIZO_ROOT unset — committed fixture trusted; set it on the cluster for live regen parity" });
    console.log("  NOTED OSTF-12 cross-tree-regen  JIZO_ROOT unset — deferred to cluster lane");
  } else {
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync("zig", ["run", "src/nam1_golden.zig"], {
      cwd: jizoRoot, encoding: "utf8", timeout: 120000,
    });
    const fresh = run.status === 0 ? run.stdout : null;
    check("OSTF-12 cross-tree-regen",
      fresh !== null && fresh === fixtureSrc,
      fresh === null ? `Jizo emitter failed: ${String(run.stderr || run.error).slice(0, 120)}`
        : fresh === fixtureSrc ? "live Jizo re-emit is byte-identical to the committed fixture"
        : "fixture drifted from Jizo emitter — regenerate golden/nam1-vectors.txt");
  }
}

const failures = results.filter(r => !r.ok);
const artifact = {
  schema: "OSTF-WIRE-AUDIT-v1",
  component: "site/assets/ostf.js",
  generated: new Date().toISOString(),
  contract: {
    version: O.VERSION,
    zone: O.ZONE,
    max_record: O.MAX_RECORD,
    identity: "node_id IS the Ed25519 public key (32B) — the name's sovereign key",
    crypto_lane: "signature verify/sign injected; audit runs the desk's real rations.wasm exports",
    security_boundary: "self-authenticating name claim — conflicts surface, never resolve silently; not ICANN DNS",
  },
  fixture: { path: "golden/nam1-vectors.txt", vectors: vectors.length },
  checks: results,
  verdict: failures.length === 0 ? "GREEN" : "FAIL",
};
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`ostf-wire report → ${OUT}`);
}
console.log(`\n${failures.length === 0 ? "OSTF-WIRE: all checks green" : `OSTF-WIRE: ${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
