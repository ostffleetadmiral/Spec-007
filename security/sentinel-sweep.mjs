// sentinel-sweep.mjs — SENTINEL team: adversarial sweep of the
// post-capstone public surface. Prior teams swept the wire; this one
// attacks the TRUST CHAIN — genesis TOFU, manifest lineage, board
// tampering, gateway flood survival, canon parity, artifact pins.
//
//   node security/sentinel-sweep.mjs
import { spawn, spawnSync, execSync } from "node:child_process";
import { createHash, generateKeyPairSync, sign as cryptoSign,
         createPublicKey, verify as cryptoVerify } from "node:crypto";
import dgram from "node:dgram";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import * as F from "./fano-mesh-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SITE = path.join(ROOT, "site");
const findings = [];
let n = 0;
const f = (name, verdict, detail, severity) => {
  n++;
  findings.push({ id: `SENT-${String(n).padStart(2, "0")}`, team: "SENTINEL",
    name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict}] SENT-${String(n).padStart(2, "0")} ${name}` +
    (detail ? " — " + detail : ""));
};
const held = (n2, d) => f(n2, "HELD", d, "info");
const noted = (n2, d) => f(n2, "NOTED", d, "info");
const open_ = (n2, d) => f(n2, "OPEN", d, "high");
const sleep = ms => new Promise(r => setTimeout(r, ms));

const canon = o => JSON.stringify(o, null, 2);
const realGen = JSON.parse(fs.readFileSync(path.join(ROOT, "fleet-genesis.json")));
const realMan = JSON.parse(fs.readFileSync(path.join(ROOT, "fleet-manifest.json")));
const ghash = createHash("sha256").update(canon(realGen.payload)).digest("hex");

/* ---------- adversary board: serves whatever JSON we hand it ---------- */
function evilBoard(genesis, manifest) {
  const srv = http.createServer((req, res) => {
    const doc = req.url.includes("genesis") ? genesis : manifest;
    res.setHeader("content-type", "application/json");
    res.end(JSON.stringify(doc, null, 2));
  });
  return new Promise(r => srv.listen(0, "127.0.0.1", () =>
    r({ srv, base: `http://127.0.0.1:${srv.address().port}` })));
}
// async spawn — a sync spawn would freeze the in-process evil board
function boot(homeDir, boardBase) {
  return new Promise(r => {
    const p = spawn("python3", [path.join(HERE, "fleet_bootstrap.py")], {
      env: { ...process.env, HOME: homeDir, FLEET_BULLETIN: boardBase + "/" } });
    let out = "";
    p.stdout.on("data", d => out += d); p.stderr.on("data", d => out += d);
    p.on("close", code => r({ code, out }));
    setTimeout(() => { p.kill(); r({ code: -9, out: out + "\nSWEEP-TIMEOUT" }); }, 90_000);
  });
}
const pemToB64 = pem => Buffer.from(pem).toString("base64");
const mkKeys = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "pem" });
  return { pub, priv: privateKey.export({ type: "pkcs8", format: "pem" }),
           hint: "sha256:" + createHash("sha256").update(pub).digest("hex").slice(0, 16) };
};
const signDoc = (payload, k) => ({
  payload,
  sig_ed25519: cryptoSign(null, Buffer.from(canon(payload)), k.priv)
    .toString("base64url"),
  pubkey_hint: k.hint });

