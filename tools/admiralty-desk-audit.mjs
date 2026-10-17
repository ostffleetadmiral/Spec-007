#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const DESK = path.join(ROOT, "admiralty-desk");
const DESK_SH = path.join(DESK, "desk.sh");
const MAIN = path.join(DESK, "main.js");
const PRELOAD = path.join(DESK, "preload.js");
const BOUNDARY = path.join(DESK, "boundary.js");
const PACKAGE = path.join(DESK, "package.json");
const LOCK = path.join(DESK, "package-lock.json");
const ELECTRON = path.join(DESK, "node_modules", "electron", "dist", "electron");
const OUT = path.join(ROOT, "site", "assets", "admiralty-desk-audit.json");
const EXPECTED_ELECTRON = "44.7.0";
const require = createRequire(import.meta.url);
const B = require(BOUNDARY);

const results = [];
const check = (id, ok, detail) => {
  results.push({ id, ok: !!ok, detail });
  console.log(`  ${ok ? "PASS" : "FAIL"}  ${id}  ${detail}`);
};
const sha256 = p => crypto.createHash("sha256").update(fs.readFileSync(p)).digest("hex");
const read = p => fs.readFileSync(p, "utf8");
const run = (cmd, args, opts = {}) => spawnSync(cmd, args, {
  cwd: ROOT, encoding: "utf8", timeout: 30_000, ...opts,
});

console.log("admiralty-desk audit — Electron workstation boundary\n");

{
  const files = [DESK_SH, MAIN, PRELOAD, BOUNDARY, PACKAGE, LOCK, ELECTRON];
  check("ADESK-00 component-surface",
    files.every(fs.existsSync) && (fs.statSync(DESK_SH).mode & 0o111) !== 0,
    "launcher, main process, preload, shared boundary, manifest, lockfile, and Electron binary are present; launcher is executable");
}

{
  const src = read(DESK_SH);
  const lines = src.split("\n");
  check("ADESK-01 launcher-environment",
    lines[0] === "#!/bin/sh" &&
    src.includes("cd \"$(dirname \"$0\")\"") &&
    src.includes("exec env -u ELECTRON_RUN_AS_NODE ./node_modules/electron/dist/electron . \"$@\""),
    "POSIX launcher enters its own directory and execs Electron with ELECTRON_RUN_AS_NODE stripped");
}

{
  const clean = run("env", ["-u", "ELECTRON_RUN_AS_NODE", ELECTRON, "--version"]);
  const poisoned = run("env", ["ELECTRON_RUN_AS_NODE=1", ELECTRON, "--version"]);
  check("ADESK-02 electron-runtime-floor",
    clean.status === 0 && clean.stdout.trim() === `v${EXPECTED_ELECTRON}` &&
    poisoned.status === 0 && poisoned.stdout.trim() !== clean.stdout.trim(),
    `${EXPECTED_ELECTRON} binary launches cleanly; poisoned NODE mode reports ${poisoned.stdout.trim() || "no version"} and cannot masquerade as Electron`);
}

{
  const pkg = JSON.parse(read(PACKAGE));
  const lock = JSON.parse(read(LOCK));
  const installed = JSON.parse(read(path.join(DESK, "node_modules", "electron", "package.json")));
  const electronLock = lock.packages?.["node_modules/electron"];
  check("ADESK-03 package-and-lock",
    pkg.name === "admiralty-desk" && pkg.main === "main.js" &&
    pkg.scripts?.start === "sh desk.sh" && pkg.scripts?.desk === "sh desk.sh" &&
    pkg.devDependencies?.electron === EXPECTED_ELECTRON &&
    lock.lockfileVersion === 3 && lock.packages?.[""]?.devDependencies?.electron === EXPECTED_ELECTRON &&
    electronLock?.version === EXPECTED_ELECTRON &&
    typeof electronLock?.resolved === "string" &&
    typeof electronLock?.integrity === "string" &&
    electronLock.integrity.startsWith("sha512-") &&
    installed.version === EXPECTED_ELECTRON,
    `package manifest, npm lockfile, registry integrity, and installed Electron all pin ${EXPECTED_ELECTRON}`);
}

{
  const syntax = [MAIN, PRELOAD, BOUNDARY].every(p => run("node", ["--check", p]).status === 0);
  const mainSrc = read(MAIN);
  const preloadSrc = read(PRELOAD);
  const boundarySrc = read(BOUNDARY);
  check("ADESK-04 module-boundary",
    syntax && mainSrc.includes('require("./boundary")') &&
    !preloadSrc.includes('require("./boundary")') &&
    !boundarySrc.includes("require(") &&
    !mainSrc.includes("shell.openExternal"),
    "all three desk modules parse; the shared boundary is CommonJS, preload stays Electron-only, and main never opens external URLs");
}

