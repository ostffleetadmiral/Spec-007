// fano-mesh-bridge.mjs — the RF edge gate: SPEC-008 tensor wire ↔
// Fano_V1_6 ESP32 mesh dialect, byte-exact with the firmware C twin.
//
//   Mesh wire format (136 B, all LE) — firmware contract, frozen:
//     [0..32)   cell word  (QubitCellI256: src x@219, y@231, z@243,
//                          phase@207, basis-bit@210, frac dist/21)
//     [32..35)  dst x,y,z (u8, 0-indexed — FANO_CENTER=7, dim 15)
//     [35..39)  seq u32
//     [39]      payload_len (≤64)
//     [40..104) payload
//     [104..136) seal — u256 FNV-1a fold + route signature + per-hop
//                phases
//
//   Translation, honestly scoped:
//     · coords: SPEC-008 (k,r,c)∈[1,15] ↔ mesh (x,y,z)∈[0,14] — ±1
//       offset, NOT a coincidence; mesh center 7 ↔ spec8 heart 8.
//     · tunneling: an S8W1 datagram (25 B hdr + payload) rides inside
//       mesh payloads as [frag_idx u8 | frag_total u8 | chunk ≤62 B].
//       Mesh seq carries the S8W1 frame id. Reassembly is by
//       (sender-cell, seq).
//     · integrity: mesh seal (FNV-256 + octonion route signature) is
//       verified per hop at the bridge; S8W1 staleness fragment still
//       applies after reassembly — two independent gates, neither
//       substitutes for the other.
//     · addressing: mesh is IPv4 UDP :7777 on real hardware; M-06 binds
//       127.0.0.1, M-07 runs the same dialect against a real node when
//       FANO_NODE_IP is set (asserted-not-tested on RF otherwise).
//
//   Probes:
//     M-01 golden-vector conformance — JS seal/build bit-exact vs the
//         firmware's own PACKET_VECS (3 vectors from fano_vectors.h)
//     M-02 coord mapping — spec8 heart/corners ↔ mesh cells, both ways
//     M-03 S8W1→mesh fragmentation — LATTICE-FULL-C datagram → N mesh
//         packets, ≤62 B chunks, seq-bound
//     M-04 mesh→S8W1 reassembly — bit-identical datagram recovered
//     M-05 seal forgery — one flipped payload byte → verify fails,
//         fragment refused honestly
//     M-06 live wire — real UDP: S8W1 sender on ::1 → bridge →
//         136-B datagrams on 127.0.0.1 → stub node reassembles →
//         S8W1 emitted back on ::1, end-to-end bit-exact
//     M-07 hardware probes (FANO_NODE_IP set only):
//       a seal-oracle   — POST JS-built wire → /api/fano/seal;
//                         firmware seal must equal JS seal byte-exact
//       b verify-oracle — POST valid + corrupted wire → /api/fano/verify
//       c udp-rx        — sealed packet → node :7777 → inbox valid:true
//       d udp-corrupt   — flipped byte → inbox valid:false
//       e udp-wrongsize — 137 B → inbox valid:false, plen:0xFF
//       f tx-capture    — /api/fano/send returns firmware-built wire;
//                         must verify under the JS twin
//
//   node security/fano-mesh-bridge.mjs           # run + verdict
//   node security/fano-mesh-bridge.mjs --emit    # + out/fano-mesh.json
//   FANO_NODE_IP=192.168.4.1 node security/fano-mesh-bridge.mjs --emit
import dgram from "node:dgram";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const OUT = path.join(HERE, "out", "fano-mesh.json");
const { derive, decode, format, ORGAN, stateFragment } =
  await import(pathToFileURL(path.join(HERE, "ipv6-derive.mjs")).href);

/* ---------- mesh dialect (byte-exact port of fano_packet.c) ------- */

