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
const { app, BrowserWindow, dialog, ipcMain, Menu, MenuItem, clipboard, session } = require("electron");
const http = require("http");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");
const B = require("./boundary");

const SITE = path.resolve(__dirname, "..", "site");
const PORT = B.PORT;
const HOST = B.HOST;
const MIME = B.MIME;
const HEADERS = B.HEADERS;

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
    /* a real OS clipboard: the Edit menu's roles install the standard
       accelerators (Ctrl+C/X/V/A) app-wide — autoHideMenuBar keeps the
       chrome invisible while the shortcuts stay live */
    Menu.setApplicationMenu(Menu.buildFromTemplate([{
      label: "Desk",
      submenu: [
        { role: "cut" }, { role: "copy" }, { role: "paste" },
        { role: "selectAll" }, { type: "separator" },
        { role: "reload" }, { role: "togglefullscreen" },
        { role: "minimize" }, { role: "quit" },
      ],
    }]));
    /* pointer-lock (mouse capture) — games and sandboxes may grab the
       cursor; only our own origin, everything else denied */
    session.defaultSession.setPermissionRequestHandler((wc, perm, cb) => {
      const own = B.isDeskUrl(wc.getURL());
      cb(own && (perm === "pointerLock" || perm === "clipboard-sanitized-write"));
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
      /* right-click — the OS-native edit menu, only where it applies:
         editable fields get cut/copy/paste/select-all; a selection on
         plain glass gets copy */
      win.webContents.on("context-menu", (e, p) => {
        const m = new Menu();
        if (p.isEditable) {
          m.append(new MenuItem({ role: "cut", enabled: p.editFlags.canCut }));
          m.append(new MenuItem({ role: "copy", enabled: p.editFlags.canCopy }));
          m.append(new MenuItem({ role: "paste", enabled: p.editFlags.canPaste }));
          m.append(new MenuItem({ type: "separator" }));
          m.append(new MenuItem({ role: "selectAll" }));
        } else if (p.selectionText && p.selectionText.length) {
          m.append(new MenuItem({ role: "copy" }));
        }
        if (m.items.length) m.popup({ window: win });
      });
      /* clipboard bridge — the desk UI writes tokens straight to the
         system clipboard via ADMIRALTY_DESK.clipboard */
      ipcMain.handle("desk:clip-write", (e, t) => {
        if (!B.isDeskIpcEvent(e) || !B.isClipboardText(t)) return false;
        clipboard.writeText(t); return true;
      });
      ipcMain.handle("desk:clip-read", (e) => {
        if (!B.isDeskIpcEvent(e)) return "";
        return clipboard.readText();
      });
      win.webContents.on("will-navigate", (e, url) => {
        if (!B.isDeskUrl(url)) e.preventDefault();
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
      ipcMain.handle("desk:quit", (e) => {
        if (B.isDeskIpcEvent(e)) app.quit();
      });
      ipcMain.handle("desk:minimize", (e) => {
        if (B.isDeskIpcEvent(e) && win) win.minimize();
      });
      ipcMain.handle("desk:fullscreen", (e) => {
        if (B.isDeskIpcEvent(e) && win) win.setFullScreen(!win.isFullScreen());
      });
      win.loadURL(`${B.ORIGIN}/index.html`);
      win.on("closed", () => { win = null; });
    });
  });

  app.on("window-all-closed", () => app.quit());
  app.on("will-quit", () => { if (server) server.close(); });
}
