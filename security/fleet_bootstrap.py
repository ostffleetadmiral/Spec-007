#!/usr/bin/env python3
# fleet_bootstrap.py — fetch + verify the fleet bulletin from the public
# GitHub bulletin board (raw.githubusercontent.com — globally replicated,
# carrier-unblocked, zero hosting of ours).
#
# The board is UNTRUSTED transport: the manifest's ed25519 signature is
# checked against the pinned fleet pubkey before any address is believed.
#
#   python3 fleet_bootstrap.py                    # fetch + verify + update
#   python3 fleet_bootstrap.py --print            # verify only, no write
#
# Env: FLEET_PUBKEY  (default ~/.config/fleet/ed25519.pub.pem)
#      FLEET_MANIFEST_URL (default raw.githubusercontent canonical)
import json, sys, os, time, base64, urllib.request, argparse

URL = os.environ.get("FLEET_MANIFEST_URL",
  "https://raw.githubusercontent.com/ostffleetadmiral/Spec-007/main/fleet-manifest.json")
PUB = os.environ.get("FLEET_PUBKEY",
  os.path.expanduser("~/.config/fleet/ed25519.pub.pem"))

def b64url_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", dest="dry", action="store_true")
    a = ap.parse_args()

    if not os.path.exists(PUB):
        sys.exit(f"no pinned pubkey at {PUB} — fleet trust anchor missing")
    from cryptography.hazmat.primitives.serialization import load_pem_public_key
    pk = load_pem_public_key(open(PUB, "rb").read())

    req = urllib.request.Request(URL, headers={"Cache-Control": "no-cache"})
    manifest = json.loads(urllib.request.urlopen(req, timeout=15).read())

    payload = manifest["payload"]
    # canonical re-serialize — must byte-match JS JSON.stringify(…, null, 2)
    body = json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")
    try:
        pk.verify(b64url_decode(manifest["sig_ed25519"]), body)
    except Exception as e:
        sys.exit(f"SIGNATURE REJECTED — bulletin untrusted: {e}")
    print(f"manifest verified (pubkey {manifest.get('pubkey_hint','?')}, "
          f"ts {payload['ts']})", flush=True)

    for name, m in payload.get("members", {}).items():
        print(f"  {name}: role={m.get('role')} addr={m.get('addr') or m.get('gateway_udp6') or m.get('v6_global')}",
              flush=True)

    if a.dry: return
    rv_path = os.path.expanduser("~/.config/fleet/rendezvous.json")
    os.makedirs(os.path.dirname(rv_path), exist_ok=True)
    rv = {}
    try: rv = json.load(open(rv_path))
    except Exception: pass
    for name, m in payload.get("members", {}).items():
        addr = m.get("addr") or m.get("gateway_udp6")
        if not addr: continue
        if addr.startswith("["):
            host, _, port = addr[1:].partition("]:")   # [v6]:port
        else:
            host, _, port = addr.rpartition(":")       # v4:port
        p = rv.get(name, {"count": 0, "firstSeen": payload["ts"]})
        p.update(addr=host, port=int(port), lastSeen=payload["ts"],
                 source="fleet-manifest", count=p.get("count", 0) + 1)
        rv[name] = p
    json.dump(rv, open(rv_path, "w"), indent=2)
    print(f"rendezvous updated → {rv_path}")

if __name__ == "__main__":
    main()
