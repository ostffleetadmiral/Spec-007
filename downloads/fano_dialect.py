#!/usr/bin/env python3
# fano_dialect.py — Python twin of the frozen 136-B Fano wire dialect
# (byte-exact port of firmware fano_packet.c / fano-mesh-bridge.mjs).
# Third independent implementation: self-test verifies the firmware's own
# golden vectors — the contract is real only if all twins agree bit-exact.
#
#   python3 fano_dialect.py            # golden-vector self-test (exit 1 on fail)
import struct, sys

FANO_WIRE = 136
FANO_CAP  = 64
FANO_CENTER = 7
MASK256  = (1 << 256) - 1
SEAL_IV  = int("F4A0" * 16, 16)
FNV_PRIME = (1 << 168) | (1 << 8) | 0x63

def _d7(v): return abs(v - FANO_CENTER)
def _basis(x, y, z): return (_d7(x) + _d7(y) + _d7(z)) & 7
def _phase(y, z): return (_d7(y) - _d7(z)) % 8

# octonion unit product from the seven Fano lines — entry = (sign+2)<<3 | idx
_LINES = [(1,2,3),(1,4,5),(1,7,6),(2,4,6),(2,5,7),(3,4,7),(3,5,6)]
_MUL = [[0]*8 for _ in range(8)]
for i in range(8):
    _MUL[0][i] = (3<<3)|i; _MUL[i][0] = (3<<3)|i
for i in range(1, 8):
    _MUL[i][i] = (1<<3)|0
for a,b,c in _LINES:
    for x,y in ((a,b),(b,c),(c,a)):
        z = a + b + c - x - y
        _MUL[x][y] = (3<<3)|z; _MUL[y][x] = (1<<3)|z
def _umul(a, b): return _MUL[a & 7][b & 7]

def route(sx, sy, sz, dx, dy, dz):
    hops = []
    x, y, z = sx, sy, sz
    hops.append((x, y, z, _basis(x,y,z), _phase(y,z)))
    while (x, y, z) != (dx, dy, dz):
        ex, ey, ez = abs(dx-x), abs(dy-y), abs(dz-z)
        if ex >= ey and ex >= ez: x += 1 if dx > x else -1
        elif ey >= ez:            y += 1 if dy > y else -1
        else:                     z += 1 if dz > z else -1
        hops.append((x, y, z, _basis(x,y,z), _phase(y,z)))
    return hops

def _route_sig(hops):
    sign, idx = 1, 0
    for h in hops:
        p = _umul(idx, h[3])
        sign *= 1 if (p >> 3) == 3 else -1
        idx = p & 7
    return ((sign + 2) << 3) | idx

def cell_word(x, y, z):
    out = bytearray(32)
    dist = _d7(x) + _d7(y) + _d7(z)
    frac = (dist << 128) // 21
    if frac >= (1 << 128): out[:16] = b"\xff" * 16
    else: out[:16] = frac.to_bytes(16, "little")
    top = (_phase(y,z) << 15) | (1 << (18 + _basis(x,y,z))) | \
          (x << 27) | (y << 39) | (z << 51)
    out[24:32] = top.to_bytes(8, "little")
    return bytes(out)

def seal(wire: bytes) -> bytes:
    top = int.from_bytes(wire[24:32], "little")
    sx, sy, sz = (top >> 27) & 0xfff, (top >> 39) & 0xfff, (top >> 51) & 0xfff
    hops = route(sx, sy, sz, wire[32], wire[33], wire[34])
    h = SEAL_IV
    for i in range(40): h = ((h ^ wire[i]) * FNV_PRIME) & MASK256
    plen = min(wire[39], FANO_CAP)
    for i in range(plen): h = ((h ^ wire[40+i]) * FNV_PRIME) & MASK256
    def rotl(n): nonlocal h; h = ((h << n) | (h >> (256-n))) & MASK256
    rotl(5); h ^= _route_sig(hops)
    for hp in hops: rotl(3); h ^= hp[4]
    return h.to_bytes(32, "little")

def verify(wire: bytes) -> bool:
    return len(wire) == FANO_WIRE and seal(wire) == wire[104:136]

def build(sx, sy, sz, dx, dy, dz, seq, payload: bytes) -> bytes:
    wire = bytearray(FANO_WIRE)
    wire[0:32] = cell_word(sx, sy, sz)
    wire[32], wire[33], wire[34] = dx, dy, dz
    wire[35:39] = struct.pack("<I", seq & 0xFFFFFFFF)
    wire[39] = min(len(payload), FANO_CAP)
    wire[40:40+wire[39]] = payload[:wire[39]]
    wire[104:136] = seal(bytes(wire))
    return bytes(wire)

# golden vectors — machine-extracted from firmware fano_vectors.h PACKET_VECS
_VECS = [
  "b66ddbb66ddbb66ddbb66ddbb66ddbb600000000000000000080000a00011800"
  "0d0e0e0700000006676f6c64656e000000000000000000000000000000000000"
  "0000000000000000000000000000000000000000000000000000000000000000"
  "0000000000000000a4649b12e03ffd2ea096201660fbd5280c44d799fb143b0a"
  "9fe3549a9caa2975",
  "ffffffffffffffffffffffffffffffff00000000000000000000800000000000"
  "0e0e0e0100000010636f726e65722d746f2d636f726e65720000000000000000"
  "0000000000000000000000000000000000000000000000000000000000000000"
  "0000000000000000898d1118492535ef2457478731b0e91e1c1a7059ac05352e"
  "99841ffb8445f419",
  "0000000000000000000000000000000000000000000000000000043880033800"
  "0707070000000000000000000000000000000000000000000000000000000000"
  "0000000000000000000000000000000000000000000000000000000000000000"
  "0000000000000000b064aed5cda83e14d7939401ee8a9e2b155ff08dc1294afc"
  "f07091cdd5fed08e",
]

if __name__ == "__main__":
    ok = all(verify(bytes.fromhex(v)) for v in _VECS)
    print(f"fano_dialect.py golden vectors: {sum(verify(bytes.fromhex(v)) for v in _VECS)}/{len(_VECS)}")
    sys.exit(0 if ok else 1)