{
  const expectedHeaders = {
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "SAMEORIGIN",
    "Referrer-Policy": "no-referrer",
    "Cross-Origin-Opener-Policy": "same-origin",
    "Content-Security-Policy":
      "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
      "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
      "font-src 'self' data:; connect-src 'self' http://127.0.0.1:8765 http://localhost:8765 ws: wss:; " +
      "object-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; " +
      "frame-ancestors 'self'; frame-src 'self' http://127.0.0.1:* http://localhost:*; " +
      "form-action 'none'; base-uri 'none'",
  };
  check("ADESK-05 serve-header-parity",
    JSON.stringify(B.HEADERS) === JSON.stringify(expectedHeaders) &&
    read(path.join(ROOT, "tools", "serve.py")).includes("frame-src 'self' http://127.0.0.1:* http://localhost:*"),
    "embedded desk headers are byte-identical to the serve.py security posture, including governed loopback frame sources");
}

{
  const src = read(MAIN);
  check("ADESK-06 static-server-boundary",
    src.includes('req.method !== "GET" && req.method !== "HEAD"') &&
    src.includes("decodeURIComponent(new URL(req.url") &&
    src.includes("path.normalize(path.join(SITE, p))") &&
    src.includes("fp.startsWith(SITE + path.sep)") &&
    src.includes('res.writeHead(403, HEADERS)') &&
    src.includes('h["Cache-Control"] = "no-store"'),
    "GET/HEAD only, decoded URL normalization, traversal refusal, no directory listing, and no-store live artifacts");
}

{
  const src = read(MAIN);
  const required = [
    "contextIsolation: true", "nodeIntegration: false", "sandbox: true",
    'partition: "persist:admiralty"', 'preload: path.join(__dirname, "preload.js")',
  ];
  const banned = [
    "contextIsolation: false", "nodeIntegration: true", "sandbox: false",
    "webSecurity: false", "allowRunningInsecureContent: true",
    "nodeIntegrationInSubFrames: true", "webviewTag: true",
  ];
  check("ADESK-07 browserwindow-hardening",
    required.every(x => src.includes(x)) && banned.every(x => !src.includes(x)),
    "renderer is sandboxed, context-isolated, Node-free, and bound to the persistent admiralty partition");
}

{
  const src = read(MAIN);
  check("ADESK-08 navigation-and-window-policy",
    src.includes('setWindowOpenHandler(() => ({ action: "deny" }))') &&
    src.includes('win.webContents.on("will-navigate"') &&
    src.includes("!B.isDeskUrl(url)") &&
    src.includes('perm === "pointerLock" || perm === "clipboard-sanitized-write"') &&
    src.includes("B.isDeskUrl(wc.getURL())"),
    "new windows deny, top-frame navigation remains desk-origin, and sensitive permissions stay scoped to the desk URL");
}

{
  const mainSrc = read(MAIN);
  const preloadSrc = read(PRELOAD);
  const mainChannels = [...mainSrc.matchAll(/ipcMain\.handle\("([^"]+)"/g)].map(m => m[1]).sort();
  const preloadChannels = [...preloadSrc.matchAll(/"(desk:[^"]+)"/g)].map(m => m[1]).sort();
  check("ADESK-09 ipc-channel-contract",
    JSON.stringify(mainChannels) === JSON.stringify([
      "desk:clip-read", "desk:clip-write", "desk:fullscreen", "desk:minimize", "desk:quit",
    ]) && JSON.stringify(mainChannels) === JSON.stringify(preloadChannels) &&
    (mainSrc.match(/B\.isDeskIpcEvent\(e\)/g) || []).length === mainChannels.length,
    "preload exposes exactly five one-method IPC calls, and every main handler validates the trusted sender frame");
}

{
  const ownFrame = { url: `${B.ORIGIN}/index.html`, parent: null };
  const subFrame = { url: `${B.ORIGIN}/doc.html`, parent: { url: `${B.ORIGIN}/index.html` } };
  const organFrame = { url: "http://127.0.0.1:3000/", parent: { url: `${B.ORIGIN}/index.html` } };
  const remoteFrame = { url: "https://desk.invalid/", parent: null };
  check("ADESK-10 trusted-frame-gate",
    B.isDeskIpcEvent({ senderFrame: ownFrame }) &&
    !B.isDeskIpcEvent({ senderFrame: subFrame }) &&
    !B.isDeskIpcEvent({ senderFrame: organFrame }) &&
    !B.isDeskIpcEvent({ senderFrame: remoteFrame }) &&
    !B.isDeskIpcEvent({}) &&
    B.isDeskUrl(`${B.ORIGIN}/deep/path?q=1`) &&
    !B.isDeskUrl("https://127.0.0.1:8901/index.html") &&
    !B.isDeskUrl("http://127.0.0.1:8901.evil.invalid/"),
    "IPC accepts only the desk top frame; subframes, loopback organs, remote origins, malformed senders, and origin-suffix tricks refuse");
}

{
  const cap = B.CLIPBOARD_TEXT_CAP_BYTES;
  check("ADESK-11 clipboard-boundary",
    B.isClipboardText("") && B.isClipboardText("☭".repeat(16)) &&
    B.isClipboardText("x".repeat(cap)) &&
    !B.isClipboardText("x".repeat(cap + 1)) &&
    !B.isClipboardText({ toString: () => "forged" }) &&
    !B.isClipboardText(null),
    "clipboard writes require real strings and are bounded to 1 MiB; object coercion cannot smuggle payloads");
}

{
  check("ADESK-12 governed-frame-policy",
    B.isAllowedFrameUrl(`${B.ORIGIN}/dossier.html`) &&
    B.isAllowedFrameUrl("http://127.0.0.1:3000/") &&
    B.isAllowedFrameUrl("http://localhost:3000/") &&
    !B.isAllowedFrameUrl("https://127.0.0.1:3000/") &&
    !B.isAllowedFrameUrl("http://127.0.0.2:3000/") &&
    !B.isAllowedFrameUrl("file:///etc/passwd") &&
    !B.isAllowedFrameUrl("data:text/html,<script></script>"),
    "same-origin desk documents and governed loopback organs can frame; HTTPS masquerade, non-loopback localhost labels, file:, and data: refuse");
}

{
  const allowedOctet = new Set([".o", ".sha256", ".nojekyll"]);
  const missing = [];
  const walk = dir => {
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      const p = path.join(dir, ent.name);
      if (ent.isDirectory()) walk(p);
      else {
        const ext = path.extname(ent.name).toLowerCase() ||
          (ent.name.startsWith(".") ? ent.name.toLowerCase() : "");
        if (!B.MIME[ext] && !allowedOctet.has(ext)) missing.push(path.relative(ROOT, p));
      }
    }
  };
  walk(path.join(ROOT, "site"));
  check("ADESK-13 mime-coverage",
    missing.length === 0 && B.MIME[".mp4"] === "video/mp4",
    missing.length ? `unmapped extension(s): ${missing.join(",")}` : "every published extension maps to an explicit MIME type or bounded octet-stream class");
}

