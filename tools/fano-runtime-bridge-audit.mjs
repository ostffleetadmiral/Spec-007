#!/usr/bin/env node
// fano-runtime-bridge-audit.mjs — executable gate for FRB1, the runtime
// envelope riding inside the canonical 136-byte FANO sealed wire.
import fs from "node:fs";
import path from "node:path";
import { createRequire } from "node:module";
import { MessageChannel } from "node:worker_threads";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const WIRE_MODULE = path.join(ROOT, "site", "assets", "fano-wire.js");
const MODULE = path.join(ROOT, "site", "assets", "fano-runtime-bridge.js");
const QUIPLINK = path.join(ROOT, "site", "assets", "quplink.js");
const DESKTOP = path.join(ROOT, "site", "desktop.html");
const D12_EVIDENCE = path.join(ROOT, "site", "assets", "d12-sdk-audit.json");
const RATIONS_WASM = path.join(ROOT, "site", "apps", "rations", "rations.wasm");
const OUT = path.join(ROOT, "security", "out", "fano-runtime-bridge-audit.json");
const require = createRequire(import.meta.url);
require(WIRE_MODULE);
require(MODULE);
const W = globalThis.FANO_WIRE;
const B = globalThis.FANO_RUNTIME_BRIDGE;

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};
const bytesEqual = (a, b) => a && b && a.length === b.length &&
  a.every((v, i) => v === b[i]);
const enc = new TextEncoder();
const seqBytes = (n, seed = 0xa5) => {
  const out = new Uint8Array(n);
  let x = seed >>> 0;
  for (let i = 0; i < out.length; i++) {
    x = (Math.imul(x, 1664525) + 1013904223) >>> 0;
    out[i] = x & 0xff;
  }
  return out;
};
const reasonOf = r => r && !r.accepted ? r.reason : null;
const meshOf = (x, y, z) => ({ x, y, z });

console.log("fano-runtime-bridge audit — FRB1 sealed envelope + memory ownership\n");

check("FRB-00 module-boundary", !!B && !!W &&
  B.HEADER_BYTES === 16 && B.BODY_CAP === 48 && B.MAX_FRAGMENTS === 255 &&
  B.LANES.host === 0 && B.LANES.edge === 1 && B.LANES.heavy === 2 &&
  B.KINDS.request === 1 && B.KINDS.response === 2 && B.KINDS.event === 3,
  "FANO_RUNTIME_BRIDGE exports the FRB1 16-byte header, 48-byte fragment cap, and three-lane contract");

{
  const src = fs.readFileSync(MODULE, "utf8");
  const banned = ["require(", "localStorage", "indexedDB", "document.", "fetch(", "WebSocket("]
    .filter(k => src.includes(k));
  if (/\bBuffer\b/.test(src)) banned.push("Buffer");
  check("FRB-01 dependency-free", banned.length === 0,
    banned.length ? `forbidden host dependency token(s): ${banned.join(",")}`
                  : "typed-array bridge carries no Buffer/DOM/storage/network dependency");
}

{
  const body = seqBytes(33, 0x1234);
  const env = B.buildEnvelope({
    kind: "response", fromLane: "edge", toLane: "heavy",
    index: 2, total: 3, flags: 3, body,
  });
  const env2 = B.buildEnvelope({
    kind: "response", fromLane: "edge", toLane: "heavy",
    index: 2, total: 3, flags: 3, body,
  });
  const parsed = B.parseEnvelope(env);
  check("FRB-02 canonical-envelope", env.length === 49 && bytesEqual(env, env2) &&
    env[0] === 0x46 && env[1] === 0x52 && env[2] === 0x42 && env[3] === 0x31 &&
    env[4] === 1 && env[5] === 2 && env[6] === 1 && env[7] === 2 &&
    env[8] === 2 && env[9] === 3 && env[10] === 33 && env[11] === 3 &&
    env.slice(12, 16).every(v => v === 0) &&
    parsed.valid && parsed.kindName === "response" &&
    parsed.fromLaneName === "edge" && parsed.toLaneName === "heavy" &&
    parsed.transfer && parsed.wipeRequested && bytesEqual(parsed.body, body),
    "FRB1 layout is deterministic: magic/version/kind/lanes/fragment/body/flags/reserved are byte-exact");
}

