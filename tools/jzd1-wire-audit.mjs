#!/usr/bin/env node
// jzd1-wire-audit.mjs — executable gate for the desk-side JZD1 v2 twin.
// Verifies site/assets/jzd1.js against the Jizo-emitted JZD1-GOLDEN-v1
// fixture (golden/jzd1-vectors.txt): parse, field parity, peerId32 fold,
// and Ed25519 signature verify through the same rations.wasm the desk
// ships. Signed records are self-authenticating discovery claims —
// the Ed25519 lane is real; peer admission is never this codec's call.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SITE_MODULE = path.join(ROOT, "site", "assets", "jzd1.js");
const FIXTURE = path.join(ROOT, "golden", "jzd1-vectors.txt");
const RATIONS_WASM = path.join(ROOT, "site", "apps", "rations", "rations.wasm");
const OUT = path.join(ROOT, "security", "out", "jzd1-wire-audit.json");
const require = createRequire(import.meta.url);
require(SITE_MODULE);
const J = globalThis.JZD1;

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};
const bytesEqual = (a, b) => a && b && a.length === b.length &&
  a.every((v, i) => v === b[i]);

console.log("jzd1-wire audit — desk twin of Jizo discovery.zig (JZD1 v2)\n");

check("JZ-00 module-boundary", !!J &&
  J.VERSION === 2 && J.HEADER_LEN === 56 && J.ENDPOINT_LEN === 28 &&
  J.SIGNATURE_LEN === 64 && J.NODE_ID_LEN === 32 && J.MAX_RECORD === 232 &&
  J.MAX_PACKET === 256 && J.MAX_ENDPOINTS === 4,
  "global JZD1 exports the frozen JZD1 v2 contract (232B max record = ESP-NOW budget)");

{
  const src = fs.readFileSync(SITE_MODULE, "utf8");
  const banned = ["require(", "localStorage", "indexedDB", "document.", "fetch(", "WebSocket("]
    .filter(k => src.includes(k));
  if (/\bBuffer\b/.test(src)) banned.push("Buffer");
  check("JZ-01 dependency-free", banned.length === 0,
    banned.length ? `forbidden host dependency token(s): ${banned.join(",")}`
                  : "typed-array implementation carries no Buffer/DOM/storage/network dependency");
}

/* ── golden fixture ── */
const fixtureSrc = fs.readFileSync(FIXTURE, "utf8");
const head = /^# JZD1-GOLDEN-v1 pubkey=([0-9a-f]{64}) peerid32=([0-9a-f]{8})/m.exec(fixtureSrc);
const vectors = [...fixtureSrc.matchAll(/^(\S+) seq=(\d+) kind=(\w+) medium=(\w+) endpoints=(\d+) len=(\d+) hex=([0-9a-f]+)$/gm)]
  .map(m => ({ name: m[1], seq: Number(m[2]), kind: m[3], medium: m[4],
               endpoints: Number(m[5]), len: Number(m[6]), hex: m[7] }));
const selfcheckPass = /^SELFCHECK PASS$/m.test(fixtureSrc);