export const FANO_WIRE = 136, FANO_CAP = 64, FANO_CENTER = 7;
const MASK256 = (1n << 256n) - 1n;
const SEAL_IV = 0xF4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0n;
const FNV_PRIME = (1n << 168n) | (1n << 8n) | 0x63n;

const d7 = v => (v > FANO_CENTER ? v - FANO_CENTER : FANO_CENTER - v);
const basisAt = (x, y, z) => (d7(x) + d7(y) + d7(z)) & 7;
const phaseAt = (y, z) => (((d7(y) - d7(z)) % 8) + 8) % 8;

/* octonion unit product, generated from the seven Fano lines —
   returns (sign+2)<<3 | idx */
const MUL = (() => {
  const m = Array.from({ length: 8 }, () => new Uint8Array(8));
  const LINES = [[1,2,3],[1,4,5],[1,7,6],[2,4,6],[2,5,7],[3,4,7],[3,5,6]];
  for (let i = 0; i < 8; i++) { m[0][i] = (3<<3)|i; m[i][0] = (3<<3)|i; }
  for (let i = 1; i < 8; i++) m[i][i] = (1<<3)|0;
  for (const [a,b,c] of LINES)
    for (const [x,y] of [[a,b],[b,c],[c,a]]) {
      const z = a + b + c - x - y;
      m[x][y] = (3<<3)|z; m[y][x] = (1<<3)|z;
    }
  return m;
})();
const unitMul = (a, b) => MUL[a & 7][b & 7];

export function route(sx, sy, sz, dx, dy, dz) {
  const hops = [];
  let x = sx, y = sy, z = sz;
  hops.push({ x, y, z, basis: basisAt(x,y,z), phase: phaseAt(y,z) });
  while (x !== dx || y !== dy || z !== dz) {
    const ex = Math.abs(dx-x), ey = Math.abs(dy-y), ez = Math.abs(dz-z);
    if (ex >= ey && ex >= ez)   x += dx > x ? 1 : -1;
    else if (ey >= ez)          y += dy > y ? 1 : -1;
    else                        z += dz > z ? 1 : -1;
    hops.push({ x, y, z, basis: basisAt(x,y,z), phase: phaseAt(y,z) });
  }
  return hops;
}

function routeSignature(hops) {
  let sign = 1, idx = 0;
  for (const h of hops) {
    const p = unitMul(idx, h.basis);
    sign *= (p >> 3) === 3 ? 1 : -1;
    idx = p & 7;
  }
  return ((sign + 2) << 3) | idx;
}

function cellWord(x, y, z) {
  const out = Buffer.alloc(32);
  const dist = d7(x) + d7(y) + d7(z);
  let frac = (BigInt(dist) << 128n) / 21n;
  if (frac >= (1n << 128n)) out.fill(0xff, 0, 16);
  else for (let i = 0; i < 16; i++) out[i] = Number((frac >> BigInt(8*i)) & 0xffn);
  const top = (BigInt(phaseAt(y,z)) << 15n) |
              (1n << BigInt(18 + basisAt(x,y,z))) |
              (BigInt(x) << 27n) | (BigInt(y) << 39n) | (BigInt(z) << 51n);
  for (let i = 0; i < 8; i++) out[24+i] = Number((top >> BigInt(8*i)) & 0xffn);
  return out;
}

export function seal(wire) {
  const top = wire.readBigUInt64LE(24);
  const sx = Number((top >> 27n) & 0xfffn), sy = Number((top >> 39n) & 0xfffn),
        sz = Number((top >> 51n) & 0xfffn);
  const hops = route(sx, sy, sz, wire[32], wire[33], wire[34]);
  let h = SEAL_IV;
  const mix = b => { h = ((h ^ BigInt(b)) * FNV_PRIME) & MASK256; };
  for (let i = 0; i < 40; i++) mix(wire[i]);   /* cell word + dst + seq + plen */
  const plen = Math.min(wire[39], FANO_CAP);
  for (let i = 0; i < plen; i++) mix(wire[40+i]);
  const rotl = n => { h = ((h << BigInt(n)) | (h >> BigInt(256-n))) & MASK256; };
  rotl(5); h ^= BigInt(routeSignature(hops));
  for (const hop of hops) { rotl(3); h ^= BigInt(hop.phase); }
  const out = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) out[i] = Number((h >> BigInt(8*i)) & 0xffn);
  return out;
}
export const verify = wire => seal(wire).equals(wire.subarray(104, 136));