{
  const src = `${read(MAIN)}\n${read(PRELOAD)}\n${read(BOUNDARY)}\n${read(DESK_SH)}`;
  const banned = [
    /(?<![.$\w])(?:window\.)?(?:prompt|alert|confirm)\s*\(/,
    /child_process|exec\(|spawn\(|fork\(/,
    /eval\(|new Function|setTimeout\s*\(\s*["'`]/,
  ];
  const hits = banned.filter(re => re.test(src));
  check("ADESK-14 renderer-privilege-floor",
    hits.length === 0,
    "desk shell carries no native dialogs, process spawning, eval, Function construction, or string timers");
}

const sourcePins = Object.fromEntries([
  "admiralty-desk/desk.sh",
  "admiralty-desk/main.js",
  "admiralty-desk/preload.js",
  "admiralty-desk/boundary.js",
  "admiralty-desk/package.json",
  "admiralty-desk/package-lock.json",
  "tools/admiralty-desk-audit.mjs",
].map(rel => [rel, sha256(path.join(ROOT, rel))]));
const failures = results.filter(r => !r.ok);
const artifact = {
  schema: "ADMIRALTY-DESK-AUDIT-v1",
  component: "admiralty-desk/",
  generated: new Date().toISOString(),
  contract: {
    electron: EXPECTED_ELECTRON,
    origin: B.ORIGIN,
    clipboard_text_cap_bytes: B.CLIPBOARD_TEXT_CAP_BYTES,
    ipc_channels: ["desk:clip-read", "desk:clip-write", "desk:fullscreen", "desk:minimize", "desk:quit"],
    frame_policy: "self + governed loopback organs only; IPC top-frame only",
    security_boundary: "Electron workstation shell — no remote execution or full-Node renderer claim",
  },
  source_sha256: sourcePins,
  checks: results,
  verdict: failures.length === 0 ? "GREEN" : "FAIL",
};
const stable = ({ generated, ...rest }) => rest;
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify(artifact, null, 2) + "\n");
  console.log(`admiralty-desk report → ${OUT}`);
}
if (process.argv.includes("--verify")) {
  const prior = fs.existsSync(OUT) ? JSON.parse(read(OUT)) : null;
  const drift = !prior || JSON.stringify(stable(prior)) !== JSON.stringify(stable(artifact));
  check("ADESK-15 evidence-parity", !drift,
    "committed audit projection matches this source surface and check vector");
}
console.log(`\n${failures.length === 0 && !process.argv.includes("--verify") ? "ADMIRALTY-DESK: all checks green" : results.some(r => !r.ok) ? `ADMIRALTY-DESK: ${results.filter(r => !r.ok).length} FAILURE(S)` : "ADMIRALTY-DESK: all checks green"}`);
process.exit(results.every(r => r.ok) ? 0 : 1);
