#!/usr/bin/env node
/* reboot-seed-audit.mjs — desk gate for the OSTF.UN seed landing.
   Cross-tree audit in the claims-link pattern: resolves BLUE's
   Reboot.html, verifies the inline app against THIS desk's published
   rations assets (site/apps/rations), and runs the DOM-harness
   assertions: same-origin seed verify, digest-gated preview, honest
   install/restore states, no fake-install copy.
   --verify (default): exit 1 on any failed assertion. */
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const VERIFY = process.argv.includes("--verify") || process.argv.length === 2;

/* Reboot.html lives in the BLUE tree + the deployed sheraton seedroot;
   the desk audit pins the BLUE source of truth (env override for a
   staged seedroot copy). */
const CANDIDATES = [
  process.env.REBOOT_HTML,
  "/home/admpaul/Music/BLUE/Reboot.html",
  "/run/media/admpaul/BLUE/Reboot.html",
].filter(Boolean);
const rebootPath = CANDIDATES.find((p) => fs.existsSync(p));
if (!rebootPath) {
  console.error("reboot-seed: no Reboot.html in candidates:", CANDIDATES.join(", "));
  process.exit(1);
}
const html = fs.readFileSync(rebootPath, "utf8");

const publicRations = path.join(ROOT, "site", "apps", "rations");
const projectedHtml = fs.readFileSync(path.join(publicRations, "quine.html"), "utf8");
const projectedWasm = fs.readFileSync(path.join(publicRations, "rations.wasm"));
const projectedSidecar = fs.readFileSync(path.join(publicRations, "rations.wasm.sha256"), "utf8").trim();
const projectedHash = createHash("sha256").update(projectedWasm).digest("hex");
assert.equal(projectedSidecar.split(/\s+/)[0].toLowerCase(), projectedHash);
assert.equal(projectedSidecar.split(/\s+/).at(-1), "rations.wasm");
assert.match(projectedHtml, /rations-bridge\.js/);
assert.match(projectedHtml, /rations\.wasm/);

const scriptMatch = html.match(/<script>([\s\S]*?)<\/script>/);
assert.ok(scriptMatch, "Reboot has an inline application script");

/* defaultSeedRoot must be a served root — a dev-machine absolute path
   here was the Wave-4 defect this gate exists to keep out. */
const rootMatch = html.match(/const defaultSeedRoot = "([^"]*)"/);
assert.ok(rootMatch, "defaultSeedRoot declared");
assert.equal(rootMatch[1], "/Spec-007/", "defaultSeedRoot matches the configured project Pages path");

const ids = [...html.matchAll(/\bid="([^"]+)"/g)].map((m) => m[1]);
const mkElements = () => {
  const elements = new Map();
  for (const id of ids) {
    elements.set(id, {
      id,
      textContent: "",
      style: {},
      classList: {
        values: new Set(),
        add(v) { this.values.add(v); },
        remove(v) { this.values.delete(v); },
        contains(v) { return this.values.has(v); },
      },
      addEventListener(type, handler) { this[`on${type}`] = handler; },
      click() { this.clicked = true; },
      closest() { return null; },
    });
  }
  return elements;
};

const gradient = { addColorStop() {} };
const context2d = new Proxy({
  createRadialGradient: () => gradient,
  createLinearGradient: () => gradient,
}, { get: (t, k) => (k in t ? t[k] : () => {}) });

let downloadedName = null;
let downloadedSource = null;
let revokedUrl = null;
let navigatedTo = null;
const responses = new Map();
const timers = [];
const elements = mkElements();
elements.get("globe").getContext = () => context2d;
elements.get("globeWrap").addEventListener = () => {};

const sitePrefix = rootMatch[1].replace(/\/+$/, "");
const document = {
  documentElement: { outerHTML: html },
  getElementById: (id) => elements.get(id),
  createElement() {
    return {
      click() { downloadedName = this.download; },
      set href(v) { this._href = v; },
      set download(v) { this._download = v; },
      get download() { return this._download; },
    };
  },
};
const context = {
  document,
  window: {
    innerWidth: 1280,
    innerHeight: 800,
    devicePixelRatio: 1,
    location: {
      href: `http://127.0.0.1:8899/Spec-007/?seedRoot=${encodeURIComponent(sitePrefix + "/")}`,
      origin: "http://127.0.0.1:8899",
      pathname: "/Spec-007/",
      search: `?seedRoot=${encodeURIComponent(sitePrefix + "/")}`,
      assign(v) { navigatedTo = v; },
    },
    addEventListener() {},
  },
  URLSearchParams,
  fetch: async (url, options) => {
    assert.equal(options.credentials, "same-origin");
    assert.equal(options.cache, "no-store");
    const resolved = new URL(url, context.window.location.origin);
    assert.equal(resolved.origin, context.window.location.origin, "preview fetches remain same-origin");
    const response = responses.get(resolved.pathname);
    if (!response) throw new Error(`missing fixture response: ${resolved.pathname}`);
    return response;
  },
  crypto: {
    subtle: {
      async digest(algorithm, bytes) {
        assert.equal(algorithm, "SHA-256");
        return new Uint8Array(createHash("sha256").update(new Uint8Array(bytes)).digest()).buffer;
      },
    },
  },
  URL: {
    createObjectURL(blob) { downloadedSource = blob; return "blob:reboot-seed-test"; },
    revokeObjectURL(v) { revokedUrl = v; },
  },
  Blob,
  TextEncoder,
  Math,
  Date,
  setTimeout(cb, delay = 0) { timers.push({ callback: cb, delay }); return timers.length; },
  clearTimeout() {},
  requestAnimationFrame() {},
  console,
};

