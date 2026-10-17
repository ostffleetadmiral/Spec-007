"use strict";

const HOST = "127.0.0.1";
const PORT = 8901;
const ORIGIN = `http://${HOST}:${PORT}`;
const CLIPBOARD_TEXT_CAP_BYTES = 1024 * 1024;

const MIME = {
  ".html": "text/html; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".json": "application/json", ".wasm": "application/wasm",
  ".svg": "image/svg+xml", ".png": "image/png", ".jpg": "image/jpeg",
  ".ico": "image/x-icon", ".pdf": "application/pdf", ".md": "text/plain; charset=utf-8",
  ".txt": "text/plain; charset=utf-8", ".py": "text/x-python",
  ".mp4": "video/mp4", ".woff": "font/woff", ".woff2": "font/woff2",
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
    "frame-ancestors 'self'; frame-src 'self' http://127.0.0.1:* http://localhost:*; " +
    "form-action 'none'; base-uri 'none'",
};

function urlOrigin(url) {
  try { return new URL(url).origin; }
  catch { return null; }
}

function isDeskUrl(url) {
  return urlOrigin(url) === ORIGIN;
}

function isDeskFrame(frame) {
  return !!frame && !frame.parent && isDeskUrl(frame.url);
}

function isDeskIpcEvent(event) {
  return isDeskFrame(event && event.senderFrame);
}

function isClipboardText(value) {
  return typeof value === "string" &&
    Buffer.byteLength(value, "utf8") <= CLIPBOARD_TEXT_CAP_BYTES;
}

function isAllowedFrameUrl(url) {
  const u = urlOrigin(url);
  if (u === ORIGIN) return true;
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" &&
      (parsed.hostname === "127.0.0.1" || parsed.hostname === "localhost");
  } catch {
    return false;
  }
}

module.exports = {
  HOST,
  PORT,
  ORIGIN,
  CLIPBOARD_TEXT_CAP_BYTES,
  MIME,
  HEADERS,
  isDeskUrl,
  isDeskFrame,
  isDeskIpcEvent,
  isClipboardText,
  isAllowedFrameUrl,
};
