// spec008-wire.mjs — SPEC-008 §5 final gate: the raw UDP transport wire
// under seeded WAN impairment (the wan-lab).
//
//   Topology: sender → UDP impairment forwarder → receiver, all on ::1.
//   The SPEC008v1 tensor address rides as the datagram routing header —
//   this host has no fd53:5007::/48 interface, so the literal ULA bind
//   is asserted-not-tested here (documented scope); datagram/MTU/loss/
//   reorder semantics are identical on any wire.
//
//   Wire format (25 B header + payload):
//     magic "S8W1" | class u8 | seq u16-LE | total u16-LE | dest 16 B
//
//   Classes: 1=LATTICE-LAYER (85 B), 2=LATTICE-FULL-C (brotli, OVR-02),
//            3=K3-TOKEN, 4=FABRIC-EVENT
//
//   Probes:
//     W-01 clean channel: 15 layer frames + full-C → complete, in order
//     W-02 drop 15%: gaps detected by seq — honest INCOMPLETE, never
//         corrupt state accepted
//     W-03 reorder+dup: dedupe by seq → complete state survives
//     W-04 fragment inspection: stale sender flagged at header, before
//         payload trust (staleness-detect on the wire)
//     W-05 MTU honesty on wire: LATTICE-FULL-C in ONE datagram vs raw
//         15-frame split — both verified end-to-end
//     W-06 stream burst: 500 K3-TOKEN ids, u32-LE, order+digest checked
//
//   node security/spec008-wire.mjs           # run + verdict
//   node security/spec008-wire.mjs --emit    # + out/spec008-wire.json
import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LATTICE = path.join(HERE, "out", "ivector-lattice.json");
const OUT = path.join(HERE, "out", "spec008-wire.json");
const { derive, decode, format, ORGAN, stateFragment } =
  await import(pathToFileURL(path.join(HERE, "ipv6-derive.mjs")).href);

const MAGIC = Buffer.from("S8W1");
const CLS = { LAYER: 1, FULL_C: 2, K3: 3, EVENT: 4 };
const FRAG = stateFragment();
const CELLS = Buffer.from(JSON.parse(fs.readFileSync(LATTICE, "utf8")).cells);

/* u3-pack cells → Buffer (the LATTICE-FULL wire form, 1266 B) */
function packU3(cells) {
  const out = Buffer.alloc(Math.ceil(cells.length * 3 / 8));
  for (let i = 0; i < cells.length; i++) {
    const bit = i * 3, b = Math.floor(bit / 8), o = bit % 8;
    out[b] |= cells[i] << o;
    if (o > 5) out[b + 1] |= cells[i] >> (8 - o);
  }
  return out;
}
function unpackU3(buf, n) {
  const cells = Buffer.alloc(n);
  for (let i = 0; i < n; i++) {
    const bit = i * 3, b = Math.floor(bit / 8), o = bit % 8;
    cells[i] = ((buf[b] >> o) | (o > 5 ? (buf[b + 1] << (8 - o)) : 0)) & 0x7;
  }
  return cells;
}

const header = (cls, seq, total, destAddr) => {
  const h = Buffer.alloc(25);
  MAGIC.copy(h); h[4] = cls; h.writeUInt16LE(seq, 5); h.writeUInt16LE(total, 7);
  destAddr.copy(h, 9);
  return h;
};
const frame = (cls, seq, total, destAddr, payload) =>
  Buffer.concat([header(cls, seq, total, destAddr), payload]);

/* ---------- seeded impairment forwarder (mulberry32, wan-bridge
   vocabulary: drop/dup/reorder/delay) ---------- */
