/* fano-reset.js — Admiralty reset doctrine.

   The Fleet Admiral's credentials are not a local file — they are a
   fleet trust object. A desk whose founding pk matches the "admiral"
   member of the published fleet genesis is THE flag desk:

     · cluster origin (loopback private suite) — reset is unilateral;
       this desk IS the sovereign cluster.
     · any other origin — the founding burns only under a UNANIMOUS
       Admiralty vote: a FANO-RESET-v1 token signed by every genesis
       member, verified against the published fleet-genesis.json.

   A desk whose founding is NOT the flag founding is ordinary —
   its operator may burn it freely; it was never a fleet object. */
window.FANO_RESET = (function () {
  "use strict";
  var enc = new TextEncoder();
  var canon = function (o) { return JSON.stringify(o, null, 2); };
  var b64d = function (s) {
    s = s.replace(/-/g, "+").replace(/_/g, "/");
    var b = atob(s), r = new Uint8Array(b.length);
    for (var i = 0; i < b.length; i++) r[i] = b.charCodeAt(i);
    return r;
  };

  function genesisLocal() {
    try { return JSON.parse(localStorage.getItem("fano1.genesis")); }
    catch (e) { return null; }
  }
  function isClusterOrigin() {
    var h = location.hostname;
    return h === "127.0.0.1" || h === "localhost" || h === "::1" ||
           h === "[::1]" || h.endsWith(".local");
  }
  function sha256hex(buf) {
    return crypto.subtle.digest("SHA-256", buf).then(function (d) {
      return Array.from(new Uint8Array(d))
        .map(function (b) { return b.toString(16).padStart(2, "0"); }).join("");
    });
  }
  function verifySig(pemB64, bodyBytes, sigB64url) {
    var pem = atob(pemB64).replace(/-----[^-]+-----|\s/g, "");
    return crypto.subtle.importKey("spki", b64d(pem).buffer,
      { name: "Ed25519" }, false, ["verify"])
      .then(function (key) {
        return crypto.subtle.verify("Ed25519", key, b64d(sigB64url), bodyBytes);
      });
  }
  function fetchGenesis() {
    return fetch("fleet-genesis.json").then(function (r) {
      return r.ok ? r.json() : null;
    }).catch(function () { return null; });
  }

  /* Is THIS desk's founding the genuine flag founding? The flag seat is
     the key, not the callsign: match the local founding pk_sha256 to the
     sha256 of the admiral member's published pubkey. */
  function flagMemberPkHash(gen) {
    var ms = (gen && gen.payload && gen.payload.members) || [];
    var adm = ms.find(function (m) {
      return m.name === "admiral" || m.role === "flag-seat" ||
             (m.role === "genesis-root" && m.name === "admiral");
    });
    if (!adm) return Promise.resolve(null);
    /* pk_sha256 in the desk record hashes the RAW 32-byte key —
       strip the SPKI DER wrapper (12-byte prefix) to match */
    var pem = atob(adm.pubkey_pem_b64).replace(/-----[^-]+-----|\s/g, "");
    var der = b64d(pem);
    var raw = der.length === 44 ? der.slice(-32) : der;
    return sha256hex(raw.buffer.slice(raw.byteOffset, raw.byteOffset + raw.length));
  }

  /* guard() → { mode, reason, callsign }
       "open"    — ordinary desk, burn freely
       "cluster" — flag desk on the sovereign cluster, unilateral
       "vote"    — flag desk off-cluster, unanimous vote required */
  function guard() {
    var g = genesisLocal();
    if (!g || !g.pk_sha256) return Promise.resolve({ mode: "open" });
    return fetchGenesis().then(function (gen) {
      return flagMemberPkHash(gen).then(function (flagHash) {
        if (flagHash && g.pk_sha256 === flagHash) {
          return { mode: isClusterOrigin() ? "cluster" : "vote",
                   callsign: g.callsign };
        }
        /* no admiral member published yet — the callsign check still
           protects a flag founding on the cluster; off-cluster a name
           alone proves nothing, the desk is ordinary */
        var pinned = (g.callsign === "ramsey 006");
        if (pinned && isClusterOrigin()) return { mode: "cluster", callsign: g.callsign };
        return { mode: "open" };
      });
    });
  }

  /* verifyVote(tokenJson) — a FANO-RESET-v1 token carries sigs from
     EVERY genesis member over canon(body). Unanimous or nothing. */
  function verifyVote(tokenJson) {
    var tok;
    try { tok = typeof tokenJson === "string" ? JSON.parse(tokenJson) : tokenJson; }
    catch (e) { return Promise.resolve(false); }
    if (!tok || tok.body === undefined || !tok.sigs) return Promise.resolve(false);
    /* the vote names the seat it burns — a token minted for one
       callsign must not burn another flag founding */
    var g = genesisLocal();
    if (!g || !g.callsign || tok.body.callsign !== g.callsign)
      return Promise.resolve(false);
    /* votes decay: a 24h-old unanimous token is a replay, not a vote */
    var age_ms = Date.now() - Date.parse(tok.body.ts || "");
    if (!(age_ms >= 0 && age_ms < 86400e3)) return Promise.resolve(false);
    var bodyBytes = enc.encode(canon(tok.body));
    return fetchGenesis().then(function (gen) {
      if (!gen) return false;
      var members = gen.payload.members;
      if (!members.length) return false;
      return Promise.all(members.map(function (m) {
        var sig = tok.sigs[m.name];
        if (!sig) return false;
        return verifySig(m.pubkey_pem_b64, bodyBytes, sig).catch(function () { return false; });
      })).then(function (res) { return res.every(Boolean); });
    });
  }

  /* the full ledger census — every key the desk writes, swept by one
     adjudication. Legacy keys stay on the list (sweeping is cheap). */
  var KEYS = ["fano1.identity", "fano1.genesis", "fano1.issuers",
              "fano1.callsigns", "fano1.lives", "fano1.comms.contacts",
              "fano1.comms.relay", "fano1.desk.state", "fano1.desk.v1",
              "fano1.directives", "fano1.containment", "fano1.revoked",
              "fano1.branchreqs", "fano1.branches", "fano1.auth.fail",
              "fano1.lang"];
  function execute() {
    var burned = [];
    KEYS.forEach(function (k) {
      if (localStorage.getItem(k) !== null) burned.push(k);
      localStorage.removeItem(k);
    });
    return burned;
  }

  return { guard: guard, verifyVote: verifyVote, execute: execute,
           isClusterOrigin: isClusterOrigin, genesisLocal: genesisLocal };
})();
