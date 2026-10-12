#!/usr/bin/env node
/* dht-native.mjs — client for the native DHT daemon (zig-out/bin/dhtd).

   Speaks the sealed 136-B FANO wire over loopback TCP: request stream
   = [op][args], reply stream = [status][data], 63 B of stream data per
   envelope, more-flag in payload[0]. Envelope sealing via
   security/fano-mesh-bridge.mjs — wasm-dispatched when the build
   artifact exists, BigInt twin otherwise.

   Return shapes mirror tools/dht-fs.mjs exactly ({ok, record, ...}) so
   callers can swap transport without touching semantics — the JS path
   stays canonical; this is the in-process (M3) accelerator surface.

   usage:
     node tools/dht-native.mjs --selfcheck --root <store> --lanes a,b,c
     import * as N from "./dht-native.mjs"; N.open({lanes, root, port});
*/
import net from "node:net";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import { build as sealBuild, verify as sealVerify, seal } from "../security/fano-mesh-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");

export const OP = {
  ping: 0x00, stat: 0x01, lanes: 0x02, put_file: 0x03, get_file: 0x04,
  providers: 0x05, record_put: 0x06, record_get: 0x07, record_query: 0x08,
  heartbeat: 0x09,
};
export const STATUS = {
  0: "ok", 1: "not-found", 2: "tampered", 3: "sig-refused",
  4: "clearance", 5: "bad-request", 6: "store-error", 7: "oversize",
  8: "chunk-missing", 9: "bad-seal",
};

/* ---- sealed-wire transport ---- */

let _seq = 1;
/* send a request stream, collect the reply stream. src cell is a fixed
   lattice point — the daemon answers to whoever sealed the request. */
async function rpc(sock, stream, timeoutMs = 30000) {
  const FRAME = 136;
  const chunks = [];
  for (let off = 0; off < stream.length; off += 63)
    chunks.push(stream.subarray(off, off + 63));
  if (!chunks.length) chunks.push(Buffer.alloc(0));
  const out = [];
  chunks.forEach((c, i) => {
    const payload = Buffer.alloc(1 + c.length);
    payload[0] = i + 1 < chunks.length ? 1 : 0;
    c.copy(payload, 1);
    // plen must count REAL bytes — a full-64 payload pads the stream
    // with phantom zeros on the last frame (the daemon trusts wire[39]).
    out.push(Buffer.from(sealBuild(1, 1, 1, 7, 7, 7, _seq, payload)));
    _seq++;
  });
  const reply = await new Promise((res, rej) => {
    let acc = Buffer.alloc(0);
    let frames = [];
    const onErr = (e) => { clearTimeout(timer); sock.off("data", onData); rej(e); };
    const timer = setTimeout(() => {
      sock.off("data", onData);
      sock.off("error", onErr);
      rej(new Error(`dhtd rpc timeout after ${timeoutMs}ms (${frames.length} frames)`));
    }, timeoutMs);
    const onData = (d) => {
      acc = Buffer.concat([acc, d]);
      while (acc.length >= FRAME) {
        const f = acc.subarray(0, FRAME);
        acc = acc.subarray(FRAME);
        frames.push(Buffer.from(f));
      }
      // reply complete when a verified frame has more-flag 0
      const verified = frames.filter(f => sealVerify(f));
      if (verified.length && verified[verified.length - 1][40] === 0) {
        clearTimeout(timer);
        sock.off("data", onData);
        sock.off("error", onErr);
        res(verified);
      }
    };
    sock.on("data", onData);
    sock.on("error", onErr);
    sock.write(Buffer.concat(out));
  });
  const streamBuf = Buffer.concat(
    reply.map(f => f.subarray(41, 40 + Math.min(f[39], 64))));
  return streamBuf;
}

function encode(op, ...parts) {
  return Buffer.concat([Buffer.from([op]), ...parts]);
}
const u16 = n => { const b = Buffer.alloc(2); b.writeUInt16LE(n); return b; };
const u32 = n => { const b = Buffer.alloc(4); b.writeUInt32LE(n); return b; };
const u8 = n => Buffer.from([n]);
const s = t => Buffer.concat([u8(Buffer.byteLength(t)), Buffer.from(t)]);

export class Client {
  constructor(sock, lanes) { this.sock = sock; this.lanes = lanes; }

  static async connect({ port = 14661, host = "127.0.0.1", lanes = null } = {}) {
    const sock = net.connect({ host, port });
    await new Promise((res, rej) => { sock.once("connect", res); sock.once("error", rej); });
    const c = new Client(sock, null);
    if (!lanes) {
      const r = await c.rpc(encode(OP.lanes));
      lanes = [];
      if (r[0] === 0) {
        const n = r.readUInt16LE(1);
        let off = 3;
        for (let i = 0; i < n; i++) {
          const l = r[off];
          lanes.push(r.subarray(off + 1, off + 1 + l).toString());
          off += 1 + l;
        }
      }
    }
    c.lanes = lanes;
    return c;
  }
  rpc(req) { return rpc(this.sock, req); }
  close() { this.sock.end(); }

