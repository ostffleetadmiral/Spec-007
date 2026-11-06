/* FANO-1 auth — the pledge is real.

   The covenant signature is an Ed25519 signature over the canonical
   covenant hash, minted by the vendored Rations core at enrollment.
   The secret key never leaves this device unwrapped: PBKDF2(pass,
   salt, 100k) -> AES-256-GCM. Local checks are advisory; the network
   is the gate — peers verify the covenant signature and role
   certificate before a channel opens.

   <!-- the signature was never ceremonial. it just looked like it. -->
*/
window.FANO_AUTH = (function () {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var wasm = null, memory = null;

  var WASM_URL = "apps/rations/rations.wasm";
  var STORE_KEY = "fano1.identity";
  var ITERATIONS = 100000;
  var TOTP_STEP = 30;
  var TOTP_WINDOW = 1;
  var TOTP_ISSUER = "QStar.net";
  var TOTP_ACCOUNT = "QStar.net";
  var RELAY_TOKEN_KEY = "rations.relay.token.v1";
  var FLEET_PIN_KEY = "fano.fleet.genesis.v1";

  /* canonical covenant bytes — what the signature actually covers.
     Keep byte-identical to the pledge text on index.html. */
  var COVENANT = [
    "To dedicate my mind to the discovery of knowledge: lifelong learning,",
    "critical evaluation, seeking truth in an age of misinformation.",
    "To dedicate my soul to the pursuit of enlightenment: empathy,",
    "understanding, inner peace, and the well-being of all who gather around",
    "the light.",
    "To dedicate my life and days upon this planet to the protection and",
    "advancement of the human species.",
    "To dedicate my efforts to the progress of abundance: sustainable",
    "innovation and equitable distribution, improving life for everyone rather",
    "than just a few.",
    "To dedicate my existence to bringing all people, in all places, into",
    "unification: bridging every divide until the whole human family shares one",
    "light."
  ].join("\n");

  /* ---------- roles (RBAC) ---------- */
  var ROLES = { field_agent: 0, operator: 1, q_branch: 2, station_chief: 3, fleet_admiral: 5 };
  var ROLE_LABEL = ["CADET", "OPERATOR", "Q-BRANCH", "STATION-CHIEF", "-", "FLEET-ADMIRAL"];

  /* ---------- wasm loader (lean — the desk does not borrow the quine) ---------- */
  function mem(ptr, len) { return new Uint8Array(memory.buffer, ptr, len); }
  function rd(ptr, len) { return dec.decode(mem(ptr, len)); }

  function load(url) {
    if (wasm) return Promise.resolve(wasm);
    memory = new WebAssembly.Memory({ initial: 2048, maximum: 16384 });
    var imp = { env: {
      memory: memory,
      js_console_log: function (p, n) { console.log("[rations]", rd(p, n)); },
      js_dom_set_text: function () {},
      js_dom_get_value: function () { return 0; },
      js_local_storage_set: function (kp, kn, vp, vn) {
        try { localStorage.setItem(rd(kp, kn), rd(vp, vn)); return 1; } catch (e) { return 0; }
      },
      js_local_storage_get: function (kp, kn, op, lp) {
        var v = localStorage.getItem(rd(kp, kn));
        if (v === null) return 0;
        var b = enc.encode(v), n = Math.min(b.length, 4096);
        mem(op, n).set(b.subarray(0, n));
        new Uint32Array(memory.buffer, lp, 1)[0] = n;
        return 1;
      },
      js_random_bytes: function (p, n) { crypto.getRandomValues(mem(p, n)); },
      js_time_now: function () { return BigInt(Date.now()); },
      js_ws_connect: wsConnect, js_ws_send: wsSend,
      js_ws_close: wsClose, js_ws_state: wsState,
    } };
    return fetch(url || WASM_URL)
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return WebAssembly.instantiate(b, imp); })
      .then(function (res) { wasm = res.instance.exports; return wasm; });
  }

  /* ---------- ws transport (minimal port of Rations transport.js) ----------
     Inbound frames feed rations_ws_on_message; state 0=down 1=opening
     2=open 3=closing 4=closed. No auto-reconnect at this layer — the
     desk reports the link honestly. */
  var wsConns = {}, wsNext = 1, wsListeners = [];
  function wsNotify(t, p) { for (var i = 0; i < wsListeners.length; i++) try { wsListeners[i](t, p); } catch (e) {} }
  function relayProtocols() {
    var protos = ["rations-relay-v1"], token = "";
    try { token = window.RATIONS_RELAY_TOKEN || localStorage.getItem(RELAY_TOKEN_KEY) || ""; } catch (e) {}
    if (token) protos.push("rations-relay-token." + token);
    return protos;
  }
  function wsConnect(p, n) {
    var url = rd(p, n), id = wsNext++;
    try {
      var s = new WebSocket(url, relayProtocols()); s.binaryType = "arraybuffer";
      wsConns[id] = s;
      s.onopen = function () { wsNotify("open", { id: id }); };
      s.onmessage = function (ev) {
        var d = new Uint8Array(ev.data), ptr = wasm.rations_alloc(d.length);
        mem(ptr, d.length).set(d);
        wasm.rations_ws_on_message(id, ptr, d.length);
        wasm.rations_free(ptr, d.length);
      };
      s.onclose = function () { delete wsConns[id]; wasm.rations_ws_on_close(id); wsNotify("close", { id: id }); };
      s.onerror = function () { wsNotify("error", { id: id }); };
      return id;
    } catch (e) { return 0; }
  }
  function wsSend(id, p, n) {
    var s = wsConns[id];
    if (!s || s.readyState !== 1) return 0;
    s.send(mem(p, n).slice()); return 1;
  }
  function wsClose(id) { var s = wsConns[id]; if (s) { delete wsConns[id]; s.close(); } }
  function wsState(id) {
    var s = wsConns[id]; if (!s) return 0;
    return [0, 1, 2, 3, 4][s.readyState] || 0;
  }
  function onWs(fn) { wsListeners.push(fn); }

  /* ---------- pointer plumbing ---------- */
  function wr(bytes) {
    var p = wasm.rations_alloc(bytes.length);
    if (!p) throw new Error("wasm alloc failed");
    mem(p, bytes.length).set(bytes);
    return p;
  }
  function outBuf(n) { var p = wasm.rations_alloc(n); mem(p, n).fill(0); return p; }
  function hex(b) { return Array.from(b).map(function (x) { return x.toString(16).padStart(2, "0"); }).join(""); }
  function unhex(h) {
    var b = new Uint8Array(h.length / 2);
    for (var i = 0; i < b.length; i++) b[i] = parseInt(h.substr(i * 2, 2), 16);
    return b;
  }

  /* ---------- raw crypto ---------- */
  function sha256(bytes) {
    var inp = wr(bytes), op = outBuf(32);
    wasm.rations_sha256(inp, bytes.length, op);
    var r = mem(op, 32).slice();
    wasm.rations_free(inp, bytes.length); wasm.rations_free(op, 32);
    return r;
  }
  /* the wire API wants the 64-byte expanded key; our keystore holds the 32-byte seed */
  function expandSeed(seed) {
    var sp = wr(seed), pp = outBuf(32), sp2 = outBuf(64);
    var ok = wasm.rations_ed25519_keypair_seed(sp, seed.length, pp, sp2);
    var r = ok ? { pk: mem(pp, 32).slice(), sk64: mem(sp2, 64).slice() } : null;
    wasm.rations_free(sp, seed.length); wasm.rations_free(pp, 32); wasm.rations_free(sp2, 64);
    return r;
  }
  function sign(msgBytes, keyBytes) {
    var sk = keyBytes.length === 64 ? keyBytes : (expandSeed(keyBytes) || {}).sk64;
    if (!sk) return null;
    var mp = wr(msgBytes), sp = wr(sk), op = outBuf(64);
    var ok = wasm.rations_ed25519_sign(mp, msgBytes.length, sp, 64, op);
    var sig = ok ? mem(op, 64).slice() : null;
    wasm.rations_free(mp, msgBytes.length); wasm.rations_free(sp, 64); wasm.rations_free(op, 64);
    return sig;
  }
  function verify(msgBytes, sigBytes, pkBytes) {
    var mp = wr(msgBytes), sp = wr(sigBytes), pp = wr(pkBytes);
    var ok = wasm.rations_ed25519_verify(mp, msgBytes.length, sp, 64, pp, 32);
    wasm.rations_free(mp, msgBytes.length); wasm.rations_free(sp, sigBytes.length); wasm.rations_free(pp, pkBytes.length);
    return !!ok;
  }
  function pbkdf2(pass, salt) {
    var passBytes = enc.encode(pass), pp = wr(passBytes), sp = wr(salt), op = outBuf(32);
    var ok = wasm.rations_pbkdf2(pp, passBytes.length, sp, salt.length, ITERATIONS, op, 32);
    var k = ok ? mem(op, 32).slice() : null;
    wasm.rations_free(pp, passBytes.length); wasm.rations_free(sp, salt.length); wasm.rations_free(op, 32);
    return k;
  }
  function aesEnc(data, key, nonce) {
    var dp = wr(data), kp = wr(key), np = wr(nonce), op = outBuf(data.length), tp = outBuf(16);
    var ok = wasm.rations_aes_encrypt(dp, data.length, kp, 32, np, nonce.length, op, tp);
    var r = ok ? { ct: mem(op, data.length).slice(), tag: mem(tp, 16).slice() } : null;
    wasm.rations_free(dp, data.length); wasm.rations_free(kp, key.length); wasm.rations_free(np, nonce.length); wasm.rations_free(op, data.length); wasm.rations_free(tp, 16);
    return r;
  }
  function aesDec(ct, key, nonce, tag) {
    var dp = wr(ct), kp = wr(key), np = wr(nonce), tp = wr(tag), op = outBuf(ct.length);
    var ok = wasm.rations_aes_decrypt(dp, ct.length, kp, 32, np, nonce.length, tp, 16, op);
    var r = ok ? mem(op, ct.length).slice() : null;
    wasm.rations_free(dp, ct.length); wasm.rations_free(kp, key.length); wasm.rations_free(np, nonce.length); wasm.rations_free(tp, tag.length); wasm.rations_free(op, ct.length);
    return r;
  }
  /* ---------- time-based authenticator (RFC 6238 / Google Authenticator) ----------
     The seed is generated locally and encrypted inside the existing identity
     record. No network, third-party library, or plaintext localStorage value
     participates in setup or verification. */
  function b32(bytes) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", out = "", acc = 0, bits = 0;
    for (var i = 0; i < bytes.length; i++) {
      acc = (acc << 8) | bytes[i]; bits += 8;
      while (bits >= 5) { bits -= 5; out += alphabet[(acc >>> bits) & 31]; }
    }
    if (bits) out += alphabet[(acc << (5 - bits)) & 31];
    return out;
  }
  function b32dec(s) {
    var alphabet = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567", clean = String(s || "").toUpperCase().replace(/[=\s-]/g, ""), out = [], acc = 0, bits = 0;
    for (var i = 0; i < clean.length; i++) {
      var n = alphabet.indexOf(clean[i]); if (n < 0) return null;
      acc = (acc << 5) | n; bits += 5;
      if (bits >= 8) { bits -= 8; out.push((acc >>> bits) & 255); }
    }
    return new Uint8Array(out);
  }
  function rol(x, n) { return ((x << n) | (x >>> (32 - n))) >>> 0; }
  function sha1(bytes) {
    var bitLen = bytes.length * 8, n = (((bytes.length + 9 + 63) >>> 6) << 6), b = new Uint8Array(n);
    b.set(bytes); b[bytes.length] = 128;
    var hi = Math.floor(bitLen / 0x100000000), lo = bitLen >>> 0;
    b[n - 8] = hi >>> 24; b[n - 7] = hi >>> 16; b[n - 6] = hi >>> 8; b[n - 5] = hi;
    b[n - 4] = lo >>> 24; b[n - 3] = lo >>> 16; b[n - 2] = lo >>> 8; b[n - 1] = lo;
    var h0 = 0x67452301, h1 = 0xefcdab89, h2 = 0x98badcfe, h3 = 0x10325476, h4 = 0xc3d2e1f0;
    for (var p = 0; p < n; p += 64) {
      var w = new Uint32Array(80), i;
      for (i = 0; i < 16; i++) w[i] = (b[p+i*4]<<24)|(b[p+i*4+1]<<16)|(b[p+i*4+2]<<8)|b[p+i*4+3];
      for (i = 16; i < 80; i++) w[i] = rol(w[i-3]^w[i-8]^w[i-14]^w[i-16], 1);
      var a=h0, c=h2, d=h3, e=h4, z=h1;
      for (i = 0; i < 80; i++) {
        var f, k;
        if (i < 20) { f=(z&c)|((~z)&d); k=0x5a827999; }
        else if (i < 40) { f=z^c^d; k=0x6ed9eba1; }
        else if (i < 60) { f=(z&c)|(z&d)|(c&d); k=0x8f1bbcdc; }
        else { f=z^c^d; k=0xca62c1d6; }
        var t=(rol(a,5)+f+e+k+w[i])>>>0; e=d; d=c; c=rol(z,30); z=a; a=t;
      }
      h0=(h0+a)>>>0; h1=(h1+z)>>>0; h2=(h2+c)>>>0; h3=(h3+d)>>>0; h4=(h4+e)>>>0;
    }
    var r = new Uint8Array(20), hs=[h0,h1,h2,h3,h4];
    for (i=0;i<5;i++) { r[i*4]=hs[i]>>>24; r[i*4+1]=hs[i]>>>16; r[i*4+2]=hs[i]>>>8; r[i*4+3]=hs[i]; }
    return r;
  }
  function hmacSha1(key, msg) {
    var k = key.length > 64 ? sha1(key) : key.slice(), pad = new Uint8Array(64), i;
    pad.set(k); for (i=0;i<64;i++) pad[i] ^= 0x36;
    var op = new Uint8Array(64); op.set(k); for (i=0;i<64;i++) op[i] ^= 0x5c;
    var inner = new Uint8Array(64 + msg.length); inner.set(pad); inner.set(msg, 64);
    var outer = new Uint8Array(64 + 20); outer.set(op); outer.set(sha1(inner), 64);
    return sha1(outer);
  }
  function hotp(secret, counter) {
    var msg = new Uint8Array(8), n = counter;
    for (var i=7;i>=0;i--) { msg[i] = n % 256; n = Math.floor(n / 256); }
    var mac = hmacSha1(secret, msg), off = mac[19] & 15;
    var bin = ((mac[off]&127)<<24)|(mac[off+1]<<16)|(mac[off+2]<<8)|mac[off+3];
    return String(bin % 1000000).padStart(6, "0");
  }
  function totpCode(secret, at) { return hotp(secret, Math.floor((at || Date.now()) / 1000 / TOTP_STEP)); }
  function totpWrapKey() { return sha256(enc.encode("FANO-TOTP-v1\n" + hex(session.sk))); }
  function totpUri(secret, issuer, account) {
    var iss = issuer || TOTP_ISSUER, acct = account || TOTP_ACCOUNT;
    return "otpauth://totp/" + encodeURIComponent(iss + ":" + acct) + "?secret=" + secret +
      "&issuer=" + encodeURIComponent(iss) + "&algorithm=SHA1&digits=6&period=30";
  }
  function setupTotp(issuer, account) {
    if (isContained()) return { error: "contained" };
    if (!session.sk || !loadRecord()) return { error: "locked" };
    var secretBytes = randBytes(20), secret = b32(secretBytes), key = totpWrapKey(), nonce = randBytes(12), wrapped = aesEnc(secretBytes, key, nonce);
    if (!wrapped) return { error: "wrap_failed" };
    var rec = loadRecord(); rec.totp = { issuer: issuer || TOTP_ISSUER, account: account || TOTP_ACCOUNT,
      saltless: true, nonce: hex(nonce), ct: hex(wrapped.ct), tag: hex(wrapped.tag), created: new Date().toISOString() };
    localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    return { issuer: rec.totp.issuer, account: rec.totp.account, secret: secret,
      uri: totpUri(secret, rec.totp.issuer, rec.totp.account), code: totpCode(secretBytes) };
  }
  function totpSecret() {
    var rec = loadRecord(); if (!rec || !rec.totp || !session.sk) return null;
    var t = rec.totp, raw = aesDec(unhex(t.ct), totpWrapKey(), unhex(t.nonce), unhex(t.tag));
    return raw && raw.length === 20 ? raw : null;
  }
  function verifyTotp(code, at) {
    /* the six-digit gate shares the unlock throttle — a passphrase
       that's already warm must not make TOTP a free guessing space */
    if (lockRemain()) return false;
    var secret = totpSecret(), value = String(code || "").replace(/\s/g, "");
    if (!secret || !/^\d{6}$/.test(value)) return false;
    var now = Math.floor((at || Date.now()) / 1000 / TOTP_STEP);
    for (var d = -TOTP_WINDOW; d <= TOTP_WINDOW; d++)
      if (hotp(secret, now + d) === value) { failReset(); session.totp = true; return true; }
    failBump();
    return false;
  }
  function totpRequired() { var r = loadRecord(); return !!(r && r.totp); }
  function totpStatus() { var r = loadRecord(); return r && r.totp ? { issuer: r.totp.issuer, account: r.totp.account } : null; }
  function qrSvg(data) {
    if (!wasm) return null;
    var bytes = enc.encode(data), dp = wr(bytes), max = 57 * 57, mp = outBuf(max), sp = outBuf(2);
    var v = wasm.rations_qr_generate_auto(dp, bytes.length, 1, mp, sp);
    if (!v) { wasm.rations_free(dp, bytes.length); wasm.rations_free(mp, max); wasm.rations_free(sp, 2); return null; }
    var size = new Uint16Array(memory.buffer, sp, 1)[0], matrix = mem(mp, size * size), q = 4, scale = 6, total = (size + q * 2) * scale, rect = "";
    for (var y=0;y<size;y++) for (var x=0;x<size;x++) if (matrix[y*size+x]) rect += "<rect x=\""+((x+q)*scale)+"\" y=\""+((y+q)*scale)+"\" width=\""+scale+"\" height=\""+scale+"\"/>";
    wasm.rations_free(dp, bytes.length); wasm.rations_free(mp, max); wasm.rations_free(sp, 2);
    return "<svg xmlns=\"http://www.w3.org/2000/svg\" viewBox=\"0 0 "+total+" "+total+"\" role=\"img\" aria-label=\"Authenticator QR code\"><rect width=\"100%\" height=\"100%\" fill=\"white\"/><g fill=\"black\">"+rect+"</g></svg>";
  }

  /* genIdentity: random 32-byte seed → ed25519 keypair. The phone layer
     consumes the same seed via phone_set_identity, so one seed is the
     agent's identity across covenant, messenger, and channel. */
  function genIdentity() {
    var seed = randBytes(32);
    var kp = expandSeed(seed);
    if (!kp) return null;
    return { sk: seed, pk: kp.pk, sk64: kp.sk64 };
  }
  function setIdentity(skBytes) {
    var p = wr(skBytes);
    wasm.rations_phone_set_identity(p);
    wasm.rations_free(p, skBytes.length);
  }
  function randBytes(n) { var b = new Uint8Array(n); crypto.getRandomValues(b); return b; }

  /* ---------- enrollment ---------- */
  var session = { sk: null, user: null, role: 0, totp: false, contained: false };
  var SESSION_IDLE_MS = 10 * 60 * 1000;
  var sessionTimer = null;
  function sessionTouch() {
    if (!session.sk || typeof setTimeout !== "function") return;
    if (sessionTimer && typeof clearTimeout === "function") clearTimeout(sessionTimer);
    sessionTimer = setTimeout(function () { lock(); }, SESSION_IDLE_MS);
  }
  function setSessionIdleMs(ms) {
    if (typeof ms !== "number" || ms < 1000 || ms > 60 * 60 * 1000) return false;
    SESSION_IDLE_MS = Math.floor(ms);
    sessionTouch();
    return true;
  }
  if (typeof window !== "undefined" && window.addEventListener) {
    ["pagehide", "beforeunload", "freeze"].forEach(function (ev) {
      window.addEventListener(ev, function () { lock(); });
    });
  }
  if (typeof document !== "undefined" && document.addEventListener) {
    ["keydown", "pointerdown", "pointermove"].forEach(function (ev) {
      document.addEventListener(ev, sessionTouch, true);
    });
  }

  function covenantBytes() { return enc.encode(COVENANT); }
  function covenantHash() { return sha256(covenantBytes()); }

  function certBytes(sub_pk, name, role, cov_hash, iss_pk, exp) {
    return enc.encode("FANO-ROLE-v1\n" + hex(sub_pk) + "\n" + name + "\n" + role +
      "\n" + hex(cov_hash) + "\n" + hex(iss_pk) + "\n" + exp);
  }

  function issueCert(subPk, name, role, covHash, issPk, issSk, expiryDays) {
    var exp = Math.floor(Date.now() / 1000) + expiryDays * 86400;
    var body = certBytes(subPk, name, role, covHash, issPk, exp);
    var sig = sign(body, issSk);
    if (!sig) return null;
    return { role: role, exp: exp, iss: hex(issPk), sig: hex(sig) };
  }

  /* issuer trust roster — hex pks displayed as known issuers.
     Raw localStorage rows are presentation only. Authority requires the
     desk founding key, the confirmed fleet flag key, or a signed
     FANO-ISSUER-v1 delegation chained to one of those anchors. This keeps
     desk-local roster injection from becoming an authority decision while
     preserving delegated STATION-CHIEF operation. */
  var ROSTER_KEY = "fano1.issuers";
  var ROSTER_PROOF_KEY = "fano1.issuer.proofs";
  var ISSUER_PROOF_MAX_DEPTH = 4;
  function roster() {
    try { return JSON.parse(localStorage.getItem(ROSTER_KEY)) || []; } catch (e) { return []; }
  }
  function issuerProofs() {
    try { return JSON.parse(localStorage.getItem(ROSTER_PROOF_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveIssuerProofs(p) { try { localStorage.setItem(ROSTER_PROOF_KEY, JSON.stringify(p)); } catch (e) {} }
  function issuerProofBytes(pkHex, issHex, exp) {
    return enc.encode("FANO-ISSUER-v1\n" + pkHex + "\n" + issHex + "\n" + exp);
  }
  function validIssuerProof(pkHex, p, depth) {
    if (!p || p.v !== "FANO-ISSUER-v1" || !p.iss || !p.sig || !p.exp) return false;
    if (p.exp < Math.floor(Date.now() / 1000)) return false;
    if (depth >= ISSUER_PROOF_MAX_DEPTH) return false;
    if (!trustedIssuer(p.iss, depth + 1)) return false;
    return verify(issuerProofBytes(pkHex, p.iss, p.exp), unhex(p.sig), unhex(p.iss));
  }
  function trustedIssuer(pkHex, depth) {
    pkHex = String(pkHex || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(pkHex)) return false;
    var g = genesis();
    if (g && g.pk === pkHex) return true;
    if (flagAnchored(pkHex)) return true;
    if (!wasm) return false;
    var p = issuerProofs()[pkHex];
    return !!(p && validIssuerProof(pkHex, p, depth || 0));
  }
  function issuerClass(pkHex) {
    var g = genesis();
    if (g && g.pk === pkHex) return "founding";
    if (flagAnchored(pkHex)) return "fleet";
    return trustedIssuer(pkHex) ? "delegated" : "unanchored";
  }
  function trustedRoster() { return roster().filter(function (pk) { return trustedIssuer(pk); }); }
  function addIssuerRaw(pkHex, proof) {
    var r = roster();
    if (r.indexOf(pkHex) === -1) { r.push(pkHex); try { localStorage.setItem(ROSTER_KEY, JSON.stringify(r)); } catch (e) {} }
    if (proof) {
      var all = issuerProofs(); all[pkHex] = proof; saveIssuerProofs(all);
    }
    return true;
  }
  function issueIssuerProof(pkHex, expiryDays) {
    if (isContained() || !session.sk || session.role < ROLES.station_chief) return null;
    if (!/^[0-9a-f]{64}$/i.test(pkHex || "")) return null;
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var issHex = hex(kp.pk);
    if (!trustedIssuer(issHex)) return null;
    var exp = Math.floor(Date.now() / 1000) + (expiryDays || 365) * 86400;
    var sig = sign(issuerProofBytes(pkHex.toLowerCase(), issHex, exp), session.sk);
    if (!sig) return null;
    return { v: "FANO-ISSUER-v1", sub: pkHex.toLowerCase(), iss: issHex,
      sig: hex(sig), exp: exp };
  }
  /* roster mutation is privileged: a rostered key certifies elevated
     roles and anchors grants, so adding one needs STATION-CHIEF+ and a
     delegation chain back to a founding/fleet anchor. */
  function addIssuer(pkHex) {
    var proof = issueIssuerProof(pkHex, 365);
    if (!proof) return false;
    return addIssuerRaw(pkHex.toLowerCase(), proof);
  }
  /* removeIssuer: same privilege gate. The desk's founding key is its
     trust anchor — removing it would orphan the roster, so it refuses. */
  function removeIssuer(pkHex) {
    if (isContained()) return false;
    if (!session.sk || session.role < ROLES.station_chief) return false;
    var g = genesis();
    if (g && g.pk === pkHex) return { error: "founding_key" };
    var r = roster(), i = r.indexOf(pkHex);
    if (i === -1) return false;
    r.splice(i, 1);
    var proofs = issuerProofs(); delete proofs[pkHex];
    saveIssuerProofs(proofs);
    try { localStorage.setItem(ROSTER_KEY, JSON.stringify(r)); } catch (e) {}
    return true;
  }

  /* ---------- callsign registry ----------
     SPEC-canon naming law: the Admiralty's own designations are not
     self-serve. Restricted callsigns enroll only with a grant token
     signed by a rostered issuer (STATION-CHIEF+ session). The Fleet
     Admiral's own console pin is hash-bound — "ramsey 006" always
     Admiral's own console pin is hash-bound — "ramsey 006" claims
     genesis only on an unfounded desk; after founding it is claimed
     and moves only by grant. Hashes, not literals, so the binding
     survives a source read. */
  var PINNED_CALLSIGN_HASH = "e41c9c4be5b1c0e91419b80770355902446abe1c5f5fe663c0fdcc6213bde6a5"; /* sha256("ramsey 006") */
  var GRANTS_KEY = "fano1.callsigns";

  /* genesis record: the first real login on this desk mints it.
     { callsign, pk, pk_sha256, ts, retro? } — a fact about the desk's
     founding, not about whoever happens to be enrolled. Plain burn()
     destroys the identity but not the founding; burnGenesis() is the
     documented reset for lab work. The pinned callsign is bound to the
     genesis key: once founding happened, "ramsey 006" enrolls only by
     grant from a rostered issuer. */
  var GENESIS_KEY = "fano1.genesis";
  function genesis() {
    try { return JSON.parse(localStorage.getItem(GENESIS_KEY)); } catch (e) { return null; }
  }
  function saveGenesis(g) { try { localStorage.setItem(GENESIS_KEY, JSON.stringify(g)); } catch (e) {} }
  function burnGenesis() { try { localStorage.removeItem(GENESIS_KEY); } catch (e) {} }

  var RESTRICTED_NAMES = {
    /* the service — posts are issued, not picked */
    q: 1, m: 1, moneypenny: 1, "miss moneypenny": 1, tanner: 1, "bill tanner": 1,
    boothroyd: 1, "major boothroyd": 1, mallory: 1, "gareth mallory": 1,
    "charles robinson": 1, "station chief": 1, "q-branch": 1, "q branch": 1,
    "quartermaster": 1, "universal exports": 1, "vauxhall cross": 1,
    mi6: 1, sis: 1, "the service": 1,
    /* the agent himself and his number */
    bond: 1, "james bond": 1, "double-oh": 1, "double oh": 1,
    /* allies and assets */
    leiter: 1, "felix leiter": 1, quarrel: 1, "rene mathis": 1, mathis: 1,
    "jack wade": 1, "mary goodnight": 1, goodnight: 1, "jock campbell": 1,
    /* women with files of their own */
    vesper: 1, "vesper lynd": 1, "honey ryder": 1, "honeychile rider": 1,
    "pussy galore": 1, "tiffany case": 1, solitaire: 1, "tatiana romanova": 1,
    octopussy: 1, "wai lin": 1, jinx: 1, "jinx johnson": 1,
    "christmas jones": 1, "miranda frost": 1, "madeleine swann": 1,
    nomi: 1, paloma: 1, "kara milovy": 1, "stacey sutton": 1, "pam bouvier": 1,
    tracy: 1, "countess tracy": 1, "teresa di vicenzo": 1,
    "elektra king": 1, "miss case": 1,
    /* the other side of the ledger */
    blofeld: 1, "ernst stavro blofeld": 1, goldfinger: 1, "auric goldfinger": 1,
    oddjob: 1, jaws: 1, trevelyan: 1, "alec trevelyan": 1, janus: 1,
    scaramanga: 1, "francisco scaramanga": 1, "dr no": 1, "dr. no": 1,
    "dr julius no": 1, "le chiffre": 1, "mr big": 1, "drax": 1, "hugo drax": 1,
    "rosa klebb": 1, klebb: 1, "red grant": 1, "donald grant": 1,
    largo: 1, "emilio largo": 1, stromberg: 1, "karl stromberg": 1,
    kananga: 1, "dr kananga": 1, zorin: 1, "max zorin": 1, whitaker: 1,
    ourumov: 1, "general ourumov": 1, onatopp: 1, "xenia onatopp": 1,
    renard: 1, "victor zokas": 1, "mr white": 1, "le chiffre": 1,
    "raoul silva": 1, "tiago rodriguez": 1, safin: 1, "lyutsifer safin": 1,
    "franz oberhauser": 1, "dominic greene": 1, "mr wint": 1, "mr kidd": 1,
    "general gogol": 1, "rosa klebb": 1, "dr alvarez": 1,
    /* organizations nobody joins by asking */
    spectre: 1, smersh: 1, quantum: 1, "the union": 1,
    /* the fleet's own — OSTF designations */
    "fleet admiral": 1, "the fleet admiral": 1, "fleet captain": 1,
    admiral: 1, commodore: 1,
    captain: 1, ramsey: 1, "the meter": 1, meter: 1, sigma: 1, aiwo: 1,
    "the admiralty": 1, "day zero": 1, "axiomatic baseline": 1,
    /* OSTF offices — Strategic Command posts are issued by grant, not picked:
       the Council seats, advisory technical authorities, and the rank
       titles themselves. Positions inside the OSTF are applied for through
       the branch-request chain; a granted title still lands as a CADET —
       the office is a name, the clearance is a different key. */
    "vice admiral": 1, "rear admiral": 1,
    "vice admiral of stem initiatives": 1,
    "rear admiral of entrepreneurship": 1,
    "admiral of financial operations": 1,
    "commodore of ethics and equity": 1,
    "lead technical systems architect": 1,
    "lead security and fabrication officer": 1,
    "chief warrant officer": 1, "warrant officer": 1, "research lead": 1,
    "chief of staff": 1, "chief of lifesupport": 1,
    commander: 1, lieutenant: 1, ensign: 1, midshipman: 1,
    ostf: 1, "open sentience technology foundation": 1,
    sallirreugtech: 1, "sallirreug tech": 1, "sallirreugtech academy": 1,
    "sallirreug academy": 1,
    /* zh faces of the same watch list */
    "龐德": 1, "詹姆斯龐德": 1, "詹姆斯·龐德": 1, "情報員": 1, "軍需官": 1,
    "錢班霓": 1, "金手指": 1, "布洛菲": 1, "魔鬼黨": 1, "海軍上將": 1,
    "ｑ": 1, "ｍ": 1,
  };
  var RESTRICTED_RE = [
    /^(?:agent\s+)?0*0[0-9](?:\b|$)/,   /* 00x designations: 001…009, agent 007 */
    /^０*００[０-９]/,               /* fullwidth 00x — the zh desk types the same watch list */
    /^wo-[0-9]+$/,                     /* officer designations WO-0…WO-9 */
    /^(?:the\s+)?admiralty$/,          /* the body itself is not a person */
    /^(?:(?:vice|rear|fleet)\s+)?admiral\b/, /* any admiral-prefixed callsign */
    /^(?:commodore|captain)\b/,         /* naval posts carry the title forward */
    /^(?:chief\s+)?warrant\s+officer\b/,
    /^(?:commander|lieutenant|ensign|midshipman)\b/,
    /^chief\s+of\b/,                    /* chief of staff / lifesupport / anything */
  ];

  function normalizeCallsign(s) { return String(s || "").trim().toLowerCase().replace(/\s+/g, " "); }

  /* ---------- bot containment ----------
     Any bot-shaped activity is treated like a cadet: forced to learn
     in containment, cut off from the main network's privileges, and
     released only by human adjudication — a STATION-CHIEF+ reviews the
     evidence and promotes or burns. Detection is heuristic: it gates
     desk privileges; it is not a proof of humanity. navigator and
     document may be absent (harness VMs, Electron preload contexts),
     so every signal is guarded and injectable.

     Strong signals contain on a single hit — they are automation
     scaffolding, not browser features. Weak signals need two hits;
     a privacy-hardened human trips at most one. */
  var CONTAIN_KEY = "fano1.containment";
  var BOT_GLOBALS = ["callPhantom", "_phantom", "__nightmare",
    "domAutomation", "domAutomationController", "$cdc_",
    "$chrome_asyncScriptInfo", "__webdriver_evaluate",
    "__selenium_evaluate", "__driver_evaluate",
    "__webdriver_script_fn", "__fxdriver_evaluate"];
  var BOT_UA_STRONG = /headless|phantomjs|selenium|webdriver|puppeteer|playwright|slimerjs|nightmare/i;
  var BOT_UA_WEAK = /\bbot\b|crawler|spider|scrapy|curl|wget|python-requests|httpclient|node\b/i;
  var _entropy = { keys: 0, moves: 0, t0: 0 };
  if (typeof document !== "undefined" && document && document.addEventListener) {
    _entropy.t0 = Date.now();
    document.addEventListener("keydown", function () { _entropy.keys++; }, true);
    document.addEventListener("pointermove", function () { _entropy.moves++; }, true);
    document.addEventListener("pointerdown", function () { _entropy.moves++; }, true);
  }
  function detectAutomation(now) {
    var strong = [], weak = [];
    var nav = (typeof navigator !== "undefined") ? navigator : null;
    if (nav) {
      var ua = nav.userAgent || "";
      if (nav.webdriver) strong.push("webdriver");
      if (BOT_UA_STRONG.test(ua)) strong.push("ua:" + ua.slice(0, 48));
      if (BOT_UA_WEAK.test(ua)) weak.push("ua-weak");
      if (nav.languages && nav.languages.length === 0) weak.push("no-languages");
      if (nav.plugins && nav.plugins.length === 0 &&
          !/mobile|android|iphone|ipad/i.test(ua)) weak.push("no-plugins");
    }
    var win = (typeof window !== "undefined") ? window : null;
    if (win) {
      for (var i = 0; i < BOT_GLOBALS.length; i++)
        if (typeof win[BOT_GLOBALS[i]] !== "undefined")
          strong.push("global:" + BOT_GLOBALS[i]);
      if (/^cdc_/.test(Object.keys(win).join(" "))) strong.push("global:cdc_*");
    }
    if (typeof document !== "undefined") {
      var age = ((typeof now === "number" ? now : Date.now())) - _entropy.t0;
      if (age < 3000 && _entropy.keys === 0 && _entropy.moves === 0)
        weak.push("no-entropy");
    }
    return strong.length ? strong
      : (weak.length >= 2 ? weak : []);
  }

  /* the containment registry: pks this desk has flagged, with the
     evidence and the adjudication status. Additive, never silent —
     a flag is an allegation with receipts, not a verdict. */
  function contained() {
    try { return JSON.parse(localStorage.getItem(CONTAIN_KEY)) || {}; } catch (e) { return {}; }
  }
  function saveContained(c) { try { localStorage.setItem(CONTAIN_KEY, JSON.stringify(c)); } catch (e) {} }
  function flagContained(pkHex, signals, origin) {
    if (!pkHex) return;
    var c = contained();
    if (!c[pkHex] || c[pkHex].status !== "burned") {
      c[pkHex] = { signals: signals || [], ts: Date.now(),
        status: (c[pkHex] && c[pkHex].status) || "pending",
        origin: origin || (c[pkHex] && c[pkHex].origin) || "enroll" };
      saveContained(c);
    }
  }
  /* the session's containment state — record flag wins, so a flagged
     identity stays contained across unlocks until a human promotes it */
  function isContained() {
    if (session.contained) return true;
    var rec = loadRecord();
    if (rec && rec.contained && rec.contained.length) return true;
    if (rec && rec.pk) {
      var c = contained()[rec.pk];
      if (c && c.status === "pending") return true;
    }
    return false;
  }
  /* adjudication — STATION-CHIEF+ only. promote clears the flag and
     the record's containment; burn erases the record outright. */
  function promoteContained(pkHex) {
    if (!session.sk || session.role < ROLES.station_chief) return false;
    var c = contained();
    if (!c[pkHex]) return false;
    c[pkHex].status = "promoted"; saveContained(c);
    var rec = loadRecord();
    if (rec && rec.pk === pkHex) {
      delete rec.contained;
      localStorage.setItem(STORE_KEY, JSON.stringify(rec));
      session.contained = false;
    }
    return true;
  }
  function burnContained(pkHex) {
    if (!session.sk || session.role < ROLES.station_chief) return false;
    var c = contained();
    if (!c[pkHex]) return false;
    c[pkHex].status = "burned"; saveContained(c);
    var rec = loadRecord();
    if (rec && rec.pk === pkHex) burn();
    return true;
  }
  /* promotion paper — a contained desk holds no chief session (its only
     record is the contained one), so adjudication travels as a signed
     FANO-CONTAIN-v1 token: minted by STATION-CHIEF+ or the fleet flag,
     bound to the subject pk, presented at the contained desk, verified
     against the same trust roots as grants. The bot learns in the
     academy until a human signs its release. */
  function promoBytes(subPkHex, issHex, exp) {
    return enc.encode("FANO-CONTAIN-v1\n" + subPkHex + "\n" + issHex + "\n" + exp);
  }
  function issuePromotion(targetPkHex, expiryDays) {
    if (!session.sk || session.role < ROLES.station_chief) return null;
    if (!/^[0-9a-f]{64}$/i.test(targetPkHex || "")) return { error: "bad_pk" };
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var issHex = hex(kp.pk);
    var exp = Math.floor(Date.now() / 1000) + (expiryDays || 30) * 86400;
    var sig = sign(promoBytes(targetPkHex.toLowerCase(), issHex, exp), session.sk);
    if (!sig) return null;
    return { v: "FANO-CONTAIN-v1", sub: targetPkHex.toLowerCase(),
      iss: issHex, sig: hex(sig), exp: exp };
  }
  function exportPromotion(p) { return p ? btoa(JSON.stringify(p)) : null; }
  function importPromotion(token) {
    try {
      var p = JSON.parse(atob(token.trim()));
      if (!p || p.v !== "FANO-CONTAIN-v1" || !p.sub || !p.iss || !p.sig) return false;
      var rec = loadRecord();
      if (!rec || rec.pk !== p.sub) return false;          /* wrong subject */
      if (p.exp < Math.floor(Date.now() / 1000)) return false;
      var trusted = trustedIssuer(p.iss);
      if (!trusted) return false;
      if (!verify(promoBytes(p.sub, p.iss, p.exp), unhex(p.sig), unhex(p.iss))) return false;
      delete rec.contained;
      localStorage.setItem(STORE_KEY, JSON.stringify(rec));
      session.contained = false;
      var c = contained();
      if (c[p.sub]) { c[p.sub].status = "promoted"; saveContained(c); }
      else { c[p.sub] = { signals: ["adjudicated"], ts: Date.now(), status: "promoted", origin: "promotion" }; saveContained(c); }
      return true;
    } catch (e) { return false; }
  }
  function isRestricted(norm) {
    if (RESTRICTED_NAMES[norm]) return true;
    for (var i = 0; i < RESTRICTED_RE.length; i++) if (RESTRICTED_RE[i].test(norm)) return true;
    return false;
  }
  function isPinned(norm) { return hex(sha256(enc.encode(norm))) === PINNED_CALLSIGN_HASH; }

  /* grant token: signed by issuer, binds callsign → optional subject pk.
     Unclaimed grants (sub:null) are claimable once — first enrollment
     binds them. Claimed grants only enroll the bound pk. */
  function grants() {
    var g;
    try { g = JSON.parse(localStorage.getItem(GRANTS_KEY)) || {}; } catch (e) { return {}; }
    /* expired paper is dead paper — lapsed grants are swept on read so
       nothing downstream can quietly resurrect them. A roaming flag
       grant lapses the same way: the paper's expiry is the leash. */
    var now = Math.floor(Date.now() / 1000), dirty = false;
    for (var k in g)
      if (g[k] && typeof g[k].exp === "number" && g[k].exp < now) {
        delete g[k]; dirty = true;
      }
    if (dirty) saveGrants(g);
    return g;
  }
  function saveGrants(g) { try { localStorage.setItem(GRANTS_KEY, JSON.stringify(g)); } catch (e) {} }
  function grantBytes(callsign, subPkHex, issPkHex, exp) {
    return enc.encode("FANO-CALLSIGN-v1\n" + callsign + "\n" + (subPkHex || "-") + "\n" + issPkHex + "\n" + exp);
  }
  /* ---------- revocation ----------
     A callsign grant can be rescinded: the desk records the revocation
     and verifyGrant refuses the callsign thereafter, even while the
     signed paper still sits in the ledger (kept as evidence). Scope is
     desk-local and permanent — a dead office stays dead here; only a
     fresh desk never heard the news. STATION-CHIEF+ only. */
  var REVOKED_KEY = "fano1.revoked";
  function revoked() {
    try { return JSON.parse(localStorage.getItem(REVOKED_KEY)) || {}; } catch (e) { return {}; }
  }
  function revokeCallsign(callsign) {
    if (isContained()) return false;
    if (!session.sk || session.role < ROLES.station_chief) return false;
    var norm = normalizeCallsign(callsign);
    if (!norm) return false;
    var kp = expandSeed(session.sk);
    if (!kp) return false;
    var r = revoked();
    r[norm] = { iss: hex(kp.pk), ts: Date.now() };
    try { localStorage.setItem(REVOKED_KEY, JSON.stringify(r)); } catch (e) {}
    return true;
  }
  /* ---------- fleet flag anchor ----------
     The roster is desk-local; the flag seat is fleet-public. The
     published fleet-genesis.json names the admiral member — after every
     signature verifies, first contact stages a pending pin. A human must
     confirm the genesis hash and flag key out of band before
     flagAnchored() trusts fleet paper on this desk. */
  var fleetFlagPk = null, fleetPin = null, fleetPending = null, fleetConflict = false;
  try {
    var p0 = JSON.parse(localStorage.getItem(FLEET_PIN_KEY) || "null");
    if (p0 && /^[0-9a-f]{64}$/.test(p0.genesis_sha256 || "") &&
        /^[0-9a-f]{64}$/.test(p0.flag_pk || "")) {
      if (p0.confirmed_out_of_band === true) {
        fleetPin = p0;
        fleetFlagPk = p0.flag_pk;
      } else {
        fleetPending = { genesis_sha256: p0.genesis_sha256,
          flag_pk: p0.flag_pk, first_seen: p0.first_seen || null };
      }
    }
  } catch (e) { fleetPin = null; fleetFlagPk = null; }

  function b64urlBytes(s) {
    var b = String(s || "").replace(/-/g, "+").replace(/_/g, "/");
    while (b.length % 4) b += "=";
    return Uint8Array.from(atob(b), function (c) { return c.charCodeAt(0); });
  }
  function memberRawPk(m) {
    if (!m || !m.pubkey_pem_b64) return null;
    try {
      /* atob unwraps b64→pem, strip armor, atob again b64→der */
      var b64 = atob(m.pubkey_pem_b64).replace(/-----[^-]+-----|\s/g, "");
      var der = Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
      var raw = der.length === 44 ? der.slice(-32) : der;
      return raw.length === 32 ? raw : null;
    } catch (e) { return null; }
  }
  function normalizeFleetPin(pin) {
    if (!pin) return null;
    if (typeof pin === "string") pin = { genesis_sha256: pin };
    var g = String(pin.genesis_sha256 || "").toLowerCase();
    var f = String(pin.flag_pk || "").toLowerCase();
    if (!/^[0-9a-f]{64}$/.test(g) || !/^[0-9a-f]{64}$/.test(f)) return null;
    return { genesis_sha256: g, flag_pk: f };
  }
  function fleetFingerprint(v) {
    return String(v || "").toUpperCase().replace(/(.{8})/g, "$1 ").trim();
  }
  function bindFleetFlag(gen, opts) {
    var expected = normalizeFleetPin(opts && opts.pin);
    var pinnedFallback = function () { return fleetPin ? fleetPin.flag_pk : null; };
    var done = function (g) {
      var ms = (g && g.payload && g.payload.members) || [];
      var sigs = (g && g.sigs) || {};
      var names = {}, raws = {}, roots = [], seats = {}, nSeats = 0, adm = null, admRaw = null;
      if (!g) return pinnedFallback();
      if (!ms.length) return pinnedFallback();
      for (var i = 0; i < ms.length; i++) {
        var m = ms[i], raw = memberRawPk(m);
        if (!m.name || names[m.name] || !raw) return pinnedFallback();
        names[m.name] = true;
        raws[m.name] = raw;
        if (m.role === "genesis-root") roots.push(m.name);
        if ((m.name === "admiral" || m.role === "flag-seat")) {
          if (!seats[m.pubkey_pem_b64]) { seats[m.pubkey_pem_b64] = m; nSeats++; }
          adm = seats[m.pubkey_pem_b64];
          admRaw = raw;
        }
      }
      var sigNames = Object.keys(sigs);
      if (!roots.length || sigNames.length !== roots.length) return pinnedFallback();
      var body = enc.encode(JSON.stringify(g.payload, null, 2));
      for (i = 0; i < roots.length; i++) {
        if (!sigs[roots[i]] || !verify(body, b64urlBytes(sigs[roots[i]]), raws[roots[i]])) return pinnedFallback();
      }
      for (i = 0; i < sigNames.length; i++) {
        var signer = ms.filter(function (m) { return m.name === sigNames[i]; })[0];
        if (!signer || signer.role !== "genesis-root") return pinnedFallback();
      }
      var ghash = hex(sha256(body));
      if (fleetPin && fleetPin.genesis_sha256 !== ghash) {
        fleetConflict = true;
        fleetFlagPk = null;
        return null;
      }
      /* an ambiguous flag seat is hostile: two different keys claiming
         the seat means the doc was tampered — refuse to bind at all */
      if (nSeats !== 1 || !adm || !admRaw) { fleetFlagPk = null; return null; }
      var flagPk = hex(admRaw);
      if (!fleetPin) {
        fleetPending = { genesis_sha256: ghash, flag_pk: flagPk,
          first_seen: new Date().toISOString() };
        /* First contact is evidence, not trust. The caller must present
           the genesis hash AND flag key out of band before this desk
           anchors fleet paper to the document. */
        if (!expected || expected.genesis_sha256 !== ghash ||
            expected.flag_pk !== flagPk) {
          fleetFlagPk = null;
          return null;
        }
        fleetPin = { genesis_sha256: ghash, flag_pk: flagPk,
          first_seen: fleetPending.first_seen,
          confirmed_out_of_band: true };
        try { localStorage.setItem(FLEET_PIN_KEY, JSON.stringify(fleetPin)); } catch (e) {}
        fleetPending = null;
      } else if (fleetPin.flag_pk !== flagPk) {
        fleetConflict = true;
        fleetFlagPk = null;
        return null;
      }
      fleetFlagPk = flagPk;
      return fleetFlagPk;
    };
    return gen !== undefined
      ? Promise.resolve(done(gen))
      : fetch("fleet-genesis.json").then(function (r) {
          return r.ok ? r.json() : null;
        }).then(done).catch(function () {
          /* A confirmed pin remains usable offline; only a verified
             conflicting document clears the in-memory anchor. */
          fleetFlagPk = fleetPin ? fleetPin.flag_pk : null;
          return fleetFlagPk;
        });
  }
  function confirmFleetPin(pin) {
    var expected = normalizeFleetPin(pin);
    if (!expected || !fleetPending) return null;
    if (expected.genesis_sha256 !== fleetPending.genesis_sha256 ||
        expected.flag_pk !== fleetPending.flag_pk) return null;
    fleetPin = { genesis_sha256: fleetPending.genesis_sha256,
      flag_pk: fleetPending.flag_pk, first_seen: fleetPending.first_seen,
      confirmed_out_of_band: true };
    try { localStorage.setItem(FLEET_PIN_KEY, JSON.stringify(fleetPin)); } catch (e) {}
    fleetPending = null;
    fleetFlagPk = fleetPin.flag_pk;
    return fleetFlagPk;
  }
  function flagAnchored(issHex) { return !!fleetFlagPk && issHex === fleetFlagPk; }
  function fleetPinState() {
    var p = fleetPending || fleetPin;
    return { pinned: !!fleetPin, pending: !!fleetPending, conflict: fleetConflict,
      genesis_sha256: fleetPin && fleetPin.genesis_sha256 || null,
      flag_pk: fleetPin && fleetPin.flag_pk || null,
      pending_genesis_sha256: fleetPending && fleetPending.genesis_sha256 || null,
      pending_flag_pk: fleetPending && fleetPending.flag_pk || null,
      pending_fingerprint: p ? fleetFingerprint(p.genesis_sha256) : null,
      pending_flag_fingerprint: p ? fleetFingerprint(p.flag_pk) : null };
  }

  function verifyGrant(g, forPkHex) {
    if (!g || !g.callsign || !g.iss || !g.sig) return false;
    if (g.exp < Math.floor(Date.now() / 1000)) return false;
    if (revoked()[g.callsign]) return false;   /* rescinded — filed as evidence, dead as paper */
    var fleet = flagAnchored(g.iss);
    var rostered = !fleet && trustedIssuer(g.iss);
    if (!rostered && !fleet) return false;
    /* claim binding: an unbound (roaming) grant is claimed to the first
       pk that enrolls with it. Newer ledgers keep the signed `sub` and
       record `claimed`; pre-C82 ledgers rewrote `sub` at claim time,
       which broke the signature — detect those by re-verifying against
       the unbound body. Either way the claimant binding must match. */
    var ok = verify(grantBytes(g.callsign, g.sub, g.iss, g.exp), unhex(g.sig), unhex(g.iss));
    var bound = g.sub || g.claimed || null;
    if (!ok && g.sub) {
      ok = verify(grantBytes(g.callsign, null, g.iss, g.exp), unhex(g.sig), unhex(g.iss));
      bound = ok ? g.sub : bound;   /* legacy claim: sub was the claim, not the signed binding */
    }
    if (!ok) return false;
    if (bound && bound !== forPkHex) return false;
    if (fleet) g._fleet = true;   /* grant anchored by the fleet board, not this desk */
    return true;
  }
  /* ---------- flag authenticator ----------
     The pinned callsign is the only seat that gets a FANO-ROOT-v1
     credential: a signed, portable artifact that proves "this public
     key holds flag authority" to any desk that verifies it. Every
     other callsign keeps the FANO-CALLSIGN-v1 one-shot grant.
     The credential embeds the grant itself, so the same artifact both
     enrolls the callsign (grant path) and authenticates the holder
     (credential path). Trust anchor on the verifying desk is the
     issuer roster — same model as grants and elevated certs. If the
     desk carries a genesis record, the credential's genesis anchor
     must match it: a founding that isn't yours refuses. */
  function credBytes(call, sub, role, iss, gen, exp) {
    return enc.encode("FANO-ROOT-v1\n" + call + "\n" + (sub || "-") + "\n" + role +
      "\n" + iss + "\n" + (gen || "-") + "\n" + exp);
  }
  function mintCredential(norm, subPkHex, issHex, exp, sk) {
    /* gen anchors the credential to the signing key itself —
       sha256(iss_pk) self-proves "the issuer is the founding key"
       and verifies on any desk, since the fleet's founding hash IS
       the issuer's public key hash. A verifier's own desk genesis is
       a local fact, not the fleet's. */
    var genSha = hex(sha256(unhex(issHex)));
    var sig = sign(credBytes(norm, subPkHex, ROLES.fleet_admiral, issHex, genSha, exp), sk);
    if (!sig) return null;
    return { v: "FANO-ROOT-v1", callsign: norm, sub: subPkHex || null,
      role: ROLES.fleet_admiral, iss: issHex, gen: genSha, exp: exp,
      sig: hex(sig) };
  }
  function verifyCredential(c) {
    if (!c || c.v !== "FANO-ROOT-v1" || !c.callsign || !c.iss || !c.sig) return null;
    if (!isPinned(c.callsign)) return null;             /* root creds exist only for the flag seat */
    if (c.role !== ROLES.fleet_admiral) return null;
    if (c.exp < Math.floor(Date.now() / 1000)) return null;
    if (!trustedIssuer(c.iss)) return null;
    if (c.gen !== hex(sha256(unhex(c.iss)))) return null; /* founding must be the signing key itself */
    if (!verify(credBytes(c.callsign, c.sub, c.role, c.iss, c.gen, c.exp), unhex(c.sig), unhex(c.iss)))
      return null;
    var g = genesis();
    var embedded = c.grant ? verifyGrant(c.grant, c.sub || undefined) : false;
    return { ok: true, callsign: c.callsign, sub: c.sub, iss: c.iss,
      exp: c.exp, gen: c.gen, grant_ok: embedded,
      same_founding: !!(g && g.pk === c.iss), tofu: !g };
  }
  function issueCredential(targetPkHex, expiryDays) {
    if (isContained()) return null;
    if (!session.sk || session.role < ROLES.fleet_admiral) return null;
    var rec = loadRecord();
    if (!rec || !isPinned(rec.user)) return { error: "not_flag_seat" };
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var issHex = hex(kp.pk);
    var exp = Math.floor(Date.now() / 1000) + (expiryDays || 365) * 86400;
    var sub = targetPkHex || rec.pk;
    var sig = sign(grantBytes(rec.user, sub, issHex, exp), session.sk);
    if (!sig) return null;
    var g = { callsign: rec.user, sub: sub, iss: issHex, sig: hex(sig), exp: exp };
    var cred = mintCredential(rec.user, sub, issHex, exp, session.sk);
    if (!cred) return null;
    var all = grants(); g.root = cred; all[rec.user] = g; saveGrants(all);
    return cred;
  }
  /* roaming paper: an UNBOUND flag authenticator — sub:null, so any
     keypair may enroll the pinned callsign where a desk trusts the
     fleet anchor. Bearer instrument: whoever holds it holds the seat.
     It is intentionally not filed as a desk-local grant — it exists
     to travel, minted fresh each call, short-dated by default. */
  function issueRoaming(expiryDays) {
    if (isContained()) return null;
    if (!session.sk || session.role < ROLES.fleet_admiral) return null;
    var rec = loadRecord();
    if (!rec || !isPinned(rec.user)) return { error: "not_flag_seat" };
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var issHex = hex(kp.pk);
    var exp = Math.floor(Date.now() / 1000) + (expiryDays || 30) * 86400;
    var sig = sign(grantBytes(rec.user, null, issHex, exp), session.sk);
    if (!sig) return null;
    var g = { callsign: rec.user, sub: null, iss: issHex, sig: hex(sig), exp: exp };
    var cred = mintCredential(rec.user, null, issHex, exp, session.sk);
    if (!cred) return null;
    cred.grant = g;
    return btoa(JSON.stringify(cred));
  }
  function exportCredential() {
    var rec = loadRecord();
    if (!rec) return null;
    /* exportGrant rebuilds the embedded grant — the authenticator
       must carry it so the artifact both enrolls and verifies */
    var g = grants()[rec.user];
    return g && g.root ? exportGrant(rec.user) : null;
  }
  function authenticate(token) {
    try {
      var c = JSON.parse(atob(token.trim()));
      var v = verifyCredential(c);
      if (!v) return null;
      /* file the embedded grant so the callsign path sees it too —
         strip the grant from the stored root to keep the graph acyclic */
      if (c.grant) {
        var all = grants(), root = Object.assign({}, c);
        delete root.grant;
        all[c.callsign] = c.grant; all[c.callsign].root = root; saveGrants(all);
      }
      return v;
    } catch (e) { return null; }
  }

  function grantCallsign(callsign, targetPkHex, expiryDays) {
    if (isContained()) return null;
    if (!session.sk || session.role < ROLES.station_chief) return null;
    var norm = normalizeCallsign(callsign);
    if (!isRestricted(norm) && !isPinned(norm)) return { error: "not_restricted" };
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var issHex = hex(kp.pk);
    var exp = Math.floor(Date.now() / 1000) + (expiryDays || 90) * 86400;
    var sig = sign(grantBytes(norm, targetPkHex || null, issHex, exp), session.sk);
    if (!sig) return null;
    var g = { callsign: norm, sub: targetPkHex || null, iss: issHex, sig: hex(sig), exp: exp };
    /* the flag seat's grant is an authenticator, not a coupon —
       mint the FANO-ROOT-v1 credential alongside the grant */
    if (isPinned(norm)) {
      var cred = mintCredential(norm, targetPkHex || null, issHex, exp, session.sk);
      if (cred) g.root = cred;
    }
    var all = grants(); all[norm] = g; saveGrants(all);
    return g;
  }
  function exportGrant(norm) {
    var g = grants()[norm];
    if (!g) return null;
    /* flag grants export as the authenticator — rebuild the embedded
       grant so the artifact both enrolls and authenticates */
    if (g.root) {
      return btoa(JSON.stringify(Object.assign({}, g.root, {
        grant: { callsign: g.callsign, sub: g.sub, iss: g.iss, sig: g.sig, exp: g.exp } })));
    }
    return btoa(JSON.stringify(g));
  }
  function importGrant(token) {
    try {
      var o = JSON.parse(atob(token.trim()));
      var g = o.v === "FANO-ROOT-v1" ? o.grant : o;
      if (!g || !g.callsign || !g.iss || !g.sig) return false;
      var all = grants();
      if (o.v === "FANO-ROOT-v1") {
        var root = Object.assign({}, o); delete root.grant; /* acyclic store */
        g.root = root;
      }
      all[normalizeCallsign(g.callsign)] = g; saveGrants(all);
      return true;
    } catch (e) { return false; }
  }
  /* checkCallsign: what enroll() enforces and what the UI/tests query.
     Returns {ok, pinned?, restricted?, reason?} — reason is a key, the
     UI translates it. pkHex is the would-be enrollee's pk (post-genesis
     the pk exists before the record is stored). */
  function checkCallsign(name, pkHex) {
    var norm = normalizeCallsign(name);
    if (!norm) return { ok: false, reason: "empty" };
    if (norm.length > 48) return { ok: false, reason: "too_long" };
    if (isPinned(norm)) {
      if (!genesis()) return { ok: true, pinned: true }; /* unfounded desk — first signature claims it */
      var pg = grants()[norm];
      if (pg && verifyGrant(pg, pkHex)) return { ok: true, restricted: true, grant: pg };
      return { ok: false, restricted: true, reason: "claimed" }; /* founding key holds the console callsign */
    }
    if (isRestricted(norm)) {
      var g = grants()[norm];
      if (g && verifyGrant(g, pkHex)) return { ok: true, restricted: true, grant: g };
      return { ok: false, restricted: true, reason: "restricted" };
    }
    return { ok: true };
  }
  /* consume a grant: claim it to a pk so the token can't enroll twice.
     `claimed` records the claimant without touching the signed body —
     rewriting `sub` used to invalidate roaming-grant signatures. */
  function claimGrant(g, pkHex) {
    var all = grants();
    if (!g.sub && !g.claimed) { g.claimed = pkHex; all[g.callsign] = g; saveGrants(all); }
  }

  function verifyCert(record) {
    var c = record.cert;
    if (!c) return false;
    /* the cert must be bound to this record's subject key */
    if (c.iss !== record.pk) return false;
    /* the role field is bound too — ranks don't exist past the flag */
    if (typeof c.role !== "number" || c.role !== Math.floor(c.role) ||
        c.role < ROLES.field_agent || c.role > ROLES.fleet_admiral) return false;
    var body = certBytes(unhex(record.pk), record.user, c.role, unhex(record.covenant_sha256), unhex(c.iss), c.exp);
    if (c.exp < Math.floor(Date.now() / 1000)) return false;
    if (!verify(body, unhex(c.sig), unhex(c.iss))) return false;
    /* roles above CADET must trace to a rostered issuer — or, for the
       flag seat alone, to the Admiral's paper: the stored grant must
       still verify on its own terms (roster-or-fleet issuer, live
       expiry, unrevoked), not just carry a flag it was once given */
    if (c.role > ROLES.field_agent) {
      var g0 = genesis();
      var flagSeat = c.role === ROLES.fleet_admiral && isPinned(record.user) &&
        ((g0 && g0.pk === record.pk) || flagAnchored(record.pk));
      var grantPaper = isPinned(record.user) ? grants()[record.user] : null;
      var grantOk = !!(grantPaper && verifyGrant(grantPaper, record.pk));
      if (c.role === ROLES.fleet_admiral && !flagSeat && !grantOk) return false;
      if (c.role < ROLES.fleet_admiral && !trustedIssuer(record.pk) && !grantOk) return false;
    }
    return true;
  }

  function enroll(callsign, passphrase, grantToken) {
    /* import a grant token first if the caller presented one */
    if (grantToken) importGrant(grantToken);
    var id = genIdentity();
    var norm = normalizeCallsign(callsign);
    var chk = checkCallsign(norm, hex(id.pk));
    if (!chk.ok) return { error: chk.reason || "restricted" };
    var covHash = covenantHash();
    var sig = sign(covenantBytes(), id.sk);
    if (!sig) return null;
    /* genesis rules: the first identity on this desk founds it —
       that enrollment writes the genesis record binding the founding
       callsign to the founding public key. The pinned callsign is no
       shortcut: it only claims genesis on an unfounded desk. */
    var isGenesis = !loadRecord() && !genesis();
    /* founding ≠ flag rank. FLEET-ADMIRAL comes only from the pinned
       callsign — claiming genesis on an unfounded desk, or enrolling
       under a fleet-anchored grant (roaming). Any other first
       enrollment founds the desk as a CADET: a fresh desk is a
       recruit, not an admiralty. Elevation enters only by grant
       from an already-rostered STATION-CHIEF+ issuer or the fleet
       anchor — never by being first through the door. */
    var role = isPinned(norm) && (isGenesis || (chk.grant && chk.grant._fleet))
      ? ROLES.fleet_admiral : ROLES.field_agent;
    /* bot-shaped activity goes to containment before anything else:
       automation hits pin the role to cadet and flag the record —
       even a pinned callsign claimed by a bot stays a cadet until a
       human adjudicates. The flag outranks the callsign. */
    var botHits = detectAutomation();
    if (botHits.length) role = ROLES.field_agent;
    var cert = issueCert(id.pk, norm, role, covHash, id.pk, id.sk, 365 * 5);
    if (chk.grant) claimGrant(chk.grant, hex(id.pk));
    var salt = randBytes(16), nonce = randBytes(12);
    var key = pbkdf2(passphrase, salt);
    if (!key) return null;
    var wrapped = aesEnc(id.sk, key, nonce);
    if (!wrapped) return null;
    var rec = {
      v: 1, user: norm, pk: hex(id.pk),
      covenant_sha256: hex(covHash), covenant_sig: hex(sig),
      cert: cert,
      keystore: { salt: hex(salt), nonce: hex(nonce), ct: hex(wrapped.ct), tag: hex(wrapped.tag) },
      created: new Date().toISOString(),
    };
    if (botHits.length) rec.contained = botHits;
    localStorage.setItem(STORE_KEY, JSON.stringify(rec));
    if (botHits.length) flagContained(hex(id.pk), botHits, "enroll");
    /* every enrollment is a life — the desk counts them */
    try {
      localStorage.setItem("fano1.lives",
        String(parseInt(localStorage.getItem("fano1.lives") || "0", 10) + 1));
    } catch (e) {}
    if (isGenesis) {
      saveGenesis({ callsign: norm, pk: hex(id.pk),
        pk_sha256: hex(sha256(id.pk)), ts: Date.now() });
      addIssuerRaw(hex(id.pk));
    }
    rec.genesis = isGenesis;
    rec.genesis_hash = (genesis() || {}).pk_sha256 || null;
    session.sk = id.sk; session.user = norm; session.role = role; session.totp = true;
    session.contained = !!botHits.length;
    sessionTouch();
    setIdentity(id.sk);
    return rec;
  }

  function loadRecord() {
    try { return JSON.parse(localStorage.getItem(STORE_KEY)); } catch (e) { return null; }
  }

  /* unlock throttle: 5 failures → exponential backoff, persisted so a
     reload doesn't reset the counter. Honest note: a local attacker can
     clear localStorage — the real rate-limit lives relay-side; this is
     depth, not the wall. */
  var FAIL_KEY = 'fano1.auth.fail';
  function fails() { try { return JSON.parse(localStorage.getItem(FAIL_KEY)) || { n: 0, until: 0 }; } catch (e) { return { n: 0, until: 0 }; } }
  function lockRemain() { var f = fails(); return f.until > Date.now() ? Math.ceil((f.until - Date.now()) / 1000) : 0; }

  function unlock(passphrase) {
    if (lockRemain()) return null;
    var rec = loadRecord();
    if (!rec || !rec.keystore) return null;
    var key = pbkdf2(passphrase, unhex(rec.keystore.salt));
    if (!key) return null;
    var sk = aesDec(unhex(rec.keystore.ct), key, unhex(rec.keystore.nonce), unhex(rec.keystore.tag));
    if (!sk || sk.length !== 32) { failBump(); return null; }
    /* verify the covenant signature still matches the public key on record */
    if (!verify(covenantBytes(), unhex(rec.covenant_sig), unhex(rec.pk))) { failBump(); return null; }
    /* continuity: the decrypted seed must derive the recorded public key,
     otherwise the keystore payload was swapped under a valid GCM tag */
    var kp = expandSeed(sk);
    if (!kp || hex(kp.pk) !== rec.pk) { failBump(); return null; }
    failReset();
    /* legacy desk: records enrolled before the roster existed carry a
       self-issued cert — seed the roster from the record once the seed
       itself proved pk-continuity above. */
    if (roster().length === 0 && rec.cert && rec.cert.iss === rec.pk) addIssuerRaw(rec.pk);
    /* retroactive founding: a record that predates the genesis record
       claims it — the first real login sets the real genesis hash. */
    if (!genesis()) {
      saveGenesis({ callsign: rec.user, pk: rec.pk,
        pk_sha256: hex(sha256(unhex(rec.pk))),
        ts: Date.parse(rec.created) || Date.now(), retro: true });
    }
    session.sk = sk; session.user = rec.user; session.totp = !rec.totp;
    session.role = verifyCert(rec) ? rec.cert.role : 0;
    session.contained = !!(rec.contained && rec.contained.length);
    if (session.contained) session.role = ROLES.field_agent; /* flagged — cadet until adjudicated */
    sessionTouch();
    setIdentity(sk);
    rec.totp_required = !!rec.totp;
    return rec;
  }

  function failBump() { var f = fails(); f.n++; f.until = f.n >= 5 ? Date.now() + Math.min(300000, 15000 * Math.pow(2, f.n - 5)) : 0; try { localStorage.setItem(FAIL_KEY, JSON.stringify(f)); } catch (e) {} }
  function failReset() { try { localStorage.removeItem(FAIL_KEY); } catch (e) {} }

  function hasRole(level) { return session.role >= level; }

  /* ---------- branch assignments ----------
     The fleet's ten divisions are its branches. A request is signed by
     the requester's own key (proof of custody), queued locally, and
     carried to the Admiral's desk as a b64 token over any channel —
     comms wire, dead drop, or paste. Only FLEET-ADMIRAL approves; the
     assignment is a signed FANO-BRANCH-v1 cert bound to the subject pk. */
  var BRANCHES = ["admiralty", "constitutional", "ethics", "human_academic",
    "legal_financial", "research_ip", "security", "specs", "strategy", "narrative"];
  var BRANCH_REQ_KEY = "fano1.branchreqs";
  var BRANCHES_KEY = "fano1.branches";

  function reqBytes(call, pkHex, branch, ts) {
    return enc.encode("FANO-BRANCH-REQ-v1\n" + call + "\n" + pkHex + "\n" + branch + "\n" + ts);
  }
  function branchBytes(subPkHex, branch, issHex, exp) {
    return enc.encode("FANO-BRANCH-v1\n" + subPkHex + "\n" + branch + "\n" + issHex + "\n" + exp);
  }
  function branchReqs() { try { return JSON.parse(localStorage.getItem(BRANCH_REQ_KEY)) || {}; } catch (e) { return {}; } }
  function saveBranchReqs(r) { try { localStorage.setItem(BRANCH_REQ_KEY, JSON.stringify(r)); } catch (e) {} }
  function branchAssigns() { try { return JSON.parse(localStorage.getItem(BRANCHES_KEY)) || {}; } catch (e) { return {}; } }
  function saveBranchAssigns(b) { try { localStorage.setItem(BRANCHES_KEY, JSON.stringify(b)); } catch (e) {} }

  function requestBranch(branch) {
    if (isContained()) return null;
    if (!session.sk || !session.user) return null;
    if (BRANCHES.indexOf(branch) < 0) return { error: "unknown_branch" };
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var pkHex = hex(kp.pk);
    var ts = Math.floor(Date.now() / 1000);
    var sig = sign(reqBytes(session.user, pkHex, branch, ts), session.sk);
    if (!sig) return null;
    var req = { callsign: session.user, pk: pkHex, branch: branch, ts: ts, sig: hex(sig), status: "pending" };
    var all = branchReqs(); all[pkHex] = req; saveBranchReqs(all);
    return req;
  }
  function verifyRequest(r) {
    if (!r || !r.pk || !r.callsign || !r.branch || !r.sig || !r.ts) return false;
    if (BRANCHES.indexOf(r.branch) < 0) return false;
    return verify(reqBytes(r.callsign, r.pk, r.branch, r.ts), unhex(r.sig), unhex(r.pk));
  }
  function exportRequest(pkHex) {
    var r = branchReqs()[pkHex];
    return r ? btoa(JSON.stringify(r)) : null;
  }
  function importRequest(token) {
    try {
      var r = JSON.parse(atob(token.trim()));
      if (!verifyRequest(r)) return false;
      var all = branchReqs(); r.status = "pending"; all[r.pk] = r; saveBranchReqs(all);
      return true;
    } catch (e) { return false; }
  }
  /* Fleet Admiral only — "over the network" approvals land here. */
  function assignBranch(subPkHex, branch) {
    if (isContained()) return null;
    if (!session.sk || session.role < ROLES.fleet_admiral) return null;
    if (BRANCHES.indexOf(branch) < 0) return { error: "unknown_branch" };
    var kp = expandSeed(session.sk);
    if (!kp) return null;
    var issHex = hex(kp.pk);
    var exp = Math.floor(Date.now() / 1000) + 365 * 5 * 86400;
    var sig = sign(branchBytes(subPkHex, branch, issHex, exp), session.sk);
    if (!sig) return null;
    var a = { sub: subPkHex, branch: branch, iss: issHex, sig: hex(sig), exp: exp };
    var bs = branchAssigns(); bs[subPkHex] = a; saveBranchAssigns(bs);
    var all = branchReqs();
    if (all[subPkHex]) { all[subPkHex].status = "approved"; saveBranchReqs(all); }
    return a;
  }
  function denyBranch(subPkHex) {
    if (isContained()) return false;
    if (!session.sk || session.role < ROLES.fleet_admiral) return false;
    var all = branchReqs();
    if (!all[subPkHex]) return false;
    all[subPkHex].status = "denied"; saveBranchReqs(all);
    return true;
  }
  /* the live assignment for a pk — verified sig + trusted issuer + unexpired.
     Trust is roster OR fleet anchor, the same rule grants and promotions
     use: a second desk that binds the fleet genesis honors the flag's
     assignments without ever holding the flag's roster. */
  function branchOf(pkHex) {
    var a = branchAssigns()[pkHex];
    if (!a) return null;
    if (a.exp < Math.floor(Date.now() / 1000)) return null;
    if (!trustedIssuer(a.iss)) return null;
    if (!verify(branchBytes(a.sub, a.branch, a.iss, a.exp), unhex(a.sig), unhex(a.iss))) return null;
    return a;
  }
  /* assignment certs are portable paper: export carries the signed body,
     import files it after a signature check — trust is still enforced at
     read time by branchOf, so dead paper can file but never verify */
  function exportAssignment(pkHex) {
    var a = branchAssigns()[pkHex];
    return a ? btoa(JSON.stringify(a)) : null;
  }
  function importAssignment(token) {
    try {
      var a = JSON.parse(atob(token.trim()));
      if (!a || !a.sub || !a.branch || !a.iss || !a.sig || !a.exp) return false;
      if (BRANCHES.indexOf(a.branch) < 0) return false;
      if (!verify(branchBytes(a.sub, a.branch, a.iss, a.exp), unhex(a.sig), unhex(a.iss))) return false;
      var bs = branchAssigns(); bs[a.sub] = a; saveBranchAssigns(bs);
      return true;
    } catch (e) { return false; }
  }
  /* burn(): the identity dies; the desk remembers its founding.
     burn("genesis") additionally erases the founding record — the lab
     reset, reachable only by deliberately asking for it. */
  /* fold the session: zero the unwrapped secret bytes before dropping
     the reference. The WASM side keeps its identity copy (it must
     sign); a full wipe is burn(). */
  function lock() {
    if (sessionTimer) {
      if (typeof clearTimeout === "function") clearTimeout(sessionTimer);
      sessionTimer = null;
    }
    if (session.sk && session.sk.fill) { try { session.sk.fill(0); } catch (e) {} }
    session.sk = null; session.user = null; session.role = 0;
    session.totp = false; session.contained = false;
  }
  function burn(scope) {
    localStorage.removeItem(STORE_KEY);
    lock();
    localStorage.removeItem(FAIL_KEY);   /* a deliberate burn resets the throttle */
    if (scope === "genesis") burnGenesis();
  }
  function fingerprint() {
    var rec = loadRecord();
    return rec ? rec.pk.slice(0, 16).toUpperCase().replace(/(.{4})/g, "$1 ").trim() : null;
  }

  /* ---------- desk transfer ----------
     A desk is its key, not its machine. FANO-DESK-v1 carries the whole
     desk record — identity (keystore still passphrase-wrapped; the key
     never travels in the clear), the founding, the issuer roster, and
     the grants ledger — signed by the desk's own key so a receiving
     desk can authenticate the handoff before it trusts it. */
  function deskBytes(bundle) {
    var b = Object.assign({}, bundle); delete b.sig;
    return enc.encode("FANO-DESK-v1\n" + canonJson(b));
  }
  function canonJson(o) { return JSON.stringify(o, null, 2); }
  function exportDesk() {
    if (isContained()) return null;
    if (!session.sk) return null;
    var rec = loadRecord();
    if (!rec) return null;
    var bundle = { v: "FANO-DESK-v1", ts: new Date().toISOString(),
      record: rec, genesis: genesis(), issuers: roster(),
      issuer_proofs: issuerProofs(), grants: grants(), revoked: revoked() };
    var sig = sign(deskBytes(bundle), session.sk);
    if (!sig) return null;
    bundle.sig = hex(sig);
    return btoa(JSON.stringify(bundle));
  }
  function importDesk(token) {
    var b;
    try { b = JSON.parse(atob(token.trim())); } catch (e) { return { error: "not_desk_token" }; }
    if (!b || b.v !== "FANO-DESK-v1" || !b.record || !b.sig)
      return { error: "not_desk_token" };
    if (loadRecord()) return { error: "desk_founded" };
    /* the token must be signed by the key it carries */
    if (!verify(deskBytes(b), unhex(b.sig), unhex(b.record.pk)))
      return { error: "sig_invalid" };
    /* founding only travels with its own key — a token claiming a
       genesis that isn't the carried key's is a forgery of state */
    var g = b.genesis;
    if (g && g.pk !== b.record.pk) g = null;
    localStorage.setItem(STORE_KEY, JSON.stringify(b.record));
    if (g) saveGenesis(g);
    var importedProofs = b.issuer_proofs && typeof b.issuer_proofs === "object"
      ? b.issuer_proofs : {};
    (b.issuers || []).forEach(function (p) {
      if (/^[0-9a-f]{64}$/i.test(p)) addIssuerRaw(p.toLowerCase(), importedProofs[p.toLowerCase()]); });
    if (b.grants && typeof b.grants === "object") saveGrants(b.grants);
    if (b.revoked && typeof b.revoked === "object") {
      try { localStorage.setItem(REVOKED_KEY, JSON.stringify(b.revoked)); } catch (e) {}
    }
    return { ok: true, user: b.record.user,
             founded: !!(g && g.pk === b.record.pk) };
  }

  return {
    load: load, enroll: enroll, unlock: unlock, burn: burn, lock: lock,
    genesis: genesis, burnGenesis: burnGenesis, GENESIS_KEY: GENESIS_KEY,
    loadRecord: loadRecord, verifyCert: verifyCert, verify: verify, sign: sign,
    sha256: sha256, covenantBytes: covenantBytes, covenantHash: covenantHash,
    genIdentity: genIdentity, setIdentity: setIdentity,
    issueCert: issueCert, certBytes: certBytes, fingerprint: fingerprint,
    roster: roster, addIssuer: addIssuer, removeIssuer: removeIssuer,
    trustedIssuer: trustedIssuer, trustedRoster: trustedRoster,
    issuerClass: issuerClass, issueIssuerProof: issueIssuerProof,
    issuerProofs: issuerProofs,
    revokeCallsign: revokeCallsign, revoked: revoked,
    ROSTER_KEY: ROSTER_KEY, ROSTER_PROOF_KEY: ROSTER_PROOF_KEY,
    checkCallsign: checkCallsign, grantCallsign: grantCallsign,
    detectAutomation: detectAutomation, isContained: isContained,
    containedList: contained, flagContained: flagContained,
    promoteContained: promoteContained, burnContained: burnContained,
    issuePromotion: issuePromotion, exportPromotion: exportPromotion,
    importPromotion: importPromotion,
    verifyGrant: verifyGrant, exportGrant: exportGrant, importGrant: importGrant,
    grants: grants, GRANTS_KEY: GRANTS_KEY, normalizeCallsign: normalizeCallsign,
    hasRole: hasRole, ROLES: ROLES, ROLE_LABEL: ROLE_LABEL, lockRemain: lockRemain,
    BRANCHES: BRANCHES, requestBranch: requestBranch, verifyRequest: verifyRequest,
    exportRequest: exportRequest, importRequest: importRequest,
    branchReqs: branchReqs, assignBranch: assignBranch, denyBranch: denyBranch,
    branchOf: branchOf, exportAssignment: exportAssignment, importAssignment: importAssignment,
    credBytes: credBytes, issueCredential: issueCredential,
    verifyCredential: verifyCredential, exportCredential: exportCredential,
    issueRoaming: issueRoaming,
    authenticate: authenticate, isPinned: isPinned,
    exportDesk: exportDesk, importDesk: importDesk,
    bindFleetFlag: bindFleetFlag, confirmFleetPin: confirmFleetPin,
    flagAnchored: flagAnchored, fleetPinState: fleetPinState,
    setupTotp: setupTotp, verifyTotp: verifyTotp, totpRequired: totpRequired,
    totpStatus: totpStatus, totpCode: totpCode, qrSvg: qrSvg,
    TOTP_ISSUER: TOTP_ISSUER, TOTP_ACCOUNT: TOTP_ACCOUNT,
    hex: hex, unhex: unhex,
    session: session, setSessionIdleMs: setSessionIdleMs,
    sessionTouch: sessionTouch, STORE_KEY: STORE_KEY,
    exports: function () { return wasm; }, memory: function () { return memory; },
    wr: wr, outBuf: outBuf, mem: mem, onWs: onWs,
  };
})();
