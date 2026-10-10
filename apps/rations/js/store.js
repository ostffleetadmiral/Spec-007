/**
 * Rations Unified Store (R8.3 / G6)
 *
 * Single IndexedDB ("rations-store") with per-namespace object stores.
 * Consolidates the persistence layer used by savers (autosave),
 * skills, settings, model config and customware state — one open()
 * per namespace, promise API, availability probing, localStorage
 * fallback for quota/errors.
 *
 * Namespaces are created lazily via `open(ns)` — the DB is version-
 * bumped only when a *new* namespace is requested, so adding a store
 * doesn't invalidate existing data.
 */

const Store = (function () {
  const DB_NAME = "rations-store";
  const KNOWN = ["autosave", "skills", "settings", "model", "customware", "rollback-refs"];
  let dbPromise = null;
  const opened = new Set();

  function available() {
    return typeof indexedDB !== "undefined";
  }

  /**
   * Open (and if needed, upgrade) the DB with namespace `ns`.
   *
   * R15.8 multi-tab safety: never guess the schema version — always
   * open the CURRENT version, read `db.version` for the real number,
   * and bump only when a namespace store is actually missing. Handles:
   *   - onversionchange: another tab is upgrading; close our handle so
   *     their upgrade isn't blocked, then drop cached state so the next
   *     open() reopens at the new version.
   *   - onblocked: our upgrade is waiting on another tab's handle;
   *     reject so callers fall back to localStorage and retry cleanly.
   */
  function open(ns) {
    if (!available()) return Promise.reject(new Error("indexedDB unavailable"));
    if (!KNOWN.includes(ns)) KNOWN.push(ns);
    if (opened.has(ns) && dbPromise) return dbPromise;

    dbPromise = new Promise((resolve, reject) => {
      const attempt = (ver) => {
        const req = ver ? indexedDB.open(DB_NAME, ver) : indexedDB.open(DB_NAME);
        req.onupgradeneeded = (e) => {
          const db = e.target.result;
          for (const name of KNOWN) {
            if (!db.objectStoreNames.contains(name)) {
              db.createObjectStore(name, { keyPath: "id" });
            }
          }
        };
        req.onsuccess = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(ns)) {
            // Missing store — bump past the REAL current version.
            const next = db.version + 1;
            db.close();
            attempt(next);
            return;
          }
          db.onversionchange = () => {
            try { db.close(); } catch (_) { /* already closed */ }
            opened.clear();
            dbPromise = null;
          };
          opened.add(ns);
          resolve(db);
        };
        req.onerror = () => reject(req.error);
        req.onblocked = () => reject(
          new Error("indexeddb upgrade blocked by another tab")
        );
      };
      attempt(null);
    });
    return dbPromise;
  }

  function tx(db, ns, mode, fn) {
    return new Promise((resolve, reject) => {
      const t = db.transaction(ns, mode);
      const store = t.objectStore(ns);
      const out = fn(store);
      t.oncomplete = () => resolve(out && out.result !== undefined ? out.result : out);
      t.onerror = () => reject(t.error);
    });
  }

  /** Get a record by key (`{id, ...}` shape). Returns null when absent. */
  async function get(ns, id) {
    const db = await open(ns);
    return new Promise((resolve, reject) => {
      const req = db.transaction(ns, "readonly").objectStore(ns).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  /** Put `{id, ...fields}` — id is the record key. */
  async function put(ns, record) {
    const db = await open(ns);
    return tx(db, ns, "readwrite", (s) => s.put(record));
  }

  /** Set a plain key→value pair inside the namespace. */
  function set(ns, id, value) {
    return put(ns, { id, value });
  }

  /** Get the `.value` field of a record (paired with `set`). */
  async function getValue(ns, id) {
    const rec = await get(ns, id);
    return rec ? rec.value : null;
  }

  async function del(ns, id) {
    const db = await open(ns);
    return tx(db, ns, "readwrite", (s) => s.delete(id));
  }

  /** All ids in a namespace. */
  async function keys(ns) {
    const db = await open(ns);
    return new Promise((resolve, reject) => {
      const req = db.transaction(ns, "readonly").objectStore(ns).getAllKeys();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  /** All records in a namespace. */
  async function all(ns) {
    const db = await open(ns);
    return new Promise((resolve, reject) => {
      const req = db.transaction(ns, "readonly").objectStore(ns).getAll();
      req.onsuccess = () => resolve(req.result || []);
      req.onerror = () => reject(req.error);
    });
  }

  async function clear(ns) {
    const db = await open(ns);
    return tx(db, ns, "readwrite", (s) => s.clear());
  }

  /** localStorage fallback — same get/set contract, JSON-encoded. */
  const ls = {
    available() {
      try {
        return typeof localStorage !== "undefined" &&
          (localStorage.setItem("__rations_store_probe__", "1"),
           localStorage.removeItem("__rations_store_probe__"), true);
      } catch (_) { return false; }
    },
    key(ns, id) { return `rations-store:${ns}:${id}`; },
    get(ns, id) {
      try {
        const raw = localStorage.getItem(ls.key(ns, id));
        return raw ? Promise.resolve(JSON.parse(raw)) : Promise.resolve(null);
      } catch (_) { return Promise.resolve(null); }
    },
    set(ns, id, value) {
      try {
        localStorage.setItem(ls.key(ns, id), JSON.stringify(value));
        return Promise.resolve(true);
      } catch (_) { return Promise.resolve(false); }
    },
  };

  /**
   * Resilient read: IndexedDB → localStorage fallback.
   * Returns {value, backend} — backend ∈ "indexeddb"|"localstorage"|null
   */
  async function resilientGet(ns, id) {
    if (available()) {
      try {
        const rec = await getValue(ns, id);
        if (rec !== null && rec !== undefined) {
          return { value: rec, backend: "indexeddb" };
        }
      } catch (_) { /* fall through */ }
    }
    if (ls.available()) {
      const v = await ls.get(ns, id);
      if (v !== null) return { value: v, backend: "localstorage" };
    }
    return { value: null, backend: null };
  }

  /** Resilient write: IndexedDB → localStorage fallback → backend used. */
  async function resilientSet(ns, id, value) {
    if (available()) {
      try {
        await set(ns, id, value);
        return "indexeddb";
      } catch (_) { /* fall through */ }
    }
    if (ls.available() && await ls.set(ns, id, value)) {
      return "localstorage";
    }
    return null;
  }

  return {
    open, get, put, set, getValue, del, keys, all, clear,
    resilientGet, resilientSet, ls, available,
    DB_NAME, KNOWN,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Store;
}
