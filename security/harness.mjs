// FANO-1 security harness — headless WASM core + raw WebSocket client.
// Runs the same rations.wasm the desk runs; Node shims stand in for
// localStorage/crypto/DOM. The ws client is hand-rolled so RED can send
// deliberately malformed frames.

import fs from "node:fs";
import net from "node:net";
import http from "node:http";
import crypto from "node:crypto";

export const enc = new TextEncoder(), dec = new TextDecoder();

/* ---------- localStorage shim ---------- */
const _store = new Map();
export const localStorage = {
  getItem: (k) => (_store.has(k) ? _store.get(k) : null),
  setItem: (k, v) => void _store.set(k, String(v)),
  removeItem: (k) => void _store.delete(k),
  clear: () => _store.clear(),
};

/* ---------- wasm core ---------- */
export function loadCore(wasmPath) {
  const memory = new WebAssembly.Memory({ initial: 2048, maximum: 16384 });
  const conns = new Map();
  let nextConn = 1;
  let connCloseHook = null;
  const mem = (p, n) => new Uint8Array(memory.buffer, p, n);
  const rd = (p, n) => dec.decode(mem(p, n));
  let ex = null;

  const imp = { env: {
    memory,
    js_console_log: (p, n) => { if (process.env.HARNESS_LOG) console.log("[wasm]", rd(p, n)); },
    js_dom_set_text: () => {},
    js_dom_get_value: () => 0,
    js_local_storage_set: (kp, kn, vp, vn) => {
      try { localStorage.setItem(rd(kp, kn), rd(vp, vn)); return 1; } catch { return 0; }
    },
    js_local_storage_get: (kp, kn, op, lp) => {
      const v = localStorage.getItem(rd(kp, kn));
      if (v === null) return 0;
      const b = enc.encode(v), n = Math.min(b.length, 4096);
      mem(op, n).set(b.subarray(0, n));
      new Uint32Array(memory.buffer, lp, 1)[0] = n;
      return 1;
    },
    js_random_bytes: (p, n) => crypto.getRandomValues ? crypto.getRandomValues(mem(p, n)) : mem(p, n).set(crypto.randomBytes(n)),
    js_time_now: () => BigInt(Date.now()),
    js_ws_connect: (p, n) => {
      const url = rd(p, n), id = nextConn++;
      /* out-of-band relays enforce an Origin allowlist; nodes present a
         configured origin (browsers send theirs implicitly) */
      const opts = process.env.RATIONS_DIAL_ORIGIN ? { origin: process.env.RATIONS_DIAL_ORIGIN } : {};
      wsConnect(url, opts).then((ws) => {
        conns.set(id, ws);
        ws.onData = (buf) => {
          const ptr = ex.rations_alloc(buf.length);
          mem(ptr, buf.length).set(buf);
          ex.rations_ws_on_message(id, ptr, buf.length);
          ex.rations_free(ptr, buf.length);
        };
        ws.onClose = () => { conns.delete(id); ex.rations_ws_on_close(id); if (connCloseHook) connCloseHook(id); };
      }).catch(() => { if (connCloseHook) connCloseHook(id); });
      return id;
    },
    js_ws_send: (id, p, n) => {
      const ws = conns.get(id);
      if (!ws || ws.state !== 2) return 0;
      ws.send(mem(p, n).slice()); return 1;
    },
    js_ws_close: (id) => { const ws = conns.get(id); if (ws) { conns.delete(id); ws.close(); } },
    js_ws_state: (id) => { const ws = conns.get(id); return ws ? ws.state : 0; },
  } };

  return WebAssembly.instantiate(fs.readFileSync(wasmPath), imp).then((res) => {
    ex = res.instance.exports;
    const wr = (bytes) => {
      const p = ex.rations_alloc(bytes.length);
      if (p < 0 || p + bytes.length > memory.buffer.byteLength) throw new Error(`alloc(${bytes.length}) → ${p}`);
      mem(p, bytes.length).set(bytes); return p;
    };
    const outBuf = (n) => {
      const p = ex.rations_alloc(n);
      if (p < 0 || p + n > memory.buffer.byteLength) throw new Error(`alloc(${n}) → ${p}`);
      mem(p, n).fill(0); return p;
    };
    const u32 = (p) => new DataView(memory.buffer, p, 4).getUint32(0, true);
    return { ex, mem, rd, wr, outBuf, u32, setConnCloseHook: (f) => { connCloseHook = f; } };
  });
}

/* ---------- raw WebSocket client (RFC6455, deliberately permissive) ----------
   `sendRaw(buf)` ships arbitrary bytes — RED uses it for malformed frames. */