{
  const edge = B.endpoint({ lane: "edge", mesh: meshOf(7, 7, 7) });
  const plain = W.build(7, 7, 7, 7, 7, 7, 0, enc.encode("plain payload over sixteen bytes"));
  const notFrb = edge.deliver(plain);
  const good = edge.pack({ lane: "edge", mesh: meshOf(7, 7, 7) }, "event", enc.encode("sealed"))[0];
  const forged = good.slice(); forged[40] ^= 0x80;
  const sealFirst = edge.deliver(forged);
  check("FRB-03 outer-seal-first",
    reasonOf(notFrb) === "not-frb1" &&
    reasonOf(sealFirst) === "wire-seal-mismatch",
    "canonical FANO seal/payload validation runs before FRB1 fields are trusted");
}

{
  let got = null;
  const edge = B.endpoint({ lane: "edge", mesh: meshOf(7, 7, 7) });
  const heavy = B.endpoint({
    lane: "heavy", mesh: meshOf(8, 8, 8), autoRelease: false,
    onMessage: m => { got = m; },
  });
  const body = seqBytes(997, 0xbeef);
  const wires = edge.pack(heavy, "request", body, { wipe: true });
  let orderOk = true;
  for (let i = wires.length - 1; i >= 0; i--) {
    const r = heavy.deliver(wires[i]);
    if (!r.accepted || (i !== 0 && r.complete)) orderOk = false;
  }
  const bodyOk = got && got.body.length === body.length && bytesEqual(got.body, body) &&
    got.fragments === wires.length && got.wipeRequested;
  const released = got && got.release() && got.body.every(v => v === 0);
  check("FRB-04 fragmented-roundtrip",
    wires.length === 21 && orderOk && bodyOk && released,
    "997-byte body splits into 21 sealed FRB1 fragments, reassembles out-of-order, then wipes on release");
}

{
  let rangeThrows = 0;
  for (const fn of [
    () => B.buildEnvelope({ kind: "bogus", fromLane: "edge", toLane: "heavy", body: new Uint8Array(0) }),
    () => B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "bogus", body: new Uint8Array(0) }),
    () => B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", index: 1, total: 1 }),
    () => B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", total: 0 }),
    () => B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", flags: 4 }),
    () => B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: new Uint8Array(49) }),
    () => B.endpoint().pack({ lane: "host", mesh: [0, 0, 0] }, "event", new Uint8Array(12241)),
  ]) {
    try { fn(); } catch (e) { if (e instanceof RangeError) rangeThrows++; }
  }
  const malformed = [
    [new Uint8Array(0), "short-envelope"],
    [enc.encode("FRB2................................................"), "not-frb1"],
    [B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: [1] }).map((v, i) => i === 4 ? 2 : v), "bad-version"],
    [B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: [1] }).map((v, i) => i === 5 ? 9 : v), "bad-kind"],
    [B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: [1] }).map((v, i) => i === 8 ? 1 : v), "bad-fragment"],
    [B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: [1, 2] }).slice(0, 17), "envelope-length-mismatch"],
    [B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: [1] }).map((v, i) => i === 11 ? 4 : v), "bad-flags"],
    [B.buildEnvelope({ kind: "event", fromLane: "edge", toLane: "heavy", body: [1] }).map((v, i) => i === 15 ? 1 : v), "noncanonical-envelope"],
  ];
  check("FRB-05 typed-boundaries", rangeThrows === 7 &&
    malformed.every(([b, reason]) => B.parseEnvelope(b).reason === reason),
    "kind/lane/fragment/flag/capacity violations fail closed; malformed envelopes classify without coercion");
}

{
  const edge = B.endpoint({ lane: "edge", mesh: meshOf(1, 1, 1) });
  const heavy = B.endpoint({ lane: "heavy", mesh: meshOf(2, 2, 2) });
  const first = edge.pack(heavy, "request", seqBytes(80));
  const dup = heavy.deliver(first[0]);
  const duplicate = heavy.deliver(first[0]);
  const tail = heavy.deliver(first[1]);
  const replay = heavy.deliver(first[0]);
  const gapWire = edge.pack(heavy, "request", new Uint8Array(1), { seq: 7 })[0];
  const gap = heavy.deliver(gapWire);
  const a = B.endpoint({ lane: "edge", mesh: meshOf(3, 3, 3) });
  const b = B.endpoint({ lane: "heavy", mesh: meshOf(4, 4, 4) });
  const five = a.pack(b, "request", seqBytes(50), { seq: 5 })[0];
  const six = a.pack(b, "request", seqBytes(50), { seq: 6 })[0];
  const overlap = (b.deliver(five), b.deliver(six));
  check("FRB-06 sequence-replay",
    dup.accepted && !dup.complete && reasonOf(duplicate) === "duplicate-fragment" &&
    tail.accepted && tail.complete && reasonOf(replay) === "replay" &&
    reasonOf(gap) === "sequence-gap" && reasonOf(overlap) === "sequence-overlap",
    "per-flow sequence is monotonic: duplicate, replay, gap, and interleaved fragment sessions refuse honestly");
}

