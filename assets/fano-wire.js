/* fano-wire.js — canonical 136-byte FANO mesh datagram.
   Sealed integrity dialect, not encryption: u256 FNV-1a + octonion
   route signature + per-hop phases. Browser-safe: typed arrays only. */
(function (root) {
  "use strict";

  var WIRE = 136, CAP = 64, CENTER = 7, CHUNK = 62;
  var MASK256 = (1n << 256n) - 1n;
  var SEAL_IV = 0xF4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0F4A0n;
  var FNV_PRIME = (1n << 168n) | (1n << 8n) | 0x63n;

  function bytes(v) {
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) {
        if (!Number.isInteger(v[i]) || v[i] < 0 || v[i] > 255) return null;
      }
      return new Uint8Array(v);
    }
    return null;
  }
  function dataView(b) {
    return new DataView(b.buffer, b.byteOffset, b.byteLength);
  }
  function u8(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new RangeError(name + " must be u8");
    return v;
  }
  function u32(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new RangeError(name + " must be u32");
    return v >>> 0;
  }
  function u32le(b, off) {
    return dataView(b).getUint32(off, true);
  }
  function u64le(b, off) {
    return dataView(b).getBigUint64(off, true);
  }
  function d7(v) { return v > CENTER ? v - CENTER : CENTER - v; }
  function basisAt(x, y, z) { return (d7(x) + d7(y) + d7(z)) & 7; }
  function phaseAt(y, z) { return (((d7(y) - d7(z)) % 8) + 8) % 8; }
  function eq(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var x = 0;
    for (var i = 0; i < a.length; i++) x |= a[i] ^ b[i];
    return x === 0;
  }

  var MUL = (function () {
    var m = [], i, a, b, c, x, y, z, pairs, p;
    for (i = 0; i < 8; i++) m.push(new Uint8Array(8));
    for (i = 0; i < 8; i++) { m[0][i] = (3 << 3) | i; m[i][0] = (3 << 3) | i; }
    for (i = 1; i < 8; i++) m[i][i] = 1 << 3;
    var lines = [[1,2,3],[1,4,5],[1,7,6],[2,4,6],[2,5,7],[3,4,7],[3,5,6]];
    for (i = 0; i < lines.length; i++) {
      a = lines[i][0]; b = lines[i][1]; c = lines[i][2];
      pairs = [[a,b],[b,c],[c,a]];
      for (var j = 0; j < pairs.length; j++) {
        x = pairs[j][0]; y = pairs[j][1]; z = a + b + c - x - y;
        m[x][y] = (3 << 3) | z; m[y][x] = (1 << 3) | z;
      }
    }
    return m;
  })();
  function unitMul(a, b) { return MUL[a & 7][b & 7]; }

  function step(state, dx, dy, dz) {
    var ex = dx > state.x ? dx - state.x : state.x - dx;
    var ey = dy > state.y ? dy - state.y : state.y - dy;
    var ez = dz > state.z ? dz - state.z : state.z - dz;
    if (ex >= ey && ex >= ez) state.x += dx > state.x ? 1 : -1;
    else if (ey >= ez) state.y += dy > state.y ? 1 : -1;
    else state.z += dz > state.z ? 1 : -1;
  }
  function eachHop(sx, sy, sz, dx, dy, dz, fn) {
    var st = { x: sx, y: sy, z: sz };
    while (true) {
      fn(st.x, st.y, st.z, basisAt(st.x, st.y, st.z), phaseAt(st.y, st.z));
      if (st.x === dx && st.y === dy && st.z === dz) break;
      step(st, dx, dy, dz);
    }
  }
  function routeSignature(sx, sy, sz, dx, dy, dz) {
    var sign = 1, idx = 0;
    eachHop(sx, sy, sz, dx, dy, dz, function (x, y, z, basis) {
      var p = unitMul(idx, basis);
      sign *= (p >> 3) === 3 ? 1 : -1;
      idx = p & 7;
    });
    return ((sign + 2) << 3) | idx;
  }
  function route(sx, sy, sz, dx, dy, dz, maxHops) {
    var limit = maxHops === undefined ? 65536 : u32(maxHops, "maxHops");
    var hops = [];
    eachHop(u32(sx, "sx"), u32(sy, "sy"), u32(sz, "sz"),
      u32(dx, "dx"), u32(dy, "dy"), u32(dz, "dz"),
      function (x, y, z, basis, phase) {
        if (hops.length >= limit) throw new RangeError("route exceeds maxHops");
        hops.push({ x: x, y: y, z: z, basis: basis, phase: phase });
      });
    return hops;
  }

  function cellWord(x, y, z) {
    u8(x, "x"); u8(y, "y"); u8(z, "z");
    var out = new Uint8Array(32);
    var dist = d7(x) + d7(y) + d7(z);
    var frac = (BigInt(dist) << 128n) / 21n;
    if (frac >= (1n << 128n)) out.fill(0xff, 0, 16);
    else for (var i = 0; i < 16; i++) {
      out[i] = Number((frac >> BigInt(8 * i)) & 0xffn);
    }
    var top = (BigInt(phaseAt(y, z)) << 15n) |
      (1n << BigInt(18 + basisAt(x, y, z))) |
      (BigInt(x) << 27n) | (BigInt(y) << 39n) | (BigInt(z) << 51n);
    for (i = 0; i < 8; i++) out[24 + i] = Number((top >> BigInt(8 * i)) & 0xffn);
    return out;
  }

  function wireBytes(wire, name) {
    var b = bytes(wire);
    if (!b || b.length !== WIRE) throw new RangeError((name || "wire") + " must be 136 bytes");
    return b;
  }
  function rotl(h, n) {
    return ((h << BigInt(n)) | (h >> BigInt(256 - n))) & MASK256;
  }
  function seal(wire) {
    var b = wireBytes(wire);
    var top = u64le(b, 24);
    var sx = Number((top >> 27n) & 0xfffn);
    var sy = Number((top >> 39n) & 0xfffn);
    var sz = Number((top >> 51n) & 0xfffn);
    var dx = b[32], dy = b[33], dz = b[34];
    var h = SEAL_IV, i;
    for (i = 0; i < 40; i++) h = ((h ^ BigInt(b[i])) * FNV_PRIME) & MASK256;
    var plen = Math.min(b[39], CAP);
    for (i = 0; i < plen; i++) h = ((h ^ BigInt(b[40 + i])) * FNV_PRIME) & MASK256;
    h = rotl(h, 5) ^ BigInt(routeSignature(sx, sy, sz, dx, dy, dz));
    eachHop(sx, sy, sz, dx, dy, dz, function (x, y, z, basis, phase) {
      h = rotl(h, 3) ^ BigInt(phase);
    });
    var out = new Uint8Array(32), v = h;
    for (i = 0; i < 32; i++) { out[i] = Number(v & 0xffn); v >>= 8n; }
    return out;
  }

  function canonicalTail(wire) {
    var b = bytes(wire);
    if (!b || b.length !== WIRE || b[39] > CAP) return false;
    for (var i = 40 + b[39]; i < 104; i++) if (b[i] !== 0) return false;
    return true;
  }
  function verify(wire) {
    var b = bytes(wire);
    return !!(b && b.length === WIRE && canonicalTail(b) && eq(seal(b), b.subarray(104, 136)));
  }

  function parse(wire) {
    var b = bytes(wire);
    if (!b || b.length !== WIRE) return null;
    var top = u64le(b, 24);
    var sx = Number((top >> 27n) & 0xfffn);
    var sy = Number((top >> 39n) & 0xfffn);
    var sz = Number((top >> 51n) & 0xfffn);
    var plen = b[39];
    var out = {
      wire: b.slice(),
      cell_word: b.slice(0, 32),
      src: { x: sx, y: sy, z: sz },
      dst: { x: b[32], y: b[33], z: b[34] },
      seq: u32le(b, 35),
      plen: plen,
      payload: plen <= CAP ? b.slice(40, 40 + plen) : new Uint8Array(0),
      seal: b.slice(104, 136),
      canonical_tail: canonicalTail(b),
      in_grid: sx <= 14 && sy <= 14 && sz <= 14 && b[32] <= 14 && b[33] <= 14 && b[34] <= 14,
      valid: false,
      reason: null
    };
    if (plen > CAP) out.reason = "payload-length-out-of-range";
    else if (!out.canonical_tail) out.reason = "noncanonical-tail";
    else if (!eq(seal(b), out.seal)) out.reason = "seal-mismatch";
    else out.valid = true;
    return out;
  }

  function build(sx, sy, sz, dx, dy, dz, seq, payload) {
    var p = payload === undefined || payload === null ? new Uint8Array(0) : bytes(payload);
    if (!p) throw new RangeError("payload must be bytes");
    if (p.length > CAP) throw new RangeError("payload exceeds 64-byte capacity");
    var wire = new Uint8Array(WIRE);
    wire.set(cellWord(u8(sx, "sx"), u8(sy, "sy"), u8(sz, "sz")), 0);
    wire[32] = u8(dx, "dx"); wire[33] = u8(dy, "dy"); wire[34] = u8(dz, "dz");
    seq = u32(seq, "seq");
    dataView(wire).setUint32(35, seq, true);
    wire[39] = p.length;
    wire.set(p, 40);
    wire.set(seal(wire), 104);
    return wire;
  }

  function fromHex(hex) {
    if (typeof hex !== "string" || (hex.length & 1) || !/^[0-9a-fA-F]*$/.test(hex)) return null;
    var out = new Uint8Array(hex.length / 2);
    for (var i = 0; i < out.length; i++) out[i] = parseInt(hex.slice(i * 2, i * 2 + 2), 16);
    return out;
  }
  function toHex(b) {
    b = bytes(b) || new Uint8Array(0);
    var s = "";
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  root.FANO_WIRE = {
    WIRE_BYTES: WIRE,
    PAYLOAD_CAP: CAP,
    CENTER: CENTER,
    CHUNK_BYTES: CHUNK,
    parse: parse,
    verify: verify,
    seal: seal,
    build: build,
    cellWord: cellWord,
    route: route,
    canonicalTail: canonicalTail,
    fromHex: fromHex,
    toHex: toHex
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
