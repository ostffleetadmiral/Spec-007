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
import json, sys, os, time, base64, urllib.request, argparse, hashlib

BASE = os.environ.get("FLEET_BULLETIN",
  "https://raw.githubusercontent.com/ostffleetadmiral/Spec-007/main")
URL  = os.environ.get("FLEET_MANIFEST_URL", BASE + "/fleet-manifest.json")
GEN_URL = BASE + "/fleet-genesis.json"
PUB = os.environ.get("FLEET_PUBKEY",
  os.path.expanduser("~/.config/fleet/ed25519.pub.pem"))
GEN_PIN = os.path.expanduser("~/.config/fleet/genesis.json")

def b64url_decode(s):
    return base64.urlsafe_b64decode(s + "=" * (-len(s) % 4))

def canon(payload):
    # canonical re-serialize — must byte-match JS JSON.stringify(…, null, 2)
    return json.dumps(payload, indent=2, ensure_ascii=False).encode("utf-8")

def fetch(url):
    req = urllib.request.Request(url, headers={"Cache-Control": "no-cache"})
    return json.loads(urllib.request.urlopen(req, timeout=15).read())

def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--print", dest="dry", action="store_true")
    a = ap.parse_args()

    from cryptography.hazmat.primitives.serialization import (
        load_pem_public_key, load_der_public_key)

    # --- 1. genesis: fetch, self-verify member sigs, TOFU-pin ---
    gen = fetch(GEN_URL)
    gbody = canon(gen["payload"])
    ghash = hashlib.sha256(gbody).hexdigest()
    members = {}
    for m in gen["payload"]["members"]:
        members[m["name"]] = (m["pubkey_hint"],
                              load_der_public_key(base64.b64decode(
                                  m["pubkey_pem_b64"])))
    for name, sig in gen["sigs"].items():
        try:
            members[name][1].verify(b64url_decode(sig), gbody)
        except Exception as e:
            sys.exit(f"GENESIS REJECTED — bad signature from {name}: {e}")
    # TOFU pin: first-seen genesis becomes the local trust anchor
    if os.path.exists(GEN_PIN):
        pin = json.load(open(GEN_PIN))
        if pin.get("genesis_sha256") != ghash:
            sys.exit(f"GENESIS CONFLICT — pinned {pin['genesis_sha256'][:16]} "
                     f"vs fetched {ghash[:16]} — possible board tampering")
        print(f"genesis pinned ({ghash[:16]}…), "
              f"{len(gen['sigs'])}/{len(members)} sigs verified", flush=True)
    else:
        os.makedirs(os.path.dirname(GEN_PIN), exist_ok=True)
        json.dump({"genesis_sha256": ghash, "firstSeen": time.time()},
                  open(GEN_PIN, "w"))
        print(f"genesis TOFU-pinned ({ghash[:16]}…), "
              f"{len(gen['sigs'])}/{len(members)} sigs verified", flush=True)

    # --- 2. manifest: signer must be a genesis member + cite genesis ---
    manifest = fetch(URL)
    payload = manifest["payload"]
    if payload.get("genesis_sha256") != ghash:
        sys.exit("manifest does not descend from pinned genesis")
    hint = manifest.get("pubkey_hint", "")
    signer = next((n for n, (h, _) in members.items()
                   if hint.endswith(h.split(":")[-1])), None)
    if not signer:
        sys.exit(f"manifest signer {hint} is not a genesis member")
    body = canon(payload)
    try:
        members[signer][1].verify(b64url_decode(manifest["sig_ed25519"]), body)
    except Exception as e:
        sys.exit(f"SIGNATURE REJECTED — bulletin untrusted: {e}")
    print(f"manifest verified (signer {signer}, genesis {ghash[:16]}…, "
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