{
  const src = B.endpoint({ lane: "host", mesh: meshOf(4, 4, 4) });
  const edge = B.endpoint({ lane: "edge", mesh: meshOf(5, 5, 5) });
  const wrongMesh = src.pack({ lane: "edge", mesh: meshOf(6, 6, 6) }, "event", new Uint8Array(1))[0];
  const wrongLane = src.pack({ lane: "heavy", mesh: meshOf(5, 5, 5) }, "event", new Uint8Array(1))[0];
  const right = src.pack({ lane: "edge", mesh: meshOf(5, 5, 5) }, "event", new Uint8Array(1))[0];
  check("FRB-07 lane-mesh-addressing",
    reasonOf(edge.deliver(wrongMesh)) === "dst-mismatch" &&
    reasonOf(edge.deliver(wrongLane)) === "lane-mismatch" &&
    edge.deliver(right).accepted,
    "outer mesh coordinates and inner execution lane must both match before delivery");
}

{
  const host = B.endpoint({ lane: "host", mesh: meshOf(1, 2, 3) });
  const edge = B.endpoint({ lane: "edge", mesh: meshOf(4, 5, 6) });
  const mc = new MessageChannel();
  const body = enc.encode("transfer-list payload");
  const posted = host.post(mc.port1, { lane: "edge", mesh: meshOf(4, 5, 6) }, "request", body);
  const received = await new Promise(resolve => {
    mc.port2.on("message", frames => {
      const rs = frames.map(f => edge.deliver(f));
      resolve({ frames, rs });
    });
  });
  mc.port1.close(); mc.port2.close();
  check("FRB-08 transferable-wire",
    posted.accepted && posted.messages === 1 && received.frames.length === 1 &&
    received.frames[0] instanceof ArrayBuffer && received.frames[0].byteLength === W.WIRE_BYTES &&
    received.rs.length === 1 && received.rs[0].accepted && received.rs[0].complete,
    "post() moves exact 136-byte wire ArrayBuffers through a real structured-clone MessageChannel");
}

{
  const edge = B.endpoint({ lane: "edge", mesh: meshOf(9, 9, 9) });
  const body = enc.encode("mutable source");
  const wire = edge.pack({ lane: "edge", mesh: meshOf(9, 9, 9) }, "event", body)[0];
  const before = wire.slice();
  body[0] ^= 0xff;
  const stillSealed = W.verify(wire) && bytesEqual(wire, before);
  const delivered = edge.deliver(wire);
  check("FRB-09 copy-boundaries",
    stillSealed && delivered.accepted && W.verify(wire) && bytesEqual(wire, before),
    "pack copies caller bytes; deliver consumes snapshots and leaves the caller's wire intact");
}

{
  const memory = new WebAssembly.Memory({ initial: 2048, maximum: 16384, shared: false });
  const wasm = fs.readFileSync(RATIONS_WASM);
  const instance = await WebAssembly.instantiate(wasm, {
    env: {
      memory,
      js_random_bytes: (ptr, len) => crypto.getRandomValues(new Uint8Array(memory.buffer, ptr, len)),
      js_time_now: () => Date.now(),
      js_ws_connect: () => -1,
      js_ws_send: () => 0,
    },
  });
  const ex = instance.instance.exports;
  const port = B.memoryPort({
    memory,
    alloc: len => ex.rations_alloc(len),
    free: (ptr, len) => ex.rations_free(ptr, len),
    secureWipe: (ptr, len) => ex.rations_secure_wipe(ptr, len),
  });
  const secret = enc.encode("runtime bridge owns this span");
  const span = port.write(secret);
  const copiedIn = bytesEqual(port.read(span.ptr, span.len), secret);
  const copiedOut = bytesEqual(span.read(), secret);
  const released = span.release();
  const wiped = port.read(span.ptr, span.len).every(v => v === 0);
  check("FRB-10 rations-memory-port",
    copiedIn && copiedOut && released && wiped && !span.release() && span.read() === null,
    "real rations.wasm ptr+len ABI: copy in, copy out, rations_secure_wipe before rations_free, double-release refused");
}

