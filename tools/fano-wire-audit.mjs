#!/usr/bin/env node
// fano-wire-audit.mjs — executable gate for the extracted browser-safe
// FANO-WIRE parser. The 136-byte packet is a canonical sealed integrity
// datagram: FNV-256 + route/phase signature, not encryption or auth.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import * as ORACLE from "../security/fano-mesh-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SITE_MODULE = path.join(ROOT, "site", "assets", "fano-wire.js");
const OUT = path.join(ROOT, "security", "out", "fano-wire-audit.json");
const require = createRequire(import.meta.url);
require(SITE_MODULE);
const W = globalThis.FANO_WIRE;

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};
const bytesEqual = (a, b) => a && b && a.length === b.length &&
  a.every((v, i) => v === b[i]);
const enc = new TextEncoder();
const HOSTILE_HEX =
  "ffffffffffffffffffffffffffffffff0000000000000000ffffffffffffffff0e0e0e2a0000000e686f7374696c652d636f6f726473000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000062667845f7731cd07bcfd6d858f5f03f6a976210e3283f05ef2016c20b616f96";

console.log("fano-wire audit — canonical 136-byte sealed datagram\n");

check("FW-00 module-boundary", !!W &&
  W.WIRE_BYTES === 136 && W.PAYLOAD_CAP === 64 && W.CENTER === 7 &&
  W.CHUNK_BYTES === 62,
  "global FANO_WIRE exports the frozen 136B/64B/center-7 contract");

{
  const src = fs.readFileSync(SITE_MODULE, "utf8");
  const banned = ["require(", "localStorage", "indexedDB", "document.", "fetch(", "WebSocket("]
    .filter(k => src.includes(k));
  if (/\bBuffer\b/.test(src)) banned.push("Buffer");
  check("FW-01 dependency-free", banned.length === 0,
    banned.length ? `forbidden host dependency token(s): ${banned.join(",")}`
                  : "typed-array implementation carries no Buffer/DOM/storage/network dependency");
}

{
  let ok = true, detail = "";
  for (let i = 0; i < ORACLE.VECS.length; i++) {
    const wire = W.fromHex(ORACLE.VECS[i].wire);
    const parsed = wire && W.parse(wire);
    const oracleWire = Buffer.from(ORACLE.VECS[i].wire, "hex");
    if (!wire || wire.length !== W.WIRE_BYTES || !parsed || !parsed.valid ||
        !W.verify(wire) || !ORACLE.verify(oracleWire) ||
        !bytesEqual(W.seal(wire), ORACLE.seal(oracleWire))) {
      ok = false; detail = `vector ${i} diverged`; break;
    }
  }
  check("FW-02 firmware-goldens", ok,
    ok ? `${ORACLE.VECS.length}/3 firmware vectors verify and seal bit-exact` : detail);
}

{
  const cases = [
    [13,14,14,13,14,14,6,"golden"],
    [14,14,14,0,0,0,16,"corner-to-corner"],
    [7,7,7,7,7,7,1,"zero-hop"],
    [1,2,3,4,5,6,9,"forgery-probe"],
    [0,0,0,14,14,14,0xffffffff,"max-seq"],
  ];
  let ok = true, detail = "";
  for (const [sx,sy,sz,dx,dy,dz,seq,text] of cases) {
    const payload = enc.encode(text);
    const ours = W.build(sx,sy,sz,dx,dy,dz,seq,payload);
    const theirs = ORACLE.build(sx,sy,sz,dx,dy,dz,seq,Buffer.from(payload));
    const parsed = W.parse(ours);
    if (!bytesEqual(ours, theirs) || !parsed.valid || !W.verify(ours) ||
        parsed.src.x !== sx || parsed.dst.x !== dx || parsed.seq !== seq ||
        parsed.plen !== payload.length || !bytesEqual(parsed.payload, payload)) {
      ok = false; detail = `build/parse mismatch for ${text}`; break;
    }
  }
  check("FW-03 build-parse-parity", ok,
    ok ? `${cases.length} deterministic builds match oracle and parse back exactly` : detail);
}

{
  let ok = true, detail = "";
  let seed = 0x5eed;
  const next = () => (seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0);
  for (let i = 0; i < 64; i++) {
    const c = Array.from({ length: 6 }, () => next() & 255);
    const seq = next();
    const payload = Uint8Array.from({ length: next() % 65 }, () => next() & 255);
    const ours = W.build(...c, seq, payload);
    const theirs = ORACLE.build(...c, seq, Buffer.from(payload));
    if (!bytesEqual(ours, theirs) || !bytesEqual(W.seal(ours), ORACLE.seal(theirs))) {
      ok = false; detail = `differential case ${i}`; break;
    }
  }
  check("FW-04 deterministic-differential", ok,
    ok ? `64/64 seeded build+seal cases byte-exact against the ${ORACLE.nativeSeal ? "WASM-native" : "bridge"} oracle` : detail);
}

