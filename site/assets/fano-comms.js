/* comms.os — the tradecraft desk.
   Every pane calls the vendored Rations WASM core through FANO_AUTH's
   live instance — no re-implementations, no simulators. Gates:
   MSG needs OPERATOR+ and a warm keystore; STEGO/SHAMIR/CARRIER need
   Q-BRANCH+. The wire needs a reachable relay — OFFLINE means offline. */
window.FANO_COMMS = (function () {
  "use strict";
  var enc = new TextEncoder(), dec = new TextDecoder();
  var ROSTER_KEY = "fano1.comms.contacts";
  var RELAY_KEY = "fano1.comms.relay";

  function A() { return window.FANO_AUTH; }
  function X() { return A().exports(); }
  function str(s) { return enc.encode(s); }
  function b64(b) { var s = ""; for (var i = 0; i < b.length; i++) s += String.fromCharCode(b[i]); return btoa(s); }
  function unb64(s) { var r = atob(s), b = new Uint8Array(r.length); for (var i = 0; i < r.length; i++) b[i] = r.charCodeAt(i); return b; }
  function dl(bytes, name, mime) {
    var a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([bytes], { type: mime || "application/octet-stream" }));
    a.download = name; a.click(); setTimeout(function () { URL.revokeObjectURL(a.href); }, 5000);
  }
  function roster() { try { return JSON.parse(localStorage.getItem(ROSTER_KEY)) || []; } catch (e) { return []; } }
  function saveRoster(r) { try { localStorage.setItem(ROSTER_KEY, JSON.stringify(r)); } catch (e) {} }

  /* ---------- wasm wrappers ---------- */
  /* every wasm-reported length is clamped to the buffer it claims to
     fill — an oversized n would otherwise read adjacent wasm heap
     into JS strings */
  function u32at(p) { return new Uint32Array(A().memory().buffer, p, 1)[0]; }
  function jread(fn, cap) {
    var op = A().outBuf(cap), lp = A().outBuf(4);
    var ok = fn(op, cap, lp);
    var n = Math.min(u32at(lp), cap);
    var out = ok && n ? dec.decode(A().mem(op, n)) : null;
    X().rations_free(op); X().rations_free(lp);
    return out;
  }
  /* inbound hex must actually BE hex of the right shape — unhex() on
     garbage yields short/zero buffers, and callers hand wasm a fixed
     length that would read past the allocation */
  function pkOf(h) {
    return (typeof h === "string" && /^[0-9a-fA-F]{64}$/.test(h)) ? A().unhex(h) : null;
  }
  function peerCount() { return X().rations_p2p_peer_count(); }
  function peersJson() { return jread(function (o, c, l) { return X().rations_p2p_peers_json(o, c, l); }, 8192); }
  function peerId() { var p = A().outBuf(32); X().rations_p2p_peer_id(p); var b = A().mem(p, 32).slice(); X().rations_free(p); return b; }
  function phonePk() { var p = A().outBuf(32); X().rations_phone_pk(p); var b = A().mem(p, 32).slice(); X().rations_free(p); return b; }

  /* contained identities hold no wire privileges — a contained bot
     learns in the academy, it does not speak on the fleet's net */
  function containedNow() { return A().isContained && A().isContained(); }

  /* the wire dials ws/wss only — no other scheme reaches the dialer,
     and the far-side peer id must be a real 32-byte key */
  var RELAY_RE = /^wss?:\/\/[^\s]{1,256}$/;
  function connect(url, pkHex) {
    if (containedNow()) return null;
    if (!RELAY_RE.test(String(url || ""))) return null;
    var pkb = pkOf(pkHex);
    if (!pkb) return null;
    var up = A().wr(str(url)), pp = A().wr(pkb);
    var id = X().rations_p2p_connect(up, url.length, pp, 32);
    X().rations_free(up); X().rations_free(pp);
    return id;
  }
  function discover(connId) { return X().rations_p2p_discover_peers(connId); }
  function presenceJson() { return jread(function (o, c, l) { return X().rations_phone_presence_json(o, c, l); }, 16384); }
  /* presence text carries the callsign — receiving peers learn both the
     phone key (auto-filed by handlePresence) and who owns it */
  function publishPresence(status) {
    if (containedNow()) return false;
    var txt = str(A().session.user || "cadet");
    var p = A().wr(txt);
    return X().rations_phone_presence_publish(status || 1, p, txt.length);
  }
  /* presence text is unsigned wire metadata — a peer can publish any
     callsign it likes. Restricted/pinned names can't be impersonated
     in the roster: they render as their peer id instead. */
  function peerLabel(text, pid) {
    var nm = String(text || "");
    if (nm && !A().isPinned(A().normalizeCallsign(nm)) &&
        A().checkCallsign(nm, pid).ok) return nm;
    return "peer-" + pid.slice(0, 8);
  }
  /* merge the WASM presence table into the desk roster. Auto-learned
     entries carry auto:true — the phone key itself is already filed
     inside the WASM contact_keys map, so sealed send needs nothing
     else. Stale: >30s wall-clock since seen → degraded; >120s → ghost. */
  function syncContacts() {
    var raw = presenceJson();
    if (!raw) return 0;
    var seen;
    try { seen = JSON.parse(raw); } catch (e) { return 0; }
    var rs = roster(), added = 0, now = Date.now();
    var byPid = {};
    rs.forEach(function (c) { byPid[c.pid] = c; });
    seen.forEach(function (s) {
      var pid = s.peer;
      if (!pid || pid === A().hex(peerId())) return;
      var cur = byPid[pid];
      if (cur) { cur.status = s.status; cur.seen = now; if (s.text && cur.auto) cur.name = peerLabel(s.text, pid); }
      else {
        var c2 = { name: peerLabel(s.text, pid), pid: pid, pk: null,
          auto: true, status: s.status, seen: now };
        rs.push(c2); byPid[pid] = c2; added++;
      }
    });
    if (added) saveRoster(rs);
    return added;
  }
  function addContact(pidHex, pkHex) {
    var ib = pkOf(pidHex), kb = pkOf(pkHex);
    if (!ib || !kb) return false;
    var ip = A().wr(ib), kp = A().wr(kb);
    X().rations_phone_add_contact(ip, kp);
    X().rations_free(ip); X().rations_free(kp);
    return true;
  }
  function sendMsg(pidHex, body) {
    if (containedNow()) return false;
    var tb = pkOf(pidHex);
    if (!tb || !body) return false;
    var tp = A().wr(tb), bp = A().wr(str(body));
    var ok = X().rations_phone_send(tp, 0, bp, body.length);
    X().rations_free(tp); X().rations_free(bp);
    return ok;
  }
  function inbox() { return jread(function (o, c, l) { return X().rations_phone_inbox_json(o, c, l); }, 65536); }
  function inboxCount() { return X().rations_phone_inbox_count(); }
  function tick(dt) { X().rations_phone_tick(dt); }

  function qrGen(text, ecc) {
    var dp = A().wr(str(text)), op = A().outBuf(65536), sp = A().outBuf(2);
    var ver = X().rations_qr_generate_auto(dp, str(text).length, ecc, op, sp);
    var size = new Uint16Array(A().memory().buffer, sp, 1)[0];
    var bmp = ver && size * size <= 65536 ? A().mem(op, size * size).slice() : null;
    X().rations_free(dp); X().rations_free(op); X().rations_free(sp);
    return bmp ? { bmp: bmp, size: size, version: ver } : null;
  }
  function qrDec(gray, w, h) {
    var ip = A().wr(gray), op = A().outBuf(8192), lp = A().outBuf(4), vp = A().outBuf(1);
    var r = X().rations_qr_decode(ip, w, h, op, 8192, lp, vp);
    var n = Math.min(u32at(lp), 8192);
    var out = r === 1 ? dec.decode(A().mem(op, n)) : null;
    X().rations_free(ip); X().rations_free(op); X().rations_free(lp); X().rations_free(vp);
    return r === 1 ? { text: out } : { err: r & 0x7f };
  }
  function stegaEmbed(png, data, pw, fname) {
    var ip = A().wr(png), dp = A().wr(data), pp = A().wr(str(pw)), fp = A().wr(str(fname));
    var op = A().outBuf(png.length + data.length + 65536), lp = A().outBuf(4);
    var ok = X().rations_stega_embed(ip, png.length, dp, data.length, pp, pw.length, fp, fname.length, op, png.length + data.length + 65536, lp);
    var n = new Uint32Array(A().memory().buffer, lp, 1)[0];
    var out = ok ? A().mem(op, n).slice() : null;
    [ip, dp, pp, fp, op, lp].forEach(function (p) { X().rations_free(p); });
    return out;
  }
  function stegaExtract(png, pw) {
    var ip = A().wr(png), pp = A().wr(str(pw));
    var dp = A().outBuf(1048576), dl_ = A().outBuf(4), fp = A().outBuf(256), fl = A().outBuf(4);
    var ok = X().rations_stega_extract(ip, png.length, pp, pw.length, dp, 1048576, dl_, fp, 256, fl);
    var dn = Math.min(u32at(dl_), 1048576);
    var fn2 = Math.min(u32at(fl), 256);
    var out = ok ? { data: A().mem(dp, dn).slice(), name: dec.decode(A().mem(fp, fn2)) } : null;
    [ip, pp, dp, dl_, fp, fl].forEach(function (p) { X().rations_free(p); });
    return out;
  }
  function shamirSplit(secret, k, n) {
    k = Math.floor(Number(k)); n = Math.floor(Number(n));
    var sb = str(secret);
    /* bounded allocation: n ≤ 250 shares of a ≤64 KiB secret */
    if (!(k >= 2 && k <= n && n <= 250) || !sb.length || sb.length > 65536) return null;
    var sp = A().wr(sb), op = A().outBuf(n * (1 + sb.length));
    var ok = X().rations_shamir_split(sp, sb.length, k, n, op);
    var out = ok ? A().mem(op, n * (1 + sb.length)).slice() : null;
    X().rations_free(sp); X().rations_free(op);
    if (!out) return null;
    var shares = [], sl = 1 + sb.length;
    for (var i = 0; i < n; i++) shares.push(out.slice(i * sl, (i + 1) * sl));
    return shares;
  }
  function shamirJoin(shares) {
    if (!shares.length || shares.length > 250) return null;
    var sl = shares[0].length;
    if (!sl || sl > 65537) return null;
    var all = new Uint8Array(sl * shares.length);
    for (var i = 0; i < shares.length; i++) { if (shares[i].length !== sl) return null; all.set(shares[i], i * sl); }
    var sp = A().wr(all), op = A().outBuf(sl - 1);
    var ok = X().rations_shamir_reconstruct(sp, sl, shares.length, op, sl - 1);
    var out = ok ? dec.decode(A().mem(op, sl - 1)) : null;
    X().rations_free(sp); X().rations_free(op);
    return out;
  }
  function carrierEnc(data, fmt) {
    var dp = A().wr(data), op = A().outBuf(data.length + 1048576), lp = A().outBuf(4);
    var st = X().rations_carrier_encode(dp, data.length, fmt, op, data.length + 1048576, lp);
    var n = Math.min(u32at(lp), data.length + 1048576);
    var out = st === 0 || st === 1 ? A().mem(op, n).slice() : null;
    X().rations_free(dp); X().rations_free(op); X().rations_free(lp);
    return out === null || st & 0x80 ? { err: st & 0x7f } : { bytes: out };
  }
  function carrierDec(data, fmt) {
    var dp = A().wr(data), op = A().outBuf(data.length + 1048576), lp = A().outBuf(4);
    var st = X().rations_carrier_decode(dp, data.length, fmt, op, data.length + 1048576, lp);
    var n = Math.min(u32at(lp), data.length + 1048576);
    var out = st === 0 || st === 1 ? A().mem(op, n).slice() : null;
    X().rations_free(dp); X().rations_free(op); X().rations_free(lp);
    return out === null || st & 0x80 ? { err: st & 0x7f } : { bytes: out };
  }
  /* invite roles are NETWORK roles — 0=admin 1=moderator 2=user per
     the Rations Role enum — not desk clearance. Issuing is
     STATION-CHIEF+; an admin invite is flag-seat business. expiry is
     u64 — the wasm ABI takes BigInt. */
  function inviteCreate(netId, endpoint, role, days) {
    if (containedNow()) return null;
    var s = A().session.sk; if (!s) return null;
    var rl = Math.floor(Number(role));
    if (A().session.role < 3 || !(rl >= 0 && rl <= 2)) return null;
    if (rl === 0 && A().session.role < A().ROLES.fleet_admiral) return null;
    var nb = pkOf(netId);
    if (!nb || !endpoint || !(days > 0)) return null;
    var np = A().wr(nb), ep = A().wr(str(endpoint)), sp = A().wr(s);
    var op = A().outBuf(4096), lp = A().outBuf(4);
    var ok = X().rations_invite_create(np, ep, endpoint.length, sp, 32, rl,
      BigInt(Math.floor(Date.now() / 1000) + days * 86400), op, lp);
    var n = Math.min(u32at(lp), 4096);
    var out = ok ? A().mem(op, n).slice() : null;
    [np, ep, sp, op, lp].forEach(function (p) { X().rations_free(p); });
    return out;
  }
  function inviteVerify(tok) {
    var tp = A().wr(tok);
    var ok = X().rations_invite_verify(tp, tok.length);
    X().rations_free(tp);
    return !!ok;
  }

  /* ---------- UI ---------- */
  var TABS = [
    { id: "wire", name: "WIRE", min: 0 },
    { id: "invite", name: "INVITE", min: 0 },
    { id: "msg", name: "MSG", min: 1, warm: true },
    { id: "drop", name: "DROP", min: 0 },
    { id: "stego", name: "STEGO", min: 2 },
    { id: "shamir", name: "SHAMIR", min: 2 },
    { id: "carrier", name: "CARRIER", min: 2 },
  ];
  var CARRIER_FMTS = ["png", "mp4", "html", "pdf", "zip", "jar", "pyz"];
  var QR_ERR = ["ok", "TooSmall", "NoFinderPatterns", "BadFormatInfo", "UnsupportedVersion", "RsUncorrectable", "BadMode", "DataTruncated"];

  function esc(s) { return String(s).replace(/[&<>"]/g, function (c) { return { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]; }); }
  function el(html) { var d = document.createElement("div"); d.innerHTML = html; return d.firstElementChild; }

  function gate(t) {
    var a = A(), warm = !!a.session.sk;
    if (t.min && a.session.role < t.min) return "denied: requires " + a.ROLE_LABEL[t.min];
    if (t.warm && !warm) return "denied: keystore cold — 'unlock' first";
    return null;
  }

  function open() {
    var title = "comms.os";
    if (!A() || !A().exports()) {
      A().load().then(open);
      return;
    }
    if (containedNow()) {
      var nb = el('<div class="console" style="padding:12px;font-size:.8rem"></div>');
      nb.textContent = "CONTAINMENT — this identity was flagged as automation. The wire is sealed: learn in academy.os, and wait for a STATION-CHIEF to adjudicate.";
      FANO.makeWindow(title + " [CONTAINED]", nb);
      return;
    }
    var body = el('<div class="console" style="display:flex;flex-direction:column;height:100%;font-size:.78rem"></div>');
    var bar = el('<div style="display:flex;gap:2px;border-bottom:1px solid var(--hair);padding:4px"></div>');
    var pane = el('<div style="flex:1;overflow:auto;padding:8px"></div>');
    body.appendChild(bar); body.appendChild(pane);
    var win = FANO.makeWindow(title, body);
    win.style.width = "44rem"; win.style.height = "30rem";

    /* presence housekeeping — while the comms desk is open, advance the
       phone clock, rebroadcast our beacon, and fold inbound beacons
       into the roster. Stops when the window leaves the DOM. */
    var beat = setInterval(function () {
      if (!win.isConnected) { clearInterval(beat); return; }
      try {
        tick(5000);
        if (peerCount()) publishPresence(1);
        if (syncContacts() && cur === "msg") renderPane();
      } catch (e) {}
    }, 5000);

    var cur = "wire";
    function renderTabs() {
      bar.innerHTML = "";
      TABS.forEach(function (t) {
        var b = el('<button class="btn" style="padding:2px 10px;font-size:.68rem;letter-spacing:.14em">' + t.name + '</button>');
        if (t.id === cur) b.style.borderColor = "var(--acc)";
        b.onclick = function () { cur = t.id; renderTabs(); renderPane(); };
        bar.appendChild(b);
      });
    }
    function renderPane() {
      pane.innerHTML = "";
      var t = TABS.filter(function (x) { return x.id === cur; })[0];
      var deny = gate(t);
      if (deny) {
        pane.appendChild(el('<pre style="color:var(--deny,#e05c5c)">' + deny + '\n\nrole on file: ' + A().ROLE_LABEL[A().session.role] + ' · keystore ' + (A().session.sk ? "warm" : "cold") + '</pre>'));
        return;
      }
      panes[t.id](pane);
    }

    var panes = {
      /* ---- WIRE: relay link ---- */
      wire: function (p) {
        var lastUrl = localStorage.getItem(RELAY_KEY) || "ws://localhost:8080/ws";
        p.appendChild(el('<pre>relay uplink — p2p_connect dials the relay as a peer;\nit routes by peer-id. your node id:\n  ' + esc(A().hex(peerId())) + '\nphone key:\n  ' + esc(A().hex(phonePk())) + '</pre>'));
        var row = el('<div style="display:flex;gap:6px;margin:6px 0;align-items:center"></div>');
        var urlIn = el('<input class="term-in" style="flex:2" spellcheck="false">'); urlIn.value = lastUrl;
        var pkIn = el('<input class="term-in" style="flex:2" spellcheck="false" placeholder="relay/peer id (64 hex)">');
        var btn = el('<button class="btn">CONNECT</button>');
        row.appendChild(urlIn); row.appendChild(pkIn); row.appendChild(btn);
        p.appendChild(row);
        var stat = el('<pre style="color:var(--acc)">LINK: ' + (peerCount() ? "UP · " + peerCount() + " peer(s)" : "OFFLINE") + '</pre>');
        p.appendChild(stat);
        var list = el('<pre style="opacity:.8;max-height:8rem;overflow:auto"></pre>');
        p.appendChild(list);
        btn.onclick = function () {
          var pk = pkIn.value.trim();
          if (!/^[0-9a-fA-F]{64}$/.test(pk)) { stat.textContent = "LINK: need the far side's 64-hex peer id (relay publishes its own)"; return; }
          localStorage.setItem(RELAY_KEY, urlIn.value);
          var id = connect(urlIn.value, pk);
          stat.textContent = id ? "LINK: dialing… conn " + id : "LINK: connect call failed";
          if (id) {
            setTimeout(function () {
              publishPresence(1);
              stat.textContent = "LINK: " + (peerCount() ? "UP · " + peerCount() + " peer(s)" : "no peers yet — try DISCOVER");
              list.textContent = peersJson() || "";
              var n = syncContacts();
              if (n) FANO.toast(n + " contact(s) learned from presence");
            }, 1500);
          }
        };
        var dbtn = el('<button class="btn">DISCOVER</button>');
        dbtn.onclick = function () { discover(1); setTimeout(function () { stat.textContent = "LINK: " + peerCount() + " peer(s)"; list.textContent = peersJson() || ""; syncContacts(); }, 1200); };
        bar.appendChild(dbtn);
      },

      /* ---- INVITE: signed admission tokens ---- */
      invite: function (p) {
        p.appendChild(el('<pre>signed admission — invite tokens carry network_id,\nendpoint, role and expiry under an Ed25519 signature.\nissuing requires STATION-CHIEF (3) and a warm keystore.</pre>'));
        var can = A().session.role >= 3 && A().session.sk;
        var mk = el('<div></div>');
        mk.appendChild(el('<div style="margin:6px 0"><b>issue</b> ' + (can ? "" : '<span style="color:var(--deny,#e05c5c)">— requires STATION-CHIEF + warm keystore</span>') + '</div>'));
        if (can) {
          var netIn = el('<input class="term-in" placeholder="network id (64 hex)" style="width:100%;margin:2px 0" spellcheck="false">');
          var epIn = el('<input class="term-in" placeholder="endpoint (ws://…)" style="width:100%;margin:2px 0" spellcheck="false">');
          var roleIn = el('<input class="term-in" placeholder="role: 0=admin 1=mod 2=user" style="width:14rem;margin:2px 0" spellcheck="false">');
          var go = el('<button class="btn">ISSUE</button>');
          var out = el('<pre style="word-break:break-all;white-space:pre-wrap;color:var(--acc)"></pre>');
          go.onclick = function () {
            var tok = inviteCreate(netIn.value.trim(), epIn.value.trim(), parseInt(roleIn.value || "0", 10), 30);
            out.textContent = tok ? "token (b64):\n" + b64(tok) : "issue failed — check inputs";
          };
          mk.appendChild(netIn); mk.appendChild(epIn); mk.appendChild(roleIn); mk.appendChild(go); mk.appendChild(out);
        }
        p.appendChild(mk);
        var v = el('<div style="margin-top:10px"></div>');
        v.appendChild(el('<div><b>verify</b> — paste a token to check its signature:</div>'));
        var vin = el('<textarea class="term-in" style="width:100%;height:4rem" spellcheck="false"></textarea>');
        var vbtn = el('<button class="btn">VERIFY</button>');
        var vout = el('<pre></pre>');
        vbtn.onclick = function () {
          try { vout.textContent = inviteVerify(unb64(vin.value.trim())) ? "signature VALID — admission may proceed" : "signature INVALID or expired — refuse";
          } catch (e) { vout.textContent = "not a token"; }
        };
        v.appendChild(vin); v.appendChild(vbtn); v.appendChild(vout);
        p.appendChild(v);
      },

      /* ---- MSG: covenant-gated messenger ---- */
      msg: function (p) {
        var me = A().session.user, myPid = A().hex(peerId());
        p.appendChild(el('<pre>messenger — ' + esc(me) + ' · node ' + esc(myPid.slice(0, 16)) + '…\nmessages seal end-to-end when the contact\'s phone key is filed.\ninbox ' + inboxCount() + ' · relay ' + (peerCount() ? "up" : "down") + '</pre>'));
        /* roster — sync presence first so beacons surface as contacts */
        syncContacts();
        var rs = roster(), now2 = Date.now();
        var rl = el('<div></div>');
        rs.forEach(function (c, i) {
          var age = c.seen ? now2 - c.seen : 0;
          var badge = c.auto
            ? (age > 120000 ? " <small style='opacity:.5'>⟡ghost</small>" : age > 30000 ? " <small style='opacity:.6'>⟡degraded</small>" : " <small style='color:var(--acc)'>⟡live</small>")
            : "";
          var row = el('<div style="display:flex;gap:6px;margin:3px 0;align-items:center"><span style="flex:1">' + esc(c.name) + ' · ' + esc(c.pid.slice(0, 12)) + '…' + badge + '</span></div>');
          var s = el('<button class="btn">MSG</button>');
          s.onclick = function () {
            /* native dialogs throw under Electron — inline compose */
            var box = el('<div style="display:flex;gap:6px;margin:2px 0 6px"></div>');
            var mi = el('<input class="term-in" style="flex:1" spellcheck="false">');
            mi.placeholder = "message to " + c.name;
            var go = el('<button class="btn">SEND</button>');
            var send = function () {
              var m = mi.value; if (!m) return;
              var ok = sendMsg(c.pid, m);
              FANO.toast(ok ? "sealed → " + c.name : "NoRoute — relay down or peer unknown");
              box.remove();
            };
            go.onclick = send;
            mi.onkeydown = function (e) { if (e.key === "Enter") send(); };
            box.appendChild(mi); box.appendChild(go);
            rl.insertBefore(box, row.nextSibling);
            mi.focus();
          };
          var del = el('<button class="btn">✕</button>');
          del.onclick = function () { rs.splice(i, 1); saveRoster(rs); renderPane(); };
          row.appendChild(s); row.appendChild(del); rl.appendChild(row);
        });
        p.appendChild(rl);
        /* add contact */
        var add = el('<div style="border-top:1px solid var(--hair);margin-top:8px;padding-top:6px"></div>');
        add.appendChild(el('<div><b>file a contact</b> — peer id + phone key (they read them off their WIRE tab):</div>'));
        var nIn = el('<input class="term-in" placeholder="callsign" style="width:10rem;margin:2px 0">');
        var pIn = el('<input class="term-in" placeholder="peer id (64 hex)" style="width:100%;margin:2px 0" spellcheck="false">');
        var kIn = el('<input class="term-in" placeholder="phone key (64 hex)" style="width:100%;margin:2px 0" spellcheck="false">');
        var ab = el('<button class="btn">FILE</button>');
        ab.onclick = function () {
          if (!/^[0-9a-fA-F]{64}$/.test(pIn.value) || !/^[0-9a-fA-F]{64}$/.test(kIn.value)) { FANO.toast("need 64-hex peer id and phone key"); return; }
          addContact(pIn.value, kIn.value);
          rs.push({ name: nIn.value || pIn.value.slice(0, 8), pid: pIn.value, pk: kIn.value });
          saveRoster(rs); renderPane();
        };
        add.appendChild(nIn); add.appendChild(pIn); add.appendChild(kIn); add.appendChild(ab);
        p.appendChild(add);
        /* inbox */
        var ib = el('<pre style="border-top:1px solid var(--hair);margin-top:8px;padding-top:6px;max-height:7rem;overflow:auto"></pre>');
        function pull() {
          tick(1000);
          var j = inbox();
          try {
            var msgs = JSON.parse(j || "[]");
            var known = {};
            roster().forEach(function (c) { known[c.pid] = 1; });
            known[A().hex(peerId())] = 1;
            msgs.forEach(function (m) {
              if (m.from && !known[m.from] && A().flagContained)
                A().flagContained("pid:" + m.from, ["unrostered-wire"], "wire");
            });
            ib.textContent = msgs.length ? msgs.map(function (m) {
              var q = m.from && !known[m.from] ? " QUARANTINED" : "";
              return "[" + (m.sealed ? "sealed" : "open") + q + "] " + m.from.slice(0, 12) + "…: " + atob(m.body_b64);
            }).join("\n") : "inbox empty — " + inboxCount() + " waiting";
          } catch (e) { ib.textContent = j || ""; }
        }
        var rb = el('<button class="btn">PULL INBOX</button>');
        rb.onclick = pull; p.appendChild(rb); p.appendChild(ib);
        pull();
      },

      /* ---- DROP: QR dead-drops ---- */
      drop: function (p) {
        p.appendChild(el('<pre>dead drop — text to machine-readable paper.\ngenerate: payload → QR. recover: upload a photo/screenshot.</pre>'));
        var tin = el('<textarea class="term-in" style="width:100%;height:4rem" placeholder="payload — keys, coordinates, a name" spellcheck="false"></textarea>');
        var eccIn = el('<select class="term-in"><option value="1">ECC M</option><option value="0">ECC L</option><option value="2">ECC Q</option><option value="3">ECC H</option></select>');
        var gb = el('<button class="btn">GENERATE</button>');
        var cv = document.createElement("canvas");
        cv.style.cssText = "image-rendering:pixelated;border:1px solid var(--hair);margin:6px 0;max-width:220px";
        var dlb = el('<button class="btn">DOWNLOAD PNG</button>');
        dlb.style.display = "none";
        gb.onclick = function () {
          var q = qrGen(tin.value, parseInt(eccIn.value, 10));
          if (!q) { FANO.toast("qr: payload too large for the alphabet"); return; }
          var s = q.size, px = Math.floor(220 / s) || 1;
          cv.width = cv.height = s * px;
          var c = cv.getContext("2d");
          c.fillStyle = "#fff"; c.fillRect(0, 0, cv.width, cv.height);
          c.fillStyle = "#000";
          for (var y = 0; y < s; y++) for (var x = 0; x < s; x++)
            if (q.bmp[y * s + x]) c.fillRect(x * px, y * px, px, px);
          dlb.style.display = "";
        };
        dlb.onclick = function () { cv.toBlob(function (b) { b.arrayBuffer().then(function (ab2) { dl(new Uint8Array(ab2), "dead-drop.png", "image/png"); }); }); };
        p.appendChild(tin); p.appendChild(eccIn); p.appendChild(gb); p.appendChild(cv); p.appendChild(dlb);
        /* decode */
        var dec_ = el('<div style="border-top:1px solid var(--hair);margin-top:8px;padding-top:6px"><b>recover</b> — drop an image on the input:</div>');
        var fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/*";
        var dout = el('<pre></pre>');
        fi.onchange = function () {
          var f = fi.files[0]; if (!f) return;
          var img = new Image();
          img.onload = function () {
            var c2 = document.createElement("canvas");
            c2.width = img.width; c2.height = img.height;
            var cx = c2.getContext("2d"); cx.drawImage(img, 0, 0);
            var d = cx.getImageData(0, 0, c2.width, c2.height).data;
            var gray = new Uint8Array(c2.width * c2.height);
            for (var i = 0; i < gray.length; i++) gray[i] = (d[i * 4] * 3 + d[i * 4 + 1] * 4 + d[i * 4 + 2]) >> 3;
            var r = qrDec(gray, c2.width, c2.height);
            dout.textContent = r.text !== undefined ? "payload:\n" + r.text : "decode failed — " + (QR_ERR[r.err] || r.err);
            URL.revokeObjectURL(img.src);
          };
          img.src = URL.createObjectURL(f);
        };
        dec_.appendChild(fi); dec_.appendChild(dout); p.appendChild(dec_);
      },

      /* ---- STEGO: PNG payload embed ---- */
      stego: function (p) {
        p.appendChild(el('<pre>steganography — hide a payload inside a PNG\'s pixels.\npassword-gated. capacity is real: stega_capacity meters it.</pre>'));
        var fi = document.createElement("input"); fi.type = "file"; fi.accept = "image/png";
        var tin = el('<textarea class="term-in" style="width:100%;height:3rem" placeholder="payload text" spellcheck="false"></textarea>');
        var pw = el('<input class="term-in" placeholder="password" style="width:12rem;margin:2px 0">');
        var eb = el('<button class="btn">EMBED+DOWNLOAD</button>');
        var xb = el('<button class="btn">EXTRACT</button>');
        var out = el('<pre></pre>');
        var png = null;
        fi.onchange = function () { fi.files[0].arrayBuffer().then(function (ab2) { png = new Uint8Array(ab2); var cp = A().wr(png); var cap = X().rations_stega_capacity(cp, png.length, 1); X().rations_free(cp); out.textContent = "carrier: " + fi.files[0].name + " · " + png.length + " B · capacity ~" + cap + " B @1bpp"; }); };
        eb.onclick = function () {
          if (!png) { out.textContent = "pick a PNG carrier first"; return; }
          var r = stegaEmbed(png, str(tin.value), pw.value || "fano", "payload.txt");
          if (!r) { out.textContent = "embed failed — payload over capacity?"; return; }
          dl(r, "carrier.png", "image/png"); out.textContent = "embedded " + tin.value.length + " B → carrier.png (" + r.length + " B)";
        };
        xb.onclick = function () {
          if (!png) { out.textContent = "pick the carrier PNG first"; return; }
          var r = stegaExtract(png, pw.value || "fano");
          out.textContent = r ? "extracted [" + r.name + "]:\n" + dec.decode(r.data) : "extract failed — wrong password or no payload";
        };
        p.appendChild(el('<div>carrier PNG:</div>')); p.appendChild(fi);
        p.appendChild(tin); p.appendChild(pw); p.appendChild(eb); p.appendChild(xb); p.appendChild(out);
      },

      /* ---- SHAMIR: k-of-n secret split ---- */
      shamir: function (p) {
        p.appendChild(el('<pre>shamir — split a secret k-of-n. any k shares rebuild it;\nk-1 shares know nothing. GF(256), per-byte polynomials.</pre>'));
        var sin = el('<input class="term-in" placeholder="secret" style="width:100%;margin:2px 0" spellcheck="false">');
        var row = el('<div style="display:flex;gap:6px;margin:2px 0"></div>');
        var kIn = el('<input class="term-in" placeholder="k" style="width:4rem">'); kIn.value = "2";
        var nIn = el('<input class="term-in" placeholder="n" style="width:4rem">'); nIn.value = "3";
        var sb = el('<button class="btn">SPLIT</button>');
        row.appendChild(kIn); row.appendChild(nIn); row.appendChild(sb);
        var out = el('<pre style="word-break:break-all;white-space:pre-wrap"></pre>');
        sb.onclick = function () {
          var shares = shamirSplit(sin.value, parseInt(kIn.value, 10), parseInt(nIn.value, 10));
          out.textContent = shares ? shares.map(function (s, i) { return "share " + (i + 1) + ": " + A().hex(s); }).join("\n") : "split failed — k ≤ n ≤ 250, secret ≥ 1 B";
        };
        p.appendChild(sin); p.appendChild(row); p.appendChild(out);
        var j = el('<div style="border-top:1px solid var(--hair);margin-top:8px;padding-top:6px"><b>reconstruct</b> — paste shares, one hex per line:</div>');
        var jin = el('<textarea class="term-in" style="width:100%;height:4rem" spellcheck="false"></textarea>');
        var jb = el('<button class="btn">REBUILD</button>');
        var jout = el('<pre></pre>');
        jb.onclick = function () {
          var shares = jin.value.trim().split(/\s+/).filter(Boolean).map(function (h) { try { return A().unhex(h); } catch (e) { return null; } });
          if (shares.some(function (s) { return !s; })) { jout.textContent = "bad hex in a share"; return; }
          var r = shamirJoin(shares);
          jout.textContent = r !== null ? "secret: " + r : "reconstruct failed — need ≥ k shares of equal length";
        };
        j.appendChild(jin); j.appendChild(jb); j.appendChild(jout); p.appendChild(j);
      },

      /* ---- CARRIER: polyglot file wrap ---- */
      carrier: function (p) {
        p.appendChild(el('<pre>carrier polyglots — the payload ships inside a file that is\nstill valid in its own format. the wrapper is the cover.</pre>'));
        var tin = el('<textarea class="term-in" style="width:100%;height:3rem" placeholder="payload text" spellcheck="false"></textarea>');
        var fsel = el('<select class="term-in">' + CARRIER_FMTS.map(function (f, i) { return '<option value="' + i + '">' + f + '</option>'; }).join("") + '</select>');
        var eb = el('<button class="btn">WRAP+DOWNLOAD</button>');
        var out = el('<pre></pre>');
        eb.onclick = function () {
          var fmt = parseInt(fsel.value, 10);
          var r = carrierEnc(str(tin.value), fmt);
          if (r.err !== undefined) { out.textContent = "wrap failed — carrier err " + r.err; return; }
          dl(r.bytes, "carrier." + CARRIER_FMTS[fmt]);
          out.textContent = "wrapped " + tin.value.length + " B inside a valid ." + CARRIER_FMTS[fmt] + " (" + r.bytes.length + " B)";
        };
        p.appendChild(tin); p.appendChild(fsel); p.appendChild(eb); p.appendChild(out);
        var d = el('<div style="border-top:1px solid var(--hair);margin-top:8px;padding-top:6px"><b>unwrap</b> — carrier file + same format:</div>');
        var fi = document.createElement("input"); fi.type = "file";
        var dout = el('<pre></pre>');
        fi.onchange = function () {
          fi.files[0].arrayBuffer().then(function (ab2) {
            var r = carrierDec(new Uint8Array(ab2), parseInt(fsel.value, 10));
            dout.textContent = r.err !== undefined ? "unwrap failed — carrier err " + r.err : "payload:\n" + dec.decode(r.bytes);
          });
        };
        d.appendChild(fi); d.appendChild(dout); p.appendChild(d);
      },
    };

    renderTabs(); renderPane();
    A().onWs(function () { if (cur === "wire") renderPane(); });
  }

  /* internals are exported for the sweep harness — they carry the
     same gates as the UI path */
  return { open: open, connect: connect, sendMsg: sendMsg,
    addContact: addContact, syncContacts: syncContacts,
    peerLabel: peerLabel, jread: jread,
    inviteCreate: inviteCreate, inviteVerify: inviteVerify,
    qrGen: qrGen, qrDec: qrDec, shamirSplit: shamirSplit,
    shamirJoin: shamirJoin, carrierEnc: carrierEnc,
    carrierDec: carrierDec, stegaEmbed: stegaEmbed,
    stegaExtract: stegaExtract, roster: roster, peersJson: peersJson };
})();
