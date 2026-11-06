/* fano-runtime-bridge.js — canonical FANO runtime bridge envelope.
   FRB1 rides inside the 136-byte FANO sealed-integrity datagram. The outer
   FANO gate is verified before any bridge field is trusted; this is a
   deterministic ownership/routing layer, not encryption or host exec. */
(function (root) {
  "use strict";

  var W = root.FANO_WIRE;
  if (!W) throw new Error("FANO_WIRE required before FANO_RUNTIME_BRIDGE");

  var HEADER = 16;
  var BODY_CAP = W.PAYLOAD_CAP - HEADER;
  var MAX_FRAGMENTS = 255;
  var LANES = { host: 0, edge: 1, heavy: 2 };
  var LANE_NAMES = ["host", "edge", "heavy"];
  var KINDS = { request: 1, response: 2, event: 3 };
  var KIND_NAMES = [null, "request", "response", "event"];

  function bytes(v, name) {
    if (v instanceof Uint8Array) return v;
    if (v instanceof ArrayBuffer) return new Uint8Array(v);
    if (Array.isArray(v)) {
      for (var i = 0; i < v.length; i++) {
        if (!Number.isInteger(v[i]) || v[i] < 0 || v[i] > 255) {
          throw new RangeError((name || "bytes") + " must be u8 bytes");
        }
      }
      return new Uint8Array(v);
    }
    if (v === undefined || v === null) return new Uint8Array(0);
    throw new RangeError((name || "bytes") + " must be u8 bytes");
  }
  function u8(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new RangeError(name + " must be u8");
    return v;
  }
  function u32(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new RangeError(name + " must be u32");
    return v >>> 0;
  }
  function lane(v, name) {
    if (typeof v === "string" && Object.prototype.hasOwnProperty.call(LANES, v)) return LANES[v];
    return u8(v, name || "lane") <= 2 ? u8(v, name || "lane") : badLane(name || "lane");
  }
  function badLane(name) { throw new RangeError(name + " must be 0..2 or a named lane"); }
  function laneName(v) { return LANE_NAMES[v] || "lane-" + v; }
  function kind(v) {
    if (typeof v === "string" && Object.prototype.hasOwnProperty.call(KINDS, v)) return KINDS[v];
    var n = u8(v, "kind");
    if (n < 1 || n > 3) throw new RangeError("kind must be request/response/event");
    return n;
  }
  function mesh(v, name) {
    var m = Array.isArray(v) ? { x: v[0], y: v[1], z: v[2] } : v;
    if (!m || typeof m !== "object") throw new RangeError((name || "mesh") + " must carry x/y/z");
    return { x: u8(m.x, (name || "mesh") + ".x"), y: u8(m.y, (name || "mesh") + ".y"), z: u8(m.z, (name || "mesh") + ".z") };
  }
  function meshEq(a, b) { return a.x === b.x && a.y === b.y && a.z === b.z; }
  function wipe(b) {
    if (!(b instanceof Uint8Array)) return false;
    b.fill(0);
    return true;
  }
  function reject(reason, parsed) {
    if (parsed && parsed.wire) wipe(parsed.wire);
    if (parsed && parsed.payload) wipe(parsed.payload);
    return { accepted: false, complete: false, reason: reason };
  }

  function buildEnvelope(opts) {
    opts = opts || {};
    var body = bytes(opts.body, "body");
    var total = opts.total === undefined ? 1 : u8(opts.total, "total");
    var index = opts.index === undefined ? 0 : u8(opts.index, "index");
    var flags = opts.flags === undefined ? 0 : u8(opts.flags, "flags");
    if (total < 1) throw new RangeError("total must be 1..255");
    if (index >= total) throw new RangeError("fragment index must be below total");
    if (body.length > BODY_CAP) throw new RangeError("FRB1 fragment body exceeds 48 bytes");
    if (flags & ~3) throw new RangeError("FRB1 flags carry only transfer|wipe bits");
    var out = new Uint8Array(HEADER + body.length);
    out[0] = 0x46; out[1] = 0x52; out[2] = 0x42; out[3] = 0x31; /* FRB1 */
    out[4] = 1;
    out[5] = kind(opts.kind);
    out[6] = lane(opts.fromLane, "fromLane");
    out[7] = lane(opts.toLane, "toLane");
    out[8] = index;
    out[9] = total;
    out[10] = body.length;
    out[11] = flags;
    out.set(body, HEADER);
    return out;
  }

  function parseEnvelope(payload) {
    var b = bytes(payload, "envelope");
    var bad = function (reason) {
      return { valid: false, reason: reason, wire: null };
    };
    if (b.length < HEADER) return bad("short-envelope");
    if (b[0] !== 0x46 || b[1] !== 0x52 || b[2] !== 0x42 || b[3] !== 0x31) return bad("not-frb1");
    if (b[4] !== 1) return bad("bad-version");
    if (b[5] < 1 || b[5] > 3) return bad("bad-kind");
    if (b[6] > 2 || b[7] > 2) return bad("bad-lane");
    if (b[9] < 1 || b[8] >= b[9]) return bad("bad-fragment");
    if (b[10] > BODY_CAP || b.length !== HEADER + b[10]) return bad("envelope-length-mismatch");
    if (b[11] & ~3) return bad("bad-flags");
    if (b[12] || b[13] || b[14] || b[15]) return bad("noncanonical-envelope");
    return {
      valid: true,
      reason: null,
      wire: b,
      kind: b[5],
      kindName: KIND_NAMES[b[5]],
      fromLane: b[6],
      fromLaneName: laneName(b[6]),
      toLane: b[7],
      toLaneName: laneName(b[7]),
      index: b[8],
      total: b[9],
      bodyLen: b[10],
      flags: b[11],
      transfer: !!(b[11] & 1),
      wipeRequested: !!(b[11] & 2),
      body: b.slice(HEADER)
    };
  }

  function endpoint(opts) {
    opts = opts || {};
    var ep = {
      lane: lane(opts.lane === undefined ? "edge" : opts.lane, "lane"),
      mesh: mesh(opts.mesh === undefined ? [7, 7, 7] : opts.mesh, "mesh"),
      seq: 0,
      onMessage: typeof opts.onMessage === "function" ? opts.onMessage : null,
      autoRelease: opts.autoRelease !== false,
      _open: {},
      _openFlow: {},
      _last: {},
    };

    ep.pack = function (dst, kindValue, bodyValue, packOpts) {
      packOpts = packOpts || {};
      var dstLane, dstMesh;
      if (dst && typeof dst === "object" && dst.mesh) {
        dstLane = dst.lane;
        dstMesh = dst.mesh;
      } else {
        dstLane = dst && typeof dst === "object" ? dst.lane : dst;
        dstMesh = dst && typeof dst === "object" ? dst.mesh : packOpts.mesh;
      }
      dstLane = lane(dstLane, "dst.lane");
      dstMesh = mesh(dstMesh, "dst.mesh");
      var body = bytes(bodyValue, "body").slice();
      var total = Math.max(1, Math.ceil(body.length / BODY_CAP));
      if (total > MAX_FRAGMENTS) throw new RangeError("body exceeds 255 FRB1 fragments");
      var seq = packOpts.seq === undefined ? ep.seq : u32(packOpts.seq, "seq");
      ep.seq = (seq + 1) >>> 0;
      var flags = (packOpts.transfer ? 1 : 0) | (packOpts.wipe ? 2 : 0);
      var out = [];
      for (var i = 0; i < total; i++) {
        var env = buildEnvelope({
          kind: kindValue,
          fromLane: ep.lane,
          toLane: dstLane,
          index: i,
          total: total,
          flags: flags,
          body: body.slice(i * BODY_CAP, Math.min(body.length, (i + 1) * BODY_CAP)),
        });
        out.push(W.build(ep.mesh.x, ep.mesh.y, ep.mesh.z, dstMesh.x, dstMesh.y, dstMesh.z, seq, env));
        wipe(env);
      }
      wipe(body);
      return out;
    };

    ep.deliver = function (input) {
      var parsed;
      try { parsed = W.parse(input); }
      catch (_) { return reject("bad-wire"); }
      if (!parsed || !parsed.valid) {
        return reject(parsed && parsed.reason ? "wire-" + parsed.reason : "wire-invalid", parsed);
      }
      if (!meshEq(parsed.dst, ep.mesh)) return reject("dst-mismatch", parsed);
      var env = parseEnvelope(parsed.payload);
      if (!env.valid) return reject(env.reason, parsed);
      if (env.toLane !== ep.lane) return reject("lane-mismatch", parsed);

      var flowKey = [env.fromLane, parsed.src.x, parsed.src.y, parsed.src.z].join(":");
      var openKey = flowKey + ":" + parsed.seq;
      var last = ep._last[flowKey];
      var group = ep._open[openKey];
      if (!group) {
        if (last !== undefined) {
          if (parsed.seq <= last) return reject("replay", parsed);
          if (parsed.seq !== ((last + 1) >>> 0)) return reject("sequence-gap", parsed);
        }
        if (ep._openFlow[flowKey] !== undefined) return reject("sequence-overlap", parsed);
      } else if (group.total !== env.total) {
        return reject("fragment-total-mismatch", parsed);
      }
      if (!group) {
        group = { total: env.total, seen: new Array(env.total), got: 0 };
        ep._open[openKey] = group;
        ep._openFlow[flowKey] = openKey;
      }
      if (group.seen[env.index]) return reject("duplicate-fragment", parsed);
      group.seen[env.index] = env.body;
      group.got++;
      wipe(parsed.payload);
      wipe(parsed.wire);
      if (group.got < group.total) {
        return {
          accepted: true,
          complete: false,
          reason: null,
          seq: parsed.seq,
          fragment: env.index + 1,
          fragments: env.total,
        };
      }

      var bodyLen = 0, i, off = 0;
      for (i = 0; i < group.total; i++) bodyLen += group.seen[i].length;
      var body = new Uint8Array(bodyLen);
      for (i = 0; i < group.total; i++) {
        body.set(group.seen[i], off);
        off += group.seen[i].length;
        wipe(group.seen[i]);
      }
      delete ep._open[openKey];
      delete ep._openFlow[flowKey];
      ep._last[flowKey] = parsed.seq;

      var released = false;
      var msg = {
        kind: env.kind,
        kindName: env.kindName,
        fromLane: env.fromLane,
        fromLaneName: env.fromLaneName,
        toLane: env.toLane,
        toLaneName: env.toLaneName,
        seq: parsed.seq,
        fragments: env.total,
        flags: env.flags,
        transfer: env.transfer,
        wipeRequested: env.wipeRequested,
        body: body,
        release: function () {
          if (released) return false;
          wipe(body);
          released = true;
          return true;
        },
      };
      if (ep.onMessage) ep.onMessage(msg);
      if (ep.autoRelease && !released) msg.release();
      return {
        accepted: true,
        complete: true,
        reason: null,
        seq: parsed.seq,
        kind: env.kind,
        kindName: env.kindName,
        fragments: env.total,
        body_len: bodyLen,
        released: released,
      };
    };

    ep.send = function (dst, kindValue, bodyValue, opts) {
      var wires = ep.pack(dst, kindValue, bodyValue, opts);
      var results = [];
      for (var i = 0; i < wires.length; i++) {
        results.push(dst.deliver(wires[i]));
        wipe(wires[i]);
      }
      return results;
    };

    ep.post = function (transport, dst, kindValue, bodyValue, opts) {
      if (!transport || typeof transport.postMessage !== "function") {
        throw new TypeError("transport must expose postMessage(message, transferList)");
      }
      var wires = ep.pack(dst, kindValue, bodyValue, opts);
      var frames = [];
      for (var i = 0; i < wires.length; i++) {
        frames.push(wires[i].buffer.slice(wires[i].byteOffset, wires[i].byteOffset + wires[i].byteLength));
        wipe(wires[i]);
      }
      transport.postMessage(frames, frames);
      return { accepted: true, messages: frames.length, transferred: true };
    };

    return ep;
  }

  function toIndex(v, name) {
    var n;
    if (typeof v === "bigint") n = v;
    else if (Number.isInteger(v)) n = BigInt(v);
    else throw new RangeError(name + " must be an integer pointer/length");
    if (n < 0n || n > BigInt(Number.MAX_SAFE_INTEGER)) throw new RangeError(name + " is outside the JS addressable range");
    return Number(n);
  }

  function memoryPort(cfg) {
    cfg = cfg || {};
    var memory = cfg.memory;
    if (!memory || !(memory.buffer instanceof ArrayBuffer)) throw new TypeError("memory must expose an ArrayBuffer");
    if (typeof cfg.alloc !== "function" || typeof cfg.free !== "function") {
      throw new TypeError("memory port requires alloc(len) and free(ptr,len)");
    }
    var secureWipe = typeof cfg.secureWipe === "function" ? cfg.secureWipe : null;

    function view(ptrN, lenN) {
      if (ptrN + lenN > memory.buffer.byteLength) throw new RangeError("span lies outside imported memory");
      return new Uint8Array(memory.buffer, ptrN, lenN);
    }
    function wipeSpan(rawPtr, ptrN, len) {
      if (secureWipe) secureWipe(rawPtr, len);
      else view(ptrN, len).fill(0);
    }
    function write(input) {
      var body = bytes(input, "memory write");
      if (body.length === 0) {
        var releasedEmpty = false;
        return {
          ptr: 0,
          len: 0,
          read: function () { return releasedEmpty ? null : new Uint8Array(0); },
          wipe: function () { return !releasedEmpty; },
          release: function () { if (releasedEmpty) return false; releasedEmpty = true; return true; },
        };
      }
      var rawPtr = cfg.alloc(body.length);
      var ptrN = toIndex(rawPtr, "ptr");
      try { view(ptrN, body.length).set(body); }
      catch (e) { cfg.free(rawPtr, body.length); throw e; }
      var released = false;
      return {
        ptr: rawPtr,
        len: body.length,
        read: function () { return released ? null : view(ptrN, body.length).slice(); },
        wipe: function () {
          if (released) return false;
          wipeSpan(rawPtr, ptrN, body.length);
          return true;
        },
        release: function () {
          if (released) return false;
          wipeSpan(rawPtr, ptrN, body.length);
          cfg.free(rawPtr, body.length);
          released = true;
          return true;
        },
      };
    }
    function read(ptr, len) {
      var ptrN = toIndex(ptr, "ptr"), lenN = toIndex(len, "len");
      return view(ptrN, lenN).slice();
    }
    return { memory: memory, write: write, read: read };
  }

  function capabilities() {
    var caps = {
      wasm: typeof WebAssembly === "object" || typeof WebAssembly === "function",
      memory32: false,
      memory64: false,
      bigint: typeof BigInt === "function",
      structured_clone: typeof structuredClone === "function",
      message_channel: typeof root.MessageChannel === "function",
      shared_array_buffer: typeof root.SharedArrayBuffer === "function",
    };
    if (caps.wasm) {
      try { new WebAssembly.Memory({ initial: 1, maximum: 1 }); caps.memory32 = true; } catch (_) {}
      try { new WebAssembly.Memory({ initial: 1, maximum: 1, address: "i64" }); caps.memory64 = true; } catch (_) {}
    }
    return caps;
  }

  root.FANO_RUNTIME_BRIDGE = {
    HEADER_BYTES: HEADER,
    BODY_CAP: BODY_CAP,
    MAX_FRAGMENTS: MAX_FRAGMENTS,
    LANES: LANES,
    KINDS: KINDS,
    lane: lane,
    laneName: laneName,
    kind: kind,
    mesh: mesh,
    buildEnvelope: buildEnvelope,
    parseEnvelope: parseEnvelope,
    endpoint: endpoint,
    memoryPort: memoryPort,
    capabilities: capabilities,
    wipe: wipe,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