{
  const memory = new WebAssembly.Memory({ initial: 1, maximum: 1 });
  let missingFree = false, badRead = false, badWrite = false, freedBadAlloc = false;
  try { B.memoryPort({ memory, alloc: () => 0 }); }
  catch (e) { missingFree = e instanceof TypeError; }
  let freed = null;
  const bad = B.memoryPort({ memory, alloc: () => memory.buffer.byteLength + 1, free: (p, l) => { freed = [p, l]; } });
  try { bad.read(0, memory.buffer.byteLength + 1); }
  catch (e) { badRead = e instanceof RangeError; }
  try { bad.write([1, 2, 3]); }
  catch (e) { badWrite = e instanceof RangeError; freedBadAlloc = freed && freed[0] === memory.buffer.byteLength + 1 && freed[1] === 3; }
  const port = B.memoryPort({ memory, alloc: () => 0, free: () => {} });
  const zero = port.write(new Uint8Array(0));
  check("FRB-11 memory-fail-closed",
    missingFree && badRead && badWrite && freedBadAlloc && zero.release() && !zero.release(),
    "missing alloc/free, out-of-range spans, malformed writes, and zero-length spans have explicit ownership outcomes");
}

{
  const caps = B.capabilities();
  const src = fs.readFileSync(MODULE, "utf8");
  const d12 = JSON.parse(fs.readFileSync(D12_EVIDENCE, "utf8"));
  check("FRB-12 capability-claim-boundary",
    caps.wasm === true && caps.memory32 === true &&
    typeof caps.memory64 === "boolean" &&
    !/d12\.profile|ExperimentalRuntime|wasm128|wasm256/i.test(src) &&
    String(d12.boundary.browser_runtime_bridge).includes("not implemented"),
    "capabilities are detected, not asserted; FRB1 does not claim D12 host execution or standard wasm128/wasm256");
}

{
  const html = fs.readFileSync(DESKTOP, "utf8");
  const wireIdx = html.indexOf("assets/fano-wire.js");
  const bridgeIdx = html.indexOf("assets/fano-runtime-bridge.js");
  const commsIdx = html.indexOf("assets/fano-comms.js");
  const qpIdx = html.indexOf("assets/quplink.js");
  const qp = fs.readFileSync(QUIPLINK, "utf8");
  check("FRB-13 desk-integration",
    wireIdx >= 0 && bridgeIdx > wireIdx && commsIdx > bridgeIdx && qpIdx > bridgeIdx &&
    qp.includes("sandboxRuntimeBridge") && qp.includes("FANO_RUNTIME_BRIDGE"),
    "desk loads FANO_WIRE → FANO_RUNTIME_BRIDGE → comms/Quplink, and Quplink exposes the envelope sandbox");
}

const failures = results.filter(r => !r.ok);
const artifact = {
  schema: "FANO-RUNTIME-BRIDGE-AUDIT-v1",
  component: "site/assets/fano-runtime-bridge.js",
  generated: new Date().toISOString(),
  contract: {
    magic: "FRB1",
    header_bytes: B.HEADER_BYTES,
    fragment_body_cap: B.BODY_CAP,
    max_fragments: B.MAX_FRAGMENTS,
    outer_wire: "FANO-WIRE 136-byte canonical sealed integrity datagram",
    lanes: { host: 0, edge: 1, heavy: 2 },
    ownership: "copy-in/copy-out snapshots; transfer-capable wires; wipe before free; double-release refused",
    d12_boundary: "upstream host SDK remains external; FRB1 is not a D12 execution claim",
  },
  checks: results,
  verdict: failures.length === 0 ? "GREEN" : "FAIL",
};
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`fano-runtime-bridge report → ${OUT}`);
}
console.log(`\n${failures.length === 0 ? "FANO-RUNTIME-BRIDGE: all checks green" : `FANO-RUNTIME-BRIDGE: ${failures.length} FAILURE(S)`}`);
process.exit(failures.length === 0 ? 0 : 1);
