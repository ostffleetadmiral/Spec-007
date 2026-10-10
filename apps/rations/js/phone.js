//! phone.js — R17 peer-as-telecommunication-device UI layer.
//!
//! Wraps the WASM phone exports (rations_phone_*) with:
//!   - persistent X25519 phone identity (localStorage)
//!   - a contacts book (localStorage) merged with learned presence
//!   - a chat/inbox view with text + voice notes
//!   - call signaling (ring/answer/reject/hangup) with live audio over
//!     RTCPeerConnection when the browser provides mic + WebRTC — the
//!     offer/answer SDP rides in the call_signal note field
//!   - honest capability reporting: no fake delivery, no fake media
//!
//! Depends on: rations-bridge.js (Rations), qr-render.js (QrRender),
//! window.toast (js/ui.js), window.log (quine.html).

(function (global) {
  'use strict';

  const LS_SK = "rations.phone.sk.v1";
  const LS_CONTACTS = "rations.phone.contacts.v1";
  const LS_STATUS = "rations.phone.status.v1";
  const IDB_HISTORY = "phone_history"; // Store.js namespace — survives reload
  const BEACON_MS = 45000; // presence re-publish interval (late peers learn our key)

  const enc = new TextEncoder();
  const dec = new TextDecoder();

  function toHex(bytes) {
    return Array.from(bytes, (b) => b.toString(16).padStart(2, "0")).join("");
  }
  function fromHex(hex) {
    const out = new Uint8Array(hex.length / 2);
    for (let i = 0; i < out.length; i++) out[i] = parseInt(hex.substr(i * 2, 2), 16);
    return out;
  }
  function b64encode(bytes) {
    let s = "";
    for (const b of bytes) s += String.fromCharCode(b);
    return btoa(s);
  }
  function b64decode(s) {
    const bin = atob(s);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // ── identity ────────────────────────────────────────────────────────

  let phonePk = null; // Uint8Array(32)

  function ensureIdentity() {
    const stored = localStorage.getItem(LS_SK);
    if (stored) {
      try {
        const sk = b64decode(stored);
        if (sk.length === 32) {
          Rations.phoneSetIdentity(sk);
          phonePk = Rations.phonePublicKey();
          return;
        }
      } catch (_) { /* fall through and regenerate */ }
    }
    const id = Rations.phoneGenIdentity();
    localStorage.setItem(LS_SK, b64encode(id.secretKey));
    phonePk = id.publicKey;
  }

  // ── contacts ────────────────────────────────────────────────────────

  function loadContacts() {
    try {
      return JSON.parse(localStorage.getItem(LS_CONTACTS) || "[]");
    } catch (_) {
      return [];
    }
  }
  function saveContacts(list) {
    localStorage.setItem(LS_CONTACTS, JSON.stringify(list));
  }
  function findContact(peerHex) {
    return loadContacts().find((c) => c.peer_id === peerHex);
  }
  function contactName(peerHex) {
    const c = findContact(peerHex);
    return c ? c.name : peerHex.slice(0, 12) + "…";
  }

  // ── persistent message history (IndexedDB via Store) ────────────────

  // The WASM inbox is in-memory only — every message (in and out) is
  // mirrored into IDB so reloads keep the conversation. Records are
  // keyed by a stable id so re-polls dedupe.
  const historyCache = new Map(); // id → record
  let historyReady = false;

  function msgId(m, dir) {
    // Prefer the wire msg_id (v2 protocol) — stable across sender+receiver.
    if (m.id) return `${dir}:${m.id}`;
    return `${dir}:${m.from || m.to}:${m.tick || 0}:${(m.body_b64 || "").length}:${hashStr(m.body_b64 || "")}`;
  }

  function historyStore(rec) {
    historyCache.set(rec.id, rec);
    if (typeof Store === "undefined") return;
    Store.put(IDB_HISTORY, rec).catch(() => {});
  }

  async function historyLoad() {
    if (typeof Store === "undefined") { historyReady = true; return; }
    try {
      const recs = await Store.all(IDB_HISTORY);
      for (const r of recs) historyCache.set(r.id, r);
    } catch (_) { /* IDB unavailable — live inbox only */ }
    historyReady = true;
  }

  // ── unread badge ────────────────────────────────────────────────────

  let unread = 0;

  function phonePanelActive() {
    const p = document.getElementById("panel-phone");
    return p && p.classList.contains("active");
  }

  function renderBadge() {
    const el = document.getElementById("phone-badge");
    if (!el) return;
    if (unread > 0 && !phonePanelActive()) {
      el.style.display = "inline-block";
      el.textContent = unread > 99 ? "99+" : String(unread);
    } else {
      el.style.display = "none";
      unread = 0;
    }
  }

  // ── live-call state (JS side; signaling state lives in WASM) ────────

  const calls = new Map(); // callIdHex → {pc, stream, peerHex, inbound}
  let activeCallId = null;

  function rtcAvailable() {
    return typeof RTCPeerConnection !== "undefined";
  }
  function micAvailable() {
    return !!(navigator.mediaDevices && navigator.mediaDevices.getUserMedia);
  }

  /** Gather a complete (non-trickle) SDP offer/answer with a timeout. */
  function gatherComplete(pc, timeoutMs) {
    return new Promise((resolve) => {
      if (pc.iceGatheringState === "complete") return resolve();
      const t = setTimeout(resolve, timeoutMs || 5000);
      pc.addEventListener("icegatheringstatechange", () => {
        if (pc.iceGatheringState === "complete") {
          clearTimeout(t);
          resolve();
        }
      });
    });
  }

  async function createOfferNote() {
    if (!rtcAvailable()) return { note: JSON.stringify({ v: 1, media: "none" }), pc: null, stream: null };
    const pc = new RTCPeerConnection();
    let stream = null;
    if (micAvailable()) {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        for (const track of stream.getTracks()) pc.addTrack(track, stream);
      } catch (e) {
        return { note: JSON.stringify({ v: 1, media: "none", reason: "mic denied" }), pc, stream: null };
      }
    }
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    await gatherComplete(pc);
    return { note: JSON.stringify({ v: 1, media: stream ? "audio" : "data", sdp: pc.localDescription }), pc, stream };
  }

  async function createAnswerNote(offerJson) {
    if (!rtcAvailable()) return { note: JSON.stringify({ v: 1, media: "none" }), pc: null, stream: null };
    const pc = new RTCPeerConnection();
    let stream = null;
    let offer;
    try {
      offer = JSON.parse(offerJson);
    } catch (_) {
      offer = null;
    }
    if (offer && offer.sdp) {
      if (micAvailable()) {
        try {
          stream = await navigator.mediaDevices.getUserMedia({ audio: true });
          for (const track of stream.getTracks()) pc.addTrack(track, stream);
        } catch (e) {
          stream = null;
        }
      }
      await pc.setRemoteDescription(offer.sdp);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      await gatherComplete(pc);
      return { note: JSON.stringify({ v: 1, media: stream ? "audio" : "data", sdp: pc.localDescription }), pc, stream };
    }
    return { note: JSON.stringify({ v: 1, media: "none" }), pc, stream };
  }

  function wirePc(pc, callIdHex) {
    const c = calls.get(callIdHex);
    if (!c) return;
    pc.ontrack = (ev) => {
      const audio = document.getElementById("phone-remote-audio");
      if (audio) {
        audio.srcObject = ev.streams[0];
        audio.play().catch(() => {});
        setCallMediaState("live audio");
      }
    };
    pc.onconnectionstatechange = () => {
      if (pc.connectionState === "connected") setCallMediaState("live audio");
      if (pc.connectionState === "failed" || pc.connectionState === "disconnected") {
        setCallMediaState("media lost — signaling only");
      }
    };
    c.pc = pc;
  }

  function setCallMediaState(text) {
    const el = document.getElementById("phone-call-media");
    if (el) el.textContent = text;
  }

  function closeCall(callIdHex) {
    const c = calls.get(callIdHex);
    if (c) {
      if (c.pc) try { c.pc.close(); } catch (_) {}
      if (c.stream) for (const t of c.stream.getTracks()) t.stop();
      calls.delete(callIdHex);
    }
    if (activeCallId === callIdHex) {
      activeCallId = null;
      setCallMediaState("");
    }
  }

  // ── polling ─────────────────────────────────────────────────────────

  let pollTimer = null;
  let lastInboxCount = 0;
  const seenCalls = new Set();

  function poll() {
    if (typeof Rations === "undefined" || !Rations.phoneInboxCount) return;
    Rations.phoneTick(2000);
    renderInbox();
    renderPresence();
    renderCalls();
    syncOutbox();
    renderGroups();
  }

  function startPolling() {
    if (pollTimer) return;
    pollTimer = setInterval(poll, 2000);
  }

  // ── rendering ───────────────────────────────────────────────────────

  function renderMsg(m, dir) {
    const groupTag = m.group ? ` <span class="group-tag">[${escapeHtml(groupName(m.group))}]</span>` : "";
    const name = dir === "in" ? contactName(m.from) : "me → " + (m.group ? "group " + groupName(m.group) : contactName(m.to || ""));
    const seal = m.sealed ? '<span class="seal">sealed</span>' : (dir === "in" ? '<span class="seal open">open</span>' : "");
    // Outbound delivery state glyph from the WASM outbox receipt map.
    let state = "";
    if (dir === "out") {
      const s = m.state || "sent";
      state = s === "read" ? ' <span class="rcpt read" title="read">✓✓</span>'
           : s === "delivered" ? ' <span class="rcpt" title="delivered">✓✓</span>'
           : ' <span class="rcpt pending" title="sent">✓</span>';
    }
    let body;
    if (m.kind === "voice_note") {
      const id = "vn-" + (m.tick || 0) + "-" + Math.abs(hashStr(m.body_b64));
      body = `<button class="small" onclick="PhoneUI.playVoiceNote('${id}')">▶ voice note</button><span id="${id}" data-b64="${m.body_b64}"></span>`;
    } else if (m.kind === "file") {
      body = `<span class="file-msg">file (${(m.body_b64 || "").length} b64 chars)</span>`;
    } else {
      body = escapeHtml(dec.decode(b64decode(m.body_b64 || "")));
    }
    return `<div class="msg ${dir === "in" ? "inbound" : "outbound"}"><div class="msg-meta">${escapeHtml(name)}${groupTag} ${seal}${state}</div><div class="msg-body">${body}</div></div>`;
  }

  const readSent = new Set(); // wire msg_ids already acked as read

  function renderInbox() {
    const el = document.getElementById("phone-messages");
    if (!el) return;
    const inbox = Rations.phoneInboxJson() || [];
    // Mirror new inbound messages into IDB history + count unread.
    for (const m of inbox) {
      const id = msgId(m, "in");
      if (!historyCache.has(id)) {
        historyStore(Object.assign({ id, dir: "in", ts: Date.now() }, m));
        if (historyReady && !phonePanelActive()) unread++;
      }
      // Read receipts: when the user is looking at the phone panel, every
      // rendered v2 message gets a read ack back to its sender (once).
      if (m.id && phonePanelActive() && !readSent.has(m.id)) {
        readSent.add(m.id);
        try { Rations.phoneMarkRead(fromHex(m.id)); } catch (_) {}
      }
    }
    // Render: history (in + out) merged, sorted by ts. Live inbox msgs
    // not yet flushed render from the same cache.
    const msgs = Array.from(historyCache.values()).sort((a, b) => (a.ts || 0) - (b.ts || 0));
    if (msgs.length === 0) {
      el.innerHTML = '<p class="empty-state">No messages yet. Messages arrive sealed when the sender knows your phone key.</p>';
      renderBadge();
      return;
    }
    el.innerHTML = msgs.map((m) => renderMsg(m, m.dir || "in")).join("");
    if (inbox.length > lastInboxCount) {
      const latest = inbox[inbox.length - 1];
      if (lastInboxCount > 0 || document.hidden) {
        toast(`Message from ${contactName(latest.from)}${latest.sealed ? " (sealed)" : ""}`, "info");
      }
      lastInboxCount = inbox.length;
    }
    renderBadge();
    el.scrollTop = el.scrollHeight;
  }

  // ── outbox receipt sync + groups (R21) ──────────────────────────────

  const outboxState = new Map(); // wire msg_id hex → state string
  let groupsCache = [];

  /** Poll the WASM outbox and push receipt state onto history records. */
  function syncOutbox() {
    if (!Rations.phoneOutboxJson) return;
    const list = Rations.phoneOutboxJson() || [];
    let dirty = false;
    for (const o of list) {
      const st = o.read ? "read" : o.delivered ? "delivered" : "sent";
      if (outboxState.get(o.id) !== st) {
        outboxState.set(o.id, st);
        const rec = historyCache.get("out:" + o.id);
        if (rec && rec.state !== st) {
          rec.state = st;
          historyStore(rec);
          dirty = true;
        }
      }
    }
    if (dirty) renderInbox();
  }

  function groupName(gidHex) {
    const g = groupsCache.find((g) => g.id === gidHex);
    return g ? g.name : gidHex.slice(0, 8) + "…";
  }

  function renderGroups() {
    const el = document.getElementById("phone-groups");
    if (!el || !Rations.phoneGroupsJson) return;
    groupsCache = Rations.phoneGroupsJson() || [];
    el.innerHTML = groupsCache.length
      ? groupsCache.map((g) => `<div class="contact-row" onclick="PhoneUI.selectGroup('${g.id}')">
          <span class="dot s1"></span>
          <span class="contact-name">${escapeHtml(g.name)}</span>
          <span class="contact-status">${g.members.length} member${g.members.length === 1 ? "" : "s"}</span>
          <button class="small" onclick="event.stopPropagation();PhoneUI.leaveGroup('${g.id}')">leave</button>
        </div>`).join("")
      : '<p class="empty-state">No groups yet — create one to message several peers at once.</p>';
  }

  let activeGroup = null; // hex group_id when a group is the send target

  function renderPresence() {
    const el = document.getElementById("phone-contacts");
    if (!el) return;
    const presence = Rations.phonePresenceJson() || [];
    const saved = loadContacts();
    const rows = [];
    const seen = new Set();
    for (const p of presence) {
      seen.add(p.peer);
      const c = findContact(p.peer);
      const st = ["offline", "online", "in call"][p.status] || "?";
      rows.push(`<div class="contact-row" onclick="PhoneUI.selectPeer('${p.peer}')">
        <span class="dot s${p.status}"></span>
        <span class="contact-name">${escapeHtml(c ? c.name : p.peer.slice(0, 12) + "…")}</span>
        <span class="contact-status">${st}${p.text ? " — " + escapeHtml(p.text) : ""}</span>
      </div>`);
    }
    for (const c of saved) {
      if (seen.has(c.peer_id)) continue;
      rows.push(`<div class="contact-row" onclick="PhoneUI.selectPeer('${c.peer_id}')">
        <span class="dot s0"></span>
        <span class="contact-name">${escapeHtml(c.name)}</span>
        <span class="contact-status">not seen</span>
      </div>`);
    }
    el.innerHTML = rows.length
      ? rows.join("")
      : '<p class="empty-state">No contacts yet. Publish presence and connect to peers, or add a contact manually.</p>';
    PhoneUI.renderGroupMemberPicker();
  }

  function renderCalls() {
    const list = Rations.phoneCallsJson() || [];
    const ringingEl = document.getElementById("phone-incoming");
    const activeEl = document.getElementById("phone-active-call");
    if (!ringingEl || !activeEl) return;
    const ringing = list.filter((c) => c.state === 1 && c.inbound);
    const active = list.filter((c) => c.state === 2 || (c.state === 0 && !c.inbound));

    ringingEl.innerHTML = ringing
      .map((c) => `<div class="incoming-call">
          <span>📞 ${escapeHtml(contactName(c.peer))} is calling</span>
          <button class="primary small" onclick="PhoneUI.answerCall('${c.call_id}')">Answer</button>
          <button class="small" onclick="PhoneUI.rejectCall('${c.call_id}')">Reject</button>
        </div>`)
      .join("");
    if (ringing.length) {
      const r = ringing[0];
      if (!seenCalls.has(r.call_id)) {
        seenCalls.add(r.call_id);
        toast(`Incoming call from ${contactName(r.peer)}`, "warn");
      }
    }

    activeEl.innerHTML = active
      .map((c) => {
        const st = c.state === 0 ? "dialing…" : "active";
        return `<div class="active-call">
            <span>${st === "active" ? "🟢" : "⏳"} ${escapeHtml(contactName(c.peer))} — ${st}</span>
            <button class="small" onclick="PhoneUI.hangupCall('${c.call_id}')">Hang up</button>
          </div>`;
      })
      .join("");
    for (const c of list) {
      // Outbound call accepted — apply the callee's SDP answer to our pc.
      if (c.state === 2 && !c.inbound) {
        const entry = calls.get(c.call_id);
        if (entry && entry.pc && !entry.answerApplied) {
          entry.answerApplied = true;
          try {
            const note = JSON.parse(c.note);
            if (note.sdp) {
              entry.pc.setRemoteDescription(note.sdp).catch(() => setCallMediaState("answer SDP rejected — signaling only"));
            } else {
              setCallMediaState("peer has no media — signaling only");
            }
          } catch (_) {
            setCallMediaState("signaling only");
          }
        }
      }
      if ((c.state === 3 || c.state === 4) && calls.has(c.call_id)) closeCall(c.call_id);
      if (c.state === 4 && seenCalls.has(c.call_id) && !c.inbound) {
        seenCalls.delete(c.call_id);
        toast(`${contactName(c.peer)} rejected the call`, "warn");
      }
    }
  }

  function renderCardQr() {
    const canvas = document.getElementById("phone-contact-qr");
    if (!canvas || !global.QrRender || !global.QrRender.generateAndRender || !phonePk) return;
    let peerHex = "";
    try { peerHex = toHex(Rations.p2pPeerId()); } catch (_) { return; }
    const card = JSON.stringify({ v: 1, peer_id: peerHex, phone_pk: toHex(phonePk) });
    global.QrRender.generateAndRender(card, 1, canvas, 4);
  }

  function renderIdentity() {
    const el = document.getElementById("phone-my-id");
    if (!el || !phonePk) return;
    el.innerHTML = `<div class="row"><span class="label">Phone key</span><code class="hex">${toHex(phonePk)}</code></div>
      <div class="row"><span class="label">Peer id</span><code class="hex" id="phone-peer-id">…</code></div>`;
    try {
      document.getElementById("phone-peer-id").textContent = toHex(Rations.p2pPeerId());
    } catch (_) {}
  }

  function renderOutbox(peerHex, kind, bodyB64, wireId, groupId) {
    const rec = { id: "", dir: "out", to: peerHex, kind, body_b64: bodyB64, ts: Date.now(), sealed: true, state: "sent" };
    if (wireId) { rec.id = "out:" + toHex(wireId); rec.wire_id = toHex(wireId); }
    else rec.id = msgId(rec, "out");
    if (groupId) rec.group = groupId;
    historyStore(rec);
    const el = document.getElementById("phone-messages");
    if (!el) return;
    if (el.querySelector(".empty-state")) el.innerHTML = "";
    const div = document.createElement("div");
    div.innerHTML = renderMsg(rec, "out");
    el.appendChild(div.firstChild);
    el.scrollTop = el.scrollHeight;
  }

  // ── helpers ─────────────────────────────────────────────────────────

  function escapeHtml(s) {
    return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function hashStr(s) {
    let h = 0;
    for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
    return h;
  }
  function selectedPeer() {
    const el = document.getElementById("phone-target");
    return el ? el.value.trim() : "";
  }

  // ── public API ──────────────────────────────────────────────────────

  const PhoneUI = {
    /** Called once after WASM is ready. */
    init() {
      ensureIdentity();
      renderIdentity();
      renderPresence();
      renderCalls();
      historyLoad().then(() => renderInbox());
      renderInbox();
      startPolling();
      // Publish presence on init, then beacon periodically so peers that
      // join the mesh later still learn our phone key.
      const statusText = localStorage.getItem(LS_STATUS) || "";
      try {
        Rations.phonePresencePublish(1, statusText);
      } catch (_) {}
      setInterval(() => {
        try {
          Rations.phonePresencePublish(1, localStorage.getItem(LS_STATUS) || "");
        } catch (_) {}
      }, BEACON_MS);
      // Clear the unread badge when the user opens the phone panel.
      const navBtn = document.querySelector('#nav button[data-panel="phone"]');
      if (navBtn) navBtn.addEventListener("click", () => { unread = 0; renderBadge(); });
      // Always show the card QR — not just after "Share My Card".
      renderCardQr();
      renderGroups();
      PhoneUI.renderGroupMemberPicker();
      // Wire contact key for saved contacts (needed to seal).
      for (const c of loadContacts()) {
        if (c.phone_pk && c.phone_pk.length === 64) {
          try {
            Rations.phoneAddContact(fromHex(c.peer_id), fromHex(c.phone_pk));
          } catch (_) {}
        }
      }
      const caps = document.getElementById("phone-caps");
      if (caps) {
        const parts = [];
        parts.push(micAvailable() ? "mic ✓" : "mic ✗");
        parts.push(rtcAvailable() ? "webrtc ✓" : "webrtc ✗");
        caps.textContent = parts.join(" · ") + " — calls degrade to signaling when media is unavailable";
      }
    },

    selectPeer(peerHex) {
      activeGroup = null;
      const el = document.getElementById("phone-target");
      if (el) el.value = peerHex;
    },

    // ── groups (R21) ──────────────────────────────────────────────────

    selectGroup(gidHex) {
      activeGroup = gidHex;
      const el = document.getElementById("phone-target");
      if (el) el.value = "";
      toast(`Sending to group "${groupName(gidHex)}" — click a contact to switch back`, "info");
    },

    leaveGroup(gidHex) {
      const name = groupName(gidHex);
      const ok = Rations.phoneGroupLeave(fromHex(gidHex));
      if (activeGroup === gidHex) activeGroup = null;
      renderGroups();
      toast(ok ? `Left group "${name}"` : `Left "${name}" — member notifies unrouted`, ok ? "success" : "warn");
    },

    /** Create a group from the checked contacts + name field. */
    createGroup() {
      const nameEl = document.getElementById("phone-group-name");
      const name = (nameEl ? nameEl.value.trim() : "") || "group";
      const boxes = document.querySelectorAll("#phone-group-members input[type=checkbox]:checked");
      const members = [];
      for (const b of boxes) members.push(fromHex(b.value));
      if (members.length === 0) {
        toast("Check at least one contact to invite", "error");
        return;
      }
      const gid = Rations.phoneGroupCreate(name, members);
      if (gid) {
        renderGroups();
        toast(`Group "${name}" created — invites sent to ${members.length} member${members.length === 1 ? "" : "s"}`, "success");
      } else {
        toast("Group created but invites couldn't be routed yet", "warn");
        renderGroups();
      }
      if (nameEl) nameEl.value = "";
    },

    /** Render the create-group member checklist from contacts. */
    renderGroupMemberPicker() {
      const el = document.getElementById("phone-group-members");
      if (!el) return;
      const contacts = loadContacts();
      el.innerHTML = contacts.length
        ? contacts.map((c) => `<label class="pick"><input type="checkbox" value="${c.peer_id}"> ${escapeHtml(c.name)}</label>`).join("")
        : '<p class="empty-state">No contacts to invite yet.</p>';
    },

    addContact() {
      const name = document.getElementById("phone-contact-name").value.trim();
      const pid = document.getElementById("phone-contact-pid").value.trim();
      const ppk = document.getElementById("phone-contact-ppk").value.trim();
      if (!pid || pid.length !== 64) {
        toast("Peer id must be 64 hex chars", "error");
        return;
      }
      const list = loadContacts().filter((c) => c.peer_id !== pid);
      list.push({ name: name || pid.slice(0, 12), peer_id: pid, phone_pk: ppk.length === 64 ? ppk : "" });
      saveContacts(list);
      if (ppk.length === 64) {
        try {
          Rations.phoneAddContact(fromHex(pid), fromHex(ppk));
        } catch (_) {}
      }
      renderPresence();
      toast("Contact saved", "success");
    },

    /** Copy my contact card JSON {peer_id, phone_pk, name} to clipboard. */
    async copyContactCard() {
      const card = JSON.stringify({
        v: 1,
        peer_id: toHex(Rations.p2pPeerId()),
        phone_pk: toHex(phonePk),
      });
      try {
        await navigator.clipboard.writeText(card);
        toast("Contact card copied — share it out-of-band or via QR", "success");
      } catch (_) {
        prompt("Contact card:", card);
      }
      renderCardQr();
    },

    /** Import a contact card (from clipboard paste / QR scan). */

    /** Scan a contact-card QR from an image file picked by the user. */
    scanContactQrFile() {
      const inp = document.getElementById("phone-card-file");
      if (inp) inp.click();
    },

    /** Camera scan for a contact card — stops on first decode. */
    async scanContactQrCamera() {
      if (typeof QR_SCANNER === "undefined") {
        toast("QR scanner not loaded", "error");
        return;
      }
      const shim = { exports: Object.assign({ memory: Rations.memory }, Rations.exports) };
      const vid = document.getElementById("phone-cam-video");
      try {
        const s = await QR_SCANNER.startCamera(shim, vid || null, {
          onResult: (r) => {
            PhoneUI._acceptCardPayload(r.data);
            if (vid) vid.style.display = "none";
          },
        });
        if (vid) vid.style.display = "block";
        toast("Camera on — point at a contact card QR", "info");
        setTimeout(() => { s.stop(); if (vid) vid.style.display = "none"; }, 60000);
      } catch (e) {
        toast("Camera unavailable: " + e.message, "error");
      }
    },

    /** Decode handler shared by file + camera scans. Returns true if the
        payload was a valid contact card. */
    _acceptCardPayload(bytes) {
      let card = null;
      try { card = JSON.parse(dec.decode(bytes)); } catch (_) {}
      if (card && card.peer_id && card.peer_id.length === 64) {
        document.getElementById("phone-contact-pid").value = card.peer_id;
        document.getElementById("phone-contact-ppk").value = card.phone_pk || "";
        if (card.name) document.getElementById("phone-contact-name").value = card.name;
        PhoneUI.addContact();
        toast(`Contact ${card.name || card.peer_id.slice(0, 12)} added from QR`, "success");
        return true;
      }
      toast("Scanned payload is not a contact card", "warn");
      return false;
    },

    /** File-input change handler — decode the chosen image as a card QR. */
    async onCardFile(input) {
      const f = input.files && input.files[0];
      input.value = "";
      if (!f) return;
      const img = new Image();
      const url = URL.createObjectURL(f);
      try {
        await new Promise((res, rej) => { img.onload = res; img.onerror = rej; img.src = url; });
        const shim = { exports: Object.assign({ memory: Rations.memory }, Rations.exports) };
        const res = QR_SCANNER.decodeSource(shim, img);
        if (res.error) { toast("No QR found in image (" + res.error + ")", "warn"); return; }
        PhoneUI._acceptCardPayload(res.data);
      } finally {
        URL.revokeObjectURL(url);
      }
    },

    /** Import a contact card (from clipboard paste / QR scan). */
    importContactCard() {
      const raw = document.getElementById("phone-contact-pid").value.trim();
      try {
        const card = JSON.parse(raw);
        if (card.peer_id && card.peer_id.length === 64) {
          document.getElementById("phone-contact-pid").value = card.peer_id;
          document.getElementById("phone-contact-ppk").value = card.phone_pk || "";
          toast("Card parsed — press Add Contact", "info");
          return;
        }
      } catch (_) {}
      toast("Paste a contact card JSON or a 64-char peer id", "warn");
    },

    publishPresence() {
      const text = document.getElementById("phone-status-text").value.trim();
      localStorage.setItem(LS_STATUS, text);
      const ok = Rations.phonePresencePublish(1, text);
      toast(ok ? "Presence broadcast" : "Presence broadcast queued (no peers)", ok ? "success" : "warn");
    },

    sendText() {
      const input = document.getElementById("phone-msg-input");
      const body = input.value.trim();
      if (!body) return;
      if (activeGroup) {
        const msgId = Rations.phoneGroupSend(fromHex(activeGroup), 0, body);
        if (msgId) {
          renderOutbox("", "text", b64encode(enc.encode(body)), msgId, activeGroup);
          input.value = "";
        } else {
          toast("Group send failed — no routes to members", "error");
        }
        return;
      }
      const target = selectedPeer();
      if (!target || target.length !== 64) {
        toast("Pick a contact/group or paste a 64-char peer id", "error");
        return;
      }
      const msgId = Rations.phoneSend2(fromHex(target), 0, body);
      if (msgId) {
        renderOutbox(target, "text", b64encode(enc.encode(body)), msgId, null);
        input.value = "";
      } else {
        const code = Rations.lastError ? Rations.lastError() : "?";
        toast(`Send failed — no route to peer (err ${code}). Is the peer reachable via relay?`, "error");
      }
    },

    /** Record a voice note via MediaRecorder, send as kind=voice_note. */
    async sendVoiceNote() {
      const target = selectedPeer();
      if (!activeGroup && (!target || target.length !== 64)) {
        toast("Pick a contact first", "error");
        return;
      }
      if (!micAvailable()) {
        toast("No microphone access — voice notes unavailable on this device", "error");
        return;
      }
      const btn = document.getElementById("phone-voice-btn");
      try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        const rec = new MediaRecorder(stream);
        const chunks = [];
        rec.ondataavailable = (e) => chunks.push(e.data);
        btn.textContent = "⏺ recording… click to stop";
        btn.onclick = () => rec.stop();
        const done = new Promise((r) => (rec.onstop = r));
        rec.start();
        await done;
        for (const t of stream.getTracks()) t.stop();
        btn.textContent = "🎤 voice note";
        btn.onclick = () => PhoneUI.sendVoiceNote();
        const blob = new Blob(chunks, { type: rec.mimeType || "audio/webm" });
        const bytes = new Uint8Array(await blob.arrayBuffer());
        if (bytes.length > 200000) {
          toast("Voice note too large (>200KB) — keep it short", "error");
          return;
        }
        const msgId = activeGroup
          ? Rations.phoneGroupSend(fromHex(activeGroup), 1, bytes)
          : Rations.phoneSend2(fromHex(target), 1, bytes);
        if (msgId) {
          renderOutbox(target, "voice_note", b64encode(bytes), msgId, activeGroup);
        } else {
          toast("Send failed — no route to peer", "error");
        }
      } catch (e) {
        btn.textContent = "🎤 voice note";
        btn.onclick = () => PhoneUI.sendVoiceNote();
        toast("Mic unavailable: " + e.message, "error");
      }
    },

    playVoiceNote(spanId) {
      const span = document.getElementById(spanId);
      if (!span) return;
      const bytes = b64decode(span.dataset.b64);
      const blob = new Blob([bytes], { type: "audio/webm" });
      const url = URL.createObjectURL(blob);
      const audio = new Audio(url);
      audio.play().catch(() => toast("Playback failed — codec unsupported", "warn"));
    },

    async dial() {
      const target = selectedPeer();
      if (!target || target.length !== 64) {
        toast("Pick a contact first", "error");
        return;
      }
      let note = "{}";
      let pc = null;
      let stream = null;
      try {
        const o = await createOfferNote();
        note = o.note;
        pc = o.pc;
        stream = o.stream;
      } catch (e) {
        note = JSON.stringify({ v: 1, media: "none", reason: String(e) });
      }
      const callId = Rations.phoneDial(fromHex(target), 1, note);
      if (!callId) {
        if (pc) pc.close();
        if (stream) for (const t of stream.getTracks()) t.stop();
        toast("Dial failed — no route to peer", "error");
        return;
      }
      const hex = toHex(callId);
      calls.set(hex, { pc, stream, peerHex: target, inbound: false });
      if (pc) wirePc(pc, hex);
      activeCallId = hex;
      toast(`Calling ${contactName(target)}…`, "info");
      renderCalls();
    },

    async answerCall(callIdHex) {
      const list = Rations.phoneCallsJson() || [];
      const call = list.find((c) => c.call_id === callIdHex);
      // The ring note carries the caller's SDP offer (WASM Call.note).
      const offerJson = call ? call.note : "{}";
      let answer;
      try {
        answer = await createAnswerNote(offerJson || "{}");
      } catch (e) {
        answer = { note: JSON.stringify({ v: 1, media: "none", reason: String(e) }), pc: null, stream: null };
      }
      const ok = Rations.phoneAnswer(fromHex(callIdHex), answer.note);
      if (!ok) {
        toast("Answer failed — caller unreachable", "error");
        if (answer.pc) answer.pc.close();
        return;
      }
      calls.set(callIdHex, { pc: answer.pc, stream: answer.stream, peerHex: call ? call.peer : "", inbound: true });
      if (answer.pc) wirePc(answer.pc, callIdHex);
      activeCallId = callIdHex;
      renderCalls();
    },

    rejectCall(callIdHex) {
      Rations.phoneReject(fromHex(callIdHex));
      renderCalls();
    },

    hangupCall(callIdHex) {
      Rations.phoneHangup(fromHex(callIdHex));
      closeCall(callIdHex);
      renderCalls();
    },
  };

  global.PhoneUI = PhoneUI;
})(window);