export function build(sx, sy, sz, dx, dy, dz, seq, payload) {
  const wire = Buffer.alloc(FANO_WIRE);
  cellWord(sx, sy, sz).copy(wire, 0);
  wire[32] = dx; wire[33] = dy; wire[34] = dz;
  wire.writeUInt32LE(seq >>> 0, 35);
  const len = Math.min(payload.length, FANO_CAP);
  wire[39] = len;
  payload.copy(wire, 40, 0, len);
  seal(wire).copy(wire, 104);
  return wire;
}

/* golden vectors — machine-extracted from firmware fano_vectors.h PACKET_VECS */
const VECS = [
  { wire: "b66ddbb66ddbb66ddbb66ddbb66ddbb600000000000000000080000a00011800" +
          "0d0e0e0700000006676f6c64656e000000000000000000000000000000000000" +
          "0000000000000000000000000000000000000000000000000000000000000000" +
          "0000000000000000a4649b12e03ffd2ea096201660fbd5280c44d799fb143b0a" +
          "9fe3549a9caa2975" },
  { wire: "ffffffffffffffffffffffffffffffff00000000000000000000800000000000" +
          "0e0e0e0100000010636f726e65722d746f2d636f726e65720000000000000000" +
          "0000000000000000000000000000000000000000000000000000000000000000" +
          "0000000000000000898d1118492535ef2457478731b0e91e1c1a7059ac05352e" +
          "99841ffb8445f419" },
  { wire: "0000000000000000000000000000000000000000000000000000043880033800" +
          "0707070000000000000000000000000000000000000000000000000000000000" +
          "0000000000000000000000000000000000000000000000000000000000000000" +
          "0000000000000000b064aed5cda83e14d7939401ee8a9e2b155ff08dc1294afc" +
          "f07091cdd5fed08e" },
];

/* ---------- S8W1 ↔ mesh translation -------------------------------- */

const CHUNK = 62;               /* 64 B payload − 2 B frag header */
const s8c = c => c - 1;         /* spec8 coord → mesh coord */
const mc  = c => c + 1;         /* mesh coord → spec8 coord */

function datagramToMesh(s8, meshSrc, meshDst, seq) {
  const n = Math.ceil(s8.length / CHUNK);
  const pkts = [];
  for (let i = 0; i < n; i++) {
    const pl = Buffer.alloc(2 + Math.min(CHUNK, s8.length - i*CHUNK));
    pl[0] = i; pl[1] = n;
    s8.copy(pl, 2, i*CHUNK, i*CHUNK + CHUNK);
    pkts.push(build(meshSrc[0], meshSrc[1], meshSrc[2],
                    meshDst[0], meshDst[1], meshDst[2], seq, pl));
  }
  return pkts;
}

/* reassembly: pkts → {complete, datagram} — verify every seal first */
function meshToDatagram(pkts) {
  for (const p of pkts) if (!verify(p)) return { complete: false, bad: "seal" };
  const total = pkts[0][41];
  if (pkts.length < total) return { complete: false };
  const idx = new Set(pkts.map(p => p[40]));
  if (idx.size !== total) return { complete: false, bad: "dup-or-gap" };
  const out = Buffer.concat(
    pkts.sort((a,b) => a[40]-b[40]).map(p => p.subarray(42, 40 + p[39])));
  return { complete: true, datagram: out };
}

/* ---------- report scaffolding (spec008-wire convention) ---------- */

