/* jzd1.js — JZD1 v2 peer-discovery record codec (desk-side twin).
   Byte-exact mirror of Jizo src/net/discovery.zig: a bounded,
   self-authenticating announce/query/response/goodbye record.
   The 32-byte node_id IS the peer's Ed25519 public key — one identity
   model, same width as Rations PeerId.

   Structural parse is dependency-free. Signature verify and signing are
   injected: the desk supplies the Rations WASM Ed25519 lane
   (rations_ed25519_verify / _sign); this module never claims a signature
   it cannot check. Big-endian wire; peerId32 folds the node id as
   little-endian u32 words (the BLIB u32 alias). */
(function (root) {
  "use strict";

  var VERSION = 2;
  var HEADER_LEN = 56;    /* magic4+ver1+kind1+medium1+count1+seq4+expires8+node32+caps4 */
  var ENDPOINT_LEN = 28;  /* medium1+alen1+port2+expires8+addr16 */
  var SIGNATURE_LEN = 64;
  var NODE_ID_LEN = 32;
  var MAX_ENDPOINTS = 4;
  var MAX_RECORD = HEADER_LEN + MAX_ENDPOINTS * ENDPOINT_LEN + SIGNATURE_LEN; /* 232 — ESP-NOW budget */
  var MAX_PACKET = 256;

  var KIND = { announce: 1, query: 2, response: 3, goodbye: 4 };
  var KIND_NAME = [null, "announce", "query", "response", "goodbye"];
  var MEDIUM = { ip_udp: 1, bluetooth: 2, acoustic_voice: 3, rf: 4, qr_physical: 5, ip_tcp: 6 };
  var MEDIUM_NAME = [null, "ip_udp", "bluetooth", "acoustic_voice", "rf", "qr_physical", "ip_tcp"];

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
  function view(b) { return new DataView(b.buffer, b.byteOffset, b.byteLength); }
  function u64(v, name) {
    if (typeof v === "bigint") {
      if (v < 0n || v > 0xffffffffffffffffn) throw new RangeError(name + " must be u64");
      return v;
    }
    if (Number.isInteger(v) && v >= 0 && v <= Number.MAX_SAFE_INTEGER) return BigInt(v);
    throw new RangeError(name + " must be u64");
  }
  function u32(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffffffff) throw new RangeError(name + " must be u32");
    return v >>> 0;
  }
  function u16(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 0xffff) throw new RangeError(name + " must be u16");
    return v;
  }
  function u8(v, name) {
    if (!Number.isInteger(v) || v < 0 || v > 255) throw new RangeError(name + " must be u8");
    return v;
  }
  function eq(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var x = 0;
    for (var i = 0; i < a.length; i++) x |= a[i] ^ b[i];
    return x === 0;
  }
  function unsignedLen(count) { return HEADER_LEN + count * ENDPOINT_LEN; }

  /* XOR-fold the 32-byte identity into the u32 BLIB alias — little-endian
     words, matching discovery.peerId32 exactly. */
  function peerId32(nodeId) {
    var b = bytes(nodeId);
    if (!b || b.length !== NODE_ID_LEN) throw new RangeError("node id must be 32 bytes");
    var dv = view(b), acc = 0;
    for (var i = 0; i < 8; i++) acc ^= dv.getUint32(i * 4, true);
    return acc >>> 0;
  }

  /* Endpoint validity mirrors Zig Endpoint.valid: bounded address length,
     future expiry, ported media (ip_udp/ip_tcp) require a nonzero port,
     other media require port zero. */
  function endpointValid(ep, now) {
    if (!ep || ep.address_len < 1 || ep.address_len > 16) return false;
    if (ep.expires_at <= now) return false;
    var ported = ep.medium === MEDIUM.ip_udp || ep.medium === MEDIUM.ip_tcp;
    if (ported && ep.port === 0) return false;
    if (!ported && ep.port !== 0) return false;
    return true;
  }

  /* Structural decode + expiry + endpoint semantics. Does NOT check the
     signature — the caller's verifySig decides authenticity. Returns
     {valid, reason, ...fields}; valid records carry the raw signature and
     signedLen (the byte range the signature covers). */
  function parse(packet, now) {
    var b = bytes(packet);
    var t = u64(now === undefined ? 0n : now, "now");
    var bad = function (reason) { return { valid: false, reason: reason }; };
    if (!b || b.length < HEADER_LEN + SIGNATURE_LEN || b.length > MAX_PACKET)
      return bad("corrupt-length");
    if (!(b[0] === 0x4a && b[1] === 0x5a && b[2] === 0x44 && b[3] === 0x31)) return bad("corrupt-magic");
    if (b[4] !== VERSION) return bad("corrupt-version");
    var kind = b[5], medium = b[6], count = b[7];
    if (kind < 1 || kind > 4) return bad("corrupt-kind");
    if (medium < 1 || medium > 6) return bad("corrupt-medium");
    if (count > MAX_ENDPOINTS) return bad("too-many-endpoints");
    if (b.length !== unsignedLen(count) + SIGNATURE_LEN) return bad("corrupt-length");

    var dv = view(b), n = 8;
    var sequence = dv.getUint32(n, false); n += 4;
    var expiresAt = dv.getBigUint64(n, false); n += 8;
    if (expiresAt <= t) return bad("expired");

    var nodeId = b.slice(n, n + NODE_ID_LEN); n += NODE_ID_LEN;
    var capabilities = dv.getUint32(n, false); n += 4;

    var endpoints = [];
    for (var i = 0; i < count; i++) {
      var epMedium = b[n];
      if (epMedium < 1 || epMedium > 6) return bad("corrupt-endpoint-medium");
      var ep = {
        medium: epMedium,
        medium_name: MEDIUM_NAME[epMedium],
        address_len: b[n + 1],
        port: dv.getUint16(n + 2, false),
        expires_at: dv.getBigUint64(n + 4, false),
        address: b.slice(n + 12, n + 28),
      };
      if (!endpointValid(ep, t)) return bad("bad-endpoint");
      endpoints.push(ep);
      n += ENDPOINT_LEN;
    }
    return {
      valid: true,
      kind: kind,
      kind_name: KIND_NAME[kind],
      medium: medium,
      medium_name: MEDIUM_NAME[medium],
      sequence: sequence,
      expires_at: expiresAt,
      node_id: nodeId,
      capabilities: capabilities,
      endpoints: endpoints,
      signature: b.slice(n, n + SIGNATURE_LEN),
      signedLen: n,
    };
  }

  /* Full verify = structural decode + Ed25519 signature over the unsigned
     body under node_id as the public key. verifySig(pubKey32, msg, sig64)
     must return boolean; without it there is no authenticity claim —
     typed refusal, never a silent pass. */
  function verify(packet, now, verifySig) {
    if (typeof verifySig !== "function")
      throw new TypeError("verifySig(pubkey32, msg, sig64) is required — no verifier, no verify");
    var b = bytes(packet);
    if (!b) return false;
    var p = parse(b, now);
    if (!p.valid) return false;
    return verifySig(p.node_id, b.slice(0, p.signedLen), p.signature) === true;
  }

  /* Signed encode. signer = { publicKey: Uint8Array(32),
     sign(msg) -> Uint8Array(64) }. The record may not speak for an
     identity it cannot sign as — publicKey must equal peer.node_id. */
  function build(message, signer) {
    if (!message || typeof message !== "object") throw new TypeError("message object required");
    if (!signer || typeof signer.sign !== "function") throw new TypeError("signer.sign required");
    var nodeId = bytes(signer.publicKey);
    if (!nodeId || nodeId.length !== NODE_ID_LEN) throw new RangeError("signer.publicKey must be 32 bytes");
    var peer = message.peer;
    if (!peer || !eq(bytes(peer.node_id), nodeId)) throw new RangeError("peer.node_id must equal signer publicKey — cannot speak for an unsigned identity");

    var kind = u8(message.kind, "kind"), medium = u8(message.medium, "medium");
    if (kind < 1 || kind > 4) throw new RangeError("kind out of range");
    if (medium < 1 || medium > 6) throw new RangeError("medium out of range");
    var seq = u32(message.sequence, "sequence");
    var expires = u64(message.expires_at, "expires_at");
    if (expires === 0n) throw new RangeError("expires_at must be nonzero");
    var caps = u32(peer.capabilities === undefined ? 0 : peer.capabilities, "capabilities");
    var eps = peer.endpoints || [];
    if (eps.length > MAX_ENDPOINTS) throw new RangeError("too many endpoints");

    /* never emit a record our own decoder would reject */
    for (var i = 0; i < eps.length; i++) {
      var e = eps[i], em = u8(e.medium, "endpoint.medium"), al = u8(e.address_len, "endpoint.address_len");
      var port = u16(e.port === undefined ? 0 : e.port, "endpoint.port");
      if (em < 1 || em > 6) throw new RangeError("endpoint.medium out of range");
      if (al < 1 || al > 16) throw new RangeError("endpoint.address_len out of range");
      var ported = em === MEDIUM.ip_udp || em === MEDIUM.ip_tcp;
      if (ported && port === 0) throw new RangeError("ported endpoint requires nonzero port");
      if (!ported && port !== 0) throw new RangeError("non-ported endpoint requires zero port");
      u64(e.expires_at, "endpoint.expires_at");
    }

    var out = new Uint8Array(unsignedLen(eps.length) + SIGNATURE_LEN);
    var dv = view(out), n = 0;
    out[n++] = 0x4a; out[n++] = 0x5a; out[n++] = 0x44; out[n++] = 0x31; /* JZD1 */
    out[n++] = VERSION; out[n++] = kind; out[n++] = medium; out[n++] = eps.length;
    dv.setUint32(n, seq, false); n += 4;
    dv.setBigUint64(n, expires, false); n += 8;
    out.set(nodeId, n); n += NODE_ID_LEN;
    dv.setUint32(n, caps, false); n += 4;
    for (i = 0; i < eps.length; i++) {
      var ep = eps[i], addr = bytes(ep.address);
      if (!addr || addr.length !== 16) throw new RangeError("endpoint.address must be 16 bytes");
      out[n] = u8(ep.medium, "endpoint.medium");
      out[n + 1] = u8(ep.address_len, "endpoint.address_len");
      dv.setUint16(n + 2, u16(ep.port === undefined ? 0 : ep.port, "endpoint.port"), false);
      dv.setBigUint64(n + 4, u64(ep.expires_at, "endpoint.expires_at"), false);
      out.set(addr, n + 12);
      n += ENDPOINT_LEN;
    }
    var sig = bytes(signer.sign(out.slice(0, n)));
    if (!sig || sig.length !== SIGNATURE_LEN) throw new RangeError("signer.sign must return 64 bytes");
    out.set(sig, n);
    return out;
  }

  function fromHex(h) {
    if (typeof h !== "string" || h.length % 2 !== 0 || /[^0-9a-fA-F]/.test(h)) return null;
    var b = new Uint8Array(h.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return b;
  }
  function toHex(b) {
    var s = "";
    for (var i = 0; i < b.length; i++) s += b[i].toString(16).padStart(2, "0");
    return s;
  }

  root.JZD1 = {
    VERSION: VERSION,
    HEADER_LEN: HEADER_LEN,
    ENDPOINT_LEN: ENDPOINT_LEN,
    SIGNATURE_LEN: SIGNATURE_LEN,
    NODE_ID_LEN: NODE_ID_LEN,
    MAX_ENDPOINTS: MAX_ENDPOINTS,
    MAX_RECORD: MAX_RECORD,
    MAX_PACKET: MAX_PACKET,
    KIND: KIND,
    MEDIUM: MEDIUM,
    unsignedLen: unsignedLen,
    peerId32: peerId32,
    endpointValid: endpointValid,
    parse: parse,
    verify: verify,
    build: build,
    fromHex: fromHex,
    toHex: toHex,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
