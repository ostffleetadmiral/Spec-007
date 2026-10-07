/**
 * Rations Quine Saver Backends (R7.4)
 *
 * Saver backend chain for the self-modifying HTML file, mirroring the
 * donor's `saveContents` dispatcher (mozillaSaveFile/TiddlyFox →
 * localStorage fallback) with modern backends:
 *
 *   File System Access (showSaveFilePicker)
 *   → Blob download (universal fallback, always "works")
 *   + IndexedDB autosave snapshot (in-browser persistence)
 *   + localStorage autosave (last resort, quota-bounded)
 *
 * Also provides the `<!--@section:name-->` … `<!--@endsection-->`
 * parser used for customware/skill storage inside the HTML, dirty
 * tracking, and drag/drop file loading.
 *
 * DOM-touching paths are guarded so the module loads under Node for
 * the section-parser unit tests.
 */

const Savers = (function () {
  const IDB_NAME = "rations-saves";
  const IDB_VERSION = 1;
  const IDB_STORE = "snapshots";
  const LS_KEY = "rations:autosave";
  const LS_MAX_BYTES = 4 * 1024 * 1024; // localStorage quota guard

  // ---------- Section parser (pure string ops — Node testable) ----------

  const SECTION_RE =
    /<!--@section:([A-Za-z0-9_-]+)-->([\s\S]*?)<!--@endsection-->/g;

  /**
   * Parse all `<!--@section:name-->…<!--@endsection-->` blocks.
   * @returns {Object} map of section name → inner content
   */
  function parseSections(html) {
    const out = {};
    SECTION_RE.lastIndex = 0;
    let m;
    while ((m = SECTION_RE.exec(html)) !== null) {
      out[m[1]] = m[2];
    }
    return out;
  }

  /**
   * Insert or replace a section idempotently. Sections are appended
   * before </body> (or at EOF if absent).
   */
  function setSection(html, name, content) {
    const single = new RegExp(
      `<!--@section:${name}-->[\\s\\S]*?<!--@endsection-->`,
      "g"
    );
    const block = `<!--@section:${name}-->${content}<!--@endsection-->`;
    if (single.test(html)) {
      return html.replace(single, block);
    }
    const idx = html.lastIndexOf("</body>");
    if (idx !== -1) {
      return html.slice(0, idx) + block + "\n" + html.slice(idx);
    }
    return html + "\n" + block + "\n";
  }

  /** Remove a section (no-op if absent). */
  function removeSection(html, name) {
    const single = new RegExp(
      `\\n?<!--@section:${name}-->[\\s\\S]*?<!--@endsection-->\\n?`,
      "g"
    );
    return html.replace(single, "");
  }

  // ---------- Snapshot + version stamp ----------

  /** Serialize the *live* DOM (agent modifications included). */
  function snapshot() {
    return "<!DOCTYPE html>\n" + document.documentElement.outerHTML;
  }

  /** 64-bit FNV-1a over UTF-16LE bytes — fallback stamp when the WASM
   *  bridge is absent. */
  function fnv1a64(str) {
    const PRIME = 0x100000001b3n;
    const MASK = 0xffffffffffffffffn;
    let h = 0xcbf29ce484222325n;
    for (let i = 0; i < str.length; i++) {
      const c = str.charCodeAt(i);
      h ^= BigInt(c & 0xff);
      h = (h * PRIME) & MASK;
      h ^= BigInt((c >> 8) & 0xff);
      h = (h * PRIME) & MASK;
    }
    return h.toString(16).padStart(16, "0");
  }

  /** Content hash for version stamping: WASM sha256 → FNV-1a fallback. */
  async function contentHash(html) {
    if (typeof Rations !== "undefined" && Rations.sha256) {
      try {
        const digest = await Rations.sha256(new TextEncoder().encode(html));
        if (digest && digest.length === 32) {
          return "sha256:" + Array.from(digest)
            .map((b) => b.toString(16).padStart(2, "0")).join("");
        }
      } catch (_) { /* fall through to FNV */ }
    }
    return "fnv1a64:" + fnv1a64(html);
  }

  // ---------- Backends ----------

  const backends = {
    /** File System Access API — real file write, Chrome/Edge. */
    fsaccess: {
      name: "fsaccess",
      available() {
        return typeof window !== "undefined" &&
          typeof window.showSaveFilePicker === "function";
      },
      async save(html, opts) {
        const handle = opts.handle ||
          (await window.showSaveFilePicker({
            suggestedName: opts.filename || "quine.html",
            types: [{ description: "HTML", accept: { "text/html": [".html"] } }],
          }));
        const w = await handle.createWritable();
        await w.write(html);
        await w.close();
        return { handle };
      },
    },

    /** WebDAV PUT — only when a URL is configured. */
    webdav: {
      name: "webdav",
      available() {
        return false; // requires opts.url — probed in save() instead
      },
      async save(html, opts) {
        if (!opts.url) throw new Error("webdav: no url configured");
        const res = await fetch(opts.url, {
          method: "PUT",
          headers: { "Content-Type": "text/html" },
          body: html,
        });
        if (!res.ok) throw new Error("webdav PUT failed: " + res.status);
        return {};
      },
    },

    /** Blob + <a download> — universal fallback. */
    download: {
      name: "download",
      available() {
        return typeof document !== "undefined" &&
          typeof Blob !== "undefined" &&
          typeof URL !== "undefined" &&
          typeof URL.createObjectURL === "function";
      },
      async save(html, opts) {
        const blob = new Blob([html], { type: "text/html" });
        const url = URL.createObjectURL(blob);
        const a = document.createElement("a");
        a.href = url;
        a.download = opts.filename || "quine.html";
        a.click();
        URL.revokeObjectURL(url);
        return {};
      },
    },
  };

  // ---------- In-browser autosave persistence ----------

  function idbOpen() {
    return new Promise((resolve, reject) => {
      const req = indexedDB.open(IDB_NAME, IDB_VERSION);
      req.onupgradeneeded = (e) =>
        e.target.result.createObjectStore(IDB_STORE, { keyPath: "id" });
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
  }

  async function idbPut(record) {
    const db = await idbOpen();
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(IDB_STORE, "readwrite");
        tx.objectStore(IDB_STORE).put(record);
        tx.oncomplete = resolve;
        tx.onerror = () => reject(tx.error);
      });
    } finally {
      db.close();
    }
  }

  async function idbGet(id) {
    const db = await idbOpen();
    try {
      return await new Promise((resolve, reject) => {
        const req = db.transaction(IDB_STORE, "readonly")
          .objectStore(IDB_STORE).get(id);
        req.onsuccess = () => resolve(req.result || null);
        req.onerror = () => reject(req.error);
      });
    } finally {
      db.close();
    }
  }

  function idbAvailable() {
    return typeof indexedDB !== "undefined";
  }

  function lsAvailable() {
    try {
      return typeof localStorage !== "undefined" &&
        (localStorage.setItem("__rations_probe__", "1"),
         localStorage.removeItem("__rations_probe__"), true);
    } catch (_) {
      return false;
    }
  }

  /**
   * Persist an autosave snapshot: unified Store → IndexedDB →
   * localStorage → none.
   * @returns {Promise<string|null>} backend used, or null
   */
  async function persistAutosave(html, hash) {
    const record = { html, hash, ts: Date.now() };
    // Prefer the unified store (G6) when loaded.
    if (typeof Store !== "undefined" && Store.resilientSet) {
      try {
        const backend = await Store.resilientSet("autosave", "autosave", record);
        if (backend) return backend;
      } catch (_) { /* fall through to internal path */ }
    }
    const rec = { id: "autosave", html, hash, ts: Date.now() };
    if (idbAvailable()) {
      try {
        await idbPut(rec);
        return "indexeddb";
      } catch (_) { /* fall through */ }
    }
    if (lsAvailable() && html.length < LS_MAX_BYTES) {
      try {
        localStorage.setItem(LS_KEY, JSON.stringify(record));
        return "localstorage";
      } catch (_) { /* quota exceeded — no further fallback */ }
    }
    return null;
  }

  /** Load the most recent autosave ({html,hash,ts} or null). */
  async function loadAutosave() {
    if (typeof Store !== "undefined" && Store.resilientGet) {
      try {
        const r = await Store.resilientGet("autosave", "autosave");
        if (r && r.value) return r.value;
      } catch (_) { /* fall through */ }
    }
    if (idbAvailable()) {
      try {
        const rec = await idbGet("autosave");
        if (rec) return rec;
      } catch (_) { /* fall through */ }
    }
    if (lsAvailable()) {
      try {
        const raw = localStorage.getItem(LS_KEY);
        if (raw) return JSON.parse(raw);
      } catch (_) { /* ignore */ }
    }
    return null;
  }

  // ---------- Orchestration ----------

  /**
   * Full save: snapshot → version stamp → file backend → autosave →
   * rollback commit.
   * @param {Object} [opts] {filename, url, handle, forceDownload, html}
   *   `html` overrides the snapshot — used by the self-edit panel to
   *   persist editor content rather than the live DOM.
   * @returns {Promise<{backend:string,hash:string,autosave:string|null}>}
   */
  async function save(opts = {}) {
    const html = (typeof opts.html === "string") ? opts.html : snapshot();
    const hash = await contentHash(html);

    // File backend: FS-API → WebDAV (if url) → download.
    let used = null;
    if (backends.fsaccess.available() && !opts.forceDownload) {
      try {
        await backends.fsaccess.save(html, opts);
        used = "fsaccess";
      } catch (e) {
        if (e && e.name === "AbortError") throw e; // user cancelled picker
      }
    }
    if (!used && opts.url) {
      try {
        await backends.webdav.save(html, opts);
        used = "webdav";
      } catch (_) { /* fall through to download */ }
    }
    if (!used) {
      await backends.download.save(html, opts);
      used = "download";
    }

    const autosave = await persistAutosave(html, hash);

    // Version-stamped save tied to rollback commits.
    if (typeof Rollback !== "undefined" && Rollback.commit) {
      try {
        await Rollback.commit(
          { kind: "quine-save", hash, bytes: html.length },
          `save ${hash.slice(0, 12)} via ${used}`
        );
      } catch (_) { /* rollback store unavailable — save still succeeded */ }
    }

    return { backend: used, hash, autosave };
  }

  // ---------- Dirty tracking + autosave loop ----------

  let dirty = false;
  let observer = null;
  let timer = null;

  function markDirty() { dirty = true; }
  function isDirty() { return dirty; }

  /**
   * Watch DOM mutations; every `intervalMs`, persist an autosave if
   * the document changed. Returns a stop function.
   */
  function startAutosave(intervalMs = 30000) {
    if (typeof MutationObserver === "undefined" ||
        typeof document === "undefined") {
      return () => {};
    }
    stopAutosave();
    observer = new MutationObserver(markDirty);
    observer.observe(document.documentElement, {
      childList: true, subtree: true, attributes: true, characterData: true,
    });
    timer = setInterval(async () => {
      if (!dirty) return;
      dirty = false;
      try {
        await persistAutosave(snapshot(), await contentHash(snapshot()));
      } catch (_) {
        dirty = true; // retry next interval
      }
    }, intervalMs);
    return stopAutosave;
  }

  function stopAutosave() {
    if (observer) { observer.disconnect(); observer = null; }
    if (timer) { clearInterval(timer); timer = null; }
  }

  // ---------- Drag/drop file loading ----------

  /**
   * Install a drop handler. Files route by type: .html → onHtml,
   * otherwise onFile(file). Returns an uninstall function.
   */
  function installDropHandler(el, { onHtml, onFile } = {}) {
    if (!el || !el.addEventListener) return () => {};
    const prevent = (e) => { e.preventDefault(); e.stopPropagation(); };
    const drop = (e) => {
      prevent(e);
      const file = e.dataTransfer && e.dataTransfer.files &&
        e.dataTransfer.files[0];
      if (!file) return;
      if (/\.html?$/i.test(file.name) && onHtml) {
        const reader = new FileReader();
        reader.onload = () => onHtml(reader.result, file);
        reader.readAsText(file);
      } else if (onFile) {
        onFile(file);
      }
    };
    el.addEventListener("dragover", prevent);
    el.addEventListener("drop", drop);
    return () => {
      el.removeEventListener("dragover", prevent);
      el.removeEventListener("drop", drop);
    };
  }

  return {
    // sections
    parseSections, setSection, removeSection,
    // snapshot/stamp
    snapshot, contentHash, fnv1a64,
    // backends + orchestration
    backends, save, persistAutosave, loadAutosave,
    // dirty/autosave
    markDirty, isDirty, startAutosave, stopAutosave,
    // dnd
    installDropHandler,
  };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = Savers;
}