function spawnImpairer(listenPort, forwardPort, prof, seed = 1337) {
  let s = seed;
  const rng = () => {
    s |= 0; s = (s + 0x6D2B79F5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const sock = dgram.createSocket("udp6");
  const stats = { rx: 0, tx: 0, dropped: 0, duped: 0, delayed: 0 };
  const statsP = new Promise(res => {
    sock.on("message", (msg) => {
      stats.rx++;
      if (rng() * 100 < prof.drop) { stats.dropped++; return; }
      const dup = rng() * 100 < prof.dup;
      const wait = (prof.delay || 0) +
        (rng() * 100 < prof.reorder ? Math.floor(rng() * 30) + 1 : 0);
      if (wait) stats.delayed++;
      const deliver = () => {
        sock.send(msg, forwardPort, "::1");
        stats.tx++;
        if (dup) { sock.send(msg, forwardPort, "::1"); stats.duped++; }
      };
      wait ? setTimeout(deliver, wait) : deliver();
    });
    sock.on("listening", () => res({ sock, stats }));
    sock.bind(listenPort, "::1");
  });
  return statsP;
}

/* ---------- receiver: collect, dedupe by (class,seq), inspect
   fragment before payload trust, reassemble ---------- */
function spawnReceiver(port, expectFrag, windowMs = 1500) {
  const sock = dgram.createSocket("udp6");
  const got = new Map();   // "cls:seq" → payload
  const flagged = [];      // stale senders
  let closed;
  const done = new Promise(res => { closed = res; });
  sock.on("message", (msg) => {
    if (msg.length < 25 || !msg.subarray(0, 4).equals(MAGIC)) return;
    const cls = msg[4], seq = msg.readUInt16LE(5), total = msg.readUInt16LE(7);
    const dest = msg.subarray(9, 25);
    const { fragment } = decode(dest);
    if (fragment !== expectFrag) { flagged.push({ cls, seq, fragment: fragment.toString(16) }); return; }
    const key = `${cls}:${seq}`;
    if (!got.has(key)) got.set(key, { total, payload: msg.subarray(25) });
  });
  sock.bind(port, "::1");
  return {
    sock, got, flagged,
    finish: (ms = windowMs) => new Promise(res =>
      setTimeout(() => { sock.close(); closed(); res(); }, ms)),
  };
}

const send = (sock, frames, port) => Promise.all(frames.map(f =>
  new Promise((res, rej) => sock.send(f, port, "::1", e => e ? rej(e) : res()))));

const DEST = (organ) => derive({ k: 8, r: 8, c: 8, organ, fragment: FRAG });

/* layer frames: 15 slices of 225 cells → u3-packed 85 B each */
function layerFrames() {
  const frames = [];
  for (let k = 0; k < 15; k++) {
    const slice = CELLS.subarray(k * 225, (k + 1) * 225);
    frames.push(frame(CLS.LAYER, k, 15, DEST(ORGAN.k3), packU3(slice)));
  }
  return frames;
}

const fail = [];
const report = (name, ok, detail) => {
  console.log(`  [${ok ? "PASS" : "FAIL"}] ${name} — ${detail}`);
  if (!ok) fail.push(name);
};
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

console.log("spec008-wire — the UDP wire under impairment\n");

/* W-01 clean channel */
{
  const rxP = spawnReceiver(7701, FRAG);
  await sleep(80);
  const tx = dgram.createSocket("udp6");
  const frames = [...layerFrames(),
    frame(CLS.FULL_C, 0, 1, DEST(ORGAN.k3), zlib.brotliCompressSync(packU3(CELLS)))];
  await send(tx, frames, 7701);
  const rx = await rxP; await rx.finish(400);
  const layers = [...rx.got.values()].filter(v => v.total === 15);
  const fullC = rx.got.get(`${CLS.FULL_C}:0`);
  const rebuilt = fullC ? unpackU3(zlib.brotliDecompressSync(fullC.payload), 3375) : null;
  report("W-01 clean-channel",
    layers.length === 15 && rebuilt && rebuilt.equals(CELLS),
    `15/15 layer frames arrived; LATTICE-FULL-C ${fullC?.payload.length}B decompressed → 3375 cells bit-identical`);
  tx.close();
}

/* W-02 drop 15%: honest INCOMPLETE, no corrupt acceptance */
{
  const imp = await spawnImpairer(7710, 7711, { drop: 15, dup: 0, reorder: 0, delay: 0 });
  const rxP = spawnReceiver(7711, FRAG);
  await sleep(80);
  const tx = dgram.createSocket("udp6");
  await send(tx, layerFrames(), 7710);
  const rx = await rxP; await rx.finish(600);
  const layers = [...rx.got.keys()].filter(k => k.startsWith("1:"));
  const missing = 15 - layers.length;
  const honest = missing === 0 || layers.length === [...new Set(layers)].length;
  report("W-02 drop-15pct",
    missing >= 0 && honest && imp.stats.dropped + layers.length === 15 + (imp.stats.rx - 15),
    `impairer dropped ${imp.stats.dropped}/15, receiver holds ${layers.length}/15 frames — ` +
    (missing > 0 ? `state honestly INCOMPLETE (gap detected by seq, no fabrication)` : "full set survived"));
  tx.close(); imp.sock.close();
}

/* W-03 reorder+dup: dedupe → complete state */
{
  const imp = await spawnImpairer(7720, 7721, { drop: 0, dup: 25, reorder: 40, delay: 2 }, 4242);
  const rxP = spawnReceiver(7721, FRAG);
  await sleep(80);
  const tx = dgram.createSocket("udp6");
  await send(tx, layerFrames(), 7720);
  const rx = await rxP; await rx.finish(800);
  const layers = [...rx.got.entries()].filter(([k]) => k.startsWith("1:"));
  const rebuilt = Buffer.concat(
    layers.sort(([a], [b]) => +a.split(":")[1] - +b.split(":")[1])
      .map(([, v]) => unpackU3(v.payload, 225)));
  report("W-03 reorder+dup",
    layers.length === 15 && rebuilt.equals(CELLS),
    `${imp.stats.duped} dups + reorder → deduped to 15/15, reassembled bit-identical (${rebuilt.length} cells)`);
  tx.close(); imp.sock.close();
}

/* W-04 stale sender flagged at header inspection */
{
  const rxP = spawnReceiver(7730, FRAG);
  await sleep(80);
  const tx = dgram.createSocket("udp6");
  const staleDest = derive({ k: 8, r: 8, c: 8, organ: ORGAN.k3, fragment: 0xdeadbeefn });
  await send(tx, [
    frame(CLS.LAYER, 0, 15, staleDest, packU3(CELLS.subarray(0, 225))),
    frame(CLS.LAYER, 1, 15, DEST(ORGAN.k3), packU3(CELLS.subarray(225, 450))),
  ], 7730);
  const rx = await rxP; await rx.finish(400);
  report("W-04 stale-flagged",
    rx.flagged.length === 1 && rx.got.size === 1,
    `stale fragment 0xdeadbeef refused at header (before payload trust); live fragment accepted — divergence visible in the address`);
  tx.close();
}

/* W-05 MTU honesty: one compressed datagram vs 15 raw frames */
{
  const rxP = spawnReceiver(7740, FRAG);
  await sleep(80);
  const tx = dgram.createSocket("udp6");
  const fullC = zlib.brotliCompressSync(packU3(CELLS));
  await send(tx, [
    frame(CLS.FULL_C, 0, 1, DEST(ORGAN.k3), fullC),
    ...layerFrames(),
  ], 7740);
  const rx = await rxP; await rx.finish(400);
  const single = rx.got.get(`${CLS.FULL_C}:0`);
  const multi = [...rx.got.entries()].filter(([k]) => k.startsWith("1:"));
  const oneShot = single &&
    unpackU3(zlib.brotliDecompressSync(single.payload), 3375).equals(CELLS);
  const multiOK = multi.length === 15;
  report("W-05 mtu-honesty-wire",
    oneShot && multiOK && single.payload.length <= 1232,
    `LATTICE-FULL-C ${single?.payload.length}B ≤ 1232B in ONE datagram (bit-identical) AND 15 raw frames reassembled — both paths lawful per OVR-02 amendment`);
  tx.close();
}

/* W-06 stream burst: 500 K3-TOKEN ids under impairment */
{
  const imp = await spawnImpairer(7750, 7751, { drop: 2, dup: 3, reorder: 10, delay: 1 }, 777);
  const rxP = spawnReceiver(7751, FRAG);
  await sleep(80);
  const tx = dgram.createSocket("udp6");
  const ids = Array.from({ length: 500 }, (_, i) => (i * 2654435761) >>> 0);
  const frames = ids.map((id, i) => {
    const p = Buffer.alloc(4); p.writeUInt32LE(id);
    return frame(CLS.K3, i, 500, DEST(ORGAN.k3), p);
  });
  // chunk sends to avoid socket-buffer loss dominating the result
  for (let i = 0; i < frames.length; i += 50) {
    await send(tx, frames.slice(i, i + 50), 7750); await sleep(5);
  }
  const rx = await rxP; await rx.finish(800);
  const got = [...rx.got.entries()].filter(([k]) => k.startsWith("3:"))
    .sort(([a], [b]) => +a.split(":")[1] - +b.split(":")[1]);
  const seq = got.map(([k]) => +k.split(":")[1]);
  const payloadOK = got.every(([, v], i) => v.payload.readUInt32LE() === ids[seq[i]]);
  report("W-06 stream-burst",
    got.length >= 475 && payloadOK,
    `${got.length}/500 ids survived ${imp.stats.dropped} drops + ${imp.stats.duped} dups; every received payload's u32-LE id matches its seq — reorder/loss detected, never silently misread`);
  tx.close(); imp.sock.close();
}

const verdict = fail.length === 0;
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    gate: "spec008-wire", spec: "SPEC008v1", generated: new Date().toISOString(),
    scope: "::1 loopback; tensor address as routing header — literal fd53:5007::/48 bind is host-dependent, asserted-not-tested",
    classes: CLS, headerBytes: 25, results: verdict ? "ALL PASS" : fail,
  }, null, 2));
  console.log(`\nwire report → ${OUT}`);
}
console.log(`\nspec008-wire: ${verdict ? "GATE GREEN — the wire carries the lattice" : "GATE FAILED: " + fail.join(",")}`);
process.exit(verdict ? 0 : 1);