  /* put(originLane, data) — identical shape to dht-fs put() */
  async put(originLane, data) {
    const r = await this.rpc(encode(OP.put_file, u16(this.lanes.indexOf(originLane)), data));
    if (r[0] !== 0) return { ok: false, reason: STATUS[r[0]] };
    return { cid: r.subarray(1, 65).toString(),
      chunks: r.readUInt16LE(65), replicas: r[67] };
  }
  /* get(cid) — resolves the manifest + chunks natively; mirrors get() */
  async get(cid) {
    const r = await this.rpc(encode(OP.get_file, Buffer.from(cid)));
    const st = r[0];
    if (st !== 0) return { ok: false, reason: STATUS[st], cid };
    const servedBy = this.lanes[r.readUInt16LE(1)];
    const replicas = r.readUInt16LE(3);
    const tampered = r[5];
    const size = Number(r.readBigUInt64LE(6));
    return { ok: true, cid, data: r.subarray(14), size,
      servedBy, replicaLanes: replicas, tampered };
  }
  async providers(cid) {
    const r = await this.rpc(encode(OP.providers, Buffer.from(cid)));
    if (r[0] !== 0) return [];
    const n = r.readUInt16LE(1);
    const out = [];
    for (let i = 0; i < n; i++) out.push(this.lanes[r.readUInt16LE(3 + i * 2)]);
    return out;
  }
  /* recordPut(lane, kind, name, body, clearance) */
  async recordPut(lane, kind, name, body, clearance = 0) {
    const r = await this.rpc(encode(OP.record_put,
      u16(this.lanes.indexOf(lane)), u8(clearance), s(kind), s(name),
      u32(Buffer.byteLength(JSON.stringify(body))), Buffer.from(JSON.stringify(body))));
    if (r[0] !== 0) return { ok: false, reason: STATUS[r[0]] };
    return { id: r.subarray(1, 65).toString(), kind, author: lane,
      version: r.readUInt32LE(65) };
  }
  /* recordGet(id, readerClearance) — mirrors the JS recordGet shape */
  async recordGet(id, readerClearance = 7) {
    if (typeof id !== "string" || id.length !== 64)
      return { ok: false, reason: "bad-request" };
    const r = await this.rpc(encode(OP.record_get, Buffer.from(id), u8(readerClearance)));
    const st = r[0];
    if (st === 0) {
      const versions = r[1];
      const lane = this.lanes[r.readUInt16LE(2)];
      return { ok: true, record: JSON.parse(r.subarray(4).toString()),
        versions, lane };
    }
    if (st === 3) {
      const d = JSON.parse(r.subarray(1).toString());
      return { ok: false, reason: "signature", detail: d.reason };
    }
    if (st === 4) {
      const d = JSON.parse(r.subarray(1).toString());
      return { ok: false, reason: "clearance", need: d.need };
    }
    return { ok: false, reason: STATUS[st] };
  }
  async recordQuery(kind, readerClearance = 7) {
    const r = await this.rpc(encode(OP.record_query, u8(readerClearance), s(kind)));
    if (r[0] !== 0) return [];
    return JSON.parse(r.subarray(1).toString());
  }
  async heartbeat(lane) {
    await this.rpc(encode(OP.heartbeat, u16(this.lanes.indexOf(lane))));
  }
}

const IS_MAIN = !!process.argv[1] &&
  (path.resolve(process.argv[1]) === fileURLToPath(import.meta.url));

if (IS_MAIN) {
  const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
  const port = parseInt(arg("--port", "14661"), 10);
  const c = await Client.connect({ port });
  console.log(`connected — ${c.lanes.length} lanes: ${c.lanes.slice(0, 6).join(",")}…`);
  const t0 = Date.now();
  const put = await c.put(c.lanes[0], Buffer.from(`native-wire probe ${Date.now()} ${"x".repeat(140000)}`));
  const t1 = Date.now();
  const g = await c.get(put.cid);
  const t2 = Date.now();
  const prov = await c.providers(put.cid);
  const rp = await c.recordPut(c.lanes[0], "native-probe", "wire-rt", { duty: "probe", n: 1 }, 4);
  const rg = await c.recordGet(rp.id, 7);
  const t3 = Date.now();
  const rq = await c.recordQuery("native-probe", 7);
  const t4 = Date.now();
  console.log(JSON.stringify({
    put: { cid: put.cid?.slice(0, 16), chunks: put.chunks, replicas: put.replicas, ms: t1 - t0 },
    get: { ok: g.ok, bytes: g.data?.length, servedBy: g.servedBy, ms: t2 - t1 },
    providers: prov,
    record: { id: rp.id?.slice(0, 16), version: rp.version, got: rg.ok, record: rg.record?.version },
    query: rq.length,
    total_ms: t4 - t0,
  }, null, 2));
  c.close();
}