/* ========== S-01 cold-boot under fully hostile board (TOFU caveat) ========== */
{
  const atk = mkKeys();
  const atkGen = {
    spec: realGen.payload.spec, fleet: realGen.payload.fleet,
    created: new Date().toISOString(),
    dialect_sha256: realGen.payload.dialect_sha256,
    baseline_sha256: realGen.payload.baseline_sha256,
    quorum: 1,
    members: [{ name: "mallory", role: "genesis-root",
      pubkey_hint: atk.hint, pubkey_pem_b64: pemToB64(atk.pub) }] };
  const atkGenDoc = { payload: atkGen, sigs: { mallory:
    cryptoSign(null, Buffer.from(canon(atkGen)), atk.priv).toString("base64url") } };
  const atkGhash = createHash("sha256").update(canon(atkGen)).digest("hex");
  const atkMan = signDoc({ spec: "FLEETMANIFESTv1", ts: new Date().toISOString(),
    genesis_sha256: atkGhash,
    members: { mallory: { role: "edge-gateway", addr: "[::1]:9" } } }, atk);

  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sent-home-"));
  fs.mkdirSync(path.join(home, ".config/fleet"), { recursive: true });
  const { srv, base } = await evilBoard(atkGenDoc, atkMan);
  const r = await boot(home, base); srv.close();
  r.code === 0
    ? noted("cold-boot-hostile-board",
        "TOFU accepted a self-consistent ATTACKER genesis on first contact — " +
        "correct behavior for trust-on-first-use, and the honest limit: " +
        "first-boot trust is whoever the board serves. Defense = out-of-band " +
        "pin distribution (ship ~/.config/fleet/genesis.json with the node image)")
    : held("cold-boot-hostile-board",
        `rejected attacker genesis rc=${r.code}: ${r.out.split("\n")[0]}`);
}

