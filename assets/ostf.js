/* ostf.js — NAM1 `*.ostf.un` name-claim codec + directory (desk-side twin).
   Byte-exact mirror of Jizo src/net/ostf_name.zig + ostf_dir.zig:
   a bounded, self-authenticating record mapping name.ostf.un → the
   owner's Ed25519 node identity + the service endpoints that name
   answers for. NOT ICANN DNS — the mesh's own namespace; the public
   edge is a separate lane.

   Two wire kinds: register (the owner's signed claim — self-
   authenticating; a directory forwards raw bytes verbatim to answer)
   and query (the asker's signed lookup; service is a wanted-mask).

   Structural parse is dependency-free. Signature verify and signing are
   injected — the desk supplies the Rations WASM Ed25519 lane; this
   module never claims a signature it cannot check. Conflicts surface,
   never resolve silently: two valid keys for one name is a fight the
   caller sees, not a tie we break. */
(function (root) {
  "use strict";

  var MAGIC = "NAM1";
  var VERSION = 1;
  var ZONE = "ostf.un";
  var MAX_NAME = 48;
  var MAX_ENDPOINTS = 2;
  var SIGNATURE_LEN = 64;
  var NODE_ID_LEN = 32;
  var HEADER_LEN = 56;    /* magic4+ver1+kind1+name_len1+count1+seq4+expires8+node32+service4 */
  var ENDPOINT_LEN = 28;  /* medium1+alen1+port2+expires8+addr16 */
  var MAX_RECORD = HEADER_LEN + MAX_NAME + MAX_ENDPOINTS * ENDPOINT_LEN + SIGNATURE_LEN; /* 224 — under JZD1's 232 ESP-NOW floor */
  var MAX_PACKET = MAX_RECORD;
  var MAX_ENTRIES = 64;

  var KIND = { register: 1, query: 2 };
  var KIND_NAME = [null, "register", "query"];
  var MEDIUM = { ip_udp: 1, bluetooth: 2, acoustic_voice: 3, rf: 4, qr_physical: 5, ip_tcp: 6 };
  var MEDIUM_NAME = [null, "ip_udp", "bluetooth", "acoustic_voice", "rf", "qr_physical", "ip_tcp"];

  var SERVICE = {
    SEED_HTTP: 1, RENDEZVOUS: 2, RELAY: 4,
    DAEMON: 8, MESH_DNS: 16, GATE: 32,
  };

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
  function eq(a, b) {
    if (!a || !b || a.length !== b.length) return false;
    var x = 0;
    for (var i = 0; i < a.length; i++) x |= a[i] ^ b[i];
    return x === 0;
  }
  function unsignedLen(nameLen, count) { return HEADER_LEN + nameLen + count * ENDPOINT_LEN; }

  /* Canonical `*.ostf.un` name. Bare labels gain the zone; ASCII folds
     lowercase; every label [a-z0-9-]+, no leading/trailing hyphen, no
     empty label; the trailing zone is exactly `ostf.un`. Returns the
     normalized string or throws RangeError — mirrors normalizeName. */
  function normalizeName(input) {
    if (typeof input !== "string") throw new RangeError("name must be a string");
    if (input.length === 0 || input.length > MAX_NAME) throw new RangeError("bad name");
    /* ASCII byte fold — mirrors the Zig codec byte-for-byte: only
       [A-Z] folds; anything outside byte range can never be a wire
       name and refuses, never silently re-shapes. */
    var name = "";
    for (var i = 0; i < input.length; i++) {
      var cc = input.charCodeAt(i);
      if (cc > 255) throw new RangeError("bad name");
      name += String.fromCharCode(cc >= 65 && cc <= 90 ? cc + 32 : cc);
    }
    /* bare label gains the zone — bounded: the zone must still fit
       inside MAX_NAME after the append (Zig checks post-append) */
    if (name.indexOf(".") === -1) {
      if (name.length + 1 + ZONE.length > MAX_NAME) throw new RangeError("bad name");
      name = name + "." + ZONE;
    }
    var labels = name.split(".");
    var tailOk = false, prev = "";
    for (var i = 0; i < labels.length; i++) {
      var l = labels[i];
      if (l.length === 0) throw new RangeError("bad name: empty label");
      for (var j = 0; j < l.length; j++) {
        var c = l.charCodeAt(j);
        if (!((c >= 97 && c <= 122) || (c >= 48 && c <= 57) || c === 45))
          throw new RangeError("bad name: illegal character");
      }
      if (l[0] === "-" || l[l.length - 1] === "-") throw new RangeError("bad name: edge hyphen");
      tailOk = i >= 1 && prev === "ostf" && l === "un";
      prev = l;
    }
    if (!tailOk) throw new RangeError("bad name: not under ostf.un");
    return name;
  }

  function nameBytes(name) {
    var b = new Uint8Array(name.length);
    for (var i = 0; i < name.length; i++) b[i] = name.charCodeAt(i);
    return b;
  }
  function nameString(b) {
    var s = "";
    for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]);
    return s;
  }

  /* Structural decode + expiry + endpoint semantics + canonical-name
     check. Does NOT check the signature — verify() does that through
     the injected lane. Returns {valid, reason, ...fields}. */
  function parse(packet, now) {
    var b = bytes(packet);
    var t = u64(now === undefined ? 0n : now, "now");
    var bad = function (reason) { return { valid: false, reason: reason }; };
    if (!b || b.length < HEADER_LEN + SIGNATURE_LEN || b.length > MAX_PACKET)
      return bad("corrupt-length");
    if (!(b[0] === 0x4e && b[1] === 0x41 && b[2] === 0x4d && b[3] === 0x31))
      return bad("corrupt-magic");
    if (b[4] !== VERSION) return bad("corrupt-version");
    var kind = b[5];
    if (kind !== KIND.register && kind !== KIND.query) return bad("corrupt-kind");
    var nameLen = b[6], count = b[7];
    if (nameLen === 0 || nameLen > MAX_NAME || count > MAX_ENDPOINTS)
      return bad("corrupt-count");
    if (b.length !== unsignedLen(nameLen, count) + SIGNATURE_LEN)
      return bad("corrupt-length");

    var dv = view(b), n = 8;
    var sequence = dv.getUint32(n, false); n += 4;
    var expiresAt = dv.getBigUint64(n, false); n += 8;
    if (expiresAt <= t) return bad("expired");
    var nodeId = b.slice(n, n + NODE_ID_LEN); n += NODE_ID_LEN;
    var service = dv.getUint32(n, false); n += 4;

    var nameRaw = b.slice(n, n + nameLen);
    var name = nameString(nameRaw);
    try {
      if (normalizeName(name) !== name) return bad("bad-name");
    } catch (e) { return bad("bad-name"); }
    n += nameLen;

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
      if (ep.address_len < 1 || ep.address_len > 16) return bad("bad-endpoint");
      var ported = epMedium === MEDIUM.ip_udp || epMedium === MEDIUM.ip_tcp;
      if (ported && ep.port === 0) return bad("bad-endpoint");
      if (!ported && ep.port !== 0) return bad("bad-endpoint");
      endpoints.push(ep);
      n += ENDPOINT_LEN;
    }
    return {
      valid: true,
      kind: kind,
      kind_name: KIND_NAME[kind],
      sequence: sequence,
      expires_at: expiresAt,
      node_id: nodeId,
      service: service,
      name: name,
      endpoints: endpoints,
      signature: b.slice(n, n + SIGNATURE_LEN),
      signedLen: n,
    };
  }

  /* Full verify = structural decode + Ed25519 signature over the
     unsigned body under node_id. verifySig(pubKey32, msg, sig64)
     returns boolean; no verifier → TypeError, never a silent pass. */
  function verify(packet, now, verifySig) {
    if (typeof verifySig !== "function")
      throw new TypeError("verifySig(pubkey32, msg, sig64) is required — no verifier, no verify");
    var b = bytes(packet);
    if (!b) return false;
    var p = parse(b, now);
    if (!p.valid) return false;
    return verifySig(p.node_id, b.slice(0, p.signedLen), p.signature) === true;
  }

  function checkEndpoints(eps) {
    if (!Array.isArray(eps) || eps.length > MAX_ENDPOINTS)
      throw new RangeError("too many endpoints");
    for (var i = 0; i < eps.length; i++) {
      var e = eps[i], em = e.medium, al = e.address_len;
      if (!Number.isInteger(em) || em < 1 || em > 6) throw new RangeError("endpoint.medium out of range");
      if (!Number.isInteger(al) || al < 1 || al > 16) throw new RangeError("endpoint.address_len out of range");
      var port = u16(e.port === undefined ? 0 : e.port, "endpoint.port");
      var ported = em === MEDIUM.ip_udp || em === MEDIUM.ip_tcp;
      if (ported && port === 0) throw new RangeError("ported endpoint requires nonzero port");
      if (!ported && port !== 0) throw new RangeError("non-ported endpoint requires zero port");
      u64(e.expires_at, "endpoint.expires_at");
      var addr = bytes(e.address);
      if (!addr || addr.length !== 16) throw new RangeError("endpoint.address must be 16 bytes");
    }
  }

  /* Signed encode shared by claim/ask. signer = { publicKey,
     sign(msg)->64B }. The record may not claim for an identity it
     cannot sign as. */
  function encode(kind, name, signer, service, sequence, expiresAt, endpoints) {
    if (!signer || typeof signer.sign !== "function") throw new TypeError("signer.sign required");
    var nodeId = bytes(signer.publicKey);
    if (!nodeId || nodeId.length !== NODE_ID_LEN) throw new RangeError("signer.publicKey must be 32 bytes");
    var canon = normalizeName(name);
    var nameB = nameBytes(canon);
    var seq = u32(sequence, "sequence");
    var exp = u64(expiresAt, "expires_at");
    if (exp === 0n) throw new RangeError("expires_at must be nonzero");
    var svc = u32(service === undefined ? 0 : service, "service");
    var eps = endpoints || [];
    checkEndpoints(eps);

    var out = new Uint8Array(unsignedLen(nameB.length, eps.length) + SIGNATURE_LEN);
    var dv = view(out), n = 0;
    out[n++] = 0x4e; out[n++] = 0x41; out[n++] = 0x4d; out[n++] = 0x31; /* NAM1 */
    out[n++] = VERSION; out[n++] = kind; out[n++] = nameB.length; out[n++] = eps.length;
    dv.setUint32(n, seq, false); n += 4;
    dv.setBigUint64(n, exp, false); n += 8;
    out.set(nodeId, n); n += NODE_ID_LEN;
    dv.setUint32(n, svc, false); n += 4;
    out.set(nameB, n); n += nameB.length;
    for (var i = 0; i < eps.length; i++) {
      var e = eps[i];
      out[n] = e.medium;
      out[n + 1] = e.address_len;
      dv.setUint16(n + 2, u16(e.port === undefined ? 0 : e.port, "endpoint.port"), false);
      dv.setBigUint64(n + 4, u64(e.expires_at, "endpoint.expires_at"), false);
      out.set(bytes(e.address), n + 12);
      n += ENDPOINT_LEN;
    }
    var sig = bytes(signer.sign(out.slice(0, n)));
    if (!sig || sig.length !== SIGNATURE_LEN) throw new RangeError("signer.sign must return 64 bytes");
    out.set(sig, n);
    return out;
  }

  function claim(name, signer, service, sequence, expiresAt, endpoints) {
    return encode(KIND.register, name, signer, service, sequence, expiresAt, endpoints);
  }
  function ask(name, signer, serviceMask, sequence, expiresAt, replyEndpoints) {
    return encode(KIND.query, name, signer, serviceMask, sequence, expiresAt, replyEndpoints);
  }

  /* The bounded directory — mirrors ostf_dir.zig: same-key higher seq
     supersedes, stale is a no-op, a different key for the same name is
     a surfaced CONFLICT (rival kept visible), expiry sweeps lazily. */
  function makeDirectory() {
    var entries = [];
    function findIdx(name) {
      for (var i = 0; i < entries.length; i++)
        if (entries[i].rec.name === name) return i;
      return -1;
    }
    var dir = {
      entries: entries,
      /* rec must already be verify()'d by the caller — the directory
         judges order, not signatures. */
      put: function (rec, now) {
        if (rec.kind !== KIND.register) return "stale";
        if (rec.expires_at <= BigInt(now)) return "stale";
        var i = findIdx(rec.name);
        if (i >= 0) {
          var e = entries[i];
          if (e.rec.expires_at <= BigInt(now)) {
            entries[i] = { rec: rec, seen_s: now, rival: null, rival_count: 0 };
            return "superseded";
          }
          if (eq(e.rec.node_id, rec.node_id)) {
            if (rec.sequence > e.rec.sequence) {
              var rv = e.rival, rc = e.rival_count;
              entries[i] = { rec: rec, seen_s: now, rival: rv, rival_count: rc };
              return "superseded";
            }
            e.seen_s = now;
            return "stale";
          }
          if (!e.rival) { e.rival = rec.node_id; e.rival_count = 1; }
          else if (!eq(e.rival, rec.node_id)) e.rival_count += 1;
          return "conflict_rival";
        }
        if (entries.length >= MAX_ENTRIES) return "refused_full";
        entries.push({ rec: rec, seen_s: now, rival: null, rival_count: 0 });
        return "stored";
      },
      resolve: function (name, serviceMask, now) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (e.rec.name !== name) continue;
          if (e.rec.expires_at <= BigInt(now)) return { result: "not_found" };
          if (e.rival) return { result: "conflict", entry: e };
          if (serviceMask && (e.rec.service & serviceMask) === 0)
            return { result: "held_other_service", entry: e };
          return { result: "ok", entry: e };
        }
        return { result: "not_found" };
      },
      get: function (name, now) {
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (e.rec.name === name && e.rec.expires_at > BigInt(now)) return e;
        }
        return null;
      },
      sweep: function (now) {
        var removed = 0;
        for (var i = entries.length - 1; i >= 0; i--) {
          if (entries[i].rec.expires_at <= BigInt(now)) {
            entries.splice(i, 1);
            removed += 1;
          }
        }
        return removed;
      },
      directoryNodes: function (now) {
        var n = 0;
        for (var i = 0; i < entries.length; i++) {
          var e = entries[i];
          if (e.rec.expires_at > BigInt(now) && (e.rec.service & SERVICE.MESH_DNS) !== 0) n += 1;
        }
        return n;
      },
    };
    return dir;
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

  root.OSTF = {
    VERSION: VERSION,
    ZONE: ZONE,
    MAX_NAME: MAX_NAME,
    MAX_ENDPOINTS: MAX_ENDPOINTS,
    HEADER_LEN: HEADER_LEN,
    ENDPOINT_LEN: ENDPOINT_LEN,
    MAX_RECORD: MAX_RECORD,
    MAX_PACKET: MAX_PACKET,
    MAX_ENTRIES: MAX_ENTRIES,
    KIND: KIND,
    MEDIUM: MEDIUM,
    SERVICE: SERVICE,
    normalizeName: normalizeName,
    parse: parse,
    verify: verify,
    claim: claim,
    ask: ask,
    makeDirectory: makeDirectory,
    fromHex: fromHex,
    toHex: toHex,
  };
})(typeof globalThis !== "undefined" ? globalThis : this);
