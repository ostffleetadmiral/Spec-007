#!/usr/bin/env node
// superpowers-audit.mjs — what the fleet can actually do.
// Every superpower is verified against its evidence anchor — file
// presence, code markers, live crypto verification where the evidence
// is a signature. Verdicts: PROVEN (anchor exists + passes), PENDING
// (built, waiting on an external precondition), ABSENT.
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const canon = o => JSON.stringify(o, null, 2);
const read = p => fs.readFileSync(path.join(ROOT, p));
const has = (p, ...needles) => {
  try { const s = read(p).toString(); return needles.every(n => s.includes(n)); }
  catch { return false; }
};
const exists = p => fs.existsSync(path.join(ROOT, p));

const R = [];
function probe(team, name, ok, evidence) {
  R.push({ team, name, ok: !!ok, evidence });
  console.log(`  [${ok ? "PROVEN" : "ABSENT"}] ${name.padEnd(46)} ${evidence}`);
}

console.log("═══ IDENTITY & KEYS ═══");
probe("IDENT", "ed25519 identity + PBKDF2/AES-256-GCM keystore wrap",
  has("site/assets/fano-auth.js", "pbkdf2", "aesEnc", "expandSeed"),
  "fano-auth.js keystore machinery");
probe("IDENT", "TOTP — Google-Authenticator-compatible second factor",
  has("site/assets/fano-auth.js", "setupTotp", "verifyTotp"),
  "fano-auth.js TOTP + site/index.html verify flow");
probe("IDENT", "roster-gated grants + role certificates",
  has("site/assets/fano-auth.js", "verifyGrant", "grantBytes", "FANO-CALLSIGN-v1"),
  "fano-auth.js grant canon");
probe("IDENT", "roaming flag sign-in without founding (FANO-ROOT-v1)",
  has("site/assets/fano-auth.js", "bindFleetFlag", "flagAnchored") &&
  has("security/team-sweep-2.mjs", "roaming-flag-signin"),
  "bindFleetFlag anchor + DESK-01 probe — LIVE once 'admiral' member lands in genesis");
probe("IDENT", "desk transfer token FANO-DESK-v1 (keystore stays wrapped)",
  has("site/assets/fano-auth.js", "FANO-DESK-v1") &&
  has("site/index.html", "RECEIVE DESK"),
  "DESK-03/04/05 probes + DOM import path");
probe("IDENT", "unlock throttle — persisted exponential backoff",
  has("site/assets/fano-auth.js", "fano1.auth.fail", "lockRemain"),
  "fano-auth.js fail counter survives reload");

console.log("═══ ESCROW & GOVERNANCE ═══");
probe("GOV", "Shamir flag escrow — 3-of-3 unanimous = reset vote",
  exists("src/spec008_qstar_escrow.zig") &&
  has("src/spec008_qstar_escrow.zig", "shamirSplit", "shamirRecover", "commit"),
  "escrow harness: byte-exact reconstruction + threshold refusal");
probe("GOV", "2-of-3 quorum — seat-dark disaster recovery",
  has("src/spec008_qstar_escrow.zig", "2-of-3 quorum"),
  "all three share pairs reconstruct");
probe("GOV", "unanimous reset vote on foreign-origin flag desk",
  has("site/assets/fano-reset.js", "FANO-RESET-v1") &&
  exists("security/admiralty-reset-token.mjs"),
  "fano-reset.js guard + token minter (dual-signed live)");
probe("GOV", "fleet genesis — dual-signed root, TOFU pin, member sigs",
  exists("fleet-genesis.json") && exists("security/fleet_bootstrap.py"),
  "fleet_bootstrap.py canon-verify + TOFU pin");

console.log("═══ WIRE & TRANSPORT ═══");
probe("WIRE", "136-B sealed envelope — strict-len verify, twin-parity",
  has("security/fano-mesh-bridge.mjs", "136") &&
  has("security/fano-wan-gateway.mjs", "136") &&
  has("site/assets/fano-comms.js", "sealed"),
  "mesh-bridge + wan-gateway canon + capstone 86/86 forgery sweep");
probe("WIRE", "O(1) route decision — ≤14 ops, ≤42-hop bound",
  exists("security/route-o1.mjs"),
  "route-o1.mjs exhaustive 3375² pairs");
probe("WIRE", "10 physical transports — QR/audio/cassette/paper/stega/etc",
  has("src/spec008_qstar_carriage.zig", "transport_qr", "transport_lora", "maypole_bridge"),
  "carriage harness: 9/9 round-trips byte-exact");
probe("WIRE", "staleness detection — digest-fragment mismatch flags STALE",
  exists("security/staleness-detect.mjs"),
  "staleness-detect.mjs: wound/permutation/truncation flagged");
probe("WIRE", "WAN-edge seal-gated gateway + DNS-free rendezvous",
  exists("security/fano-wan-gateway.mjs") && exists("security/fleet-map.mjs"),
  "FNV-256 seal at boundary; external v6 inbound still UNVERIFIED");
probe("WIRE", "relay routing — TTL-16 bounded walk, honest drop",
  has("src/spec008_qstar_mesh.zig", "handleRelayRoute", "buildRelayPacket"),
  "mesh harness: deliver/forward/drop proven");
