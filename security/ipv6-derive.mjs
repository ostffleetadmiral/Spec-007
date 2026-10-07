// ipv6-derive.mjs — SPEC008v1 address derivation (the `addr-derive` gate).
//
// coord (k,r,c ∈ [1,15], khat-domain) + organ id + lattice artifact
// digest → a 128-bit SPEC008v1 address:
//
//   | fd53:5007::/48 (64) | k,r,c u4×3 (12) | organ u8 | digest low 44 |
//
//   node ipv6-derive.mjs                 # golden vectors → stdout
//   node ipv6-derive.mjs --emit          # → out/spec008-vectors.json
//
// Determinism: same inputs → same address on any platform. The digest
// fragment binds the address to the emitter's lattice state — a stale
// world-view is visible in the address itself.
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const LATTICE = path.join(HERE, "out", "ivector-lattice.json");
const VECTORS_OUT = path.join(HERE, "out", "spec008-vectors.json");

export const ORGAN = { bridge: 0, k3: 1, rations: 2, deck: 3, gov: 4 };

const PREFIX = Buffer.from("fd53500700000000", "hex"); // fd:5350:0700::

/* cell-byte sha256 of the lattice artifact → the 44-bit state fragment */
export function stateFragment(latticePath = LATTICE) {
  const j = JSON.parse(fs.readFileSync(latticePath, "utf8"));
  const cellBytes = Buffer.from(j.cells);
  const digest = crypto.createHash("sha256").update(cellBytes).digest();
  // low 44 bits of the digest (network-order tail)
  return digest.readBigUInt64BE(24) & ((1n << 44n) - 1n);
}

/* the honest O(1) resolver: coordinate+organ+digest → address bits.
   No table scan, no lookup — pure arithmetic on 128 bits.
   Low 64: coord(12)<<52 ‖ organ(8)<<44 ‖ fragment(44) — exactly 64. */
export function derive({ k, r, c, organ, fragment }) {
  if (![k, r, c].every(v => Number.isInteger(v) && v >= 1 && v <= 15))
    throw new Error("coordinate outside khat domain [1,15]");
  if (!Number.isInteger(organ) || organ < 0 || organ > 255)
    throw new Error("organ id outside u8");
  const frag44 = BigInt(fragment) & ((1n << 44n) - 1n);
  const coord = (BigInt(k) << 8n) | (BigInt(r) << 4n) | BigInt(c);
  const tail = (coord << 52n) | (BigInt(organ) << 44n) | frag44;
  const addr = Buffer.concat([PREFIX, Buffer.alloc(8)]);
  let t = tail;
  for (let i = 15; i >= 8; i--) { addr[i] = Number(t & 0xffn); t >>= 8n; }
  return addr;
}

export function format(addr) {
  const groups = [];
  for (let i = 0; i < 16; i += 2) groups.push(addr.readUInt16BE(i).toString(16));
  return groups.join(":");
}

/* lossless decode — the packing is reversible, so the vector set
   doubles as a conformance gate: derive→decode must round-trip. */
export function decode(addr) {
  let tail = 0n;
  for (let i = 8; i < 16; i++) tail = (tail << 8n) | BigInt(addr[i]);
  const coord = (tail >> 52n) & 0xfffn;
  return {
    k: Number(coord >> 8n), r: Number((coord >> 4n) & 0xfn), c: Number(coord & 0xfn),
    organ: Number((tail >> 44n) & 0xffn),
    fragment: tail & ((1n << 44n) - 1n),
  };
}

/* main-guard: exports (derive/decode/format/stateFragment) are importable
   by sibling gates; the vector emit below is CLI-only */
const IS_MAIN = !!process.argv[1] &&
  fileURLToPath(import.meta.url) === path.resolve(process.argv[1]);

const EMIT = process.argv.includes("--emit");
const fragment = IS_MAIN ? stateFragment() : undefined;
if (IS_MAIN) {
const vectors = [
  { name: "e0-heart-bridge", k: 8, r: 8, c: 8, organ: ORGAN.bridge },
  { name: "e0-heart-k3", k: 8, r: 8, c: 8, organ: ORGAN.k3 },
  { name: "corner-min-deck", k: 1, r: 1, c: 1, organ: ORGAN.deck },
  { name: "corner-max-rations", k: 15, r: 15, c: 15, organ: ORGAN.rations },
  { name: "mid-cell-gov", k: 7, r: 3, c: 12, organ: ORGAN.gov },
].map(v => {
  const addr = derive({ ...v, fragment });
  const back = decode(addr);
  const roundtrip = back.k === v.k && back.r === v.r && back.c === v.c &&
    back.organ === v.organ && back.fragment === (fragment & ((1n << 44n) - 1n));
  return { ...v, fragment: "0x" + fragment.toString(16), address: format(addr), roundtrip };
});
if (vectors.some(v => !v.roundtrip)) { console.error("derive→decode round-trip failed — packing is lossy"); process.exit(1); }

const rec = {
  spec: "SPEC008v1",
  latticeDigestFragment: "0x" + fragment.toString(16),
  prefix: "fd53:5007::/48",
  vectors,
  generated: new Date().toISOString(),
};
const out = JSON.stringify(rec, null, 2);
EMIT ? (fs.writeFileSync(VECTORS_OUT, out), console.log(`spec008-vectors → ${VECTORS_PATH()} (${vectors.length} vectors)`))
     : console.log(out);
}
function VECTORS_PATH() { return VECTORS_OUT; }
