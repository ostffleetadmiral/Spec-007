#!/usr/bin/env python3
"""serve.py — hardened static server for the FANO-1 desk.

Replaces `python3 -m http.server` for any non-throwaway serving of site/:
  - GET/HEAD only (everything else -> 501)
  - no directory listing (dir without index.html -> 403)
  - no version banner (Server: FANO-1, not SimpleHTTP/Python x.y)
  - nosniff / SAMEORIGIN / no-referrer on every response
  - binds 127.0.0.1 by default; pass --host 0.0.0.0 to expose deliberately

Usage: python3 tools/serve.py [--root site] [--host 127.0.0.1] [--port 8080]
"""
import argparse
import http.server
import os
import sys

ROOT = os.path.dirname(os.path.abspath(__file__))


class DeskHandler(http.server.SimpleHTTPRequestHandler):
    server_version = "FANO-1"
    sys_version = ""

    def version_string(self):
        return self.server_version

    def send_response(self, code, message=None):
        # omit the Server header entirely — even a name is fingerprint surface
        self.log_request(code)
        self.send_response_only(code, message)
        self.send_header("Date", self.date_time_string())

    def log_message(self, fmt, *args):
        sys.stderr.write("%s - %s\n" % (self.address_string(), fmt % args))

    def end_headers(self):
        # live artifacts must never come back stale — the desk re-derives
        # from spec007.wasm and reads findings/inventory json per open
        if self.path.endswith((".wasm", ".json", ".html")):
            self.send_header("Cache-Control", "no-store")
        self.send_header("X-Content-Type-Options", "nosniff")
        self.send_header("X-Frame-Options", "SAMEORIGIN")
        self.send_header("Referrer-Policy", "no-referrer")
        self.send_header("Cross-Origin-Opener-Policy", "same-origin")
        # static dossier + WASM desk: no third-party anything; inline boot
        # scripts are part of the shipped pages, wasm-unsafe-eval covers the
        # rations.wasm instantiate path, ws/wss covers comms
        self.send_header("Content-Security-Policy",
            "default-src 'self'; script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval'; "
            "style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; "
            "font-src 'self' data:; connect-src 'self' http://127.0.0.1:8765 http://localhost:8765 ws: wss:; "
            "object-src 'self'; media-src 'self' blob:; worker-src 'self' blob:; "
            "frame-ancestors 'self'; frame-src 'none'; form-action 'none'; "
            "base-uri 'none'")
        super().end_headers()

    def do_PUT(self):
        self.send_error(501)

    def do_DELETE(self):
        self.send_error(501)

    def do_POST(self):
        self.send_error(501)

    def do_OPTIONS(self):
        self.send_error(501)

    def do_TRACE(self):
        self.send_error(501)

    def list_directory(self, path):
        # no listing — a directory without index.html is a 403, not a map
        self.send_error(403, "Directory listing is not issued on this desk")


def main():
    ap = argparse.ArgumentParser(description="FANO-1 desk static server")
    ap.add_argument("--root", default=os.path.join(ROOT, "..", "site"))
    ap.add_argument("--host", default="127.0.0.1")
    ap.add_argument("--port", type=int, default=8080)
    a = ap.parse_args()
    os.chdir(os.path.abspath(a.root))
    http.server.ThreadingHTTPServer.allow_reuse_address = True
    srv = http.server.ThreadingHTTPServer((a.host, a.port), DeskHandler)
    print(f"[desk] serving {os.getcwd()} on http://{a.host}:{a.port}")
    try:
        srv.serve_forever()
    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