{
  const good = W.build(1, 2, 3, 4, 5, 6, 9, enc.encode("boundary"));
  const badLen = [0, 135, 137].every(n =>
    W.parse(new Uint8Array(n)) === null && W.verify(new Uint8Array(n)) === false);
  let sealThrows = false;
  try { W.seal(new Uint8Array(135)); } catch (e) { sealThrows = e instanceof RangeError; }
  const tail = good.slice(); tail[103] = 0xaa;
  const forged = good.slice(); forged[40] ^= 0xff;
  const badSeal = good.slice(); badSeal[104] ^= 1;
  const over = good.slice(); over[39] = W.PAYLOAD_CAP + 1; over.set(W.seal(over), 104);
  const reasons = [
    W.parse(tail)?.reason === "noncanonical-tail" && !W.verify(tail),
    W.parse(forged)?.reason === "seal-mismatch" && !W.verify(forged),
    W.parse(badSeal)?.reason === "seal-mismatch" && !W.verify(badSeal),
    W.parse(over)?.reason === "payload-length-out-of-range" && !W.verify(over),
  ];
  check("FW-05 hostile-canonical-boundaries",
    badLen && sealThrows && reasons.every(Boolean),
    "wrong length refused; nonzero tail, forged payload/seal, and resealed plen>64 classify honestly");
}

{
  const hostile = W.fromHex(HOSTILE_HEX);
  const parsed = hostile && W.parse(hostile);
  check("FW-06 hostile-coordinate-evidence",
    !!parsed && parsed.valid && parsed.in_grid === false &&
    parsed.src.x === 4095 && parsed.src.y === 4095 && parsed.src.z === 4095,
    "12-bit out-of-grid source coordinates verify against the bounded route fold while parse marks in_grid:false");
}

{
  const good = W.build(1, 1, 1, 2, 2, 2, 1, enc.encode("capacity"));
  const exact = W.build(1, 1, 1, 2, 2, 2, 2, new Uint8Array(64).fill(0x5a));
  let refused = false;
  try { W.build(1, 1, 1, 2, 2, 2, 3, new Uint8Array(65)); }
  catch (e) { refused = e instanceof RangeError; }
  check("FW-07 payload-cap",
    W.verify(good) && W.verify(exact) && exact[39] === 64 && refused,
    "0..64-byte payloads accepted canonically; 65-byte build throws RangeError");
}

{
  let badArgs = 0;
  for (const fn of [
    () => W.build(-1,0,0,0,0,0,0,new Uint8Array(0)),
    () => W.build(0,0,0,256,0,0,0,new Uint8Array(0)),
    () => W.build(0,0,0,0,0,0,0x100000000,new Uint8Array(0)),
    () => W.build(0,0,0,0,0,0,0,"not bytes"),
    () => W.build(0,0,0,0,0,0,0,[256]),
    () => W.seal("not bytes"),
  ]) {
    try { fn(); } catch (e) { if (e instanceof RangeError) badArgs++; }
  }
  check("FW-08 typed-argument-boundaries", badArgs === 6,
    "coordinate/sequence/wire/payload argument violations throw RangeError, never coerce silently");
}

{
  const a = W.route(0, 0, 0, 14, 14, 14);
  const b = W.route(0, 0, 0, 14, 14, 14);
  let bounded = false;
  try { W.route(0, 0, 0, 14, 14, 14, 2); }
  catch (e) { bounded = e instanceof RangeError; }
  check("FW-09 route-determinism-bound",
    a.length === 43 && JSON.stringify(a) === JSON.stringify(b) && bounded,
    "corner route emits deterministic 43-hop diagnostic; explicit maxHops fails closed");
}

{
  const src = fs.readFileSync(SITE_MODULE, "utf8");
  const sink = /Sealed integrity dialect, not encryption/.test(src) &&
    !/Ed25519|AES-GCM|confidential|encrypted/i.test(src);
  check("FW-10 security-claim-boundary", sink,
    "public module identifies sealed integrity only — no confidentiality/auth claim");
}

{
  const hostile = W.fromHex(HOSTILE_HEX);
  const zig = spawnSync("zig", ["run", "src/spec008_seal_cli.zig", "--", "seal-hex", W.toHex(hostile)], {
    cwd: ROOT, encoding: "utf8", timeout: 30000,
  });
  const zigSeal = zig.status === 0 ? zig.stdout.trim() : null;
  check("FW-11 zig-differential",
    zigSeal === W.toHex(W.seal(hostile)),
    zigSeal ? "hostile-vector seal matches Zig CLI bit-exact"
            : `zig oracle unavailable: ${String(zig.stderr || zig.error).slice(0,120)}`);
}

{
  const good = W.build(7, 7, 7, 7, 7, 7, 42, enc.encode("snapshot"));
  const parsed = W.parse(good);
  parsed.payload[0] ^= 0xff;
  parsed.seal[0] ^= 0xff;
  check("FW-12 parsed-view-isolation",
    W.verify(good) && !bytesEqual(parsed.payload, good.subarray(40, 40 + good[39])),
    "parse returns snapshots; mutating returned views cannot tamper with the source wire");
}

const failures = results.filter(r => !r.ok);
const artifact = {
  schema: "FANO-WIRE-AUDIT-v1",
  component: "site/assets/fano-wire.js",
  generated: new Date().toISOString(),
  contract: {
    wire_bytes: W.WIRE_BYTES,
    payload_cap: W.PAYLOAD_CAP,
    center: W.CENTER,
    chunk_bytes: W.CHUNK_BYTES,
    security_boundary: "canonical sealed integrity datagram — not encryption or signature auth",
  },
  checks: results,
  verdict: failures.length === 0 ? "GREEN" : "FAIL",
};
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`fano-wire report → ${OUT}`);
}
console.log(`\n${failures.length === 0 ? "FANO-WIRE: all checks green" : `FANO-WIRE: ${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
