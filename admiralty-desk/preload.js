/* preload.js — the thin bridge between Electron and the desk.
   The renderer stays sandboxed; it sees only this surface. */
"use strict";
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("ADMIRALTY_DESK", {
  shell: "electron",
  version: "1.0.0",
  /* the desk knows it's running on dedicated hardware, not a tab —
     apps can check window.ADMIRALTY_DESK to show shell-specific hints */
  isDesk: true,
  quit: () => ipcRenderer.invoke("desk:quit"),
  minimize: () => ipcRenderer.invoke("desk:minimize"),
  toggleFullscreen: () => ipcRenderer.invoke("desk:fullscreen"),
});
