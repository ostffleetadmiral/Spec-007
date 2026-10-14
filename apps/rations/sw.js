/**
 * Rations service worker (R8.2 / G5) — offline-first app shell.
 *
 * Strategy: precache the shell on install, cache-first on fetch with
 * network fallback + bounded runtime caching. The quine is a single-
 * file app — the shell is quine.html + rations.wasm + the js/ modules
 * + icons.
 *
 * Versioned cache: bump CACHE_VERSION on every wave that ships new
 * shell files so old precaches are evicted cleanly.
 *
 * R15: runtime cache is a SEPARATE cache (CACHE_VERSION + "-runtime")
 * with an LRU index, per-entry size cap, and total byte budget. A
 * GB-scale ZIM/PMTiles/model fetch can evict runtime entries but can
 * never touch the app shell.
 */

const CACHE_VERSION = "rations-r29-v1";
const RUNTIME_CACHE = CACHE_VERSION + "-runtime";

const SHELL = [
  "./",
  "./quine.html",
  "./manifest.json",
  "./rations.wasm",
  "./models/manifest.json",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./js/agent.js",
  "./js/encodec-worker.js",
  "./js/llm-manager.js",
  "./js/llm-worker.js",
  "./js/models.js",
  "./js/prompt-runtime.js",
  "./js/tool-registry.js",
  "./js/quine-editor.js",
  "./js/qr-render.js",
  "./js/qr-scanner.js",
  "./js/rations-bridge.js",
  "./js/rollback.js",
  "./js/savers.js",
  "./js/skills.js",
  "./js/store.js",
  "./js/transport.js",
  "./js/ui.js",
  "./js/phone.js",
  "./js/vendor/cm6.bundle.b64.js",
  "./js/webcodecs-bridge.js",
  "./js/webgpu-bridge.js",
  "./js/webrtc-bridge.js",
  "./js/zipapp.js",
  "./js/vphone.js",
  "./js/nomad_data.js",
  "./js/nomad.js",
];

// ---------- Bounded runtime cache (R15.7) ----------

// Synthetic index entry tracking {url: {ts,size}} inside the runtime
// cache itself — Cache API exposes no per-entry size metadata.
const RT_INDEX_URL = self.location.origin + "/__rt_index__";
const RT_MAX_ENTRIES = 64;                  // entry count bound
const RT_MAX_TOTAL_BYTES = 256 * 1024 * 1024;  // 256 MiB total budget
const RT_MAX_ENTRY_BYTES = 64 * 1024 * 1024;   // 64 MiB per entry
// Model weights legitimately need offline caching past the normal cap.
const RT_MODEL_ENTRY_BYTES = 1024 * 1024 * 1024; // 1 GiB for /models/
const RT_MODEL_PATH = /^\/models\//;

async function rtIndexRead(cache) {
  const res = await cache.match(RT_INDEX_URL);
  if (!res) return {};
  try {
    const idx = await res.json();
    return idx && typeof idx === "object" ? idx : {};
  } catch {
    return {};
  }
}

async function rtIndexWrite(cache, idx) {
  await cache.put(RT_INDEX_URL, new Response(JSON.stringify(idx), {
    headers: { "Content-Type": "application/json" },
  }));
}

/**
 * Runtime-cache a response if it fits policy, then evict LRU entries
 * over budget. Advisory only — index races across tabs are harmless.
 */
async function rtPut(req, res) {
  const url = new URL(req.url);
  let len = parseInt(res.headers.get("content-length") || "0", 10) || 0;
  if (len === 0) {
    // Chunked model responses often omit content-length. Measure the
    // cloned body before accounting it, otherwise the LRU can silently
    // exceed its byte budget.
    const bytes = await res.arrayBuffer();
    len = bytes.byteLength;
    res = new Response(bytes, { status: res.status, headers: res.headers });
  }
  const cap = RT_MODEL_PATH.test(url.pathname)
    ? RT_MODEL_ENTRY_BYTES
    : RT_MAX_ENTRY_BYTES;
  if (len > cap) return;

  const cache = await caches.open(RUNTIME_CACHE);
  await cache.put(req, res);

  const idx = await rtIndexRead(cache);
  idx[req.url] = { ts: Date.now(), size: len };

  // Evict oldest entries while over count or byte budget.
  const entries = Object.entries(idx).sort((a, b) => a[1].ts - b[1].ts);
  let total = entries.reduce((a, [, v]) => a + (v.size || 0), 0);
  let count = entries.length;
  for (const [key, v] of entries) {
    if (count <= RT_MAX_ENTRIES && total <= RT_MAX_TOTAL_BYTES) break;
    if (key === req.url) continue; // never evict the entry we just wrote
    await cache.delete(key);
    delete idx[key];
    total -= v.size || 0;
    count -= 1;
  }
  await rtIndexWrite(cache, idx);
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_VERSION)
      .then((cache) => cache.addAll(SHELL))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys
          .filter((k) => k !== CACHE_VERSION && k !== RUNTIME_CACHE)
          .map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;

  // WebSocket / p2p signaling never touches the cache.
  if (req.url.startsWith("ws:") || req.url.startsWith("wss:")) return;
  // The runtime LRU index is internal bookkeeping, never serve it.
  if (req.url === RT_INDEX_URL) return;

  event.respondWith(
    caches.match(req).then((hit) => {
      if (hit) return hit;
      return fetch(req).then((res) => {
        // Runtime-cache successful same-origin GETs (models, vendors).
        if (res && res.ok && new URL(req.url).origin === self.location.origin) {
          const copy = res.clone();
          rtPut(req, copy).catch(() => {});
        }
        return res;
      }).catch(() => {
        // Offline + not cached: fall back to the shell for navigations.
        if (req.mode === "navigate") {
          return caches.match("./quine.html");
        }
        throw new Error("offline and not cached: " + req.url);
      });
    })
  );
});
