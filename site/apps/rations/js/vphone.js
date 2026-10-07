// VPhone — vphone-control v1 client for Rations (R13).
//
// The donor (vphone-cli) talks to the guest daemon over virtio-vsock port
// 1337 — a transport browsers cannot open. The honest integration path is
// a host-side ws↔vsock gateway (vphone-cli host runs `vphoned-relay` or
// socat-style bridging): this client speaks the exact same wire frames
// through a WebSocket and reports `external` when no gateway is reachable.
//
// Frame codec runs in WASM (rations_vphone_*) — this file owns the socket
// lifecycle, request/response correlation, and capability reporting.

"use strict";

const VPhone = (() => {
  const DEFAULT_GATEWAY = "ws://127.0.0.1:13370";

  let ws = null;
  let wsUrl = null;
  let rxBuf = new Uint8Array(0);
  const pending = new Map(); // id → {resolve, reject, timer}
  let nextId = 1;
  let openPromise = null;

  function catalog() {
    return Rations.vphoneCatalog();
  }

  function capabilities() {
    const cat = catalog();
    return {
      protocol: cat ? cat.protocol : 1,
      vsock_port: cat ? cat.vsock_port : 1337,
      transport: {
        state: ws && ws.readyState === WebSocket.OPEN ? "connected" : "external",
        note:
          "Guest channel is virtio-vsock:1337 — not openable from a browser. " +
          "Point gateway_url at a host-side ws↔vsock relay (e.g. socat or " +
          "the vphone-gateway shim) to get a live session; frames are the " +
          "identical vphone-control v1 wire format.",
        gateway_url: wsUrl || DEFAULT_GATEWAY,
      },
      commands: cat ? cat.commands.length : 0,
      host_only_commands: cat ? cat.commands.filter((c) => c.host_only).length : 0,
    };
  }

  async function probe(url, timeoutMs = 1500) {
    url = url || DEFAULT_GATEWAY;
    return new Promise((resolve) => {
      let done = false;
      const finish = (ok) => {
        if (!done) {
          done = true;
          resolve(ok);
        }
      };
      try {
        const probe_ws = new WebSocket(url);
        probe_ws.binaryType = "arraybuffer";
        const timer = setTimeout(() => {
          try { probe_ws.close(); } catch (_) {}
          finish(false);
        }, timeoutMs);
        probe_ws.onopen = () => {
          clearTimeout(timer);
          probe_ws.close();
          finish(true);
        };
        probe_ws.onerror = () => {
          clearTimeout(timer);
          finish(false);
        };
      } catch (_) {
        finish(false);
      }
    });
  }

  function connect(url) {
    if (ws && ws.readyState === WebSocket.OPEN) return Promise.resolve(true);
    if (openPromise) return openPromise;
    wsUrl = url || DEFAULT_GATEWAY;
    openPromise = new Promise((resolve, reject) => {
      try {
        ws = new WebSocket(wsUrl);
      } catch (e) {
        openPromise = null;
        reject(e);
        return;
      }
      ws.binaryType = "arraybuffer";
      ws.onopen = () => {
        openPromise = null;
        resolve(true);
      };
      ws.onerror = (e) => {
        openPromise = null;
        reject(new Error("vphone gateway unreachable"));
      };
      ws.onclose = () => {
        ws = null;
        for (const [, p] of pending) {
          clearTimeout(p.timer);
          p.reject(new Error("gateway closed"));
        }
        pending.clear();
      };
      ws.onmessage = (ev) => {
        const chunk = new Uint8Array(ev.data);
        const merged = new Uint8Array(rxBuf.length + chunk.length);
        merged.set(rxBuf);
        merged.set(chunk, rxBuf.length);
        rxBuf = merged;
        drainFrames();
      };
    });
    return openPromise;
  }

  function drainFrames() {
    for (;;) {
      if (rxBuf.length < 4) return;
      const view = new DataView(rxBuf.buffer, rxBuf.byteOffset, 4);
      const jsonLen = view.getUint32(0, false);
      if (jsonLen === 0 || jsonLen > 4 * 1024 * 1024) {
        rxBuf = new Uint8Array(0);
        return; // protocol violation — drop connection state
      }
      const total = 4 + jsonLen;
      if (rxBuf.length < total) return;
      const jsonText = new TextDecoder().decode(rxBuf.subarray(4, total));
      rxBuf = rxBuf.subarray(total);
      let msg;
      try {
        msg = JSON.parse(jsonText);
      } catch (_) {
        continue;
      }
      const id = msg.id;
      if (id && pending.has(id)) {
        const p = pending.get(id);
        pending.delete(id);
        clearTimeout(p.timer);
        if (msg.err) p.reject(new Error(msg.err));
        else p.resolve(msg);
      }
    }
  }

  async function request(name, params, timeoutMs = 10000) {
    await connect();
    const id = (nextId++).toString(16);
    const body = Object.assign({ id }, params || {});
    const frame = Rations.vphoneCommand(name, body);
    if (!frame) throw new Error("vphoneCommand failed for " + name);
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        pending.delete(id);
        reject(new Error("timeout: " + name));
      }, timeoutMs);
      pending.set(id, { resolve, reject, timer });
      ws.send(frame);
    });
  }

  function disconnect() {
    if (ws) {
      try { ws.close(); } catch (_) {}
      ws = null;
    }
    rxBuf = new Uint8Array(0);
  }

  return {
    catalog,
    capabilities,
    probe,
    connect,
    request,
    disconnect,
    DEFAULT_GATEWAY,
    // Convenience wrappers for the common donor commands.
    ping: () => request("ping"),
    version: () => request("version"),
    hello: () => request("hello"),
    fileList: (path) => request("file_list", { path }),
    appList: (filter) => request("app_list", { filter }),
    appLaunch: (bundleId) => request("app_launch", { bundle_id: bundleId }),
    openUrl: (url) => request("open_url", { url }),
    screenshot: (path) => request("screenshot", path ? { path } : {}),
  };
})();

if (typeof module !== "undefined" && module.exports) module.exports = VPhone;
if (typeof window !== "undefined") window.VPhone = VPhone;
