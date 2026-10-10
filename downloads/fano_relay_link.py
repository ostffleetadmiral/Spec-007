#!/usr/bin/env python3
# fano_relay_link.py — Fano dialect over a Rations-style WS relay.
#
# The relay is outbound-only for clients: every peer dials ws://anchor/ws
# and the hub fans frames out to all others. Identity stays inside the
# sealed 136-B packet — the relay is a dumb pipe that never sees trust.
#
# Frame envelope: b"F1" + 136-B wire packet (binary WS frame).
#
# Modes:
#   --forward HOST:PORT   gateway role: verified frames → UDP to mesh node
#   --send PAYLOAD        node role: seal+send one packet, print acks
#   --beacon NAME         node role: FLEET-BEACON through the relay
#   --listen              node role: just receive+verify frames
#
# Zero deps — stdlib WebSocket client (works on sheraton's py3.10 too).
import socket, sys, time, struct, base64, os, argparse, threading
from fano_dialect import build, verify, FANO_WIRE

MAGIC = b"F1"

class WS:
    """minimal RFC6455 client: binary frames, masking, ping/pong"""
    def __init__(self, url, timeout=10):
        assert url.startswith("ws://")
        hostport, _, pth = url[5:].partition("/")
        host, _, prt = hostport.partition(":")
        port = int(prt or 80)
        if host.startswith("["):           # v6 literal
            host, _, prt = hostport[1:].partition("]")
            port = int(prt[1:] or 80)
        fam = socket.AF_INET6 if ":" in host else socket.AF_INET
        self.s = socket.socket(fam, socket.SOCK_STREAM)
        self.s.settimeout(timeout)
        self.s.connect((host, port))
        key = base64.b64encode(os.urandom(16)).decode()
        req = (f"GET /{pth} HTTP/1.1\r\nHost: {hostport}\r\n"
               "Upgrade: websocket\r\nConnection: Upgrade\r\n"
               f"Sec-WebSocket-Key: {key}\r\nSec-WebSocket-Version: 13\r\n\r\n")
        self.s.sendall(req.encode())
        resp = b""
        while b"\r\n\r\n" not in resp:
            resp += self.s.recv(4096)
        assert b"101" in resp.split(b"\r\n", 1)[0], resp[:120]
        self.s.settimeout(None)   # handshake done — recv blocks forever

    def send(self, data: bytes):
        hdr = bytearray([0x82])                     # FIN|binary
        n = len(data)
        if n < 126: hdr.append(0x80 | n)
        elif n < 65536: hdr += bytes([0x80 | 126]) + struct.pack(">H", n)
        else: hdr += bytes([0x80 | 127]) + struct.pack(">Q", n)
        mask = os.urandom(4); hdr += mask
        self.s.sendall(bytes(hdr) + bytes(b ^ mask[i % 4] for i, b in enumerate(data)))

    def _exact(self, n):
        b = b""
        while len(b) < n:
            c = self.s.recv(n - len(b))
            if not c: raise ConnectionError("ws closed")
            b += c
        return b

    def recv(self):
        """next binary payload (handles ping→pong, ignores text/ctl)"""
        while True:
            h = self._exact(2)
            fin_op, ln = h[0], h[1] & 0x7f
            if ln == 126: ln = struct.unpack(">H", self._exact(2))[0]
            elif ln == 127: ln = struct.unpack(">Q", self._exact(8))[0]
            if h[1] & 0x80: self._exact(4)          # server frames unmasked
            data = self._exact(ln)
            op = fin_op & 0x0f
            if op == 0x9:                          # ping → pong
                ph = bytearray([0x8a])
                if ln < 126: ph.append(0x80 | ln)
                else: ph += bytes([0x80|126]) + struct.pack(">H", ln)
                mask = os.urandom(4); ph += mask
                self.s.sendall(bytes(ph) + bytes(b ^ mask[i%4] for i,b in enumerate(data)))
                continue
            if op in (0x1, 0x2): return data
            if op == 0x8: raise ConnectionError("ws close frame")

def rx_loop(ws, forward, stats):
    while True:
        try: data = ws.recv()
        except Exception as e:
            print(f"relay link closed: {e}", flush=True); return
        if not data.startswith(MAGIC): continue    # foreign traffic (rations frames)
        wire = data[2:]
        if len(wire) != FANO_WIRE or not verify(wire):
            stats["drop"] += 1; continue
        stats["ok"] += 1
        if forward:
            host, port = forward.rsplit(":", 1)
            udp = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            udp.sendto(wire, (host, int(port)))
            stats["fwd"] += 1
            print(f"fwd relay→{forward} plen={wire[39]}", flush=True)
        else:
            plen = wire[39]
            print(f"recv sealed plen={plen} body={wire[40:40+plen].decode(errors='replace')}",
                  flush=True)

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--relay", required=True)
    ap.add_argument("--forward")                    # gateway role
    ap.add_argument("--send")                       # one-shot payload
    ap.add_argument("--beacon")                     # one-shot FLEET-BEACON:<name>
    ap.add_argument("--listen", action="store_true")
    ap.add_argument("--seq", type=lambda s: int(s, 0), default=0xB5ED)
    ap.add_argument("--keepalive", type=float, default=0)
    a = ap.parse_args()

    ws = WS(a.relay)
    print(f"linked → {a.relay}", flush=True)
    stats = {"ok": 0, "drop": 0, "fwd": 0}
    t = threading.Thread(target=rx_loop, args=(ws, a.forward, stats), daemon=True)
    t.start()

    if a.send or a.beacon:
        body = (f"FLEET-BEACON:{a.beacon}" if a.beacon else a.send).encode()
        wire = build(0, 0, 0, 7, 7, 7, a.seq, body)
        assert verify(wire)
        ws.send(MAGIC + wire)
        print(f"sent sealed 136-B via relay ({body.decode()!r})", flush=True)
        if not a.keepalive: time.sleep(3)

    if a.listen or a.forward:
        while t.is_alive(): time.sleep(1)
    elif a.keepalive:
        while True: time.sleep(a.keepalive); ws.send(MAGIC + build(0,0,0,7,7,7,a.seq,b"FLEET-BEACON:ka"))
    print("stats:", stats)

if __name__ == "__main__":
    main()