vm.createContext(context);
vm.runInContext(scriptMatch[1], context, { filename: "Reboot.html" });

const wasmFixture = new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0]);
const wasmHash = createHash("sha256").update(wasmFixture).digest("hex");
const htmlFixture = "<script src=\"rations-bridge.js\"></script><code>rations.wasm</code>";
const seedPath = (rel) => `${sitePrefix}/apps/rations/${rel}`;
responses.set(seedPath("quine.html"), { ok: true, text: async () => htmlFixture });
responses.set(seedPath("rations.wasm"), { ok: true, arrayBuffer: async () => wasmFixture.buffer });
responses.set(seedPath("rations.wasm.sha256"), { ok: true, text: async () => `${wasmHash}  rations.wasm\n` });

await elements.get("btnPreview").onclick();
assert.equal(elements.get("seedStatus").textContent, "verified", elements.get("seedMessage").textContent);
assert.equal(elements.get("seedDigest").textContent, wasmHash);
assert.equal(elements.get("runtimeStatus").textContent, "RATIONS BROWSER APP · VERIFIED");
assert.equal(navigatedTo, seedPath("quine.html"));
assert.equal(elements.get("installOverlay").classList.contains("on"), false);

elements.get("btnSaveSeed").onclick();
assert.equal(downloadedName, "reboot-seed.html");
assert.ok(downloadedSource instanceof Blob);
assert.ok((await downloadedSource.text()).includes('id="btnPreview"'));
assert.equal(elements.get("toast").textContent, "Seed download requested. This does not install software.");
timers.find((t) => t.delay === 1000)?.callback();
assert.equal(revokedUrl, "blob:reboot-seed-test");

responses.set(seedPath("rations.wasm.sha256"), {
  ok: true,
  text: async () => `${"0".repeat(64)}  rations.wasm\n`,
});
navigatedTo = null;
await elements.get("btnPreview").onclick();
assert.equal(navigatedTo, null);
assert.equal(elements.get("seedStatus").textContent, "unavailable");
assert.ok(elements.get("seedMessage").textContent.includes("does not match"));

const originalWasmPath = html.match(/wasm:\s*"([^"]+)"/)[1];
const htmlCross = html.replace(originalWasmPath, "https://attacker.invalid/rations.wasm");
const crossScript = htmlCross.match(/<script>([\s\S]*?)<\/script>/)[1];
const crossElements = mkElements();
crossElements.get("globe").getContext = () => context2d;
crossElements.get("globeWrap").addEventListener = () => {};
const crossContext = {
  ...context,
  URLSearchParams,
  document: {
    documentElement: { outerHTML: htmlCross },
    getElementById: (id) => crossElements.get(id),
    createElement: document.createElement.bind(document),
  },
  window: { ...context.window, location: { ...context.window.location } },
};
vm.createContext(crossContext);
vm.runInContext(crossScript, crossContext, { filename: "Reboot-cross-origin.html" });
navigatedTo = null;
await crossElements.get("btnPreview").onclick();
assert.equal(navigatedTo, null);
assert.ok(crossElements.get("seedMessage").textContent.includes("relative"));

elements.get("btnInstall").onclick();
assert.equal(elements.get("installOverlay").classList.contains("on"), true);
assert.ok(elements.get("installMessage").textContent.includes("No verified installer"));
assert.equal(elements.get("decouple").classList.contains("on"), false);
elements.get("btnInstallClose").onclick();
assert.equal(elements.get("installOverlay").classList.contains("on"), false);

elements.get("decouple").classList.add("on");
elements.get("btnRestore").onclick();
assert.equal(elements.get("decouple").classList.contains("on"), false);
assert.equal(elements.get("toast").textContent, "Preview closed. No backup restore was performed.");

assert.doesNotMatch(html, /Installing Planetary Update|100% COMPLETE|Planetary state restored from VSF latent backup/);
console.log(`reboot-seed audit: 23 assertions PASS (${path.relative(ROOT, rebootPath)})`);
if (!VERIFY) process.exit(0);
