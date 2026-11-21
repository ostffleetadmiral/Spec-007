/**
 * WebRTC Bridge — JavaScript RTCPeerConnection wrapper for the vendored
 * WebRTC protocol logic (src/p2p/webrtc.zig) and the secure-channel layer
 * (src/p2p/channel_crypto.zig).
 *
 * Responsibilities:
 *  - Parse browser SDP into the compact fields the wrtc1: invite endpoint
 *    carries (ice-ufrag, ice-pwd, DTLS fingerprint, setup, offer/answer).
 *  - Reconstruct a minimal browser-acceptable SDP from a wrtc1: record.
 *  - Drive the X25519 handshake over the DataChannel, then route every
 *    application message through rations_channel_seal/open (AES-256-GCM).
 *
 * Message framing on the DataChannel mirrors channel_crypto.zig:
 *   handshake pubkey : 32 raw bytes (sent once per side, first message)
 *   sealed message   : u64 counter LE | u8 direction | ciphertext | tag[16]
 *
 * Signaling transport (how endpoints/candidates reach the peer) is out of
 * scope — the caller wires `onSignal` to QR, WebSocket relay, or copy/paste.
 */

const WebRTCBridge = (function () {
  const HANDSHAKE_PPKIND = 32; // raw 32-byte X25519 pubkey
  let wasm = null;
  let pc = null;
  let dc = null;
  let listeners = [];
  let peerPubkeyReceived = false;
  let localCandidates = [];

  function init(wasmInstance) {
    wasm = wasmInstance;
  }

  function notify(type, payload) {
    listeners.forEach((fn) => fn(type, payload));
  }

  function on(listener) {
    listeners.push(listener);
    return () => { listeners = listeners.filter((l) => l !== listener); };
  }

  // ── helpers ──────────────────────────────────────────────────────────

  function mem() {
    return wasm.exports.memory || wasm.memory;
  }

  function writeBytes(bytes) {
    const ptr = wasm.exports.rations_alloc(bytes.length);
    new Uint8Array(mem().buffer, ptr, bytes.length).set(bytes);
    return ptr;
  }

  function readBytes(ptr, len) {
    return new Uint8Array(mem().buffer, ptr, len).slice();
  }

  function writeString(s) {
    return writeBytes(new TextEncoder().encode(s));
  }

  function allocOut(len) {
    return { ptr: wasm.exports.rations_alloc(len), lenPtr: wasm.exports.rations_alloc(4) };
  }

  function readLen(lenPtr) {
    // usize is u32 on wasm32
    return new DataView(mem().buffer).getUint32(lenPtr, true);
  }

  function hexToBytes(hex) {
    const clean = hex.replace(/:/g, "").toLowerCase();
    const out = new Uint8Array(clean.length / 2);
    for (let i = 0; i < out.length; i++) {
      out[i] = parseInt(clean.substr(i * 2, 2), 16);
    }
    return out;
  }

  function bytesToColonHex(bytes) {
    return Array.from(bytes)
      .map((b) => b.toString(16).padStart(2, "0").toUpperCase())
      .join(":");
  }

  // Extract the fields the wrtc1: record carries from browser SDP text.
  function parseSdpFields(sdpText) {
    const grab = (key) => {
      const m = sdpText.match(new RegExp("a=" + key + ":([^\\r\\n]+)"));
      return m ? m[1].trim() : "";
    };
    const fpLine = grab("fingerprint"); // "sha-256 AB:CD:..."
    const fpParts = fpLine.split(" ");
    const fpAlgo = fpParts.length > 1 && fpParts[0].toLowerCase() === "sha-384" ? 1 : 0;
    const fpHash = hexToBytes(fpParts.length > 1 ? fpParts[1] : fpLine);
    const setupStr = grab("setup");
    const setup = setupStr === "active" ? 1 : setupStr === "passive" ? 2 : 0;
    return {
      ufrag: grab("ice-ufrag"),
      pwd: grab("ice-pwd"),
      fpAlgo,
      fpHash,
      setup,
    };
  }

  // Rebuild a minimal SDP the browser will accept for a datachannel-only m-line.
  function buildSdpText(type, f) {
    const algoName = f.fpAlgo === 1 ? "sha-384" : "sha-256";
    const setupName = f.setup === 1 ? "active" : f.setup === 2 ? "passive" : "actpass";
    return [
      "v=0",
      "o=- 0 0 IN IP4 0.0.0.0",
      "s=-",
      "t=0 0",
      "m=application 9 UDP/DTLS/SCTP webrtc-datachannel",
      "c=IN IP4 0.0.0.0",
      "a=ice-ufrag:" + f.ufrag,
      "a=ice-pwd:" + f.pwd,
      "a=fingerprint:" + algoName + " " + bytesToColonHex(f.fpHash),
      "a=setup:" + setupName,
      "a=mid:0",
      "a=sctp-port:5000",
      type === "answer" ? "a=recvonly" : "a=sendrecv",
      "",
    ].join("\r\n");
  }

  // ── wrtc1: endpoint codec (WASM) ─────────────────────────────────────

  function wrapEndpoint(sdpType, fields) {
    const ufrag = new TextEncoder().encode(fields.ufrag);
    const pwd = new TextEncoder().encode(fields.pwd);
    const ufragPtr = writeBytes(ufrag);
    const pwdPtr = writeBytes(pwd);
    const fpPtr = writeBytes(fields.fpHash);
    const out = allocOut(512);
    const ok = wasm.exports.rations_wrtc_wrap_endpoint(
      sdpType, ufragPtr, ufrag.length, pwdPtr, pwd.length,
      fpPtr, fields.fpAlgo, fields.setup, out.ptr, out.lenPtr
    );
    let endpoint = null;
    if (ok) {
      const len = readLen(out.lenPtr);
      endpoint = new TextDecoder().decode(readBytes(out.ptr, len));
    }
    wasm.exports.rations_free(ufragPtr, ufrag.length);
    wasm.exports.rations_free(pwdPtr, pwd.length);
    wasm.exports.rations_free(fpPtr, fields.fpHash.length);
    wasm.exports.rations_free(out.ptr, 512);
    wasm.exports.rations_free(out.lenPtr, 4);
    return endpoint;
  }

  function unwrapEndpoint(endpoint) {
    const ep = new TextEncoder().encode(endpoint);
    const epPtr = writeBytes(ep);
    const out = allocOut(128);
    const ok = wasm.exports.rations_wrtc_unwrap_endpoint(epPtr, ep.length, out.ptr, out.lenPtr);
    wasm.exports.rations_free(epPtr, ep.length);
    if (!ok) {
      wasm.exports.rations_free(out.ptr, 128);
      wasm.exports.rations_free(out.lenPtr, 4);
      return null;
    }
    const rec = readBytes(out.ptr, readLen(out.lenPtr));
    wasm.exports.rations_free(out.ptr, 128);
    wasm.exports.rations_free(out.lenPtr, 4);
    const dv = new DataView(rec.buffer);
    const ufragLen = rec[1];
    const pwdLen = rec[34];
    return {
      type: rec[0] === 0 ? "offer" : "answer",
      ufrag: new TextDecoder().decode(rec.slice(2, 2 + ufragLen)),
      pwd: new TextDecoder().decode(rec.slice(35, 35 + pwdLen)),
      fpAlgo: rec[67],
      fpHash: rec.slice(68, 100),
      setup: rec[100],
      ncand: dv.getUint16(101, true),
    };
  }

  // ── peer connection lifecycle ────────────────────────────────────────

  function newPeerConnection() {
    pc = new RTCPeerConnection({ iceServers: [] }); // LAN/manual signaling
    pc.onicecandidate = (e) => {
      if (e.candidate) {
        localCandidates.push(e.candidate.toJSON());
        notify("candidate", e.candidate.toJSON());
      } else {
        notify("candidates-complete", localCandidates);
      }
    };
    pc.onconnectionstatechange = () => notify("connection-state", pc.connectionState);
    return pc;
  }

  function wireDataChannel(channel, isInitiator) {
    dc = channel;
    dc.binaryType = "arraybuffer";
    dc.onopen = () => {
      // Begin X25519 handshake: send our 32-byte pubkey first.
      const role = isInitiator ? 0 : 1;
      wasm.exports.rations_channel_init(role);
      const pubPtr = wasm.exports.rations_alloc(32);
      wasm.exports.rations_channel_handshake(pubPtr);
      dc.send(readBytes(pubPtr, 32));
      wasm.exports.rations_free(pubPtr, 32);
      notify("datachannel-open", {});
    };
    dc.onmessage = (ev) => {
      const data = new Uint8Array(ev.data);
      if (!peerPubkeyReceived && data.length === HANDSHAKE_PPKIND) {
        peerPubkeyReceived = true;
        const ptr = writeBytes(data);
        const ok = wasm.exports.rations_channel_accept(ptr);
        wasm.exports.rations_free(ptr, data.length);
        notify(ok ? "channel-secure" : "channel-error", {});
        return;
      }
      // Sealed application message → decrypt via WASM.
      const inPtr = writeBytes(data);
      const out = allocOut(Math.max(256, data.length));
      const metaPtr = wasm.exports.rations_alloc(4);
      const ok = wasm.exports.rations_channel_open(inPtr, data.length, out.ptr, out.lenPtr, metaPtr);
      wasm.exports.rations_free(inPtr, data.length);
      if (ok) {
        const len = readLen(out.lenPtr);
        const payload = readBytes(out.ptr, len);
        const meta = readBytes(metaPtr, 4);
        const mv = new DataView(meta.buffer);
        notify("message", { channelId: mv.getUint16(0, true), ppid: mv.getUint16(2, true), data: payload });
      } else {
        notify("channel-error", { reason: "open failed" });
      }
      wasm.exports.rations_free(out.ptr, Math.max(256, data.length));
      wasm.exports.rations_free(out.lenPtr, 4);
      wasm.exports.rations_free(metaPtr, 4);
    };
    dc.onclose = () => notify("datachannel-closed", {});
    dc.onerror = () => notify("channel-error", { reason: "datachannel error" });
  }

  // ── public API ───────────────────────────────────────────────────────

  /** Create an offer; resolves to the wrtc1: endpoint string for the invite. */
  async function createOffer(label) {
    newPeerConnection();
    peerPubkeyReceived = false;
    localCandidates = [];
    wireDataChannel(pc.createDataChannel(label || "rations", { ordered: true }), true);
    await pc.setLocalDescription(await pc.createOffer());
    const f = parseSdpFields(pc.localDescription.sdp);
    const endpoint = wrapEndpoint(0, f);
    notify("offer", { endpoint });
    return endpoint;
  }

  /** Accept a wrtc1: offer endpoint; resolves to the wrtc1: answer endpoint. */
  async function acceptOffer(offerEndpoint, label) {
    const offer = unwrapEndpoint(offerEndpoint);
    if (!offer || offer.type !== "offer") throw new Error("not a wrtc1 offer");
    newPeerConnection();
    peerPubkeyReceived = false;
    localCandidates = [];
    pc.ondatachannel = (ev) => wireDataChannel(ev.channel, false);
    await pc.setRemoteDescription({ type: "offer", sdp: buildSdpText("offer", offer) });
    await pc.setLocalDescription(await pc.createAnswer());
    const f = parseSdpFields(pc.localDescription.sdp);
    const endpoint = wrapEndpoint(1, f);
    notify("answer", { endpoint });
    return endpoint;
  }

  /** Complete the handshake on the offerer side with the wrtc1: answer. */
  async function acceptAnswer(answerEndpoint) {
    const answer = unwrapEndpoint(answerEndpoint);
    if (!answer || answer.type !== "answer") throw new Error("not a wrtc1 answer");
    await pc.setRemoteDescription({ type: "answer", sdp: buildSdpText("answer", answer) });
  }

  /** Feed a remote ICE candidate (as produced by the 'candidate' event). */
  async function addRemoteCandidate(candidate) {
    if (pc) await pc.addIceCandidate(candidate);
  }

  /** Seal + send an application message on the open DataChannel. */
  function send(channelId, ppid, data) {
    if (!dc || dc.readyState !== "open") return false;
    const bytes = typeof data === "string" ? new TextEncoder().encode(data) : data;
    const inPtr = writeBytes(bytes);
    const out = allocOut(bytes.length + 64);
    const ok = wasm.exports.rations_channel_seal(channelId, ppid, inPtr, bytes.length, out.ptr, out.lenPtr);
    wasm.exports.rations_free(inPtr, bytes.length);
    if (!ok) {
      wasm.exports.rations_free(out.ptr, bytes.length + 64);
      wasm.exports.rations_free(out.lenPtr, 4);
      return false;
    }
    const sealed = readBytes(out.ptr, readLen(out.lenPtr));
    wasm.exports.rations_free(out.ptr, bytes.length + 64);
    wasm.exports.rations_free(out.lenPtr, 4);
    dc.send(sealed);
    return true;
  }

  function close() {
    if (dc) dc.close();
    if (pc) pc.close();
    dc = null;
    pc = null;
    peerPubkeyReceived = false;
  }

  return {
    init,
    on,
    createOffer,
    acceptOffer,
    acceptAnswer,
    addRemoteCandidate,
    send,
    close,
    wrapEndpoint,
    unwrapEndpoint,
  };
})();

if (typeof window !== "undefined") {
  window.WebRTCBridge = WebRTCBridge;
}
