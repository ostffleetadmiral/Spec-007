/**
 * Transport Bridge — JavaScript WebSocket wrapper for the Zig P2P transport layer.
 * Provides the extern functions that Zig WASM calls (js_ws_connect, js_ws_send, etc.)
 * and calls back into WASM when messages arrive (rations_ws_on_message).
 *
 * R15.6: automatic reconnect with exponential backoff + jitter. A
 * dropped socket reconnects transparently under the SAME conn_id —
 * the Zig node keeps its peer registration, sends fail-closed during
 * the gap, and resume once the new socket opens. rations_ws_on_close
 * is only delivered after maxAttempts is exhausted or on an explicit
 * wsClose, so the node only sees genuinely dead connections.
 *
 * Heartbeat: browsers answer protocol-level ws pings automatically —
 * liveness is enforced relay-side (server.js 30s ping → terminate),
 * which also keeps NAT bindings warm.
 */

const TransportBridge = (function () {
  let wasm = null;
  let connections = new Map(); // conn_id → {ws, url, attempts, manualClose, timer}
  let nextConnId = 1;
  let listeners = [];

  const RECONNECT = {
    maxAttempts: 10,
    baseDelayMs: 500,
    maxDelayMs: 30000,
    jitterRatio: 0.25,
  };

  function init(wasmInstance) {
    wasm = wasmInstance;
  }

  function notify(type, payload) {
    listeners.forEach((fn) => fn(type, payload));
  }

  function on(listener) {
    listeners.push(listener);
    return () => {
      listeners = listeners.filter((l) => l !== listener);
    };
  }

  function wireSocket(connId, entry, ws) {
    ws.binaryType = "arraybuffer";

    ws.onopen = function () {
      const wasReconnect = entry.attempts > 0;
      entry.attempts = 0;
      notify(wasReconnect ? "reconnected" : "connected", { connId, url: entry.url });
    };

    ws.onmessage = function (event) {
      const data = new Uint8Array(event.data);
      // Call back into Zig: rations_ws_on_message(conn_id, data_ptr, data_len)
      if (wasm && wasm.exports && wasm.exports.rations_ws_on_message) {
        const ptr = wasm.exports.rations_alloc(data.length);
        new Uint8Array(wasm.memory.buffer, ptr, data.length).set(data);
        wasm.exports.rations_ws_on_message(connId, ptr, data.length);
        wasm.exports.rations_free(ptr, data.length);
      }
    };

    ws.onclose = function () {
      const current = connections.get(connId);
      if (!current || current.manualClose) {
        finishClose(connId);
        return;
      }
      // Unexpected drop — reconnect transparently under the same conn_id.
      scheduleReconnect(connId, current);
    };

    ws.onerror = function () {
      notify("error", { connId, message: "WebSocket error" });
    };
  }

  function scheduleReconnect(connId, entry) {
    if (entry.attempts >= RECONNECT.maxAttempts) {
      notify("reconnect_exhausted", { connId, url: entry.url });
      finishClose(connId);
      return;
    }
    const backoff = Math.min(
      RECONNECT.maxDelayMs,
      RECONNECT.baseDelayMs * 2 ** entry.attempts
    );
    const jitter = backoff * RECONNECT.jitterRatio * (Math.random() * 2 - 1);
    const delay = Math.max(100, Math.round(backoff + jitter));
    entry.attempts += 1;
    notify("reconnecting", {
      connId,
      url: entry.url,
      attempt: entry.attempts,
      delayMs: delay,
    });
    entry.timer = setTimeout(() => {
      entry.timer = null;
      try {
        const ws = new WebSocket(entry.url);
        entry.ws = ws;
        wireSocket(connId, entry, ws);
      } catch {
        scheduleReconnect(connId, entry);
      }
    }, delay);
  }

  // Called by Zig WASM: js_ws_connect(url_ptr, url_len) → conn_id
  function wsConnect(urlPtr, urlLen) {
    const url = readString(urlPtr, urlLen);
    const connId = nextConnId++;

    try {
      const ws = new WebSocket(url);
      const entry = { ws, url, attempts: 0, manualClose: false, timer: null };
      connections.set(connId, entry);
      wireSocket(connId, entry, ws);
      return connId;
    } catch (e) {
      connections.delete(connId);
      return 0;
    }
  }

  // Called by Zig WASM: js_ws_send(conn_id, data_ptr, data_len) → bool
  function wsSend(connId, dataPtr, dataLen) {
    const entry = connections.get(connId);
    if (!entry || !entry.ws || entry.ws.readyState !== WebSocket.OPEN) return false;

    const data = new Uint8Array(wasm.memory.buffer, dataPtr, dataLen);
    entry.ws.send(data);
    return true;
  }

  function finishClose(connId) {
    connections.delete(connId);
    notify("disconnected", { connId });
    if (wasm && wasm.exports && wasm.exports.rations_ws_on_close) {
      wasm.exports.rations_ws_on_close(connId);
    }
  }

  // Called by Zig WASM: js_ws_close(conn_id)
  function wsClose(connId) {
    const entry = connections.get(connId);
    if (!entry) return;
    entry.manualClose = true;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = null;
    }
    if (!entry.ws || entry.ws.readyState === WebSocket.CLOSED) {
      // No onclose event will fire — clean up directly.
      finishClose(connId);
      return;
    }
    entry.ws.close();
    // onclose fires asynchronously and calls finishClose via the
    // manualClose path.
  }

  // Called by Zig WASM: js_ws_state(conn_id) → u8
  function wsState(connId) {
    const entry = connections.get(connId);
    if (!entry || !entry.ws) return 0; // disconnected
    switch (entry.ws.readyState) {
      case WebSocket.CONNECTING: return 1;
      case WebSocket.OPEN: return 2;
      case WebSocket.CLOSING: return 3;
      case WebSocket.CLOSED: return 4;
      default: return 0;
    }
  }

  function readString(ptr, len) {
    return new TextDecoder().decode(
      new Uint8Array(wasm.memory.buffer, ptr, len)
    );
  }

  function getConnectionCount() {
    return connections.size;
  }

  function getConnections() {
    return Array.from(connections.keys());
  }

  return {
    init,
    on,
    wsConnect,
    wsSend,
    wsClose,
    wsState,
    getConnectionCount,
    getConnections,
    RECONNECT,
  };
})();

if (typeof window !== "undefined") {
  window.TransportBridge = TransportBridge;
}
