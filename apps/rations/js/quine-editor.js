// QuineEditor — vendored CodeMirror 6 self-edit surface for quine.html.
// The CM6 bundle ships gzip'd as base64 (js/vendor/cm6.bundle.b64.js,
// ~92KB gz / ~277KB source) and is inflated via DecompressionStream at
// first use. API: open(container, doc) → view, getText(), isOpen(), close().
const QuineEditor = (function () {
  "use strict";

  let cm6 = null;
  let loading = null;
  let view = null;

  function b64ToBytes(b64) {
    const bin = atob(b64);
    const out = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
    return out;
  }

  // Inflate the vendored bundle and eval it into global scope (CM6).
  async function loadCM6() {
    if (cm6) return cm6;
    if (loading) return loading;
    loading = (async () => {
      if (typeof CM6_GZ_B64 === "undefined") {
        throw new Error("cm6.bundle.b64.js not loaded");
      }
      const gz = b64ToBytes(CM6_GZ_B64);
      const ds = new DecompressionStream("gzip");
      const text = await new Response(
        new Blob([gz]).stream().pipeThrough(ds)
      ).text();
      // classic <script> element → global var CM6 (CSP-safe: no eval)
      const s = document.createElement("script");
      s.textContent = text;
      document.head.appendChild(s);
      cm6 = (typeof CM6 !== "undefined") ? CM6 : null;
      if (!cm6 || !cm6.EditorView) throw new Error("CM6 bundle eval failed");
      return cm6;
    })();
    try {
      return await loading;
    } finally {
      loading = null;
    }
  }

  /**
   * Open the editor in `container` with initial document `doc`.
   * Idempotent: re-opening focuses the existing view and (optionally)
   * replaces its content when `doc` is provided.
   */
  async function open(container, doc) {
    const cm = await loadCM6();
    if (view) {
      if (typeof doc === "string" && doc !== view.state.doc.toString()) {
        view.dispatch({ changes: { from: 0, to: view.state.doc.length, insert: doc } });
      }
      view.focus();
      return view;
    }
    view = new cm.EditorView({
      doc: doc || "",
      extensions: cm.baseExtensions,
      parent: container,
    });
    view.focus();
    return view;
  }

  function getText() {
    return view ? view.state.doc.toString() : null;
  }

  function isOpen() { return view !== null; }

  function close() {
    if (view) { view.destroy(); view = null; }
  }

  return { loadCM6, open, getText, isOpen, close };
})();

if (typeof module !== "undefined" && module.exports) {
  module.exports = QuineEditor;
}
