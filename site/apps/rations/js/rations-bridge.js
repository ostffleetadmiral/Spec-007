/**
 * Rations WASM Loader — bridges Zig WASM module to browser APIs.
 * Provides the import object for WebAssembly.instantiate and
 * wraps exported functions for use by the agent and UI.
 */

const RationsBridge = (function () {
  let wasm = null;

  // Text encoder/decoder for string passing
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();

  // Import object — these functions are called from Zig via extern
  // Memory is imported so JS controls the initial/max size.
  const memory = new WebAssembly.Memory({ initial: 2048, maximum: 16384, shared: false });

  const importObject = {
    env: {
      memory: memory,
      js_console_log: function (msgPtr, msgLen) {
        const bytes = new Uint8Array(memory.buffer, msgPtr, msgLen);
        console.log("[rations]", decoder.decode(bytes));
      },

      js_dom_set_text: function (idPtr, idLen, textPtr, textLen) {
        const idBytes = new Uint8Array(memory.buffer, idPtr, idLen);
        const textBytes = new Uint8Array(memory.buffer, textPtr, textLen);
        const id = decoder.decode(idBytes);
        const text = decoder.decode(textBytes);
        const el = document.getElementById(id);
        if (el) el.textContent = text;
      },

      js_dom_get_value: function (idPtr, idLen, outPtr, outLen) {
        const idBytes = new Uint8Array(memory.buffer, idPtr, idLen);
        const id = decoder.decode(idBytes);
        const el = document.getElementById(id);
        const value = el ? el.value : "";
        const valueBytes = encoder.encode(value);
        const copyLen = Math.min(valueBytes.length, outLen);
        const out = new Uint8Array(memory.buffer, outPtr, outLen);
        out.set(valueBytes.subarray(0, copyLen));
        return copyLen;
      },

      js_local_storage_set: function (keyPtr, keyLen, valPtr, valLen) {
        const keyBytes = new Uint8Array(memory.buffer, keyPtr, keyLen);
        const valBytes = new Uint8Array(memory.buffer, valPtr, valLen);
        const key = decoder.decode(keyBytes);
        const val = decoder.decode(valBytes);
        try {
          localStorage.setItem(key, val);
          return 1;
        } catch (e) {
          return 0;
        }
      },

      js_local_storage_get: function (keyPtr, keyLen, outPtr, outLenPtr) {
        const keyBytes = new Uint8Array(memory.buffer, keyPtr, keyLen);
        const key = decoder.decode(keyBytes);
        const val = localStorage.getItem(key);
        if (val === null) return 0;
        const valBytes = encoder.encode(val);
        const outView = new Uint8Array(memory.buffer, outPtr);
        const lenView = new Uint32Array(memory.buffer, outLenPtr);
        const copyLen = Math.min(valBytes.length, 4096);
        outView.set(valBytes.subarray(0, copyLen));
        lenView[0] = copyLen;
        return 1;
      },

      js_random_bytes: function (bufPtr, bufLen) {
        const buf = new Uint8Array(memory.buffer, bufPtr, bufLen);
        crypto.getRandomValues(buf);
      },

      js_time_now: function () {
        return BigInt(Date.now());
      },

      js_ws_connect: function (urlPtr, urlLen) {
        if (window.TransportBridge) {
          return window.TransportBridge.wsConnect(urlPtr, urlLen);
        }
        return 0;
      },

      js_ws_send: function (connId, dataPtr, dataLen) {
        if (window.TransportBridge) {
          return window.TransportBridge.wsSend(connId, dataPtr, dataLen) ? 1 : 0;
        }
        return 0;
      },

      js_ws_close: function (connId) {
        if (window.TransportBridge) {
          window.TransportBridge.wsClose(connId);
        }
      },

      js_ws_state: function (connId) {
        if (window.TransportBridge) {
          return window.TransportBridge.wsState(connId);
        }
        return 0;
      },
    },
  };

  async function load(wasmUrl) {
    const response = await fetch(wasmUrl);
    const wasmBytes = await response.arrayBuffer();
    const result = await WebAssembly.instantiate(wasmBytes, importObject);
    wasm = result.instance.exports;
    return wasm;
  }

  // Helper: write a byte array into WASM memory
  function writeToWasm(bytes) {
    const ptr = wasm.rations_alloc(bytes.length);
    if (ptr === 0) throw new Error("WASM allocation failed");
    const view = new Uint8Array(memory.buffer, ptr, bytes.length);
    view.set(bytes);
    return ptr;
  }

  // Helper: read a byte array from WASM memory
  function readFromWasm(ptr, len) {
    return new Uint8Array(memory.buffer, ptr, len).slice();
  }

  // Helper: convert hex string to Uint8Array
  function hexToBytes(hex) {
    const bytes = new Uint8Array(hex.length / 2);
    for (let i = 0; i < bytes.length; i++) {
      bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
    }
    return bytes;
  }

  // Wrapped crypto functions
  const api = {
    load,

    get exports() {
      return wasm;
    },

    get memory() {
      return memory;
    },

    get version() {
      return wasm.rations_version();
    },

    sha256(data) {
      const dataPtr = writeToWasm(data);
      const outPtr = wasm.rations_alloc(32);
      wasm.rations_sha256(dataPtr, data.length, outPtr);
      const result = readFromWasm(outPtr, 32);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, 32);
      return result;
    },

    ed25519KeypairFromSeed(seed) {
      if (seed.length < 32) return null;
      const seedPtr = writeToWasm(seed);
      const pkPtr = wasm.rations_alloc(32);
      const skPtr = wasm.rations_alloc(64);
      const ok = wasm.rations_ed25519_keypair_seed(seedPtr, seed.length, pkPtr, skPtr);
      let result = null;
      if (ok) {
        result = {
          publicKey: readFromWasm(pkPtr, 32),
          secretKey: readFromWasm(skPtr, 64),
        };
      }
      wasm.rations_free(seedPtr, seed.length);
      wasm.rations_free(pkPtr, 32);
      wasm.rations_free(skPtr, 64);
      return result;
    },

    ed25519Sign(msg, sk) {
      const msgPtr = writeToWasm(msg);
      const skPtr = writeToWasm(sk);
      const sigPtr = wasm.rations_alloc(64);
      const ok = wasm.rations_ed25519_sign(msgPtr, msg.length, skPtr, sk.length, sigPtr);
      let result = null;
      if (ok) result = readFromWasm(sigPtr, 64);
      wasm.rations_free(msgPtr, msg.length);
      wasm.rations_free(skPtr, sk.length);
      wasm.rations_free(sigPtr, 64);
      return result;
    },

    ed25519Verify(msg, sig, pk) {
      const msgPtr = writeToWasm(msg);
      const sigPtr = writeToWasm(sig);
      const pkPtr = writeToWasm(pk);
      const ok = wasm.rations_ed25519_verify(msgPtr, msg.length, sigPtr, sig.length, pkPtr, pk.length);
      wasm.rations_free(msgPtr, msg.length);
      wasm.rations_free(sigPtr, sig.length);
      wasm.rations_free(pkPtr, pk.length);
      return ok === 1;
    },

    aesEncrypt(plaintext, key, nonce) {
      const ptPtr = writeToWasm(plaintext);
      const keyPtr = writeToWasm(key);
      const noncePtr = writeToWasm(nonce);
      const ctPtr = wasm.rations_alloc(plaintext.length);
      const tagPtr = wasm.rations_alloc(16);
      const ok = wasm.rations_aes_encrypt(ptPtr, plaintext.length, keyPtr, key.length, noncePtr, nonce.length, ctPtr, tagPtr);
      let result = null;
      if (ok) {
        result = {
          ciphertext: readFromWasm(ctPtr, plaintext.length),
          tag: readFromWasm(tagPtr, 16),
        };
      }
      wasm.rations_free(ptPtr, plaintext.length);
      wasm.rations_free(keyPtr, key.length);
      wasm.rations_free(noncePtr, nonce.length);
      wasm.rations_free(ctPtr, plaintext.length);
      wasm.rations_free(tagPtr, 16);
      return result;
    },

    aesDecrypt(ciphertext, key, nonce, tag) {
      const ctPtr = writeToWasm(ciphertext);
      const keyPtr = writeToWasm(key);
      const noncePtr = writeToWasm(nonce);
      const tagPtr = writeToWasm(tag);
      const ptPtr = wasm.rations_alloc(ciphertext.length);
      const ok = wasm.rations_aes_decrypt(ctPtr, ciphertext.length, keyPtr, key.length, noncePtr, nonce.length, tagPtr, tag.length, ptPtr);
      let result = null;
      if (ok) result = readFromWasm(ptPtr, ciphertext.length);
      wasm.rations_free(ctPtr, ciphertext.length);
      wasm.rations_free(keyPtr, key.length);
      wasm.rations_free(noncePtr, nonce.length);
      wasm.rations_free(tagPtr, tag.length);
      wasm.rations_free(ptPtr, ciphertext.length);
      return result;
    },

    pbkdf2(password, salt, iterations, outLen) {
      const pwPtr = writeToWasm(password);
      const saltPtr = writeToWasm(salt);
      const outPtr = wasm.rations_alloc(outLen);
      const ok = wasm.rations_pbkdf2(pwPtr, password.length, saltPtr, salt.length, iterations, outPtr, outLen);
      let result = null;
      if (ok) result = readFromWasm(outPtr, outLen);
      wasm.rations_free(pwPtr, password.length);
      wasm.rations_free(saltPtr, salt.length);
      wasm.rations_free(outPtr, outLen);
      return result;
    },

    huffmanEncode(data) {
      const dataPtr = writeToWasm(data);
      // Zig huffman.encode needs: 4 + 4*256 + data.len*2 + 16 = data.len*2 + 1044
      const outSize = data.length * 2 + 1044;
      const outPtr = wasm.rations_alloc(outSize);
      const lenBuf = new Uint32Array(memory.buffer, wasm.rations_alloc(4), 1);
      const ok = wasm.rations_huffman_encode(dataPtr, data.length, outPtr, lenBuf);
      let result = null;
      if (ok) result = readFromWasm(outPtr, lenBuf[0]);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      return result;
    },

    huffmanDecode(data) {
      const dataPtr = writeToWasm(data);
      const outPtr = wasm.rations_alloc(data.length * 4 + 1024);
      const lenBuf = new Uint32Array(memory.buffer, wasm.rations_alloc(4), 1);
      const ok = wasm.rations_huffman_decode(dataPtr, data.length, outPtr, lenBuf);
      let result = null;
      if (ok) result = readFromWasm(outPtr, lenBuf[0]);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, data.length * 4 + 1024);
      return result;
    },

    shamirSplit(secret, threshold, total) {
      const secretPtr = writeToWasm(secret);
      const shardLen = 1 + secret.length;
      const outPtr = wasm.rations_alloc(shardLen * total);
      const ok = wasm.rations_shamir_split(secretPtr, secret.length, threshold, total, outPtr);
      let result = null;
      if (ok) result = readFromWasm(outPtr, shardLen * total);
      wasm.rations_free(secretPtr, secret.length);
      wasm.rations_free(outPtr, shardLen * total);
      return result;
    },

    shamirReconstruct(shards, shardLen, shardCount, outLen) {
      const shardsPtr = writeToWasm(shards);
      const outPtr = wasm.rations_alloc(outLen);
      const ok = wasm.rations_shamir_reconstruct(shardsPtr, shardLen, shardCount, outPtr, outLen);
      let result = null;
      if (ok) result = readFromWasm(outPtr, outLen);
      wasm.rations_free(shardsPtr, shards.length);
      wasm.rations_free(outPtr, outLen);
      return result;
    },

    // Raw memory access for advanced use
    get memory() {
      return memory;
    },

    get exports() {
      return wasm;
    },

    // Memory helpers for external use
    alloc(len) {
      return wasm.rations_alloc(len);
    },
    free(ptr, len) {
      wasm.rations_free(ptr, len);
    },

    // === Blockchain wrappers ===
    chainInit(seed) {
      const seedPtr = writeToWasm(seed);
      const ok = wasm.rations_chain_init(seedPtr, seed.length);
      wasm.rations_free(seedPtr, seed.length);
      return ok;
    },

    chainHeight() {
      return wasm.rations_chain_height();
    },

    chainAddTx(action, payload, seed, timestamp, nonce) {
      const payloadPtr = writeToWasm(payload);
      const seedPtr = writeToWasm(seed);
      const ok = wasm.rations_chain_add_tx(action, payloadPtr, payload.length, seedPtr, seed.length, BigInt(timestamp), BigInt(nonce));
      wasm.rations_free(payloadPtr, payload.length);
      wasm.rations_free(seedPtr, seed.length);
      return ok;
    },

    chainMineBlock(timestamp) {
      return wasm.rations_chain_mine_block(BigInt(timestamp));
    },

    chainVerify() {
      return wasm.rations_chain_verify();
    },

    chainTipHash() {
      const outPtr = wasm.rations_alloc(32);
      wasm.rations_chain_tip_hash(outPtr);
      const result = readFromWasm(outPtr, 32);
      wasm.rations_free(outPtr, 32);
      return result;
    },

    // === P2P wrappers ===
    p2pConnect(url, remotePk) {
      const urlPtr = writeToWasm(url);
      const pkPtr = writeToWasm(remotePk);
      const connId = wasm.rations_p2p_connect(urlPtr, url.length, pkPtr, remotePk.length);
      wasm.rations_free(urlPtr, url.length);
      wasm.rations_free(pkPtr, remotePk.length);
      return connId;
    },

    p2pBroadcast(msgType, payload) {
      const payloadPtr = writeToWasm(payload);
      const ok = wasm.rations_p2p_broadcast(msgType, payloadPtr, payload.length);
      wasm.rations_free(payloadPtr, payload.length);
      return ok;
    },

    p2pPeerCount() {
      return wasm.rations_p2p_peer_count();
    },

    /** This node's 32-byte peer id (the p2p identity — distinct from the
     *  UI-layer generateKeypair() Ed25519 keypair). */
    p2pPeerId() {
      const outPtr = wasm.rations_alloc(32);
      wasm.rations_p2p_peer_id(outPtr);
      const result = readFromWasm(outPtr, 32);
      wasm.rations_free(outPtr, 32);
      return result;
    },

    p2pSendPing(connId) {
      return wasm.rations_p2p_send_ping(connId);
    },

    p2pRelaySend(targetPk, msgType, payload) {
      const pkPtr = writeToWasm(targetPk);
      const payloadPtr = writeToWasm(payload);
      const ok = wasm.rations_p2p_relay_send(pkPtr, targetPk.length, msgType, payloadPtr, payload.length);
      wasm.rations_free(pkPtr, targetPk.length);
      wasm.rations_free(payloadPtr, payload.length);
      return ok;
    },

    p2pRequestRendezvous(relayConnId, targetPk) {
      const pkPtr = writeToWasm(targetPk);
      const ok = wasm.rations_p2p_rendezvous_request(relayConnId, pkPtr, targetPk.length);
      wasm.rations_free(pkPtr, targetPk.length);
      return ok;
    },

    p2pDiscoverPeers(connId) {
      return wasm.rations_p2p_discover_peers(connId);
    },

    p2pRelayedForwarded() {
      return Number(wasm.rations_p2p_relayed_forwarded());
    },

    p2pRelayedReceived() {
      return Number(wasm.rations_p2p_relayed_received());
    },

    /** Peer table → [{id,conn,state,loc}] — route debugging/ops console. */
    p2pPeersJson() {
      return this._callJson("rations_p2p_peers_json", null, 65536);
    },

    gossipReceived() {
      return Number(wasm.rations_gossip_received());
    },

    // === R17 Phone / Messenger wrappers ===

    /** Call a JSON-emitting export: fn(outPtr, outCap, lenPtr) → parsed JSON or null. */
    _callJson(exportName, args, outSize) {
      const size = outSize || 65536;
      const outPtr = wasm.rations_alloc(size);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm[exportName](...(args || []), outPtr, size, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = JSON.parse(decoder.decode(readFromWasm(outPtr, len)));
      }
      wasm.rations_free(outPtr, size);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Generate a fresh X25519 phone identity → {secretKey, publicKey}. */
    phoneGenIdentity() {
      const skPtr = wasm.rations_alloc(32);
      const pkPtr = wasm.rations_alloc(32);
      wasm.rations_phone_gen_identity(skPtr, pkPtr);
      const result = { secretKey: readFromWasm(skPtr, 32), publicKey: readFromWasm(pkPtr, 32) };
      wasm.rations_free(skPtr, 32);
      wasm.rations_free(pkPtr, 32);
      return result;
    },

    /** Restore a persisted phone secret into the node. */
    phoneSetIdentity(secretKey) {
      const skPtr = writeToWasm(secretKey);
      wasm.rations_phone_set_identity(skPtr);
      wasm.rations_free(skPtr, secretKey.length);
    },

    /** This node's X25519 phone public key. */
    phonePublicKey() {
      const outPtr = wasm.rations_alloc(32);
      wasm.rations_phone_pk(outPtr);
      const result = readFromWasm(outPtr, 32);
      wasm.rations_free(outPtr, 32);
      return result;
    },

    /** Register a contact's phone key (both args are 32B Uint8Array). */
    phoneAddContact(peerId, phonePk) {
      const pidPtr = writeToWasm(peerId);
      const pkPtr = writeToWasm(phonePk);
      wasm.rations_phone_add_contact(pidPtr, pkPtr);
      wasm.rations_free(pidPtr, peerId.length);
      wasm.rations_free(pkPtr, phonePk.length);
    },

    /** Send a direct message. kind: 0=text 1=voice_note 2=file.
     *  Sealed E2E when the recipient's phone key is known. */
    phoneSend(targetPeerId, kind, body) {
      const bytes = typeof body === "string" ? encoder.encode(body) : body;
      const tPtr = writeToWasm(targetPeerId);
      const bPtr = writeToWasm(bytes);
      const ok = wasm.rations_phone_send(tPtr, kind, bPtr, bytes.length);
      wasm.rations_free(tPtr, targetPeerId.length);
      wasm.rations_free(bPtr, bytes.length);
      return ok;
    },

    /** Publish our presence beacon (status: 0=offline 1=online 2=in_call). */
    phonePresencePublish(status, text) {
      const bytes = encoder.encode(text || "");
      const tPtr = writeToWasm(bytes);
      const ok = wasm.rations_phone_presence_publish(status, tPtr, bytes.length);
      wasm.rations_free(tPtr, bytes.length);
      return ok;
    },

    phoneInboxCount() {
      return wasm.rations_phone_inbox_count();
    },

    /** Inbox → [{from,kind,sealed,body_b64,tick}]. */
    phoneInboxJson() {
      return this._callJson("rations_phone_inbox_json", null, 262144);
    },

    /** Presence table → [{peer,status,text,tick}]. */
    phonePresenceJson() {
      return this._callJson("rations_phone_presence_json", null, 65536);
    },

    /** Dial a peer → {callId} on success, null on failure. media: bit0=audio. */
    phoneDial(targetPeerId, media, note) {
      const bytes = encoder.encode(note || "");
      const tPtr = writeToWasm(targetPeerId);
      const nPtr = writeToWasm(bytes);
      const idPtr = wasm.rations_alloc(32);
      const ok = wasm.rations_phone_dial(tPtr, media, nPtr, bytes.length, idPtr);
      let callId = null;
      if (ok) callId = readFromWasm(idPtr, 32);
      wasm.rations_free(tPtr, targetPeerId.length);
      wasm.rations_free(nPtr, bytes.length);
      wasm.rations_free(idPtr, 32);
      return callId;
    },

    phoneAnswer(callId, note) {
      const bytes = encoder.encode(note || "");
      const idPtr = writeToWasm(callId);
      const nPtr = writeToWasm(bytes);
      const ok = wasm.rations_phone_answer(idPtr, nPtr, bytes.length);
      wasm.rations_free(idPtr, callId.length);
      wasm.rations_free(nPtr, bytes.length);
      return ok;
    },

    phoneReject(callId) {
      const idPtr = writeToWasm(callId);
      const ok = wasm.rations_phone_reject(idPtr);
      wasm.rations_free(idPtr, callId.length);
      return ok;
    },

    phoneHangup(callId) {
      const idPtr = writeToWasm(callId);
      const ok = wasm.rations_phone_hangup(idPtr);
      wasm.rations_free(idPtr, callId.length);
      return ok;
    },

    /** Call state: -1 unknown, 0 dialing, 1 ringing, 2 active, 3 ended, 4 rejected. */
    phoneCallState(callId) {
      const idPtr = writeToWasm(callId);
      const s = wasm.rations_phone_call_state(idPtr);
      wasm.rations_free(idPtr, callId.length);
      return s;
    },

    /** Known calls → [{call_id,peer,state,media,inbound}] (hex ids). */
    phoneCallsJson() {
      return this._callJson("rations_phone_calls_json", null, 65536);
    },

    phoneTick(dtMs) {
      wasm.rations_phone_tick(BigInt(dtMs));
    },

    // === R21 messenger: receipts + groups ===

    /** Send a v2 direct message → {msgId} (32B) or null. Receipts tracked
     *  in the WASM outbox — poll phoneOutboxJson for delivered/read.
     *  On NoRoute the id is still returned (outbox shows it undelivered);
     *  callers check Rations.lastError() for routing state. */
    phoneSend2(targetPeerId, kind, body) {
      const bytes = typeof body === "string" ? encoder.encode(body) : body;
      const tPtr = writeToWasm(targetPeerId);
      const bPtr = writeToWasm(bytes);
      const idPtr = wasm.rations_alloc(32);
      wasm.rations_phone_send2(tPtr, kind, bPtr, bytes.length, idPtr);
      const msgId = readFromWasm(idPtr, 32);
      wasm.rations_free(tPtr, targetPeerId.length);
      wasm.rations_free(bPtr, bytes.length);
      wasm.rations_free(idPtr, 32);
      return msgId.some((b) => b !== 0) ? msgId : null;
    },

    /** Send a read receipt for an inbound v2 message (32B id). */
    phoneMarkRead(msgId) {
      const idPtr = writeToWasm(msgId);
      const ok = wasm.rations_phone_mark_read(idPtr);
      wasm.rations_free(idPtr, msgId.length);
      return ok;
    },

    /** Outbox → [{id,to,kind,delivered,read,group?,tick}] (hex ids). */
    phoneOutboxJson() {
      return this._callJson("rations_phone_outbox_json", null, 262144);
    },

    /** Create a group → {groupId} or null. members = array of 32B peer_ids.
     *  The id is returned even when some invites couldn't be routed —
     *  check Rations.lastError() for routing state. */
    phoneGroupCreate(name, members) {
      const nBytes = encoder.encode(name || "group");
      const bin = new Uint8Array(32 * members.length);
      members.forEach((m, i) => bin.set(m, 32 * i));
      const nPtr = writeToWasm(nBytes);
      const mPtr = writeToWasm(bin);
      const gPtr = wasm.rations_alloc(32);
      wasm.rations_phone_group_create(nPtr, nBytes.length, mPtr, bin.length, gPtr);
      const gid = readFromWasm(gPtr, 32);
      wasm.rations_free(nPtr, nBytes.length);
      wasm.rations_free(mPtr, bin.length);
      wasm.rations_free(gPtr, 32);
      return gid.some((b) => b !== 0) ? gid : null;
    },

    /** Send to a group → {msgId} or null (id survives unrouted copies —
     *  per-member state lives in the outbox). */
    phoneGroupSend(groupId, kind, body) {
      const bytes = typeof body === "string" ? encoder.encode(body) : body;
      const gPtr = writeToWasm(groupId);
      const bPtr = writeToWasm(bytes);
      const idPtr = wasm.rations_alloc(32);
      wasm.rations_phone_group_send(gPtr, kind, bPtr, bytes.length, idPtr);
      const msgId = readFromWasm(idPtr, 32);
      wasm.rations_free(gPtr, groupId.length);
      wasm.rations_free(bPtr, bytes.length);
      wasm.rations_free(idPtr, 32);
      return msgId.some((b) => b !== 0) ? msgId : null;
    },

    phoneGroupLeave(groupId) {
      const gPtr = writeToWasm(groupId);
      const ok = wasm.rations_phone_group_leave(gPtr);
      wasm.rations_free(gPtr, groupId.length);
      return ok;
    },

    /** Groups → [{id,name,members:[hex,...]}]. */
    phoneGroupsJson() {
      return this._callJson("rations_phone_groups_json", null, 65536);
    },

    // === Freenet ops + CAS wrappers (R19.1) ===

    /** Store a blob in the local CAS → 32-byte content key, or null. */
    casPut(data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      const dPtr = writeToWasm(bytes);
      const kPtr = wasm.rations_alloc(32);
      const ok = wasm.rations_cas_put(dPtr, bytes.length, kPtr);
      const key = ok ? readFromWasm(kPtr, 32) : null;
      wasm.rations_free(dPtr, bytes.length);
      wasm.rations_free(kPtr, 32);
      return key;
    },

    /** Fetch a CAS blob by 32-byte key → Uint8Array, or null if absent. */
    casGet(key) {
      const kPtr = writeToWasm(key);
      // Two-phase: probe with cap 0 to learn the length, then fetch.
      const len = wasm.rations_cas_get(kPtr, 0, 0);
      let data = null;
      if (len > 0) {
        const oPtr = wasm.rations_alloc(len);
        const got = wasm.rations_cas_get(kPtr, oPtr, len);
        if (got > 0) data = readFromWasm(oPtr, got);
        wasm.rations_free(oPtr, len);
      }
      wasm.rations_free(kPtr, key.length);
      return data;
    },

    /** PUT data under its content key on the network → 32-byte key, or null. */
    opPut(data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      const dPtr = writeToWasm(bytes);
      const kPtr = wasm.rations_alloc(32);
      const ok = wasm.rations_op_put(dPtr, bytes.length, kPtr);
      const key = ok ? readFromWasm(kPtr, 32) : null;
      wasm.rations_free(dPtr, bytes.length);
      wasm.rations_free(kPtr, 32);
      return key;
    },

    /** GET the blob at key (32B) → op id (0 = served locally / failed).
     *  wasm i64 → JS BigInt is two's-complement signed; normalize to u64. */
    opGet(key, subscribe) {
      const kPtr = writeToWasm(key);
      const id = wasm.rations_op_get(kPtr, subscribe ? 1 : 0);
      wasm.rations_free(kPtr, key.length);
      return BigInt.asUintN(64, id);
    },

    /** UPDATE mutable state at key → bool. */
    opUpdate(key, data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      const kPtr = writeToWasm(key);
      const dPtr = writeToWasm(bytes);
      const ok = wasm.rations_op_update(kPtr, dPtr, bytes.length);
      wasm.rations_free(kPtr, key.length);
      wasm.rations_free(dPtr, bytes.length);
      return ok === 1;
    },

    /** SUBSCRIBE to key → op id (unsigned u64 BigInt). */
    opSubscribe(key) {
      const kPtr = writeToWasm(key);
      const id = wasm.rations_op_subscribe(kPtr);
      wasm.rations_free(kPtr, key.length);
      return BigInt.asUintN(64, id);
    },

    /** UNSUBSCRIBE from key → op id (unsigned u64 BigInt). */
    opUnsubscribe(key) {
      const kPtr = writeToWasm(key);
      const id = wasm.rations_op_unsubscribe(kPtr);
      wasm.rations_free(kPtr, key.length);
      return BigInt.asUintN(64, id);
    },

    /** Drain one op delivery → {key, data, found} or null when empty.
     *  Buffer is 4 MiB — deliveries larger than that are truncated to cap
     *  with the true length reported as `fullLen`. */
    opPollDelivery() {
      const CAP = 4 * 1024 * 1024;
      const kPtr = wasm.rations_alloc(32);
      const oPtr = wasm.rations_alloc(CAP);
      const lPtr = wasm.rations_alloc(4);
      const status = wasm.rations_op_poll_delivery(kPtr, oPtr, CAP, lPtr);
      let result = null;
      if (status !== 0) {
        const fullLen = new Uint32Array(memory.buffer, lPtr, 1)[0];
        result = {
          key: readFromWasm(kPtr, 32),
          data: readFromWasm(oPtr, Math.min(fullLen, CAP)),
          fullLen,
          found: status === 1,
        };
      }
      wasm.rations_free(kPtr, 32);
      wasm.rations_free(oPtr, CAP);
      wasm.rations_free(lPtr, 4);
      return result;
    },

    /** Drain one anchor key → 32-byte key, or null. */
    opPollAnchor() {
      const kPtr = wasm.rations_alloc(32);
      const ok = wasm.rations_op_poll_anchor(kPtr);
      const key = ok ? readFromWasm(kPtr, 32) : null;
      wasm.rations_free(kPtr, 32);
      return key;
    },

    // === TurboQuant vector compression (R20.1 f64 sidecar) ===
    // Compress a Float64Array → serialized TQSeed wire blob.
    tqEncode(f64arr, bits) {
      const n = f64arr.length;
      const dataPtr = wasm.rations_alloc(n * 8);
      const cap = Math.max(4096, n * 8);
      const outPtr = wasm.rations_alloc(cap);
      const lenPtr = wasm.rations_alloc(4);
      try {
        // DataView: rations_alloc(u8) has no 8-byte alignment guarantee
        const dv = new DataView(memory.buffer);
        for (let i = 0; i < n; i++) dv.setFloat64(dataPtr + i * 8, f64arr[i], true);
        const r = wasm.rations_tq_encode(dataPtr, n, bits || 4, outPtr, cap, lenPtr);
        if (r !== 1) return null;
        const len = new DataView(memory.buffer).getUint32(lenPtr, true);
        return readFromWasm(outPtr, len);
      } finally {
        wasm.rations_free(dataPtr, n * 8);
        wasm.rations_free(outPtr, cap);
        wasm.rations_free(lenPtr, 4);
      }
    },
    // Decode a serialized TQSeed → Float64Array (lossy reconstruction).
    tqDecode(seedBytes) {
      const sPtr = writeToWasm(seedBytes);
      const cap = Math.max(4096, seedBytes.length * 16);
      const outPtr = wasm.rations_alloc(cap);
      const lenPtr = wasm.rations_alloc(4);
      try {
        const r = wasm.rations_tq_decode(sPtr, seedBytes.length, outPtr, cap, lenPtr);
        if (r !== 1) return null;
        const dv = new DataView(memory.buffer); // post-call: may be regrown
        const len = dv.getUint32(lenPtr, true);
        const out = new Float64Array(len / 8);
        for (let i = 0; i < out.length; i++) out[i] = dv.getFloat64(outPtr + i * 8, true);
        return out;
      } finally {
        wasm.rations_free(sPtr, seedBytes.length);
        wasm.rations_free(outPtr, cap);
        wasm.rations_free(lenPtr, 4);
      }
    },

    // === Invite & QR wrappers ===
    urlCompress(url, alphabet) {
      const urlPtr = writeToWasm(url);
      const alphaPtr = writeToWasm(alphabet);
      const outPtr = wasm.rations_alloc(4096);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_url_compress(urlPtr, url.length, alphaPtr, alphabet.length, outPtr, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(urlPtr, url.length);
      wasm.rations_free(alphaPtr, alphabet.length);
      wasm.rations_free(outPtr, 4096);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    urlDecompress(data, alphabet) {
      const dataPtr = writeToWasm(data);
      const alphaPtr = writeToWasm(alphabet);
      const outPtr = wasm.rations_alloc(4096);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_url_decompress(dataPtr, data.length, alphaPtr, alphabet.length, outPtr, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(alphaPtr, alphabet.length);
      wasm.rations_free(outPtr, 4096);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    qrGenerate(data, eccLevel) {
      const dataPtr = writeToWasm(data);
      const maxMatrixSize = 57 * 57;
      const matrixPtr = wasm.rations_alloc(maxMatrixSize);
      const sizePtr = wasm.rations_alloc(2);
      const version = wasm.rations_qr_generate(dataPtr, data.length, eccLevel, matrixPtr, sizePtr);
      let result = null;
      if (version > 0) {
        const size = new Uint16Array(memory.buffer, sizePtr, 1)[0];
        result = { version, size, matrix: readFromWasm(matrixPtr, size * size) };
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(matrixPtr, maxMatrixSize);
      wasm.rations_free(sizePtr, 2);
      return result;
    },

    // Optimal multi-mode segmentation (R9.3 lean-qr auto). Same return
    // shape as qrGenerate; picks the smallest version for mixed
    // numeric/alnum/byte segments.
    qrGenerateAuto(data, eccLevel) {
      const dataPtr = writeToWasm(data);
      const maxMatrixSize = 57 * 57;
      const matrixPtr = wasm.rations_alloc(maxMatrixSize);
      const sizePtr = wasm.rations_alloc(2);
      const version = wasm.rations_qr_generate_auto(dataPtr, data.length, eccLevel, matrixPtr, sizePtr);
      let result = null;
      if (version > 0) {
        const size = new Uint16Array(memory.buffer, sizePtr, 1)[0];
        result = { version, size, matrix: readFromWasm(matrixPtr, size * size) };
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(matrixPtr, maxMatrixSize);
      wasm.rations_free(sizePtr, 2);
      return result;
    },

    // ===== Paper backup (R5) =====

    // flags: bit0 tar, bit1 compress, bit2 shuffle
    qrBackupPrepare(data, flags, filename, passphrase) {
      const dataPtr = writeToWasm(data);
      const nameBytes = encoder.encode(filename || "backup.bin");
      const namePtr = writeToWasm(nameBytes);
      const passBytes = passphrase ? encoder.encode(passphrase) : new Uint8Array(0);
      const passPtr = passBytes.length ? writeToWasm(passBytes) : 0;
      const outSize = Math.max(data.length * 4 + 4096, 65536);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_qr_backup_prepare(
        dataPtr, data.length, flags, namePtr, nameBytes.length,
        passPtr, passBytes.length, outPtr, outSize, lenPtr
      );
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(namePtr, nameBytes.length);
      if (passBytes.length) wasm.rations_free(passPtr, passBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    qrBackupUnprep(payload, flags, passphrase) {
      const payloadPtr = writeToWasm(payload);
      const passBytes = passphrase ? encoder.encode(passphrase) : new Uint8Array(0);
      const passPtr = passBytes.length ? writeToWasm(passBytes) : 0;
      const outSize = Math.max(payload.length * 4 + 4096, 65536);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_qr_backup_unprep(
        payloadPtr, payload.length, flags, passPtr, passBytes.length,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(payloadPtr, payload.length);
      if (passBytes.length) wasm.rations_free(passPtr, passBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // PaperTune "PT" payloads → EC01 request blob for encodec-worker.js.
    // payloads: array of Uint8Array (decoded QR contents, any order).
    // Returns the EC01 request (Uint8Array) to post to the worker, or null.
    encodecPrepare(payloads, dataShards, parityShards) {
      let total = 2;
      for (const p of payloads) total += 2 + p.length;
      const packed = new Uint8Array(total);
      const view = new DataView(packed.buffer);
      view.setUint16(0, payloads.length, true);
      let off = 2;
      for (const p of payloads) {
        view.setUint16(off, p.length, true);
        packed.set(p, off + 2);
        off += 2 + p.length;
      }
      const packedPtr = writeToWasm(packed);
      const outSize = total * 4 + 1024;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_encodec_prepare(
        packedPtr, packed.length, dataShards, parityShards,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(packedPtr, packed.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // Returns [{index, parity, data}] after RS erasure coding.
    qrBackupChunks(payload, dataShards, parityShards) {
      const payloadPtr = writeToWasm(payload);
      const outSize = Math.max(payload.length * 3 + 4096, 65536);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_qr_backup_chunks(
        payloadPtr, payload.length, dataShards, parityShards,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        const pk = readFromWasm(outPtr, len);
        const count = pk[0] | (pk[1] << 8);
        result = [];
        let off = 2;
        for (let i = 0; i < count; i++) {
          const l = pk[off] | (pk[off + 1] << 8);
          off += 2;
          const index = pk[off];
          const parity = pk[off + 1] !== 0;
          off += 2;
          result.push({ index, parity, data: pk.slice(off, off + l - 2) });
          off += l - 2;
        }
      }
      wasm.rations_free(payloadPtr, payload.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    qrBackupPdf(data, opts) {
      const o = opts || {};
      const dataPtr = writeToWasm(data);
      const nameBytes = encoder.encode(o.filename || "backup.bin");
      const namePtr = writeToWasm(nameBytes);
      const passBytes = o.passphrase ? encoder.encode(o.passphrase) : new Uint8Array(0);
      const passPtr = passBytes.length ? writeToWasm(passBytes) : 0;
      const outSize = Math.max(data.length * 8 + 65536, 1 << 20);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_qr_backup_pdf(
        dataPtr, data.length, o.flags || 0,
        o.dataShards || 4, o.parityShards || 2,
        o.numCopies || 1, o.qrVersion || 10, o.ecLevel == null ? 1 : o.ecLevel,
        namePtr, nameBytes.length, passPtr, passBytes.length,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(namePtr, nameBytes.length);
      if (passBytes.length) wasm.rations_free(passPtr, passBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // Paperback v0 backup → {doc, shards:[{enc, keyText}]}
    pbBackup(secret, quorumSize, shardCount, sealed) {
      const secPtr = writeToWasm(secret);
      const outSize = Math.max(secret.length * 16 + 65536, 1 << 20);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_pb_backup(
        secPtr, secret.length, quorumSize, shardCount, sealed ? 1 : 0,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        const pk = readFromWasm(outPtr, len);
        const count = pk[0] | (pk[1] << 8);
        const items = [];
        let off = 2;
        for (let i = 0; i < count; i++) {
          const l = pk[off] | (pk[off + 1] << 8);
          off += 2;
          items.push(pk.slice(off, off + l));
          off += l;
        }
        result = { doc: items[0], shards: [] };
        for (let i = 1; i + 1 < items.length; i += 2) {
          result.shards.push({ enc: items[i], keyText: decoder.decode(items[i + 1]) });
        }
      }
      wasm.rations_free(secPtr, secret.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // Paperback v0 recovery. doc = doc wire; shards = [{enc, key(raw Uint8Array 32B)}]
    pbRecover(doc, shards) {
      const items = [doc];
      for (const s of shards) items.push(s.enc);
      for (const s of shards) items.push(s.key);
      let total = 2;
      for (const it of items) total += 2 + it.length;
      const pk = new Uint8Array(total);
      pk[0] = shards.length & 0xff;
      pk[1] = (shards.length >> 8) & 0xff;
      let off = 2;
      for (const it of items) {
        pk[off] = it.length & 0xff;
        pk[off + 1] = (it.length >> 8) & 0xff;
        off += 2;
        pk.set(it, off);
        off += it.length;
      }
      const pkPtr = writeToWasm(pk);
      const outSize = 1 << 20;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const r = wasm.rations_pb_recover(pkPtr, pk.length, outPtr, outSize, lenPtr);
      let result = null;
      if (r === 1) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(pkPtr, pk.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    inviteCreate(networkId, endpoint, seed, role, expiry) {
      const netIdPtr = writeToWasm(networkId);
      const epPtr = writeToWasm(endpoint);
      const seedPtr = writeToWasm(seed);
      const outPtr = wasm.rations_alloc(512);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_invite_create(
        netIdPtr, epPtr, endpoint.length, seedPtr, seed.length, role, BigInt(expiry), outPtr, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(netIdPtr, networkId.length);
      wasm.rations_free(epPtr, endpoint.length);
      wasm.rations_free(seedPtr, seed.length);
      wasm.rations_free(outPtr, 512);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    inviteVerify(tokenData) {
      const dataPtr = writeToWasm(tokenData);
      const ok = wasm.rations_invite_verify(dataPtr, tokenData.length);
      wasm.rations_free(dataPtr, tokenData.length);
      return ok;
    },

    base64Encode(data) {
      const dataPtr = writeToWasm(data);
      const outPtr = wasm.rations_alloc(8192);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_base64_encode(dataPtr, data.length, outPtr, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, 8192);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    base64Decode(data) {
      const dataPtr = writeToWasm(data);
      const outPtr = wasm.rations_alloc(8192);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_base64_decode(dataPtr, data.length, outPtr, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, 8192);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // ===== Media / Polyglot =====

    detectFormat(data) {
      const dataPtr = writeToWasm(data);
      const outPtr = wasm.rations_alloc(32);
      const ok = wasm.rations_detect_format(dataPtr, data.length, outPtr, 32);
      let result = "unknown";
      if (ok) {
        // WASM writes name + single NUL; the rest of the buffer is stale
        // heap bytes which may contain \r/\n — `.*$` can't span those,
        // so split at the first NUL instead of a regex strip.
        result = decoder.decode(new Uint8Array(memory.buffer, outPtr, 32)).split("\0")[0];
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, 32);
      return result;
    },

    pngToBmp(data) {
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(data.length * 4, 65536);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_png_to_bmp(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    bmpToPng(data) {
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(data.length * 4, 65536);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_bmp_to_png(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    wavToRaw(data) {
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(data.length, 65536);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_wav_to_raw(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    rawToWav(data) {
      const dataPtr = writeToWasm(data);
      const outSize = data.length + 44;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_raw_to_wav(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    zipList(data) {
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(data.length * 2, 4096);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_zip_list(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    zipCreate(filename, content) {
      const nameBytes = encoder.encode(filename);
      const contentBytes = encoder.encode(content);
      const namePtr = writeToWasm(nameBytes);
      const contentPtr = writeToWasm(contentBytes);
      const outSize = contentBytes.length + nameBytes.length + 128;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_zip_create(namePtr, nameBytes.length, contentPtr, contentBytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(namePtr, nameBytes.length);
      wasm.rations_free(contentPtr, contentBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    mp4Info(data) {
      const dataPtr = writeToWasm(data);
      const outSize = 4096;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_mp4_info(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    generatePolyglot(pngData, mp4Data, options) {
      // options: string html (legacy) or { html, pdf, zips }
      const opts = typeof options === 'string' || options == null ? { html: options } : options;
      const pngPtr = writeToWasm(pngData);
      const mp4Ptr = writeToWasm(mp4Data);
      let htmlPtr = 0;
      let htmlLen = 0;
      let htmlBytes = null;
      if (opts.html) {
        htmlBytes = encoder.encode(opts.html);
        htmlPtr = writeToWasm(htmlBytes);
        htmlLen = htmlBytes.length;
      }
      let pdfPtr = 0;
      let pdfLen = 0;
      if (opts.pdf) {
        pdfPtr = writeToWasm(opts.pdf);
        pdfLen = opts.pdf.length;
      }
      // Pack zips as repeated [u32 LE len][bytes] entries
      let zipsPtr = 0;
      let zipsLen = 0;
      let zipsBlob = null;
      if (opts.zips && opts.zips.length > 0) {
        const parts = opts.zips.slice(0, 8);
        const total = parts.reduce((s, z) => s + 4 + z.length, 0);
        zipsBlob = new Uint8Array(total);
        const view = new DataView(zipsBlob.buffer);
        let p = 0;
        for (const z of parts) {
          view.setUint32(p, z.length, true);
          zipsBlob.set(z, p + 4);
          p += 4 + z.length;
        }
        zipsPtr = writeToWasm(zipsBlob);
        zipsLen = zipsBlob.length;
      }
      const carriersLen = (htmlBytes ? htmlBytes.length : 0) + pdfLen + (zipsBlob ? zipsBlob.length : 0);
      const outSize = pngData.length + mp4Data.length + carriersLen + 4096;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_polyglot_generate(pngPtr, pngData.length, mp4Ptr, mp4Data.length, htmlPtr, htmlLen, pdfPtr, pdfLen, zipsPtr, zipsLen, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(pngPtr, pngData.length);
      wasm.rations_free(mp4Ptr, mp4Data.length);
      if (htmlBytes) wasm.rations_free(htmlPtr, htmlBytes.length);
      if (pdfPtr) wasm.rations_free(pdfPtr, pdfLen);
      if (zipsBlob) wasm.rations_free(zipsPtr, zipsBlob.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    isPolyglot(data) {
      const dataPtr = writeToWasm(data);
      const result = wasm.rations_is_polyglot(dataPtr, data.length);
      wasm.rations_free(dataPtr, data.length);
      return result;
    },

    detectCarriers(data) {
      const dataPtr = writeToWasm(data);
      const mask = wasm.rations_detect_carriers(dataPtr, data.length);
      wasm.rations_free(dataPtr, data.length);
      return {
        mp4: (mask & 1) !== 0,
        png: (mask & 2) !== 0,
        html: (mask & 4) !== 0,
        pdf: (mask & 8) !== 0,
        zip: (mask & 16) !== 0,
        ico: (mask & 32) !== 0,
      };
    },

    findConversionPath(sourceName, targetName) {
      const srcBytes = encoder.encode(sourceName);
      const tgtBytes = encoder.encode(targetName);
      const srcPtr = writeToWasm(srcBytes);
      const tgtPtr = writeToWasm(tgtBytes);
      const outSize = 4096;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_find_conversion_path(srcPtr, srcBytes.length, tgtPtr, tgtBytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(srcPtr, srcBytes.length);
      wasm.rations_free(tgtPtr, tgtBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /**
     * R15.9 error surface: {code, name} of the most recent failing
     * export — read only after a wrapper returned null/false. Codes:
     * 1 invalid_input, 2 truncated, 3 unsupported, 4 too_large,
     * 5 not_found, 6 bad_format, 7 out_of_memory, 8 internal.
     */
    lastError() {
      if (!wasm.rations_last_error) return { code: 0, name: "ok" };
      const code = wasm.rations_last_error();
      if (!code) return { code: 0, name: "ok" };
      const ptr = wasm.rations_alloc(256);
      const n = wasm.rations_last_error_msg(ptr, 256);
      const name = decoder.decode(readFromWasm(ptr, n));
      wasm.rations_free(ptr, 256);
      return { code, name };
    },

    convert(sourceName, targetName, data, outCapacity) {
      const srcBytes = encoder.encode(sourceName);
      const tgtBytes = encoder.encode(targetName);
      const srcPtr = writeToWasm(srcBytes);
      const tgtPtr = writeToWasm(tgtBytes);
      const dataPtr = writeToWasm(data);
      const outSize = outCapacity || Math.max(65536, data.length * 4);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_convert(srcPtr, srcBytes.length, tgtPtr, tgtBytes.length, dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(srcPtr, srcBytes.length);
      wasm.rations_free(tgtPtr, tgtBytes.length);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** ZipApp runtime manifest: {format, runtime, executable, entry, name, version, safe, files}. */
    zipappManifest(formatName, data) {
      const fmtBytes = encoder.encode(formatName);
      const fmtPtr = writeToWasm(fmtBytes);
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(65536, data.length);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_zipapp_manifest(fmtPtr, fmtBytes.length, dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = JSON.parse(decoder.decode(readFromWasm(outPtr, len)));
      }
      wasm.rations_free(fmtPtr, fmtBytes.length);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Extract one named entry from a ZIP archive (decompressed bytes). */
    zipExtract(data, name) {
      const nameBytes = encoder.encode(name);
      const namePtr = writeToWasm(nameBytes);
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(65536, data.length * 8);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_zip_extract(dataPtr, data.length, namePtr, nameBytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(namePtr, nameBytes.length);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Extract a ZIM article by (ns char, url) — raw payload bytes or null. */
    zimArticle(data, ns, url) {
      const urlBytes = encoder.encode(url);
      const urlPtr = writeToWasm(urlBytes);
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(65536, data.length * 4);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_zim_article(ns.charCodeAt(0), urlPtr, urlBytes.length, dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(urlPtr, urlBytes.length);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Extract a PMTiles tile by (z, x, y) — raw tile bytes or null. */
    pmtilesTile(data, z, x, y) {
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(65536, data.length);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_pmtiles_tile(z, x, y, dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** PMTiles metadata JSON (decompressed) or null. */
    pmtilesMetadata(data) {
      const dataPtr = writeToWasm(data);
      const outSize = Math.max(65536, 1024 * 1024);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_pmtiles_metadata(dataPtr, data.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // ============================================================
    // Device protocols (R13) — vphone-control v1 wire codec
    // ============================================================

    /** Frame a JSON message → Uint8Array [u32be len][json]. */
    vphoneFrame(jsonStr) {
      const bytes = encoder.encode(jsonStr);
      const inPtr = writeToWasm(bytes);
      const outSize = bytes.length + 16;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_vphone_frame(inPtr, bytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(inPtr, bytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Validate + unwrap a frame → JSON string. */
    vphoneParse(frameBytes) {
      const inPtr = writeToWasm(frameBytes);
      const outSize = Math.max(4096, frameBytes.length);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_vphone_parse(inPtr, frameBytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(inPtr, frameBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Build a command frame: (name, paramsObj) → framed bytes. */
    vphoneCommand(name, paramsObj) {
      const nameBytes = encoder.encode(name);
      const params = paramsObj ? encoder.encode(JSON.stringify(paramsObj)) : new Uint8Array(0);
      const namePtr = writeToWasm(nameBytes);
      const paramsPtr = params.length ? writeToWasm(params) : wasm.rations_alloc(1);
      const outSize = 65536;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_vphone_command(namePtr, nameBytes.length, paramsPtr, params.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(namePtr, nameBytes.length);
      wasm.rations_free(paramsPtr, Math.max(1, params.length));
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Command catalog + protocol constants (parsed JSON). */
    vphoneCatalog() {
      const outSize = 65536;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_vphone_catalog(outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = JSON.parse(decoder.decode(readFromWasm(outPtr, len)));
      }
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** VM manifest JSON (0 args → donor defaults). */
    vphoneManifest(cpuCount, memoryMib) {
      const outSize = 8192;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_vphone_manifest(cpuCount | 0, memoryMib | 0, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = JSON.parse(decoder.decode(readFromWasm(outPtr, len)));
      }
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** config.plist XML for `vphone-cli boot --config`. */
    vphonePlist(cpuCount, memoryMib) {
      const outSize = 8192;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_vphone_plist(cpuCount | 0, memoryMib | 0, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // ============================================================
    // Collapse & restoration (R16) — qr_nest, portals, radio
    // ============================================================

    /** Helper: call an export returning a packed multi-blob → Uint8Array[] . */
    _callPackedBlobs(fnName, args, inBytes) {
      const dataPtr = writeToWasm(inBytes);
      const outSize = Math.max(262144, inBytes.length * 4);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm[fnName](dataPtr, inBytes.length, ...(args === null || args === undefined ? [] : [args]), outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        const buf = new Uint8Array(memory.buffer, outPtr, len);
        const dv = new DataView(memory.buffer, outPtr, len);
        const count = dv.getUint32(0, true);
        result = [];
        let pos = 4;
        for (let i = 0; i < count; i++) {
          const blen = dv.getUint32(pos, true);
          pos += 4;
          result.push(new Uint8Array(buf.slice(pos, pos + blen)));
          pos += blen;
        }
      }
      wasm.rations_free(dataPtr, inBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Helper: pack Uint8Array[] into the multi-blob wire format. */
    _packBlobs(blobs) {
      let total = 4;
      blobs.forEach((b) => (total += 4 + b.length));
      const out = new Uint8Array(total);
      const dv = new DataView(out.buffer);
      dv.setUint32(0, blobs.length, true);
      let pos = 4;
      for (const b of blobs) {
        dv.setUint32(pos, b.length, true);
        pos += 4;
        out.set(b, pos);
        pos += b.length;
      }
      return out;
    },

    /** qr_nest encode: bytes → array of QRNS packet byte-arrays (null on error). */
    qrnestEncode(data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      return this._callPackedBlobs("rations_qrnest_encode", null, bytes);
    },

    /** qr_nest decode: array of packet byte-arrays → original bytes (null on error). */
    qrnestDecode(packets) {
      const packed = this._packBlobs(packets);
      const dataPtr = writeToWasm(packed);
      const outSize = Math.max(262144, packed.length * 4);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_qrnest_decode(dataPtr, packed.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, packed.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Collapse plan JSON: mediaMask bit i → PhysicalMedium i (0=paper…5=isg_video). */
    collapsePlan(payloadLen, mediaMask) {
      const outSize = 8192;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_collapse_plan(payloadLen >>> 0, mediaMask >>> 0, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = JSON.parse(decoder.decode(readFromWasm(outPtr, len)));
      }
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Atomize payload → array of RPOR portal wire buffers.
     *  `parity` extra RS portals tolerate that many losses at restore. */
    collapsePortals(data, parity) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      return this._callPackedBlobs("rations_collapse_portals", parity || 0, bytes);
    },

    /** Restore from RPOR portal buffers → {report, payload} or null. */
    collapseRestore(portalBufs) {
      const packed = this._packBlobs(portalBufs);
      const dataPtr = writeToWasm(packed);
      const outSize = Math.max(262144, packed.length * 4);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_collapse_restore(dataPtr, packed.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        const dv = new DataView(memory.buffer, outPtr, len);
        const jlen = dv.getUint32(0, true);
        const report = JSON.parse(decoder.decode(new Uint8Array(memory.buffer, outPtr + 4, jlen)));
        const payload = new Uint8Array(memory.buffer.slice(outPtr + 4 + jlen, outPtr + len));
        result = { report, payload };
      }
      wasm.rations_free(dataPtr, packed.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Render RPOR portal buffers as a printable QR-sheet PDF. */
    collapsePdf(portalBufs) {
      const packed = this._packBlobs(portalBufs);
      const dataPtr = writeToWasm(packed);
      const outSize = Math.max(262144, portalBufs.length * 32768);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_collapse_pdf(dataPtr, packed.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, packed.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** Restore a qr-backup payload from decoded QR shard payloads (RB format)
     *  → reconstructed payload bytes (feed to qrBackupUnprep for the file). */
    qrBackupRestorePayload(payloads) {
      let total = 2;
      for (const p of payloads) total += 2 + p.length;
      const packed = new Uint8Array(total);
      const dv = new DataView(packed.buffer);
      dv.setUint16(0, payloads.length, true);
      let off = 2;
      for (const p of payloads) {
        dv.setUint16(off, p.length, true);
        packed.set(p, off + 2);
        off += 2 + p.length;
      }
      const dataPtr = writeToWasm(packed);
      const outSize = Math.max(262144, packed.length * 2);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_restore_payloads(dataPtr, packed.length, 0, 0, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, packed.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** LoRa packet encode → wire bytes (null on error). */
    loraEncode(sender, receiver, msgId, flags, sf, payload) {
      const bytes = typeof payload === "string" ? encoder.encode(payload) : payload;
      const pPtr = writeToWasm(bytes);
      const outSize = 512;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_lora_encode(sender >>> 0, receiver >>> 0, msgId >>> 0, flags | 0, sf | 0, pPtr, bytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(pPtr, bytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** LoRa packet decode → JSON fields or null. */
    loraDecode(frame) {
      const dataPtr = writeToWasm(frame);
      const outSize = Math.max(4096, frame.length * 2 + 512);
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_lora_decode(dataPtr, frame.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = JSON.parse(decoder.decode(readFromWasm(outPtr, len)));
      }
      wasm.rations_free(dataPtr, frame.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** WiFi CSI frame encode → wire bytes. */
    csiEncode(data) {
      const bytes = typeof data === "string" ? encoder.encode(data) : data;
      const dataPtr = writeToWasm(bytes);
      const outSize = bytes.length + 64;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_csi_encode(dataPtr, bytes.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, bytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    /** WiFi CSI frame decode → payload bytes or null. */
    csiDecode(frame) {
      const dataPtr = writeToWasm(frame);
      const outSize = frame.length + 64;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_csi_decode(dataPtr, frame.length, outPtr, outSize, lenPtr);
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(dataPtr, frame.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // ============================================================
    // Agent layer (R7) — tokenizer, models, skills
    // ============================================================

    /** Load production tokenizer from JS buffers (vocab.json + merges.txt). */
    tokenizerInit(vocabJson, mergesTxt) {
      const vPtr = writeToWasm(vocabJson);
      const mPtr = writeToWasm(mergesTxt);
      const n = wasm.rations_tokenizer_init(vPtr, vocabJson.length, mPtr, mergesTxt.length);
      wasm.rations_free(vPtr, vocabJson.length);
      wasm.rations_free(mPtr, mergesTxt.length);
      return n;
    },

    /** Encode text -> Uint32Array of token ids (byte-level fallback if uninitialized). */
    tokenize(text) {
      const bytes = typeof text === "string" ? encoder.encode(text) : text;
      const dataPtr = writeToWasm(bytes);
      const outPtr = wasm.rations_alloc(bytes.length * 4 + 64);
      const n = wasm.rations_tokenize(dataPtr, bytes.length, outPtr, bytes.length * 4 + 64);
      let result = null;
      if (n > 0) {
        result = new Uint32Array(n);
        result.set(new Uint32Array(memory.buffer, outPtr, n));
      }
      wasm.rations_free(dataPtr, bytes.length);
      wasm.rations_free(outPtr, bytes.length * 4 + 64);
      return result;
    },

    /** Decode Uint32Array ids -> string. */
    detokenize(ids) {
      const bytes = new Uint8Array(ids.buffer.slice(0));
      const dataPtr = writeToWasm(bytes);
      const outPtr = wasm.rations_alloc(65536);
      const n = wasm.rations_detokenize(dataPtr, bytes.length, outPtr, 65536);
      let result = null;
      if (n > 0) result = decoder.decode(readFromWasm(outPtr, n));
      wasm.rations_free(dataPtr, bytes.length);
      wasm.rations_free(outPtr, 65536);
      return result;
    },

    /** Registered LLM models as parsed JSON array. */
    modelsList() {
      const outPtr = wasm.rations_alloc(65536);
      const n = wasm.rations_models_list(outPtr, 65536);
      let result = null;
      if (n > 0) {
        try { result = JSON.parse(decoder.decode(readFromWasm(outPtr, n))); } catch (_) { result = null; }
      }
      wasm.rations_free(outPtr, 65536);
      return result;
    },

    /** Render messages array through the model's chat template -> string. */
    chatTemplate(modelId, messages) {
      const mid = encoder.encode(modelId);
      const msgs = encoder.encode(JSON.stringify(messages));
      const midPtr = writeToWasm(mid);
      const msgsPtr = writeToWasm(msgs);
      const outPtr = wasm.rations_alloc(262144);
      const n = wasm.rations_chat_template(midPtr, mid.length, msgsPtr, msgs.length, outPtr, 262144);
      let result = null;
      if (n > 0) result = decoder.decode(readFromWasm(outPtr, n));
      wasm.rations_free(midPtr, mid.length);
      wasm.rations_free(msgsPtr, msgs.length);
      wasm.rations_free(outPtr, 262144);
      return result;
    },

    /** Registered agent skills as parsed JSON array. */
    skillsList() {
      const outPtr = wasm.rations_alloc(65536);
      const n = wasm.rations_skills_list(outPtr, 65536);
      let result = null;
      if (n > 0) {
        try { result = JSON.parse(decoder.decode(readFromWasm(outPtr, n))); } catch (_) { result = null; }
      }
      wasm.rations_free(outPtr, 65536);
      return result;
    },

    /** Dispatch a skill: name + args object -> parsed JSON result. */
    skillCall(name, args) {
      const nb = encoder.encode(name);
      const ab = encoder.encode(JSON.stringify(args || {}));
      const namePtr = writeToWasm(nb);
      const argsPtr = writeToWasm(ab);
      const outPtr = wasm.rations_alloc(4 * 1024 * 1024);
      const n = wasm.rations_skill_call(namePtr, nb.length, argsPtr, ab.length, outPtr, 4 * 1024 * 1024);
      let result = null;
      if (n > 0) {
        try { result = JSON.parse(decoder.decode(readFromWasm(outPtr, n))); } catch (_) { result = null; }
      }
      wasm.rations_free(namePtr, nb.length);
      wasm.rations_free(argsPtr, ab.length);
      wasm.rations_free(outPtr, 4 * 1024 * 1024);
      return result;
    },

    // ============================================================
    // WebGPU chain runner (R8) — job packing + GPU digest verify
    // ============================================================

    /**
     * Pack messages -> WGJ1 job table for the WGSL batch shader.
     * @param {Uint8Array[]} msgs
     * @returns {Uint8Array|null}
     */
    wgpuPackSha256(msgs) {
      // frame: [u32 count][u32 len][msg]... LE
      let total = 4;
      for (const m of msgs) total += 4 + m.length;
      const frame = new Uint8Array(total);
      const dv = new DataView(frame.buffer);
      dv.setUint32(0, msgs.length, true);
      let off = 4;
      for (const m of msgs) {
        dv.setUint32(off, m.length, true);
        off += 4;
        frame.set(m, off);
        off += m.length;
      }
      const inPtr = writeToWasm(frame);
      const outCap = total + 4 + 4 * msgs.length + 64 * msgs.length;
      const outPtr = wasm.rations_alloc(outCap);
      const n = wasm.rations_wgpu_pack_sha256(inPtr, frame.length, outPtr, outCap);
      let result = null;
      if (n > 0) result = readFromWasm(outPtr, n);
      wasm.rations_free(inPtr, frame.length);
      wasm.rations_free(outPtr, outCap);
      return result;
    },

    /** Verify a GPU-produced digest against CPU sha256. */
    wgpuVerifySha256(data, digest) {
      if (digest.length !== 32) return false;
      const dataPtr = writeToWasm(data);
      const digPtr = writeToWasm(digest);
      const ok = wasm.rations_wgpu_verify_sha256(dataPtr, data.length, digPtr);
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(digPtr, 32);
      return ok;
    },

    // ============================================================
    // Steganography
    // ============================================================

    stegaEmbed(imageData, payloadData, password, filename) {
      const imgPtr = writeToWasm(imageData);
      const dataPtr = writeToWasm(payloadData);
      const pwBytes = encoder.encode(password);
      const fnBytes = encoder.encode(filename);
      const pwPtr = writeToWasm(pwBytes);
      const fnPtr = writeToWasm(fnBytes);
      // Parse PNG IHDR to get dimensions for output buffer calculation
      // IHDR starts at byte 8 (after signature), width at bytes 16-19, height at 20-23
      let outSize = imageData.length * 4 + 65536; // fallback
      if (imageData.length >= 24 && imageData[0] === 0x89 && imageData[1] === 0x50) {
        const view = new DataView(imageData.buffer, imageData.byteOffset, imageData.byteLength);
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        // Worst case: raw RGB pixels + filter bytes + PNG overhead + zlib overhead
        outSize = width * height * 3 + height + 1024 + 65536;
      }
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_stega_embed(
        imgPtr, imageData.length,
        dataPtr, payloadData.length,
        pwPtr, pwBytes.length,
        fnPtr, fnBytes.length,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(imgPtr, imageData.length);
      wasm.rations_free(dataPtr, payloadData.length);
      wasm.rations_free(pwPtr, pwBytes.length);
      wasm.rations_free(fnPtr, fnBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    stegaExtract(imageData, password) {
      const imgPtr = writeToWasm(imageData);
      const pwBytes = encoder.encode(password);
      const pwPtr = writeToWasm(pwBytes);
      const dataOutSize = imageData.length * 2 + 65536;
      const dataOutPtr = wasm.rations_alloc(dataOutSize);
      const dataLenPtr = wasm.rations_alloc(4);
      const fnOutSize = 512;
      const fnOutPtr = wasm.rations_alloc(fnOutSize);
      const fnLenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_stega_extract(
        imgPtr, imageData.length,
        pwPtr, pwBytes.length,
        dataOutPtr, dataOutSize, dataLenPtr,
        fnOutPtr, fnOutSize, fnLenPtr
      );
      let result = null;
      if (ok) {
        const dataLen = new Uint32Array(memory.buffer, dataLenPtr, 1)[0];
        const fnLen = new Uint32Array(memory.buffer, fnLenPtr, 1)[0];
        result = {
          data: readFromWasm(dataOutPtr, dataLen),
          filename: decoder.decode(readFromWasm(fnOutPtr, fnLen)),
        };
      }
      wasm.rations_free(imgPtr, imageData.length);
      wasm.rations_free(pwPtr, pwBytes.length);
      wasm.rations_free(dataOutPtr, dataOutSize);
      wasm.rations_free(dataLenPtr, 4);
      wasm.rations_free(fnOutPtr, fnOutSize);
      wasm.rations_free(fnLenPtr, 4);
      return result;
    },

    stegaCapacity(imageData, bitDepth) {
      const imgPtr = writeToWasm(imageData);
      const result = wasm.rations_stega_capacity(imgPtr, imageData.length, bitDepth);
      wasm.rations_free(imgPtr, imageData.length);
      return result;
    },

    // Configurable embed (R9.1): bitDepth 0 = auto; channelMask
    // bit0=R bit1=G bit2=B (0b111 default keeps the classic wire format).
    stegaEmbedCfg(imageData, payloadData, password, filename, bitDepth, channelMask) {
      const imgPtr = writeToWasm(imageData);
      const dataPtr = writeToWasm(payloadData);
      const pwBytes = encoder.encode(password);
      const fnBytes = encoder.encode(filename);
      const pwPtr = writeToWasm(pwBytes);
      const fnPtr = writeToWasm(fnBytes);
      let outSize = imageData.length * 4 + 65536;
      if (imageData.length >= 24 && imageData[0] === 0x89 && imageData[1] === 0x50) {
        const view = new DataView(imageData.buffer, imageData.byteOffset, imageData.byteLength);
        const width = view.getUint32(16);
        const height = view.getUint32(20);
        outSize = width * height * 3 + height + 1024 + 65536;
      }
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_stega_embed_cfg(
        imgPtr, imageData.length,
        dataPtr, payloadData.length,
        pwPtr, pwBytes.length,
        fnPtr, fnBytes.length,
        bitDepth, channelMask,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(imgPtr, imageData.length);
      wasm.rations_free(dataPtr, payloadData.length);
      wasm.rations_free(pwPtr, pwBytes.length);
      wasm.rations_free(fnPtr, fnBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // PNG tEXt aux channel (R9.1).
    stegaPngTextWrite(png, keyword, text) {
      const pngPtr = writeToWasm(png);
      const kwBytes = encoder.encode(keyword);
      const txBytes = encoder.encode(text);
      const kwPtr = writeToWasm(kwBytes);
      const txPtr = writeToWasm(txBytes);
      const outSize = png.length + txBytes.length + 1024;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_stega_png_text_write(
        pngPtr, png.length, kwPtr, kwBytes.length,
        txPtr, txBytes.length, outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(pngPtr, png.length);
      wasm.rations_free(kwPtr, kwBytes.length);
      wasm.rations_free(txPtr, txBytes.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // Returns decoded text string, or null when the keyword is absent.
    stegaPngTextRead(png, keyword) {
      const pngPtr = writeToWasm(png);
      const kwBytes = encoder.encode(keyword);
      const kwPtr = writeToWasm(kwBytes);
      const outSize = 65536;
      const outPtr = wasm.rations_alloc(outSize);
      const n = wasm.rations_stega_png_text_read(
        pngPtr, png.length, kwPtr, kwBytes.length, outPtr, outSize
      );
      let result = null;
      if (n > 0) result = decoder.decode(readFromWasm(outPtr, n));
      wasm.rations_free(pngPtr, png.length);
      wasm.rations_free(kwPtr, kwBytes.length);
      wasm.rations_free(outPtr, outSize);
      return result;
    },

    // ============================================================
    // Video Storage
    // ============================================================

    videoEncode(data, width, height) {
      const dataPtr = writeToWasm(data);
      const frameSize = width * height * 3;
      const maxFrames = Math.ceil((data.length * 8 + 64) / (frameSize)) + 1;
      const outSize = maxFrames * frameSize;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const frameCountPtr = wasm.rations_alloc(4);
      const origSizePtr = wasm.rations_alloc(8);
      const ok = wasm.rations_video_encode(
        dataPtr, data.length,
        width, height,
        outPtr, outSize, lenPtr,
        frameCountPtr, origSizePtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        const frameCount = new Uint32Array(memory.buffer, frameCountPtr, 1)[0];
        const origSize = new BigUint64Array(memory.buffer, origSizePtr, 1)[0];
        result = {
          pixels: readFromWasm(outPtr, len),
          frameCount: frameCount,
          originalSize: Number(origSize),
          width: width,
          height: height,
        };
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      wasm.rations_free(frameCountPtr, 4);
      wasm.rations_free(origSizePtr, 8);
      return result;
    },

    videoDecode(framePixels, width, height, frameCount) {
      const pixelsPtr = writeToWasm(framePixels);
      const outSize = framePixels.length;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_video_decode(
        pixelsPtr, framePixels.length,
        width, height, frameCount,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(pixelsPtr, framePixels.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    // ISG1 cell-video storage (R9.2). mode: 1=bw, 2=gray4, 4=gray16.
    isgEncode(data, width, height, cellSize, mode, rsData, rsParity) {
      const dataPtr = writeToWasm(data);
      const frameSize = width * height * 3;
      const maxFrames = Math.ceil(data.length / 256) + 2;
      const outSize = maxFrames * frameSize;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const fcPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_isg_encode(
        dataPtr, data.length, width, height, cellSize, mode,
        rsData, rsParity, outPtr, outSize, lenPtr, fcPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = {
          pixels: readFromWasm(outPtr, len),
          frameCount: new Uint32Array(memory.buffer, fcPtr, 1)[0],
          width, height,
        };
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      wasm.rations_free(fcPtr, 4);
      return result;
    },

    // Returns {data, report:{framesFailed, rsRepairs, framesExpected,
    // truncated}} — data is the longest decodable prefix.
    isgDecode(framePixels, width, height, frameCount, cellSize, mode, rsData, rsParity) {
      const pixelsPtr = writeToWasm(framePixels);
      const outSize = framePixels.length;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const repPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_isg_decode(
        pixelsPtr, framePixels.length, width, height, frameCount,
        cellSize, mode, rsData, rsParity, outPtr, outSize, lenPtr, repPtr
      );
      const rep = new Uint32Array(memory.buffer, repPtr, 1)[0];
      const report = {
        framesFailed: rep & 0xff,
        rsRepairs: (rep >> 8) & 0xff,
        framesExpected: (rep >> 16) & 0xff,
        truncated: ((rep >> 24) & 1) === 1,
      };
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = { data: readFromWasm(outPtr, len), report };
      }
      wasm.rations_free(pixelsPtr, framePixels.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      wasm.rations_free(repPtr, 4);
      return result;
    },

    simhashFingerprint: function (text) {
      const bytes = encoder.encode(text);
      const ptr = writeToWasm(bytes);
      const outPtr = wasm.rations_alloc(8);
      const ok = wasm.rations_simhash_fingerprint(ptr, bytes.length, outPtr);
      let result = null;
      if (ok) {
        const fpBytes = new Uint8Array(memory.buffer, outPtr, 8);
        const fp = new DataView(memory.buffer).getBigUint64(outPtr, true);
        result = fp.toString(16).padStart(16, "0");
      }
      wasm.rations_free(ptr, bytes.length);
      wasm.rations_free(outPtr, 8);
      return result;
    },

    simhashHamming: function (fp1Hex, fp2Hex) {
      const fp1 = hexToBytes(fp1Hex);
      const fp2 = hexToBytes(fp2Hex);
      const ptr1 = writeToWasm(fp1);
      const ptr2 = writeToWasm(fp2);
      const dist = wasm.rations_simhash_hamming(ptr1, ptr2);
      wasm.rations_free(ptr1, fp1.length);
      wasm.rations_free(ptr2, fp2.length);
      return dist;
    },

    simhashSimilarity: function (fp1Hex, fp2Hex) {
      const fp1 = hexToBytes(fp1Hex);
      const fp2 = hexToBytes(fp2Hex);
      const ptr1 = writeToWasm(fp1);
      const ptr2 = writeToWasm(fp2);
      const score = wasm.rations_simhash_similarity(ptr1, ptr2);
      wasm.rations_free(ptr1, fp1.length);
      wasm.rations_free(ptr2, fp2.length);
      return score;
    },

    ragCreateQuery: function (text, requesterPubkey, topK, ttl) {
      const bytes = encoder.encode(text);
      const textPtr = writeToWasm(bytes);
      const reqPtr = writeToWasm(requesterPubkey);
      const outPtr = wasm.rations_alloc(74);
      const ok = wasm.rations_rag_create_query(textPtr, bytes.length, reqPtr, topK, ttl, outPtr);
      let result = null;
      if (ok) {
        result = readFromWasm(outPtr, 74);
      }
      wasm.rations_free(textPtr, bytes.length);
      wasm.rations_free(reqPtr, requesterPubkey.length);
      wasm.rations_free(outPtr, 74);
      return result;
    },

    ragSerializeResponse: function (queryHash, fragmentHash, content, responder, relevance) {
      const contentBytes = encoder.encode(content);
      const qhPtr = writeToWasm(queryHash);
      const fhPtr = writeToWasm(fragmentHash);
      const cPtr = writeToWasm(contentBytes);
      const rPtr = writeToWasm(responder);
      const outSize = 101 + contentBytes.length;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_rag_serialize_response(
        qhPtr, fhPtr, cPtr, contentBytes.length, rPtr, relevance,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(qhPtr, queryHash.length);
      wasm.rations_free(fhPtr, fragmentHash.length);
      wasm.rations_free(cPtr, contentBytes.length);
      wasm.rations_free(rPtr, responder.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    ragDeserializeResponse: function (data) {
      const dataPtr = writeToWasm(data);
      const qhPtr = wasm.rations_alloc(32);
      const fhPtr = wasm.rations_alloc(32);
      const rPtr = wasm.rations_alloc(32);
      const relPtr = wasm.rations_alloc(1);
      const contentSize = data.length;
      const contentPtr = wasm.rations_alloc(contentSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_rag_deserialize_response(
        dataPtr, data.length,
        qhPtr, fhPtr, rPtr, relPtr,
        contentPtr, contentSize, lenPtr
      );
      let result = null;
      if (ok) {
        const contentLen = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = {
          queryHash: readFromWasm(qhPtr, 32),
          fragmentHash: readFromWasm(fhPtr, 32),
          responder: readFromWasm(rPtr, 32),
          relevance: new Uint8Array(memory.buffer, relPtr, 1)[0],
          content: decoder.decode(readFromWasm(contentPtr, contentLen)),
        };
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(qhPtr, 32);
      wasm.rations_free(fhPtr, 32);
      wasm.rations_free(rPtr, 32);
      wasm.rations_free(relPtr, 1);
      wasm.rations_free(contentPtr, contentSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    ragAssembleContext: function (contents, relevances) {
      // Concatenate all contents into one buffer, build lengths array
      const allBytes = [];
      const lengths = new Uint32Array(contents.length);
      for (let i = 0; i < contents.length; i++) {
        const b = encoder.encode(contents[i]);
        lengths[i] = b.length;
        for (let j = 0; j < b.length; j++) allBytes.push(b[j]);
      }
      const allU8 = new Uint8Array(allBytes);
      const contentsPtr = writeToWasm(allU8);
      const relPtr = writeToWasm(relevances);
      const lengthsPtr = writeToWasm(new Uint8Array(lengths.buffer));
      const outSize = allU8.length + contents.length * 80 + 256;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_rag_assemble_context(
        contentsPtr, allU8.length,
        relPtr, contents.length,
        lengthsPtr,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = decoder.decode(readFromWasm(outPtr, len));
      }
      wasm.rations_free(contentsPtr, allU8.length);
      wasm.rations_free(relPtr, relevances.length);
      wasm.rations_free(lengthsPtr, lengths.byteLength);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    customwareCreate: function (groupId, version, content, seed) {
      const contentBytes = encoder.encode(content);
      const gPtr = writeToWasm(groupId);
      const cPtr = writeToWasm(contentBytes);
      const sPtr = writeToWasm(seed);
      const outSize = 172 + contentBytes.length;
      const outPtr = wasm.rations_alloc(outSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_customware_create(
        gPtr, version, cPtr, contentBytes.length, sPtr,
        outPtr, outSize, lenPtr
      );
      let result = null;
      if (ok) {
        const len = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = readFromWasm(outPtr, len);
      }
      wasm.rations_free(gPtr, groupId.length);
      wasm.rations_free(cPtr, contentBytes.length);
      wasm.rations_free(sPtr, seed.length);
      wasm.rations_free(outPtr, outSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    customwareDeserialize: function (data) {
      const dataPtr = writeToWasm(data);
      const gPtr = wasm.rations_alloc(32);
      const vPtr = wasm.rations_alloc(8);
      const pPtr = wasm.rations_alloc(32);
      const contentSize = data.length;
      const cPtr = wasm.rations_alloc(contentSize);
      const lenPtr = wasm.rations_alloc(4);
      const ok = wasm.rations_customware_deserialize(
        dataPtr, data.length,
        gPtr, vPtr, pPtr,
        cPtr, contentSize, lenPtr
      );
      let result = null;
      if (ok) {
        const contentLen = new Uint32Array(memory.buffer, lenPtr, 1)[0];
        result = {
          groupId: readFromWasm(gPtr, 32),
          version: Number(new DataView(memory.buffer).getBigUint64(vPtr, true)),
          publisher: readFromWasm(pPtr, 32),
          content: decoder.decode(readFromWasm(cPtr, contentLen)),
        };
      }
      wasm.rations_free(dataPtr, data.length);
      wasm.rations_free(gPtr, 32);
      wasm.rations_free(vPtr, 8);
      wasm.rations_free(pPtr, 32);
      wasm.rations_free(cPtr, contentSize);
      wasm.rations_free(lenPtr, 4);
      return result;
    },

    consensusCreateVote: function (proposalHash, approve, seed) {
      const phPtr = writeToWasm(proposalHash);
      const sPtr = writeToWasm(seed);
      const voterPtr = wasm.rations_alloc(32);
      const sigPtr = wasm.rations_alloc(64);
      const ok = wasm.rations_consensus_create_vote(phPtr, approve ? 1 : 0, sPtr, voterPtr, sigPtr);
      let result = null;
      if (ok) {
        result = {
          voter: readFromWasm(voterPtr, 32),
          signature: readFromWasm(sigPtr, 64),
        };
      }
      wasm.rations_free(phPtr, proposalHash.length);
      wasm.rations_free(sPtr, seed.length);
      wasm.rations_free(voterPtr, 32);
      wasm.rations_free(sigPtr, 64);
      return result;
    },

    consensusVerifyVote: function (proposalHash, voter, approve, signature) {
      const phPtr = writeToWasm(proposalHash);
      const vPtr = writeToWasm(voter);
      const sPtr = writeToWasm(signature);
      const ok = wasm.rations_consensus_verify_vote(phPtr, vPtr, approve ? 1 : 0, sPtr);
      wasm.rations_free(phPtr, proposalHash.length);
      wasm.rations_free(vPtr, voter.length);
      wasm.rations_free(sPtr, signature.length);
      return ok;
    },

    consensusProposalHash: function (proposalType, payload, proposer, timestamp) {
      const payloadBytes = encoder.encode(payload);
      const pPtr = writeToWasm(payloadBytes);
      const prPtr = writeToWasm(proposer);
      const outPtr = wasm.rations_alloc(32);
      const ok = wasm.rations_consensus_proposal_hash(
        proposalType, pPtr, payloadBytes.length, prPtr, timestamp, outPtr
      );
      let result = null;
      if (ok) {
        result = readFromWasm(outPtr, 32);
      }
      wasm.rations_free(pPtr, payloadBytes.length);
      wasm.rations_free(prPtr, proposer.length);
      wasm.rations_free(outPtr, 32);
      return result;
    },
  };

  return api;
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = RationsBridge;
}