export function wsConnect(url, opts = {}) {
  return new Promise((resolve, reject) => {
    const u = new URL(url);
    const port = u.port ? +u.port : 80;
    const key = crypto.randomBytes(16).toString("base64");
    const sock = net.connect(port, u.hostname);
    const api = { state: 1, onData: null, onClose: null, onError: null, send, sendRaw: (b) => sock.write(b), close: () => sock.end(), socket: sock };
    let buf = Buffer.alloc(0), up = false;

    sock.on("connect", () => {
      const headers = [
        `GET ${u.pathname || "/"} HTTP/1.1`,
        `Host: ${u.host}`,
        "Upgrade: websocket", "Connection: Upgrade",
        `Sec-WebSocket-Key: ${key}`, "Sec-WebSocket-Version: 13",
      ];
      if (opts.origin !== undefined) headers.push(`Origin: ${opts.origin}`);
      if (opts.extraHeaders) headers.push(...opts.extraHeaders);
      sock.write(headers.join("\r\n") + "\r\n\r\n");
    });
    sock.on("data", (chunk) => {
      buf = Buffer.concat([buf, chunk]);
      if (!up) {
        const idx = buf.indexOf("\r\n\r\n");
        if (idx === -1) return;
        const head = buf.subarray(0, idx).toString();
        buf = buf.subarray(idx + 4);
        if (!/^HTTP\/1\.1 101/.test(head)) {
          api.state = 4; api.statusLine = head.split("\r\n")[0];
          reject(new Error("upgrade refused: " + api.statusLine));
          return;
        }
        up = true; api.state = 2; resolve(api);
      }
      drain();
    });
    sock.on("close", () => {
      api.state = 4;
      if (!up) reject(new Error("tcp closed before upgrade"));
      if (api.onClose) api.onClose(null);
    });
    sock.on("error", (e) => { api.state = 4; if (api.onError) api.onError(e); if (!up) reject(e); });
    setTimeout(() => { if (api.state === 1) { api.state = 4; sock.destroy(); reject(new Error("ws handshake timeout")); } }, 4000);

    function send(payload, opcode = 0x02) {
      const data = Buffer.isBuffer(payload) ? payload : Buffer.from(payload);
      let header;
      const len = data.length;
      const mask = crypto.randomBytes(4);
      if (len < 126) header = Buffer.from([0x80 | opcode, 0x80 | len]);
      else if (len < 65536) header = Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 126]), Buffer.alloc(2)]);
      else header = Buffer.concat([Buffer.from([0x80 | opcode, 0x80 | 127]), Buffer.alloc(8)]);
      if (len >= 126 && len < 65536) header.writeUInt16BE(len, 2);
      if (len >= 65536) header.writeBigUInt64BE(BigInt(len), 2);
      const masked = Buffer.alloc(len);
      for (let i = 0; i < len; i++) masked[i] = data[i] ^ mask[i & 3];
      sock.write(Buffer.concat([header, mask, masked]));
    }

    function drain() {
      while (buf.length >= 2) {
        const fin = (buf[0] & 0x80) !== 0, op = buf[0] & 0x0f;
        let len = buf[1] & 0x7f, off = 2;
        if (len === 126) { if (buf.length < 4) return; len = buf.readUInt16BE(2); off = 4; }
        else if (len === 127) { if (buf.length < 10) return; len = Number(buf.readBigUInt64BE(2)); off = 10; }
        if (buf.length < off + len) return;
        const payload = buf.subarray(off, off + len);
        buf = buf.subarray(off + len);
        if (op === 0x9) send(payload, 0xA);                       // ping→pong
        else if (op === 0x8) { api.state = 4; if (api.onClose) api.onClose(payload); sock.end(); }
        else if ((op === 0x1 || op === 0x2 || op === 0x0) && api.onData) api.onData(payload);
        void fin;
      }
    }
  });
}

/* raw HTTP request helper */
export function httpGet(url, headers = {}) {
  return new Promise((resolve, reject) => {
    http.get(url, { headers }, (res) => {
      let body = "";
      res.on("data", (d) => body += d);
      res.on("end", () => resolve({ status: res.statusCode, headers: res.headers, body }));
    }).on("error", reject);
  });
}

export const hex = (b) => Buffer.from(b).toString("hex");
export const unhex = (h) => new Uint8Array(Buffer.from(h, "hex"));
export const eq = (a, b) => a && b && a.length === b.length && a.every((v, i) => v === b[i]);
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