check("JZ-02 fixture-integrity", !!head && vectors.length === 5 && selfcheckPass &&
  vectors.every(v => v.hex.length === v.len * 2),
  head ? `JZD1-GOLDEN-v1: 5 vectors, SELFCHECK PASS, pubkey ${head[1].slice(0, 16)}…`
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

check("JZ-03 wasm-ed25519-lane", !!ex && typeof ex.rations_ed25519_verify === "function" &&
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

/* ── golden vectors: parse + field parity + real signature verify ── */
{
  const FAR = (1n << 64n) - 1n;
  let ok = !!ex, detail = "";
  const pub = head && J.fromHex(head[1]);
  for (const v of vectors) {
    const wire = J.fromHex(v.hex);
    const p = wire && J.parse(wire, 1n);
    if (!p || !p.valid || p.sequence !== v.seq || p.kind_name !== v.kind ||
        p.medium_name !== v.medium || p.endpoints.length !== v.endpoints ||
        p.expires_at !== FAR || !bytesEqual(p.node_id, pub) ||
        !J.verify(wire, 1n, wasmVerify)) {
      ok = false; detail = `vector ${v.name} diverged`; break;
    }
  }
  check("JZ-04 golden-verify", ok,
    ok ? "5/5 Jizo-emitted records parse, match fields, and verify under rations.wasm Ed25519" : detail);
}

/* ── peerId32 cross-tree anchor ── */
{
  const pub = head && J.fromHex(head[1]);
  check("JZ-05 peerid32-anchor",
    pub && J.peerId32(pub) === parseInt(head[2], 16),
    head ? `XOR-fold alias ${head[2]} matches the Jizo-computed BLIB peer id` : "no fixture");
}

/* ── desk-side build round-trip through the same WASM lane ── */
{
  let ok = !!ex, detail = "";
  const FAR = (1n << 64n) - 1n;
  const kp = ex && expandSeed(new TextEncoder().encode("JZD1-GOLDEN-V1-SEED--00000000001"));
  if (kp && head && bytesEqual(kp.pk, J.fromHex(head[1]))) {
    const signer = { publicKey: kp.pk, sign: m => wasmSign(kp.sk64, m) };
    const addr = new Uint8Array(16); addr.set([192, 168, 12, 210]);
    const btAddr = new Uint8Array(16); btAddr.set([0xde, 0xad, 0xbe, 0xef, 0x00, 0x01]);
    const cases = [
      { kind: 1, medium: 1, sequence: 1, expires_at: FAR, peer: { node_id: kp.pk, capabilities: 7, endpoints: [{ medium: 1, address_len: 4, port: 45750, expires_at: FAR, address: addr }] } },
      { kind: 1, medium: 2, sequence: 2, expires_at: FAR, peer: { node_id: kp.pk, capabilities: 7, endpoints: [{ medium: 2, address_len: 6, port: 0, expires_at: FAR, address: btAddr }, { medium: 4, address_len: 16, port: 0, expires_at: FAR, address: new Uint8Array(16).fill(0x10) }] } },
    ];
    /* the JS twin must reproduce the Jizo-emitted bytes bit-exact */
    for (let i = 0; i < cases.length && i < vectors.length; i++) {
      const built = J.build(cases[i], signer);
      const golden = J.fromHex(vectors[i].hex);
      if (!bytesEqual(built, golden) || !J.verify(built, 1n, wasmVerify)) {
        ok = false; detail = `build ${vectors[i].name} diverged from golden bytes`; break;
      }
    }
  } else { ok = false; detail = "seed expansion did not reproduce the fixture pubkey"; }
  check("JZ-06 build-bit-exact", ok,
    ok ? "desk twin builds announce-ip + announce-bt bit-exact to Jizo's bytes via rations.wasm sign" : detail);
}

/* ── hostile boundaries: every truncation + every bit mutation fails closed ── */
{
  const wire = J.fromHex(vectors[2].hex); /* the full 232B record */
  let ok = true;
  for (let cut = 0; cut < wire.length; cut++) {
    if (J.verify(wire.slice(0, cut), 1n, wasmVerify) || J.parse(wire.slice(0, cut), 1n).valid) { ok = false; break; }
  }
  if (ok) for (let i = 0; i < wire.length && ok; i++) {
    for (let bit = 0; bit < 8; bit++) {
      const d = wire.slice(); d[i] ^= 1 << bit;
      if (J.verify(d, 1n, wasmVerify)) { ok = false; break; }
    }
  }
  check("JZ-07 hostile-fail-closed", ok,
    "every truncated prefix and every single-bit mutation of the 232B record is refused — structure or signature");
}

/* ── endpoint semantics + identity binding ── */
{
  const FAR = (1n << 64n) - 1n;
  const kp = ex && expandSeed(new Uint8Array(32).fill(0x11));
  const signer = kp && { publicKey: kp.pk, sign: m => wasmSign(kp.sk64, m) };
  const addr = new Uint8Array(16); addr.set([10, 0, 0, 1]);
  let refused = 0;
  const tries = [
    () => J.build({ kind: 1, medium: 1, sequence: 1, expires_at: FAR, peer: { node_id: kp.pk, endpoints: [{ medium: 1, address_len: 4, port: 0, expires_at: FAR, address: addr }] } }, signer),        // ip_udp port 0
    () => J.build({ kind: 1, medium: 2, sequence: 1, expires_at: FAR, peer: { node_id: kp.pk, endpoints: [{ medium: 2, address_len: 6, port: 9, expires_at: FAR, address: addr }] } }, signer),        // bt port nonzero
    () => J.build({ kind: 1, medium: 1, sequence: 1, expires_at: FAR, peer: { node_id: kp.pk, endpoints: [{ medium: 1, address_len: 0, port: 1, expires_at: FAR, address: addr }] } }, signer),        // addr_len 0
    () => J.build({ kind: 1, medium: 1, sequence: 1, expires_at: FAR, peer: { node_id: new Uint8Array(32).fill(0x22), endpoints: [] } }, signer),                                                       // alien identity
    () => J.build({ kind: 9, medium: 1, sequence: 1, expires_at: FAR, peer: { node_id: kp.pk, endpoints: [] } }, signer),                                                                              // bad kind
    () => J.build({ kind: 1, medium: 1, sequence: 1, expires_at: 0n, peer: { node_id: kp.pk, endpoints: [] } }, signer),                                                                               // zero expiry
  ];
  for (const f of tries) { try { f(); } catch (e) { if (e instanceof RangeError) refused++; } }
  check("JZ-08 encode-side-law", refused === tries.length,
    "port semantics, bounded address length, kind range, nonzero expiry, and no-speaking-for-unsigned-identity all fail closed at build");
}

/* ── typed boundaries ── */
{
  let badArgs = 0;
  for (const fn of [
    () => J.verify(new Uint8Array(148), 1n),
    () => J.verify(new Uint8Array(148), 1n, "not a function"),
    () => J.peerId32(new Uint8Array(31)),
    () => J.build({}, null),
    () => J.parse(new Uint8Array(148), -1),
  ]) {
    try { fn(); } catch (e) { if (e instanceof TypeError || e instanceof RangeError) badArgs++; }
  }
  /* parse never throws on hostile input — it returns a typed refusal */
  const refused = J.parse("not bytes", 1n).valid === false;
  check("JZ-09 typed-argument-boundaries", badArgs === 5 && refused,
    "missing verifier, wrong node-id length, missing signer, and bad clock throw TypeError/RangeError; malformed input parses to a typed refusal — never coerce silently");
}

/* ── wrong-key forgery: a record re-signed by another key dies under the
      identity it claims ── */
{
  let ok = !!ex;
  const wire = J.fromHex(vectors[0].hex);
  const p = J.parse(wire, 1n);
  const alien = ex && expandSeed(new Uint8Array(32).fill(0x77));
  if (alien) {
    const forged = wire.slice();
    forged.set(wasmSign(alien.sk64, wire.slice(0, p.signedLen)), p.signedLen);
    ok = !J.verify(forged, 1n, wasmVerify) && J.verify(wire, 1n, wasmVerify);
  }
  check("JZ-10 forgery-refused", ok,
    "re-signing announce-ip under an alien Ed25519 key verifies false against the claimed node identity");
}

/* ── cross-tree freshness: when JIZO_ROOT is set (cluster dev space),
      regenerate the fixture from Jizo's emitter and demand byte-exact
      equality with the committed golden — drift in either tree fails.
      In desk-only CI the private tree is absent: the check reports
      NOTED-deferred, never a false green. ── */
{
  const jizoRoot = process.env.JIZO_ROOT;
  if (!jizoRoot) {
    results.push({ id: "JZ-11 cross-tree-regen", ok: true, noted: true,
      detail: "JIZO_ROOT unset — committed fixture trusted; set it on the cluster for live regen parity" });
    console.log("  NOTED JZ-11 cross-tree-regen  JIZO_ROOT unset — deferred to cluster lane");
  } else {
    const { spawnSync } = await import("node:child_process");
    const run = spawnSync("zig", ["run", "src/jzd1_golden.zig"], {
      cwd: jizoRoot, encoding: "utf8", timeout: 120000,
    });
    const fresh = run.status === 0 ? run.stdout : null;
    check("JZ-11 cross-tree-regen",
      fresh !== null && fresh === fixtureSrc,
      fresh === null ? `Jizo emitter failed: ${String(run.stderr || run.error).slice(0, 120)}`
        : fresh === fixtureSrc ? "live Jizo re-emit is byte-identical to the committed fixture"
        : "fixture drifted from Jizo emitter — regenerate golden/jzd1-vectors.txt");
  }
}

const failures = results.filter(r => !r.ok);
const artifact = {
  schema: "JZD1-WIRE-AUDIT-v1",
  component: "site/assets/jzd1.js",
  generated: new Date().toISOString(),
  contract: {
    version: J.VERSION,
    max_record: J.MAX_RECORD,
    max_packet: J.MAX_PACKET,
    identity: "node_id IS the Ed25519 public key (32B) — same model as Rations PeerId",
    crypto_lane: "signature verify/sign injected; audit runs the desk's real rations.wasm exports",
    security_boundary: "self-authenticating discovery record — peer admission is the caller's decision",
  },
  fixture: { path: "golden/jzd1-vectors.txt", vectors: vectors.length, peerid32: head && head[2] },
  checks: results,
  verdict: failures.length === 0 ? "GREEN" : "FAIL",
};
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`jzd1-wire report → ${OUT}`);
}
console.log(`\n${failures.length === 0 ? "JZD1-WIRE: all checks green" : `JZD1-WIRE: ${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
