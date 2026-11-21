#!/usr/bin/env python3
# fano_beacon.py — sealed rendezvous beacon for fleet peers.
#
# Sends FLEET-BEACON:<name> as a sealed 136-B Fano packet to the anchor's
# UDP6 edge. The gateway verifies the seal, then records OUR OBSERVED
# source address — the rendezvous binding is the verified packet's return
# path, not any name. Identity is cryptographic; location is measured.
#
#   python3 fano_beacon.py --as sheraton --to 2607:fb91:3a11:bafb::a1c \
#                          --port 9779 [--interval 30]
import socket, sys, time, argparse
from fano_dialect import build, verify

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--as", dest="name", required=True)
    ap.add_argument("--to", required=True, help="anchor v6 (or v4) address")
    ap.add_argument("--port", type=int, default=9779)
    ap.add_argument("--interval", type=float, default=0, help="0 = single beacon")
    ap.add_argument("--seq", type=int, default=0xBEC0)
    a = ap.parse_args()

    payload = f"FLEET-BEACON:{a.name}".encode()
    assert len(payload) <= 64, "beacon payload exceeds FANO_CAP"
    wire = build(0, 0, 0, 7, 7, 7, a.seq, payload)   # src cell [0,0,0] = rendezvous origin
    assert verify(wire)

    family = socket.AF_INET6 if ":" in a.to else socket.AF_INET
    s = socket.socket(family, socket.SOCK_DGRAM)
    s.settimeout(5)

    n = 0
    while True:
        n += 1
        s.sendto(wire, (a.to, a.port))
        try:
            data, src = s.recvfrom(4096)
            ok = verify(data)
            plen = data[39]
            body = data[40:40+plen]
            print(f"[{n}] beacon {a.name} → {a.to}:{a.port}  "
                  f"ack={'sealed:' + body.decode(errors='replace') if ok else 'UNSEALED'}", flush=True)
        except socket.timeout:
            print(f"[{n}] beacon {a.name} → {a.to}:{a.port}  no ack", flush=True)
        if not a.interval: break
        time.sleep(a.interval)

if __name__ == "__main__":
    main()