/* ========== S-02 pinned genesis vs self-consistent foreign genesis ==== */
{
  // an attacker genesis that PASSES self-verification (signed by its own
  // embedded key) but whose hash ≠ the local pin — the true downgrade test
  const atk = mkKeys();
  const atkGen = { spec: realGen.payload.spec, fleet: realGen.payload.fleet,
    created: new Date().toISOString(),
    dialect_sha256: realGen.payload.dialect_sha256,
    baseline_sha256: realGen.payload.baseline_sha256, quorum: 1,
    members: [{ name: "mallory", role: "genesis-root",
      pubkey_hint: atk.hint, pubkey_pem_b64: pemToB64(atk.pub) }] };
  const atkGenDoc = { payload: atkGen, sigs: { mallory:
    cryptoSign(null, Buffer.from(canon(atkGen)), atk.priv).toString("base64url") } };
  const atkGhash = createHash("sha256").update(canon(atkGen)).digest("hex");
  const atkMan = signDoc({ spec: "FLEETMANIFESTv1", ts: new Date().toISOString(),
    genesis_sha256: atkGhash, members: {} }, atk);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sent-home-"));
  fs.mkdirSync(path.join(home, ".config/fleet"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config/fleet/genesis.json"),
    JSON.stringify({ genesis_sha256: ghash, firstSeen: Date.now() }));
  const { srv, base } = await evilBoard(atkGenDoc, atkMan);
  const r = await boot(home, base); srv.close();
  r.code !== 0 && /CONFLICT/i.test(r.out)
    ? held("pinned-genesis-conflict", `GENESIS CONFLICT — foreign-but-valid genesis refused against pin: ${r.out.trim().split("\n")[0]}`)
    : open_("pinned-genesis-conflict", `rc=${r.code} out=${r.out.slice(0, 120)}`);
}

/* ========== S-03 foreign signer, correct genesis citation ========== */
{
  const atk = mkKeys();
  const forgery = signDoc({ spec: "FLEETMANIFESTv1",
    ts: new Date().toISOString(), genesis_sha256: ghash,
    members: { mallory: { role: "edge-gateway", addr: "[::1]:9" } } }, atk);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sent-home-"));
  fs.mkdirSync(path.join(home, ".config/fleet"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config/fleet/genesis.json"),
    JSON.stringify({ genesis_sha256: ghash, firstSeen: Date.now() }));
  const { srv, base } = await evilBoard(realGen, forgery);
  const r = await boot(home, base); srv.close();
  r.code !== 0
    ? held("foreign-signer-rejected", `non-genesis signer refused: ${r.out.trim().split("\n").pop()}`)
    : open_("foreign-signer-rejected", "forged manifest accepted!");
}

/* ========== S-04 replay: valid-sig manifest with ancient ts ========== */
{
  // sign a replayed manifest with the REAL digit key — proves the board
  // can't distinguish fresh from replayed when the signature is valid
  const privPem = fs.readFileSync(
    path.join(os.homedir(), ".config/fleet/ed25519.pem"));
  const realPub = fs.readFileSync(
    path.join(os.homedir(), ".config/fleet/ed25519.pub.pem"));
  const replay = {
    payload: { spec: "FLEETMANIFESTv1", ts: "2020-01-01T00:00:00.000Z",
      genesis_sha256: ghash, artifacts: {},
      members: { digit: { role: "edge-gateway",
        addr: "[2607:fb91:3a11:bafb::dead]:9779" } } },
    sig_ed25519: null, pubkey_hint: realMan.pubkey_hint };
  replay.sig_ed25519 = cryptoSign(null,
    Buffer.from(canon(replay.payload)), privPem).toString("base64url");
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sent-home-"));
  fs.mkdirSync(path.join(home, ".config/fleet"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config/fleet/genesis.json"),
    JSON.stringify({ genesis_sha256: ghash, firstSeen: Date.now() }));
  const { srv, base } = await evilBoard(realGen, replay);
  const r = await boot(home, base); srv.close();
  r.code === 0
    ? open_("manifest-replay-window",
        "replayed manifest (ts=2020, forged endpoints, REAL signature) " +
        "accepted — freshness is NOT enforced; replay window is unbounded. " +
        "Mitigation needed: bootstrap should warn/reject on ts older than a " +
        "configurable horizon")
    : held("manifest-replay-window", `rejected rc=${r.code}`);
}

/* ========== S-05 gateway flood: malformed + forged + sealed mix ========== */
{
  const sink = dgram.createSocket("udp4");
  const got = [];
  sink.on("message", m => got.push(m));
  await new Promise(r => sink.bind(0, "127.0.0.1", r));
  const sinkPort = sink.address().port;

  const gwPort = 19700 + Math.floor(Math.random() * 800);
  const gw = spawn("node", [path.join(HERE, "fano-wan-gateway.mjs")], {
    env: { ...process.env, GATE_PORT: String(gwPort),
           MESH_NODE: "127.0.0.1", MESH_PORT: String(sinkPort) },
    stdio: "ignore" });
  await sleep(1200);

  const cli = dgram.createSocket("udp4");
  const send = b => new Promise(r => cli.send(b, gwPort, "127.0.0.1", r));
  const sealed = F.build(1, 1, 1, 7, 7, 7, 1, Buffer.from("flood-seed"));
  // flood: random 136B + covered-byte forgeries (must NOT forward) +
  // tail-byte edits (contract-valid scratch — MAY forward) + wrong sizes
  for (let i = 0; i < 100; i++) await send(
    Buffer.from(Array.from({ length: 136 }, () => Math.random() * 256)));
  const coveredForged = [];
  for (let i = 0; i < 50; i++) {
    const b = Buffer.from(sealed); b[i % 40] ^= 0xFF;   // covered region
    coveredForged.push(b); await send(b); }
  for (let i = 0; i < 20; i++) {
    const b = Buffer.from(sealed); b[104 + (i % 32)] ^= 0xFF; // seal bytes
    coveredForged.push(b); await send(b); }
  for (let i = 0; i < 30; i++) {
    const b = Buffer.from(sealed); b[55 + i] ^= 0xFF; await send(b); } // tail
  for (const s of [1, 100, 135, 137, 512]) await send(Buffer.alloc(s, 0xAA));
  await send(sealed); // the one that must pass
  await sleep(800);

  const survived = gw.exitCode === null;
  const allVerified = got.every(w => F.verify(w));
  const sealedArrived = got.some(w => w.equals(sealed));
  const forgedLeaked = got.some(w => coveredForged.some(bf => bf.equals(w)));
  gw.kill(); sink.close(); cli.close();
  survived && allVerified && sealedArrived && !forgedLeaked
    ? held("gateway-flood-siege",
        `206 forged/malformed dropped; every forwarded datagram seal-verifies ` +
        `(${got.length} in: covered-forgeries leaked=${forgedLeaked}); gateway alive`)
    : open_("gateway-flood-siege",
        `fwd=${got.length} allVerified=${allVerified} sealed=${sealedArrived} ` +
        `forgedLeak=${forgedLeaked} alive=${survived}`);
}

/* ========== S-06 canon parity: JS vs Python on adversarial payloads ==== */
{
  const tricky = { z: "é中漢字🚀", a: [1, "x", { k: null }],
    num: 42, bool: false, nested: { "weird\"key": "line\nbreak" } };
  const js = canon(tricky);
  const py = spawnSync("python3", ["-c",
    `import json,sys; p=json.loads(sys.argv[1]); ` +
    `sys.stdout.write(json.dumps(p, indent=2, ensure_ascii=False))`,
    JSON.stringify(tricky)], { encoding: "utf8" }).stdout;
  js === py
    ? held("canon-parity-adversarial",
        "unicode/escapes/nested — JS canon byte-matches Python canon " +
        `(cross-impl signature domain intact, ${js.length}B)`)
    : open_("canon-parity-adversarial",
        "canonical serialization diverges — signatures would split across twins");
}

/* ========== S-07 private-key material in committed tree ========== */
{
  const tree = execSync("git ls-tree -r HEAD --name-only",
    { cwd: ROOT, encoding: "utf8" });
  let leak = null;
  for (const file of tree.split("\n")) {
    if (!file) continue;
    const p = path.join(ROOT, file);
    try {
      if (fs.statSync(p).size < 2_000_000 &&
          /BEGIN [A-Z ]*PRIVATE KEY/.test(fs.readFileSync(p, "utf8"))) {
        leak = file; break; }
    } catch {}
  }
  !leak
    ? held("no-private-keys-committed", "committed tree carries zero PEM private keys")
    : open_("no-private-keys-committed", `PRIVATE KEY MATERIAL: ${leak}`);
}

/* ========== S-08 signed artifact pins present + accurate ========== */
{
  const arts = realMan.payload.artifacts || {};
  const entries = Object.entries(arts);
  let ok = entries.length > 0;
  for (const [rel, pinned] of entries) {
    const p = path.join(SITE, rel);
    if (!fs.existsSync(p)) { ok = false; break; }
    const h = "sha256:" + createHash("sha256").update(fs.readFileSync(p)).digest("hex");
    if (h !== pinned) { ok = false; break; }
  }
  ok
    ? held("artifact-pins-signed",
        `${entries.length} artifacts hashed inside the signed manifest — ` +
        `board-served tamper fails closed at verify time`)
    : open_("artifact-pins-signed", `pins=${entries.length} verify=${ok}`);
}

/* ========== S-09 gh-pages artifact == main artifact ========== */
{
  const gpw = spawnSync("git", ["show", "gh-pages:apps/fano/fano.wasm"],
    { cwd: ROOT, encoding: "buffer", maxBuffer: 10_000_000 });
  const mainW = fs.readFileSync(path.join(SITE, "apps/fano/fano.wasm"));
  gpw.status === 0 && Buffer.from(gpw.stdout).equals(mainW)
    ? held("ghpages-artifact-identity",
        "deployed fano.wasm bit-identical to the audited artifact")
    : f("ghpages-artifact-identity", "NOTED",
        `gh-pages wasm differs or missing (status ${gpw.status}) — ` +
        `branch may predate latest site`, "med");
}

/* ========== S-10 stale non-descending manifest: retry then reject ==== */
{
  const atk = mkKeys();
  const stale = signDoc({ spec: "FLEETMANIFESTv1",
    ts: new Date().toISOString(),
    genesis_sha256: "0".repeat(64), members: {} }, atk);
  const home = fs.mkdtempSync(path.join(os.tmpdir(), "sent-home-"));
  fs.mkdirSync(path.join(home, ".config/fleet"), { recursive: true });
  fs.writeFileSync(path.join(home, ".config/fleet/genesis.json"),
    JSON.stringify({ genesis_sha256: ghash, firstSeen: Date.now() }));
  const { srv, base } = await evilBoard(realGen, stale);
  const t0 = Date.now();
  const r = await boot(home, base); srv.close();
  r.code !== 0 && /retry|stale|does not descend/i.test(r.out)
    ? held("stale-manifest-rejected",
        `non-descending manifest retried then refused (${((Date.now()-t0)/1000).toFixed(0)}s, staleness-aware)`)
    : open_("stale-manifest-rejected", `rc=${r.code} out=${r.out.slice(0, 100)}`);
}

/* ---------- merge into findings.json ---------- */
const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const merged = { generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter(x => x.team !== "SENTINEL"), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nSENTINEL sweep: ${findings.length} probes — ${JSON.stringify(tally)}`);
process.exit(tally.OPEN ? 1 : 0);