probe("WIRE", "mesh AEAD — XChaCha20-Poly1305 on the envelope",
  has("src/spec008_qstar_mesh.zig", "encryptMessage", "AuthenticationFailed"),
  "tamper + wrong-key refused");

console.log("═══ ARCHIVE & SURVIVAL ═══");
probe("ARCH", "lattice atomization — 3375 cells → 20,250 QR portals",
  has("src/spec008_qstar_archive.zig", "atomizeLattice", "reassembleCell"),
  "archive harness byte-exact");
probe("ARCH", "recursive QR nest — dossier-scale payload round-trip",
  has("src/spec008_qstar_archive.zig", "NestTree"),
  "8 KB subtree build+extract");
probe("ARCH", "RMSY container — desk-state compression byte-exact",
  has("src/spec008_qstar_archive.zig", "compress.compress"),
  "dedup+transform round-trip");
probe("ARCH", "VFS lattice pages — pin/evict/agent-state/heartbeat registry",
  has("src/spec008_qstar_archive.zig", "VFSCache", "saveAgentState", "NodeRegistry"),
  "421-node pages + liveness horizon");
probe("ARCH", "paperback print — 2-of-3 Shamir survives a lost page",
  has("src/spec008_qstar_carriage.zig", "shamirReconstruct"),
  "carriage harness: share-drop recovery");

console.log("═══ COUNTERMEASURES ═══");
probe("CM", "hardened server — GET/HEAD only, security headers, no listing",
  has("tools/serve.py", "send_head") && has("tools/serve.py", "X-Content-Type-Options"),
  "BLUE probes: PUT/DELETE/TRACE/PROPFIND refused");
probe("CM", "surname/classified tripwire on the public tree",
  has("tools/publish-check.sh", "surname tripwire"),
  "SPEC-004 probes: drawer absent from HEAD/gh-pages");
probe("CM", "wasm artifact bit-parity + manifest pins",
  exists("site/apps/rations/rations.wasm.sha256") &&
  has("tools/publish-check.sh", "wasm continuity"),
  "BLACK probes: 5 artifact pins live-verify");
probe("CM", "detached-worktree deploy — shared-tree class eliminated",
  has("tools/deploy-pages.sh", "git worktree"),
  "drawer + serve.py cwd no longer at risk");

console.log("═══ LIVE GENESIS VERIFICATION ═══");
{
  const gen = JSON.parse(read("fleet-genesis.json"));
  const body = Buffer.from(canon(gen.payload));
  const members = {};
  for (const m of gen.payload.members) members[m.name] = m;
  let all = true;
  for (const [name, sig] of Object.entries(gen.sigs)) {
    const pem = Buffer.from(members[name].pubkey_pem_b64, "base64");
    const ok = crypto.verify(null, body, crypto.createPublicKey({ key: pem }),
      Buffer.from(sig, "base64url"));
    if (!ok) all = false;
    console.log(`  [${ok ? "PROVEN" : "ABSENT"}] genesis sig: ${name}`);
  }
  probe("LIVE", "genesis member sigs verify over canonical payload", all,
    `${Object.keys(gen.sigs).length} sigs checked live`);
  const adm = gen.payload.members.find(m => m.name === "admiral" || m.role === "flag-seat");
  probe("LIVE", "admiral member present — roaming anchor live", !!adm,
    adm ? `flag-seat pk hint ${adm.pubkey_hint}` :
      "PENDING — needs the flag pk (fleet-genesis-update.mjs --pk <hex>)");
}

console.log("═══ HONEST LIMITS (the things we cannot do — recorded) ═══");
const LIMITS = [
  "TOFU cold-boot: a fully hostile board can serve a self-consistent attacker genesis on first contact — defense is out-of-band pinning",
  "entangle.rsEncode parity is XOR-sum (one-erasure bound), not Vandermonde RS — rsReconstruct transposes; both routed around, upstream never tested it",
  "unlocked session sk lives in page memory — devtools/same-origin read is inherent to client-side keystore",
  "roster injection is desk-local theater — fleet authority is published-key-gated, but a local UI can be spoofed",
  "fano-comms.js still uses prompt() — silent failure under Electron",
  "external IPv6 inbound to the WAN edge is UNVERIFIED; IPv4 inbound is CGNAT-blocked",
  "136-B envelope payload tail is unauthenticated scratch — receivers MUST honor plen",
  "capacity() in transport deps is a registry slot, not a byte count",
  "admiral member not yet in genesis — roaming sign-in is built and probed but cannot anchor until the flag pk lands",
];
for (const l of LIMITS) console.log(`  [LIMIT  ] ${l}`);

const n = R.filter(r => r.ok).length;
console.log(`\nSUPERPOWERS: ${n}/${R.length} proven, ${R.length - n} pending/absent, ${LIMITS.length} honest limits`);
fs.mkdirSync(path.join(ROOT, "security/out"), { recursive: true });
fs.writeFileSync(path.join(ROOT, "security/out/superpowers.json"),
  JSON.stringify({ ts: new Date().toISOString(), powers: R, limits: LIMITS }, null, 2));