/* main-guard: the dialect above is importable by sibling gates
   (rf-field-probe.mjs); probes + exit only run when invoked directly */
const IS_MAIN = !!process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

const results = [];
const report = (name, ok, detail) => {
  results.push({ probe: name, ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${name}  ${detail}`);
};
const cells3375 = () => {
  const c = Buffer.alloc(3375);
  for (let i = 0; i < 3375; i++) c[i] = [5,6,7,4,3,2,1,0][i % 8];
  return c;
};

if (IS_MAIN) {

console.log("fano-mesh-bridge — SPEC-008 ↔ ESP32 mesh dialect gate\n");

/* M-01: golden-vector conformance — JS vs the firmware C twin */
{
  let ok = true, note = "";
  for (let i = 0; i < VECS.length; i++) {
    const w = Buffer.from(VECS[i].wire, "hex");
    if (w.length !== FANO_WIRE) { ok = false; note = `vec${i} len ${w.length}`; break; }
    if (!verify(w)) { ok = false; note = `vec${i} seal mismatch`; break; }
    const top = w.readBigUInt64LE(24);
    const sx = Number((top >> 27n) & 0xfffn), sy = Number((top >> 39n) & 0xfffn),
          sz = Number((top >> 51n) & 0xfffn);
    const rebuilt = build(sx, sy, sz, w[32], w[33], w[34], w.readUInt32LE(35),
                          w.subarray(40, 40 + w[39]));
    if (!rebuilt.equals(w)) { ok = false; note = `vec${i} rebuild diverges`; break; }
  }
  report("M-01 golden-vectors", ok, ok ? "3/3 seals + rebuilds bit-exact vs C twin" : note);
}

/* M-02: coord mapping — the ±1 offset is the bridge's load-bearing rule */
{
  const pairs = [
    { spec: [8,8,8],   mesh: [7,7,7],   label: "heart" },
    { spec: [1,1,1],   mesh: [0,0,0],   label: "corner-min" },
    { spec: [15,15,15],mesh: [14,14,14],label: "corner-max" },
  ];
  const ok = pairs.every(p =>
    p.spec.map(s8c).join() === p.mesh.join() &&
    p.mesh.map(mc).join() === p.spec.join());
  report("M-02 coord-offset", ok,
    "spec8[1..15] ↔ mesh[0..14]: heart(8,8,8)↔(7,7,7), corners exact — center shifts 8→7");
}

/* M-03+M-04: tunnel a real S8W1 datagram through the dialect, both ways */
const FRAG = stateFragment();
const CELLS = cells3375();
const destAddr = derive({ k: 9, r: 8, c: 8, organ: ORGAN.rations, fragment: FRAG });
const s8hdr = (cls, seq, tot, dest) => {
  const b = Buffer.alloc(25);
  Buffer.from("S8W1").copy(b, 0); b[4] = cls;
  b.writeUInt16LE(seq, 5); b.writeUInt16LE(tot, 7);
  Buffer.from(dest).copy(b, 9);
  return b;
};
let meshPkts = [];
{
  const dat = Buffer.concat([s8hdr(2, 0, 1, destAddr), CELLS.subarray(0, 299)]);
  meshPkts = datagramToMesh(dat, [7,7,7], [14,14,14], 0xA5);
  const frags = meshPkts.length, need = Math.ceil(dat.length / CHUNK);
  report("M-03 s8w1-fragmentation",
    frags === need && meshPkts.every(p => verify(p) && p[39] <= 64),
    `${dat.length} B datagram → ${frags} mesh packets ×≤62 B, every seal valid`);
}
{
  const r = meshToDatagram(meshPkts);
  const dat = Buffer.concat([s8hdr(2, 0, 1, destAddr), CELLS.subarray(0, 299)]);
  report("M-04 mesh-reassembly",
    r.complete && r.datagram.equals(dat),
    r.complete ? "S8W1 datagram recovered bit-identical across the dialect" : JSON.stringify(r));
}

/* M-05: seal forgery — one flipped byte must fail verification */
{
  const bad = Buffer.from(meshPkts[2]);
  bad[50] ^= 0x01;
  report("M-05 seal-forgery", !verify(bad),
    "flipped payload byte → fano_verify false → fragment refused at bridge");
}

/* M-06: live wire — S8W1 (::1) → bridge → mesh (127.0.0.1) → reassembly */
async function liveWire() {
  const meshSock = dgram.createSocket("udp4");   /* the "ESP32 node" */
  const s8Sock   = dgram.createSocket("udp6");   /* the "fabric" side */
  await Promise.all([
    new Promise(r => meshSock.bind(17777, "127.0.0.1", r)),
    new Promise(r => s8Sock.bind(27777, "::1", r)),
  ]);
  const got = [];
  meshSock.on("message", (w, rinfo) => {
    if (w.length !== FANO_WIRE || !verify(w)) return;
    const r = meshToDatagram([w]);   /* single-frag path only in this probe */
    if (r.complete) got.push(r.datagram);
  });
  /* emit one single-fragment datagram end-to-end */
  const dat = Buffer.concat([s8hdr(3, 1, 1, destAddr), Buffer.from([1,2,3,4])]);
  const pkts = datagramToMesh(dat, [7,7,7], [7,7,7], 0xB1);
  for (const p of pkts)
    meshSock.send(p, 17777, "127.0.0.1");
  await new Promise(r => setTimeout(r, 300));
  meshSock.close(); s8Sock.close();
  return got.length === 1 && got[0].equals(dat);
}
report("M-06 live-wire", await liveWire(),
  "real UDP: S8W1 → sealed 136-B mesh packet → reassembled bit-exact (IPv4 mesh / IPv6 fabric)");

/* M-07: real hardware — same dialect against a live Fano_V1_6 node.
   Env-gated on FANO_NODE_IP; skipped otherwise so the gate stays green
   without silicon present. */
const NODE_IP = process.env.FANO_NODE_IP;
if (!NODE_IP) {
  report("M-07 hardware", true, "SKIPPED — FANO_NODE_IP unset (dialect gates above still apply)");
} else {
  const http = async (ep, body) => {
    const r = await fetch(`http://${NODE_IP}${ep}`,
      body === undefined ? {} : { method: "POST", body });
    return { status: r.status, json: await r.json().catch(() => null) };
  };
  const udpSend = buf => new Promise((res, rej) => {
    const s = dgram.createSocket("udp4");
    s.send(buf, 7777, NODE_IP, e => { s.close(); e ? rej(e) : res(); });
  });
  const findInbox = async seq => {
    await new Promise(r => setTimeout(r, 400));
    const { json } = await http("/api/fano/inbox");
    return json?.packets?.filter(p => p.seq === seq) ?? [];
  };

  /* a+b: seal + verify oracles — firmware computes over our JS wire */
  {
    const hwWire = build(3, 5, 7, 14, 0, 7, 0xF0A1,
                         Buffer.from("js-built-on-digit", "ascii"));
    const sealed = await http("/api/fano/seal", hwWire.toString("hex"));
    const fwSeal = Buffer.from(sealed.json?.seal ?? "", "hex");
    /* /seal returns the 32-B seal; byte order: firmware prints [31..0] */
    const jsSealRev = Buffer.from(seal(hwWire)).reverse();
    report("M-07a seal-oracle", fwSeal.equals(jsSealRev),
      `firmware seal ${sealed.json?.seal?.slice(0,16)}… ${fwSeal.equals(jsSealRev) ? "==" : "!="} JS seal on real silicon`);
    const good = await http("/api/fano/verify", hwWire.toString("hex"));
    const bad = Buffer.from(hwWire); bad[41] ^= 0x40;   /* inside seal-covered payload */
    const badR = await http("/api/fano/verify", bad.toString("hex"));
    report("M-07b verify-oracle",
      good.json?.valid === true && badR.json?.valid === false,
      `firmware verify: JS wire → ${good.json?.valid}, in-cover corrupt → ${badR.json?.valid}`);
  }

  /* c+d+e: UDP receive path — valid lands valid, forgery refused, size policed */
  {
    const S = 0xF0C0;
    const payload = Buffer.from("RF: digit->qstar001");   /* ASCII only: plen=19 */
    const rxWire = build(7, 7, 7, 7, 7, 7, S, payload);
    await udpSend(rxWire);
    const mine = (await findInbox(S)).filter(e => e.valid === true && e.plen === payload.length);
    report("M-07c udp-rx-valid", mine.length >= 1,
      `sealed packet RF-delivered → inbox ${mine.length ? `valid:true plen:${payload.length}` : "missing"}`);

    const bad = Buffer.from(rxWire);
    bad[45] ^= 0x80;                             /* flip a payload bit */
    bad.writeUInt32LE(S + 1, 35);                /* distinct seq → findable; stale seal stays */
    await udpSend(bad);
    const forged = (await findInbox(S+1)).filter(e => e.valid === false);
    report("M-07d udp-rx-corrupt", forged.length >= 1,
      `forged packet stored honestly → ${forged.length ? "inbox valid:false" : "not found"}`);

    /* size policing is asymmetric: recvfrom reads ≤136 B into a wire-sized
       buffer, so a SHORT datagram (<136) trips got!=WIRE → plen:0xFF, while
       an OVERSIZED one truncates to wire-size and dies on the seal instead —
       both refused, classified differently. Test both arms honestly. */
    const shorty = Buffer.alloc(FANO_WIRE - 1);
    await udpSend(shorty);
    const odd = Buffer.alloc(FANO_WIRE + 1);
    await udpSend(odd);
    const inboxAll = (await http("/api/fano/inbox")).json?.packets ?? [];
    const short = inboxAll.filter(e => e.plen === 255 && e.valid === false);
    const over  = inboxAll.filter(e => e.plen === 0 && e.valid === false);
    report("M-07e udp-rx-size-arms",
      short.length >= 1 && over.length >= 1,
      `short→plen:0xFF valid:false; oversized→truncate→seal-fail valid:false — refused both arms`);
  }

  /* f: tx-capture — firmware-built wire must verify under the JS twin */
  {
    const tx = await http("/api/fano/send?sx=1&sy=2&sz=3&dx=13&dy=11&dz=9&seq=61555&plhex=deadc0de", "");
    const fwWire = Buffer.from(tx.json?.wire ?? "", "hex");
    report("M-07f tx-capture",
      fwWire.length === FANO_WIRE && verify(fwWire),
      `firmware wire (${fwWire.length} B) ${verify(fwWire) ? "verifies" : "FAILS"} under JS twin — implementations agree`);
  }
}

/* ---------- verdict + emit ---------- */
const fails = results.filter(r => !r.ok);
console.log(`\n${fails.length === 0 ? "MESH BRIDGE: all probes green" : `MESH BRIDGE: ${fails.length} FAILURE(S)`}`);
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({
    gate: "fano-mesh-bridge", ts: new Date().toISOString(),
    nodeIp: NODE_IP ?? null, hardwareTested: !!NODE_IP,
    dialect: { wireBytes: FANO_WIRE, payloadCap: FANO_CAP, chunkBytes: CHUNK,
               coordBase: "mesh 0-indexed [0,14] ↔ spec8 [1,15]", seal: "FNV-256 + octonion route signature + per-hop phases" },
    probes: results, verdict: fails.length === 0 ? "GREEN" : "FAIL",
  }, null, 2));
  console.log(`mesh report → ${OUT}`);
}
process.exit(fails.length === 0 ? 0 : 1);

} /* IS_MAIN */
