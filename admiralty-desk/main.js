/* admiralty-desk/main.js — the Admiralty's own machine.

   A full-screen Electron shell that serves site/ from an embedded
   loopback static server and loads the covenant. Same desk code, same
   hardening — the Electron process IS the workstation, not a browser
   tab into someone else's session.

   Design decisions, recorded honestly:
   - Embedded server on a FIXED port (8901) so localStorage's origin
     (http://127.0.0.1:8901) is stable across restarts — an ephemeral
     port would orphan the founding key every launch.
   - The embedded desk is its own identity store — the browser desk on
     :8080 is a different device under the doctrine. Found here and this
     seat is the flag desk.
   - Headers mirror tools/serve.py exactly: same CSP, same refusals.
   - contextIsolation + sandbox + no nodeIntegration: the renderer is
     the same untrusted-by-default surface as the browser desk. */

"use strict";
const { app, BrowserWindow, dialog, ipcMain } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const SITE = path.resolve(__dirname, "..", "site");
const PORT = 8901;
const HOST = "127.0.0.1";

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".py": "text/x-python",
  ".woff": "font/woff", ".woff2": "font/woff2",
};

const HEADERS = {
  "X-Content-Type-Options": "nosniff",
  "X-Frame-Options": "SAMEORIGIN",
  "Referrer-Policy": "no-referrer",
  "Cross-Origin-Opener-Policy": "same-origin",
  "Content-Security-Policy":
    "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; " +
    "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
    "font-src 'self' data:; connect-src 'self' http://127.0.0.1:8765 http://localhost:8765 ws: wss:; " +
    "object-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; " +
    "frame-ancestors 'self'; frame-src 'none'; form-action 'none'; " +
    "base-uri 'none'",
};

/* hardened static handler — GET/HEAD only, no listing, no traversal */
function serve(req, res) {
  if (req.method !== "GET" && req.method !== "HEAD") {
    res.writeHead(501, HEADERS); res.end(); return;
  }
  let p;
  try { p = decodeURIComponent(new URL(req.url, "http://x").pathname); }
  catch (e) { res.writeHead(400, HEADERS); res.end(); return; }
  const fp = path.normalize(path.join(SITE, p));
  if (!fp.startsWith(SITE + path.sep) && fp !== SITE) {
    res.writeHead(404, HEADERS); res.end(); return;
  }
  let file = fp;
  const st = fs.existsSync(file) ? fs.statSync(file) : null;
  if (st && st.isDirectory()) {
    const idx = path.join(file, "index.html");
    if (fs.existsSync(idx)) file = idx;
    else { res.writeHead(403, HEADERS); res.end(); return; }
  } else if (!st || !st.isFile()) {
    res.writeHead(404, HEADERS); res.end(); return;
  }
  const ext = path.extname(file).toLowerCase();
  const h = Object.assign({}, HEADERS,
    { "Content-Type": MIME[ext] || "application/octet-stream" });
  if ([".wasm", ".json", ".html"].includes(ext)) h["Cache-Control"] = "no-store";
  const body = fs.readFileSync(file);
  res.writeHead(200, Object.assign({ "Content-Length": body.length }, h));
  req.method === "HEAD" ? res.end() : res.end(body);
}

const gotLock = app.requestSingleInstanceLock();
if (!gotLock) { app.quit(); }
else {
  let server = null, win = null;

  app.whenReady().then(() => {
    server = http.createServer(serve);
    server.on("error", (e) => {
      dialog.showErrorBox("FANO-1 — Admiralty Desk",
        "Port " + PORT + " is occupied. Another desk server may be running.\n\n" + e.message);
      app.quit();
    });
    server.listen(PORT, HOST, () => {
      win = new BrowserWindow({
        fullscreen: true,
        autoHideMenuBar: true,
        backgroundColor: "#0d141b",
        title: "FANO-1 // ADMIRALTY DESK",
        webPreferences: {
          preload: path.join(__dirname, "preload.js"),
          contextIsolation: true,
          nodeIntegration: false,
          sandbox: true,
          /* a single stable origin: the founding key persists in the
             app's own storage partition, sealed by the credential */
          partition: "persist:admiralty",
        },
      });
      win.webContents.setWindowOpenHandler(() => ({ action: "deny" }));
      win.webContents.on("will-navigate", (e, url) => {
        if (!url.startsWith(`http://${HOST}:${PORT}/`)) e.preventDefault();
      });
      /* window-scoped controls — before-input-event only fires while
         the desk has focus, so we never steal keys from other apps:
           F11          toggle full-screen
           Esc          leave full-screen (never quits — the desk itself
                        doesn't bind Esc, so the key is free)
           Ctrl+Shift+Q quit the workstation
           Ctrl+M       minimize the workstation   */
      win.webContents.on("before-input-event", (e, input) => {
        if (input.type !== "keyDown") return;
        if (input.key === "F11") {
          win.setFullScreen(!win.isFullScreen()); e.preventDefault();
        } else if (input.key === "Escape" && win.isFullScreen()) {
          win.setFullScreen(false); e.preventDefault();
        } else if (input.control && input.shift && input.key.toLowerCase() === "q") {
          app.quit();
        } else if (input.control && input.key.toLowerCase() === "m") {
          win.minimize(); e.preventDefault();
        }
      });
      /* start-menu bridge: the desk UI calls these via ADMIRALTY_DESK */
      ipcMain.handle("desk:quit", () => app.quit());
      ipcMain.handle("desk:minimize", () => win && win.minimize());
      ipcMain.handle("desk:fullscreen", () => {
        if (win) win.setFullScreen(!win.isFullScreen());
      });
      win.loadURL(`http://${HOST}:${PORT}/index.html`);
      win.on("closed", () => { win = null; });
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { if (server) server.close(); });
}
