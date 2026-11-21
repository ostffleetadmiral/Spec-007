// zipapp.js — ZipApp runner: inspect / catalog / run executable
// packages (R12).
//
//   const m = await ZipApp.inspect(bytes)      // detect + manifest
//   const list = ZipApp.catalog(manifest)      // entry table
//   const r = await ZipApp.run(bytes, opts)    // dispatch by runtime
//
// Runtime families and their in-browser status:
//   js        → real Worker execution (blob URL, console capture)
//   python    → lazy Pyodide loader (vendored or CDN); capability-gated
//   lua       → lazy wasmoon loader; capability-gated
//   love      → LÖVE API surface — external/deferred (fengari+love.js)
//   java/dotnet/android/ios/node-vscode/webext/js-bedrock/posix
//             → external runtime required — reported, not faked
//   document/kml → not runnable (convert to text via the media graph)
//
// Nothing here pretends a runtime exists when it doesn't — `capabilities()`
// reports what this session can actually execute.

"use strict";

const ZipApp = (() => {
  const decoder = new TextDecoder();
  const encoder = new TextEncoder();

  // Lazy runtime registries — a runtime is "available" when its module
  // was already loaded (vendored `<script>` or host-injected global) or
  // can be fetched from its canonical CDN URL when online.
  const RUNTIME_URLS = {
    pyodide: "https://cdn.jsdelivr.net/pyodide/v0.26.4/full/pyodide.js",
    wasmoon: "https://cdn.jsdelivr.net/npm/wasmoon@1.16.0/dist/index.js",
  };

  function bridge() {
    if (!self.Rations || !self.Rations.zipappManifest) throw new Error("WASM bridge not ready");
    return self.Rations;
  }

  /** Detect the format and build the runtime manifest.
   *  `hint` overrides detection when it yields "unknown" (source text
   *  has no magic — callers pass e.g. "JS" for source runs). */
  async function inspect(bytes, hint) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    let format = bridge().detectFormat(b);
    if (format === "unknown" && hint) format = hint;
    const manifest = bridge().zipappManifest(format, b);
    return { format, manifest };
  }

  /** File table for display. */
  function catalog(manifest) {
    return (manifest && manifest.files) || [];
  }

  /** What this session can actually execute right now. */
  async function capabilities() {
    const caps = {
      js: typeof Worker === "function" && typeof URL.createObjectURL === "function",
      python: !!self.pyodide || !!self.loadPyodide,
      lua: !!self.wasmoon || !!(self.LuaFactory && self.LuaFactory),
      love: !!self.love,
    };
    // Probe lazy loaders only when online-ish — cheap HEAD-ish fetch
    // with a short timeout; failure just reports false.
    if (!caps.python && navigator.onLine !== false) {
      caps.python = await probeUrl(RUNTIME_URLS.pyodide);
    }
    if (!caps.lua && navigator.onLine !== false) {
      caps.lua = await probeUrl(RUNTIME_URLS.wasmoon);
    }
    return caps;
  }

  function probeUrl(url) {
    // HEAD with a 3s timeout — just answers "is the loader fetchable".
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 3000);
    return fetch(url, { method: "HEAD", mode: "no-cors", signal: ctrl.signal })
      .then(() => { clearTimeout(timer); return true; })
      .catch(() => { clearTimeout(timer); return false; });
  }

  function loadScript(url) {
    return new Promise((resolve, reject) => {
      const s = document.createElement("script");
      s.src = url;
      s.onload = resolve;
      s.onerror = () => reject(new Error("load failed: " + url));
      document.head.appendChild(s);
    });
  }

  /** Extract the entry source text from a package or the blob itself. */
  function entrySource(manifest, bytes) {
    if (!manifest.entry || manifest.entry === "self") {
      return decoder.decode(bytes);
    }
    const raw = bridge().zipExtract(bytes, manifest.entry);
    if (!raw) throw new Error("entry not found: " + manifest.entry);
    return decoder.decode(raw);
  }

  /** Run source in a real Worker; console + errors are captured. */
  function runJsWorker(source, opts) {
    const stdout = [];
    const stderr = [];
    const timeout = (opts && opts.timeout) || 10000;
    return new Promise((resolve) => {
      const prelude =
        "const __out=[];const __err=[];" +
        "console.log=(...a)=>__out.push(a.join(' '));" +
        "console.error=(...a)=>__err.push(a.join(' '));" +
        "console.warn=(...a)=>__err.push(a.join(' '));" +
        "try{\n";
      const epilogue =
        "\n}catch(e){__err.push(String(e&&e.stack||e));}" +
        "postMessage({out:__out,err:__err});";
      const blob = new Blob([prelude + source + epilogue], { type: "text/javascript" });
      const url = URL.createObjectURL(blob);
      let worker;
      try {
        worker = new Worker(url);
      } catch (e) {
        URL.revokeObjectURL(url);
        resolve({ ok: false, stdout, stderr: [String(e)] });
        return;
      }
      const timer = setTimeout(() => {
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({ ok: false, stdout, stderr: stderr.concat(["timeout"]) });
      }, timeout);
      worker.onmessage = (ev) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({ ok: (ev.data.err || []).length === 0, stdout: ev.data.out || [], stderr: ev.data.err || [] });
      };
      worker.onerror = (e) => {
        clearTimeout(timer);
        worker.terminate();
        URL.revokeObjectURL(url);
        resolve({ ok: false, stdout, stderr: [e.message || "worker error"] });
      };
    });
  }

  async function ensurePyodide() {
    if (self.pyodide) return self.pyodide;
    if (!self.loadPyodide) {
      await loadScript(RUNTIME_URLS.pyodide);
    }
    self.pyodide = await self.loadPyodide();
    return self.pyodide;
  }

  async function ensureWasmoon() {
    if (self.__wasmoonFactory) return self.__wasmoonFactory;
    await loadScript(RUNTIME_URLS.wasmoon);
    // wasmoon UMD exposes `wasmoon` global with LuaFactory.
    const factory = self.wasmoon && self.wasmoon.LuaFactory;
    if (!factory) throw new Error("wasmoon loaded but LuaFactory missing");
    self.__wasmoonFactory = new factory();
    return self.__wasmoonFactory;
  }

  async function runPython(source, opts) {
    const py = await ensurePyodide();
    const stdout = [];
    const stderr = [];
    py.setStdout({ batched: (l) => stdout.push(l) });
    py.setStderr({ batched: (l) => stderr.push(l) });
    try {
      await py.runPythonAsync(source);
      return { ok: stderr.length === 0, stdout, stderr };
    } catch (e) {
      return { ok: false, stdout, stderr: stderr.concat([String(e)]) };
    }
  }

  async function runLua(source, opts) {
    const factory = await ensureWasmoon();
    const lua = await factory.createEngine();
    const stdout = [];
    const stderr = [];
    try {
      lua.global.set("print", (...a) => stdout.push(a.join("\t")));
      await lua.doString(source);
      return { ok: true, stdout, stderr };
    } catch (e) {
      return { ok: false, stdout, stderr: [String(e)] };
    } finally {
      lua.global.close();
    }
  }

  const EXTERNAL = {
    java: "a JVM (native host or TeaVM/cheerpJ module — deferred)",
    "node-vscode": "a VS Code extension host (node + vscode API)",
    dotnet: ".NET (native host or lazy dotnet WASM — deferred)",
    android: "an Android runtime (host device/emulator — external)",
    ios: "an iOS runtime (macOS Virtualization.framework bridge — R13)",
    webext: "a browser extension host (install as extension — external)",
    "js-bedrock": "the Minecraft Bedrock scripting API (game host)",
    love: "the LÖVE engine (love.js lazy module — deferred)",
    posix: "a POSIX shell (host system)",
    kml: "a KML viewer (map renderer — convert to text instead)",
    document: "a document viewer (convert to text instead)",
    none: "no runtime (not a runnable package)",
  };

  /**
   * Run a package/source blob. `bytes` is the raw file; the manifest is
   * recomputed by inspect() when not supplied.
   * Returns {ok, runtime, stdout[], stderr[], external?}.
   */
  async function run(bytes, opts) {
    const b = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
    const info = await inspect(b, opts && opts.format);
    const m = info.manifest;
    if (!m) return { ok: false, runtime: "none", stdout: [], stderr: ["manifest failed"] };
    const runtime = m.runtime;
    if (!m.executable) {
      return { ok: false, runtime, stdout: [], stderr: ["not executable"], external: EXTERNAL[runtime] || EXTERNAL.none };
    }
    const source = entrySource(m, b);
    switch (runtime) {
      case "js":
        return { runtime, ...(await runJsWorker(source, opts)) };
      case "python":
        try {
          return { runtime, ...(await runPython(source, opts)) };
        } catch (e) {
          return { ok: false, runtime, stdout: [], stderr: [String(e)], external: "Pyodide (lazy load failed — offline?)" };
        }
      case "lua":
        try {
          return { runtime, ...(await runLua(source, opts)) };
        } catch (e) {
          return { ok: false, runtime, stdout: [], stderr: [String(e)], external: "wasmoon (lazy load failed — offline?)" };
        }
      default:
        return { ok: false, runtime, stdout: [], stderr: ["requires " + (EXTERNAL[runtime] || runtime)], external: EXTERNAL[runtime] || runtime };
    }
  }

  return { inspect, catalog, capabilities, run, RUNTIME_URLS };
})();

if (typeof module !== "undefined" && module.exports) module.exports = ZipApp;
if (typeof self !== "undefined") self.ZipApp = ZipApp;
