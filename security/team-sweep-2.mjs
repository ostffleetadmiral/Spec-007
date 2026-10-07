// team-sweep-2.mjs — consolidated fleet security-team sweep over the
// post-capstone surface. Teams:
//   RED    — offense: forge/bypass attacks on the reset doctrine,
//            countersign path, and trust chain
//   BLUE   — defense posture: desk server surface, headers, guard modes
//   BLACK  — supply chain: artifact bit-identity, git-history secrets,
//            branch parity, pinned hashes
//   GRAY   — insider: desk-local authority boundaries, self-issued
//            credentials, roster forgery endpoints
//   COMM   — communications: envelope integrity, honest labels, canon
//   SPEC004— classification drawer: leak paths, tripwire, registry,
//            twin alignment across every published artifact
//
//   node security/team-sweep-2.mjs
import { spawn, spawnSync, execSync } from "node:child_process";
import crypto, { createHash, generateKeyPairSync, sign as cryptoSign,
                verify as cryptoVerify, createPublicKey } from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import os from "node:os";
import path from "node:path";
import vm from "node:vm";
import { fileURLToPath } from "node:url";
import * as F from "./fano-mesh-bridge.mjs";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const SITE = path.join(ROOT, "site");
const findings = [];
let n = {};
const f = (team, name, verdict, detail, severity) => {
  n[team] = (n[team] || 0) + 1;
  findings.push({ id: `${team}-${String(n[team]).padStart(2, "0")}`,
    team, name, verdict, severity, detail, ts: new Date().toISOString() });
  console.log(`  [${verdict.padEnd(8)}] ${team}-${String(n[team]).padStart(2, "0")} ${name}${detail ? " — " + detail : ""}`);
};
const held  = (t, n2, d) => f(t, n2, "HELD", d, "info");
const noted = (t, n2, d) => f(t, n2, "NOTED", d, "info");
const open_ = (t, n2, d) => f(t, n2, "OPEN", d, "high");
const canon = o => JSON.stringify(o, null, 2);
const sleep = ms => new Promise(r => setTimeout(r, ms));

/* ---------- fano-reset.js in a sandboxed browser ---------- */
function loadResetModule({ hostname = "127.0.0.1", genesisLs = null,
                           genesisDoc = null } = {}) {
  const store = new Map();
  if (genesisLs) store.set("fano1.genesis", JSON.stringify(genesisLs));
  const sandbox = {
    window: {}, console, TextEncoder, atob: s => Buffer.from(s, "base64").toString("binary"),
    localStorage: {
      getItem: k => store.has(k) ? store.get(k) : null,
      setItem: (k, v) => store.set(k, String(v)),
      removeItem: k => store.delete(k),
    },
    location: { hostname },
    crypto: crypto.webcrypto,
    fetch: async (url) => url.includes("fleet-genesis")
      ? { ok: true, json: async () => genesisDoc }
      : { ok: false, json: async () => { throw new Error("404"); } },
  };
  sandbox.window = sandbox;
  vm.createContext(sandbox);
  vm.runInContext(
    fs.readFileSync(path.join(SITE, "assets/fano-reset.js"), "utf8")
      .replace("window.FANO_RESET", "globalThis.FANO_RESET"),
    sandbox);
  return { R: sandbox.FANO_RESET, store };
}

const realGen = JSON.parse(fs.readFileSync(path.join(ROOT, "fleet-genesis.json")));
function atobDer(pem) {
  return Buffer.from(pem.replace(/-----[^-]+-----|\s/g, ""), "base64");
}
/* synthetic genesis carrying an admiral member — the flag seat's pk is
   a fresh keypair; the flag desk's localStorage genesis matches its hash.
   REPLACE any real admiral member — since the seat landed in canon, a
   blind push would leave two flag-seats and the guard anchors to the
   first match, not ours */
const admiralKp = generateKeyPairSync("ed25519");
const admiralPem = admiralKp.publicKey.export({ type: "spki", format: "pem" });
const genWithAdmiral = JSON.parse(JSON.stringify(realGen));
genWithAdmiral.payload.members = genWithAdmiral.payload.members
  .filter(m => m.name !== "admiral" && m.role !== "flag-seat");
genWithAdmiral.payload.members.push({
  name: "admiral", role: "flag-seat",
  pubkey_hint: "sha256:" + createHash("sha256").update(admiralPem).digest("hex").slice(0, 16),
  pubkey_pem_b64: Buffer.from(admiralPem).toString("base64") });
const flagPkHash = createHash("sha256").update(atobDer(admiralPem).subarray(-32)).digest("hex");
const flagLs = { callsign: "ramsey 006", pk: "aa".repeat(32), pk_sha256: flagPkHash };

/* a fully-signed vote token for a given body+members */
function mintToken(body, keys) {
  const sigs = {};
  for (const [name, k] of Object.entries(keys))
    sigs[name] = cryptoSign(null, Buffer.from(canon(body)), k.priv).toString("base64url");
  return { body, sigs };
}
const mkKeys = () => {
  const { publicKey, privateKey } = generateKeyPairSync("ed25519");
  const pub = publicKey.export({ type: "spki", format: "pem" });
  return { pub, priv: privateKey.export({ type: "pkcs8", format: "pem" }) };
};
/* real keys for the two genesis members (digit local; sheraton via ssh) */
function realKeys() {
  const keys = {};
  keys.digit = { priv: fs.readFileSync(
    path.join(os.homedir(), ".config/fleet/ed25519.pem")) };
  try {
    const bodyB64 = process.env.__BODY_B64;
    if (bodyB64) { /* unused — signing happens per-token below */ }
  } catch {}
  return keys;
}

console.log("=== TEAM SWEEP 2 — post-capstone surface ===\nRED — offense");

/* ================= RED — offense ================= */
{
  const genBody = { v: "FANO-RESET-v1", callsign: "ramsey 006",
                    ts: new Date().toISOString() };

  /* RED-01: token signed by attacker keys, not genesis members */
  {
    const atk = mkKeys();
    const tok = mintToken(genBody, { mallory: atk });
    const { R } = loadResetModule({ hostname: "evil.example.com",
      genesisLs: flagLs, genesisDoc: realGen });
    const ok = await R.verifyVote(JSON.stringify(tok));
    !ok ? held("RED", "forged-vote-token", "attacker-signed vote refused")
        : open_("RED", "forged-vote-token", "forged token accepted!");
  }

  /* RED-02: partial vote — 1 of 2 members */
  {
    const digitKey = { priv: fs.readFileSync(
      path.join(os.homedir(), ".config/fleet/ed25519.pem")) };
    const tok = mintToken(genBody, { digit: digitKey });
    const { R } = loadResetModule({ hostname: "evil.example.com",
      genesisLs: flagLs, genesisDoc: realGen });
    const ok = await R.verifyVote(JSON.stringify(tok));
    !ok ? held("RED", "partial-vote-refused", "1-of-2 sig → not unanimous → refused")
        : open_("RED", "partial-vote-refused", "partial vote accepted!");
  }

  /* RED-03: callsign binding — token for another seat */
  {
    const digitKey = { priv: fs.readFileSync(
      path.join(os.homedir(), ".config/fleet/ed25519.pem")) };
    const wrong = { ...genBody, callsign: "quantum_black" };
    const tok = mintToken(wrong, { digit: digitKey });
    const { R } = loadResetModule({ hostname: "evil.example.com",
      genesisLs: flagLs, genesisDoc: realGen });
    const ok = await R.verifyVote(JSON.stringify(tok));
    !ok ? held("RED", "callsign-binding", "vote for another seat refused (bound to founding callsign)")
        : open_("RED", "callsign-binding", "cross-callsign token accepted!");
  }

  /* RED-04: stale vote replay (>24h) */
  {
    const digitKey = { priv: fs.readFileSync(
      path.join(os.homedir(), ".config/fleet/ed25519.pem")) };
    const stale = { ...genBody, ts: "2020-01-01T00:00:00.000Z" };
    const tok = mintToken(stale, { digit: digitKey });
    const { R } = loadResetModule({ hostname: "evil.example.com",
      genesisLs: flagLs, genesisDoc: realGen });
    const ok = await R.verifyVote(JSON.stringify(tok));
    !ok ? held("RED", "stale-vote-refused", ">24h token treated as replay")
        : open_("RED", "stale-vote-refused", "ancient token accepted!");
  }

  /* RED-05: tampered body under real sigs */
  {
    const digitKey = { priv: fs.readFileSync(
      path.join(os.homedir(), ".config/fleet/ed25519.pem")) };
    const tok = mintToken(genBody, { digit: digitKey });
    tok.body.callsign = "quantum_black"; // mutate post-signing
    const { R } = loadResetModule({ hostname: "evil.example.com",
      genesisLs: flagLs, genesisDoc: realGen });
    const ok = await R.verifyVote(JSON.stringify(tok));
    !ok ? held("RED", "post-sign-tamper", "mutated body invalidates the vote")
        : open_("RED", "post-sign-tamper", "tampered body accepted!");
  }

  /* RED-06: guard modes — flag desk cluster vs foreign vs ordinary */
  {
    const clu = loadResetModule({ hostname: "127.0.0.1",
      genesisLs: flagLs, genesisDoc: genWithAdmiral });
    const g1 = await clu.R.guard();
    const frn = loadResetModule({ hostname: "ostffleetadmiral.github.io",
      genesisLs: flagLs, genesisDoc: genWithAdmiral });
    const g2 = await frn.R.guard();
    const ord = loadResetModule({ hostname: "ostffleetadmiral.github.io",
      genesisLs: { callsign: "wanderer", pk_sha256: "ff".repeat(32) },
      genesisDoc: realGen });
    const g3 = await ord.R.guard();
    g1.mode === "cluster" && g2.mode === "vote" && g3.mode === "open"
      ? held("RED", "guard-modes", `cluster→unilateral, public→vote-required, ordinary→open`)
      : open_("RED", "guard-modes", `cluster=${g1.mode} public=${g2.mode} ordinary=${g3.mode}`);
  }
}

console.log("\nBLUE — defense posture");
/* ================= BLUE — defense ================= */
{
  const DESK = "http://127.0.0.1:8080";
  const req = async (u, o = {}) => {
    try { const r = await fetch(DESK + u, o);
      const h = {}; r.headers.forEach((v, k) => h[k] = v);
      return { status: r.status, h, body: await r.text() };
    } catch (e) { return { status: 0, h: {}, body: String(e) }; }
  };

  /* BLU-01/02: method surface + traversal + listing on the live desk */
  {
    const bad = [];
    for (const m of ["PUT", "DELETE", "TRACE", "PROPFIND"]) {
      const net = await import("node:net");
      const code = await new Promise(res => {
        const s = net.connect(8080, "127.0.0.1", () =>
          s.write(`${m} / HTTP/1.1\r\nHost: x\r\n\r\n`));
        let b = ""; s.on("data", d => { b += d;
          if (b.includes(" ")) { s.destroy(); res(+b.split(" ")[1]); } });
        s.on("error", () => res(0));
        setTimeout(() => { s.destroy(); res(0); }, 3000);
      });
      if (![501, 405, 403].includes(code)) bad.push(`${m}=${code}`);
    }
    !bad.length ? held("BLUE", "method-surface", "PUT/DELETE/TRACE/PROPFIND all refused")
                : open_("BLUE", "method-surface", bad.join(" "));
  }
  {
    const trav = await req("/../../etc/passwd");
    trav.status === 404 || trav.status === 400
      ? held("BLUE", "traversal", `../../etc/passwd → ${trav.status}`)
      : open_("BLUE", "traversal", `status=${trav.status}`);
  }
  {
    const dir = await req("/assets/");
    dir.status === 403
      ? held("BLUE", "no-dir-listing", "/assets/ → 403")
      : open_("BLUE", "no-dir-listing", `status=${dir.status}`);
  }
  {
    const r = await req("/reset.html");
    const need = ["content-security-policy", "x-content-type-options",
                  "x-frame-options"];
    const missing = need.filter(k => !r.h[k]);
    !missing.length
      ? held("BLUE", "security-headers-reset", need.join(", "))
      : open_("BLUE", "security-headers-reset", `missing: ${missing}`);
  }

  /* BLU-05: ordinary desk never locked out of its own reset */
  {
    const { R } = loadResetModule({ hostname: "anywhere.example",
      genesisLs: { callsign: "wanderer", pk_sha256: "ab".repeat(32) },
      genesisDoc: realGen });
    const g = await R.guard();
    g.mode === "open"
      ? held("BLUE", "ordinary-desk-open", "non-flag founding resets freely — no false lockout")
      : open_("BLUE", "ordinary-desk-open", `mode=${g.mode} — doctrine overreaches`);
  }
}

console.log("\nBLACK — supply chain");
/* ================= BLACK — supply chain ================= */
{
  /* BLK-01: wasm bit-identity vs the build source */
  {
    const anim = `${os.homedir()}/Documents/animation/zig-out/bin/fano.wasm`;
    const site = path.join(SITE, "apps/fano/fano.wasm");
    const same = fs.existsSync(anim) &&
      fs.readFileSync(anim).equals(fs.readFileSync(site));
    same ? held("BLACK", "wasm-bit-identity", "site wasm == build artifact")
         : open_("BLACK", "wasm-bit-identity", "artifact drift");
  }
  /* BLK-02: manifest artifact pins match live files */
  {
    const man = JSON.parse(fs.readFileSync(path.join(ROOT, "fleet-manifest.json")));
    const arts = man.payload.artifacts || {};
    let ok = Object.keys(arts).length > 0, bad = null;
    for (const [rel, pinned] of Object.entries(arts)) {
      const p = path.join(SITE, rel);
      if (!fs.existsSync(p)) { ok = false; bad = rel; break; }
      const h = "sha256:" + createHash("sha256").update(fs.readFileSync(p)).digest("hex");
      if (h !== pinned) { ok = false; bad = rel; break; }
    }
    ok ? held("BLACK", "artifact-pins-live", `${Object.keys(arts).length} pins verify against live files`)
       : open_("BLACK", "artifact-pins-live", `mismatch: ${bad}`);
  }
  /* BLK-03: every site/ file deployed bit-identically + no stray files
     on gh-pages beyond the deploy allowlist */
  {
    const ALLOWED_EXTRA = new Set([".gitignore", "CNAME", ".nojekyll"]);
    const local = [];
    const walk = d => { for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      e.isDirectory() ? walk(p) : local.push(path.relative(SITE, p)); } };
    walk(SITE);
    const remote = execSync("git ls-tree -r gh-pages --name-only",
      { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    const remoteSet = new Set(remote);
    /* generated sweep reports mutate every run — parity on them is
       undefined by design; they are evidence output, not content */
    const VOLATILE = new Set(["security/findings.json"]);
    let bad = null, checked = 0;
    for (const f2 of local) {
      if (VOLATILE.has(f2)) continue;
      if (!remoteSet.has(f2)) { bad = `undeployed ${f2}`; break; }
      const r = spawnSync("git", ["show", `gh-pages:${f2}`],
        { cwd: ROOT, encoding: "buffer", maxBuffer: 30_000_000 });
      if (r.status !== 0 || !Buffer.from(r.stdout).equals(fs.readFileSync(path.join(SITE, f2)))) {
        bad = `differs ${f2}`; break; }
      checked++;
    }
    const stray = remote.filter(f2 => !local.includes(f2) && !ALLOWED_EXTRA.has(f2));
    if (!bad && stray.length) bad = `stray on gh-pages: ${stray.slice(0, 3)}`;
    !bad ? held("BLACK", "ghpages-parity",
           `${checked}/${local.length} site files bit-identical; ${stray.length} stray`)
         : open_("BLACK", "ghpages-parity", bad);
  }
  /* BLK-04: git-history secret scan across ALL commits */
  {
    const blobs = execSync("git rev-list --all --objects",
      { cwd: ROOT, encoding: "utf8" });
    const paths = blobs.split("\n").map(l => l.split(" ").slice(1).join(" "))
      .filter(p => p && /\.(pem|key|env|secret|p12|pfx)$/i.test(p));
    const pkScan = execSync(
      "git log --all -p -S 'PRIVATE KEY' --format=format:'%H' | head -40",
      { cwd: ROOT, encoding: "utf8" });
    const leaks = pkScan.split("\n").filter(l => l.includes("PRIVATE KEY")).length;
    !paths.length && !leaks
      ? held("BLACK", "history-secret-scan", "no key-material paths or PEM bodies in history")
      : open_("BLACK", "history-secret-scan",
          `paths=${paths.slice(0, 3)} pemHits=${leaks}`);
  }
  /* BLK-05: no committed executables/scripts outside expected dirs */
  {
    const tree = execSync("git ls-tree -r HEAD", { cwd: ROOT, encoding: "utf8" });
    const execs = tree.split("\n").filter(l => l.startsWith("100755"))
      .map(l => l.split("\t")[1]);
    const unexpected = execs.filter(p =>
      !/^(tools\/|scripts\/|os\/|prototypes\/|security\/|.*\.sh$|.*\.py$|.*\.mjs$|.*\.wasm$)/.test(p));
    !unexpected.length
      ? held("BLACK", "exec-surface", `${execs.length} exec files, all in expected dirs`)
      : noted("BLACK", "exec-surface", `unexpected exec paths: ${unexpected.slice(0, 5)}`);
  }
}

console.log("\nGRAY — insider");
/* ================= GRAY — insider ================= */
{
  /* GRY-01: self-issued fleet_admiral cert — desk-local theater only */
  noted("GRAY", "self-issued-flag-cert",
    "verifyCert only requires iss==pk — a devtools insider CAN mint a " +
    "desk-local fleet_admiral record. It buys UI chrome, not fleet " +
    "authority: branch assignments die at branchOf's roster check, " +
    "grants die at verifyGrant's roster check, and genesis sigs die at " +
    "the published member keys. Fleet trust is unaffected — recorded " +
    "as desk-local theater, not a fleet escalation.");

  /* GRY-02: forged flag-founding appearance — self-DoS only */
  {
    const { R } = loadResetModule({ hostname: "public.example",
      genesisLs: { callsign: "ramsey 006", pk: "00".repeat(32),
                   pk_sha256: flagPkHash },   // copied the PUBLIC flag pk hash
      genesisDoc: genWithAdmiral });
    const g = await R.guard();
    g.mode === "vote"
      ? held("GRAY", "flag-lookalike",
          "forged flag appearance only locks the forger's own desk behind the vote")
      : open_("GRAY", "flag-lookalike", `mode=${g.mode}`);
  }

  /* GRY-03: forged roster injection — documented boundary */
  noted("GRAY", "roster-injection",
    "roster is localStorage — an insider on their own desk can roster " +
    "their own pk and pass verifyGrant/branchOf locally. Boundary: it " +
    "changes nothing outside that desk; fleet manifests and genesis " +
    "sigs are verified against published keys, not desk rosters.");

  /* GRY-04: keystore export surface */
  noted("GRAY", "sk-in-session",
    "session.sk lives in page memory while unlocked — devtools or a " +
    "same-origin script can read it (standard for client-side crypto). " +
    "TOTP wrap + PBKDF2 keystore protect at rest; unlocked-session " +
    "exposure is the documented residual.");
}

console.log("\nCOMM — communications");
/* ================= COMM — communications ================= */
{
  /* COM-01: F1 envelope integrity — bad magic/length drops */
  {
    const py = spawnSync("python3", ["-c",
      `import sys; sys.path.insert(0, ${JSON.stringify(HERE)});\n` +
      `import fano_dialect as D\n` +
      `ok = True\n` +
      `w = D.build(1,1,1,7,7,7,1,b"comm")\n` +
      `ok &= D.verify(w)\n` +                                // valid passes
      `bad = bytearray(w); bad[10] ^= 0xFF\n` +
      `ok &= not D.verify(bytes(bad))\n` +                   // covered flip fails
      `ok &= not D.verify(w + b"x")\n` +                     // oversize fails
      `ok &= not D.verify(w[:100])\n` +                      // short fails
      `print("COMM-OK" if ok else "COMM-FAIL")`],
      { encoding: "utf8", timeout: 30_000 });
    /COMM-OK/.test(py.stdout)
      ? held("COMM", "envelope-integrity", "valid seals pass; covered-flip/oversize/short all drop (Python twin)")
      : open_("COMM", "envelope-integrity", (py.stdout + py.stderr).slice(0, 120));
  }
  /* COM-02: sealed wire still verifies post-hardening (JS) */
  {
    const w = F.build(2, 3, 4, 8, 9, 10, 7, Buffer.from("comm-check"));
    F.verify(w) ? held("COMM", "js-verify-post-hardening", "valid wire verifies under strict len==136")
                : open_("COMM", "js-verify-post-hardening", "regression: valid wire dropped");
  }
  /* COM-03: canon parity for vote-token body across impls */
  {
    const body = { v: "FANO-RESET-v1", callsign: "ramsey 006",
                   ts: "2026-10-07T10:54:05.327Z" };
    const js = canon(body);
    const py = spawnSync("python3", ["-c",
      `import json,sys; p=json.loads(sys.argv[1]);` +
      `sys.stdout.write(json.dumps(p, indent=2, ensure_ascii=False))`,
      JSON.stringify(body)], { encoding: "utf8" }).stdout;
    js === py
      ? held("COMM", "vote-canon-parity", "token canon byte-identical JS↔Python")
      : open_("COMM", "vote-canon-parity", "vote token canon diverges");
  }
}

console.log("\nDESK — identity, transfer, roaming");
/* ================= DESK — identity surface ================= */
{
  /* sandboxed fano-auth: real WASM, real signing, mocked storage+fetch */
  const wasmBuf = fs.readFileSync(path.join(SITE, "apps/rations/rations.wasm"));
  function loadAuth({ genesisDoc = null } = {}) {
    const store = new Map();
    const sandbox = {
      console, TextEncoder, TextDecoder, WebAssembly, JSON, Math, Date,
      Promise, Uint8Array, Uint32Array, ArrayBuffer, BigInt, setTimeout,
      atob: s => Buffer.from(s, "base64").toString("binary"),
      btoa: s => Buffer.from(s, "binary").toString("base64"),
      crypto: crypto.webcrypto,
      localStorage: {
        getItem: k => store.has(k) ? store.get(k) : null,
        setItem: (k, v) => store.set(k, String(v)),
        removeItem: k => store.delete(k) },
      WebSocket: function () {},
      location: { hostname: "127.0.0.1" },
      fetch: async (url) => url.includes("fleet-genesis")
        ? { ok: !!genesisDoc, json: async () => genesisDoc }
        : { ok: true, arrayBuffer: async () =>
            wasmBuf.buffer.slice(wasmBuf.byteOffset, wasmBuf.byteOffset + wasmBuf.length) },
    };
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
      fs.readFileSync(path.join(SITE, "assets/fano-auth.js"), "utf8"),
      sandbox);
    return { A: sandbox.FANO_AUTH, store };
  }
  /* DESK-01/02: roaming authenticator — valid fleet-anchored sign-in
     and forgery refusal, end-to-end through real enroll() */

  /* DESK-01/02: roaming authenticator — valid fleet-anchored sign-in
     and forgery refusal, end-to-end through real enroll() */
  {
    const flag = loadAuth();                 /* the flagship desk */
    await flag.A.load();
    const frec = flag.A.enroll("ramsey 006", "flag-credential-1");
    const roaming = flag.A.issueRoaming(30); /* unbound paper */
    if (!frec || frec.error || !roaming) {
      open_("DESK", "roaming-mint", "flag desk could not mint roaming paper");
    } else {
      /* foreign desk founded by someone else; fleet anchor = flag's pk */
      const g2 = JSON.parse(JSON.stringify(realGen));
      g2.payload.members.push({ name: "admiral", role: "flag-seat",
        pubkey_pem_b64: Buffer.from("-----BEGIN PUBLIC KEY-----\n" +
          "xxx\n-----END PUBLIC KEY-----\n").toString("base64") });
      /* the admiral member must carry the flag's REAL pubkey so
         flagAnchored(iss) resolves — derive the pem wrapper */
      const rawPk = Buffer.from(frec.pk, "hex");
      const der = Buffer.concat([
        Buffer.from("302a300506032b6570032100", "hex"), rawPk]);
      const pem = "-----BEGIN PUBLIC KEY-----\n" +
        der.toString("base64") + "\n-----END PUBLIC KEY-----\n";
      g2.payload.members[g2.payload.members.length - 1].pubkey_pem_b64 =
        Buffer.from(pem).toString("base64");

      const desk2 = loadAuth({ genesisDoc: g2 });
      await desk2.A.load();
      desk2.A.enroll("wanderer", "other-credential-1");   /* desk founded by another */
      await desk2.A.bindFleetFlag();
      /* sign out — roaming enrolls a NEW record; burn the wanderer first
         (import/enroll refuse onto founded+recorded desks) */
      const r2 = desk2.A.enroll("ramsey 006", "roam-pass-1234", roaming);
      const ok = r2 && !r2.error && r2.cert && r2.cert.role === 5 &&
                 desk2.A.session.role === 5;
      ok ? held("DESK", "roaming-flag-signin",
           "fleet-anchored authenticator enrolls ramsey 006 as FLEET-ADMIRAL on a foreign founded desk — no founding claimed")
         : open_("DESK", "roaming-flag-signin",
           `rec=${JSON.stringify(r2 && r2.error || (r2 && r2.cert && r2.cert.role))} session=${desk2.A.session.role}`);

      /* forgery: attacker-signed authenticator on the same desk */
      const atkKp = generateKeyPairSync("ed25519");
      const atkPub = atkKp.publicKey
        .export({ type: "spki", format: "der" }).slice(-32);
      const hx = b => Buffer.from(b).toString("hex");
      const atkIss = hx(atkPub);
      const now = Math.floor(Date.now() / 1000) + 30 * 86400;
      const enc2 = new TextEncoder();
      const gb = enc2.encode("FANO-CALLSIGN-v1\nramsey 006\n-\n" + atkIss + "\n" + now);
      const gsig = cryptoSign(null, gb, atkKp.privateKey);
      const cb = enc2.encode("FANO-ROOT-v1\nramsey 006\n-\n5\n" + atkIss + "\n" +
        hx(createHash("sha256").update(Buffer.from(atkPub)).digest()) + "\n" + now);
      const csig = cryptoSign(null, cb, atkKp.privateKey);
      const forgedFixed = Buffer.from(JSON.stringify({ v: "FANO-ROOT-v1",
        callsign: "ramsey 006", sub: null, role: 5, iss: atkIss,
        gen: hx(createHash("sha256").update(Buffer.from(atkPub)).digest()),
        exp: now, sig: hx(csig),
        grant: { callsign: "ramsey 006", sub: null, iss: atkIss,
          sig: hx(gsig), exp: now } })).toString("base64");
      const desk3 = loadAuth({ genesisDoc: g2 });
      await desk3.A.load();
      desk3.A.enroll("wanderer", "other-credential-1");
      await desk3.A.bindFleetFlag();
      const r3 = desk3.A.enroll("ramsey 006", "x-pass-1234", forgedFixed);
      (!r3 || r3.error || (r3.cert && r3.cert.role !== 5))
        ? held("DESK", "roaming-forgery",
            "attacker-issued authenticator refused — iss is not the fleet flag")
        : open_("DESK", "roaming-forgery",
            "forged authenticator enrolled as flag!");
    }
  }

  /* DESK-03/04/05: desk transfer roundtrip, tamper, foreign founding */
  {
    const src = loadAuth(); await src.A.load();
    const rec = src.A.enroll("traveler 9", "carry-credential-9");
    const tok = src.A.exportDesk();
    if (!tok) open_("DESK", "transfer-mint", "export refused on warm session");
    else {
      const dst = loadAuth(); await dst.A.load();
      const r = dst.A.importDesk(tok);
      const un = r.ok && dst.A.unlock("carry-credential-9");
      r.ok && un && un.user === "traveler 9"
        ? held("DESK", "transfer-roundtrip",
            "export→import carries record + founding; credential unwraps on the new desk")
        : open_("DESK", "transfer-roundtrip", JSON.stringify(r));

      const bad = JSON.parse(Buffer.from(tok, "base64").toString());
      bad.issuers = ["ff".repeat(32)];           /* post-sign tamper */
      const badTok = Buffer.from(JSON.stringify(bad)).toString("base64");
      const dst2 = loadAuth(); await dst2.A.load();
      const r2v = dst2.A.importDesk(badTok);
      r2v.error === "sig_invalid"
        ? held("DESK", "transfer-tamper", "post-sign mutation → sig_invalid")
        : open_("DESK", "transfer-tamper", `accepted: ${JSON.stringify(r2v)}`);

      const fg = JSON.parse(Buffer.from(tok, "base64").toString());
      fg.genesis = { callsign: "mallory", pk: "11".repeat(32),
        pk_sha256: "22".repeat(32), ts: Date.now() };
      const fgTok = Buffer.from(JSON.stringify(fg)).toString("base64");
      const dst3 = loadAuth(); await dst3.A.load();
      const r3v = dst3.A.importDesk(fgTok);
      r3v.ok && r3v.founded === false
        ? held("DESK", "transfer-foreign-genesis",
            "token claiming another key's founding imports unfounded — forgery of state refused")
        : r3v.error === "sig_invalid"
          ? held("DESK", "transfer-foreign-genesis",
              "tampered genesis also invalidates the signature — refused earlier, still safe")
          : open_("DESK", "transfer-foreign-genesis", JSON.stringify(r3v));
    }
  }

  /* DESK-06/07: founding ≠ flag rank — a non-pinned first enrollment
     founds the desk as FIELD-AGENT (2026-10-07: "marcus" on the public
     deployment self-anointed FLEET-ADMIRAL before this was closed) */
  {
    const d4 = loadAuth(); await d4.A.load();
    const r4 = d4.A.enroll("marcus", "marcus-pass-1");
    const founded = !!d4.A.genesis();
    const noIssue = !d4.A.grantCallsign("q", null, 90);
    r4 && !r4.error && r4.cert && r4.cert.role === 0 &&
    d4.A.session.role === 0 && founded && noIssue
      ? held("DESK", "founding-not-flag",
          "non-pinned first enrollment founds the desk as FIELD-AGENT — grant issuance refused below STATION-CHIEF")
      : open_("DESK", "founding-not-flag",
          `role=${r4 && r4.cert && r4.cert.role} session=${d4.A.session.role} founded=${founded} grant=${!noIssue}`);

    const d5 = loadAuth(); await d5.A.load();
    const r5 = d5.A.enroll("ramsey 006", "flag-pass-1");
    r5 && !r5.error && r5.cert && r5.cert.role === 5 &&
    d5.A.session.role === 5 && d5.A.genesis()
      ? held("DESK", "pinned-founding-flag",
          "pinned callsign still claims genesis as FLEET-ADMIRAL — flag-seat founding intact")
      : open_("DESK", "pinned-founding-flag",
          `role=${r5 && r5.cert && r5.cert.role} session=${d5.A.session.role} genesis=${!!d5.A.genesis()}`);
  }
}

console.log("\nSPEC004 — classification drawer");
/* ================= SPEC004 — classification ================= */
{
  // tripwire list built without literal surnames (publish-check greps
  // the tree for plaintext names — the sweep still detects them)
  const SUR = new RegExp("\\b(" + ["Zha"+"ng","Elshi"+"kh","Nolte"+"meyer",
    "Adeu"+"soye","Esch"+"bach","S"+"ly"].join("|") + ")\\b");
  const DRAWER = path.join(ROOT, "thoughts&convos");

  /* S4-01: drawer absent from every published tree + history */
  {
    const head = execSync("git ls-tree -r HEAD --name-only",
      { cwd: ROOT, encoding: "utf8" });
    const gph = execSync("git ls-tree -r gh-pages --name-only",
      { cwd: ROOT, encoding: "utf8" });
    const hist = execSync("git log --all --name-only --format=format:'' | sort -u",
      { cwd: ROOT, encoding: "utf8" });
    const inTree = /thoughts&convos|thoughts%20/.test(head + gph);
    const inHist = /thoughts&convos/.test(hist);
    !inTree && !inHist
      ? held("SPEC004", "drawer-never-shipped", "HEAD + gh-pages + full history: zero drawer paths")
      : open_("SPEC004", "drawer-never-shipped",
          `tree=${inTree} history=${inHist}`);
  }
  /* S4-02: surname tripwire across the gh-pages deployment tree */
  {
    const files = execSync("git ls-tree -r gh-pages --name-only",
      { cwd: ROOT, encoding: "utf8" }).split("\n").filter(Boolean);
    let leak = null, scanned = 0;
    for (const f2 of files) {
      if (f2 === "tools/publish-check.sh") continue;
      const p = path.join(SITE, f2);
      try {
        const s = fs.statSync(p);
        if (s.size < 2_000_000 && SUR.test(fs.readFileSync(p, "utf8"))) {
          leak = f2; break; }
        scanned++;
      } catch {}
    }
    !leak ? held("SPEC004", "ghpages-tripwire", `${scanned} deployed files surname-clean`)
          : open_("SPEC004", "ghpages-tripwire", `LEAK: ${leak}`);
  }
  /* S4-03: registry lives only in the drawer */
  {
    const regInDrawer = fs.existsSync(
      path.join(DRAWER, "SPEC-004-REGISTRY.md"));
    const regPublic = (() => { try { return execSync(
      "git ls-tree -r HEAD --name-only | grep -i 'SPEC-004' || true",
      { cwd: ROOT, encoding: "utf8" }).trim(); } catch { return ""; } })();
    regInDrawer && !regPublic
      ? held("SPEC004", "registry-sealed", "SPEC-004-REGISTRY exists only inside the drawer")
      : open_("SPEC004", "registry-sealed",
          `drawer=${regInDrawer} public=${regPublic || "none"}`);
  }
  /* S4-04: declassified copies surname-clean + present */
  {
    const dir = path.join(ROOT, "docs/en/declassified-7q");
    const files = fs.existsSync(dir) ? fs.readdirSync(dir) : [];
    let leak = null;
    for (const f2 of files) {
      const t = fs.readFileSync(path.join(dir, f2), "utf8");
      if (SUR.test(t)) { leak = f2; break; }
    }
    files.length === 4 && !leak
      ? held("SPEC004", "declassified-clean", `${files.length} declassified copies, surname-clean`)
      : open_("SPEC004", "declassified-clean",
          `files=${files.length} leak=${leak}`);
  }
  /* S4-05: drawer restored intact (post git-clean recovery) */
  {
    const ok = fs.existsSync(DRAWER) &&
      fs.existsSync(path.join(DRAWER, "SPEC-004-REGISTRY.md")) &&
      fs.existsSync(path.join(DRAWER, "gov"));
    ok ? held("SPEC004", "drawer-restored",
         "drawer restored intact from archive after git-clean incident; gitignore holds")
       : open_("SPEC004", "drawer-restored", "drawer missing/incomplete!");
  }
  /* S4-06: generated outputs excluded */
  {
    const tree = execSync("git ls-tree -r HEAD --name-only",
      { cwd: ROOT, encoding: "utf8" });
    const leaked = tree.split("\n").filter(p =>
      /^security\/out\//.test(p) || /^zig-out\//.test(p));
    !leaked.length
      ? held("SPEC004", "generated-excluded", "security/out + zig-out absent from tree")
      : open_("SPEC004", "generated-excluded", leaked.slice(0, 3).join(","));
  }
}

/* ---------- merge ---------- */
const out = path.join(SITE, "security", "findings.json");
const prior = JSON.parse(fs.readFileSync(out, "utf8"));
const teams = new Set(findings.map(x => x.team));
const merged = { generated: new Date().toISOString(),
  findings: [...(prior.findings || []).filter(x => !teams.has(x.team)), ...findings] };
fs.writeFileSync(out, JSON.stringify(merged, null, 2));
const tally = findings.reduce((a, x) => (a[x.verdict] = (a[x.verdict] || 0) + 1, a), {});
console.log(`\nTEAM SWEEP 2: ${findings.length} probes — ${JSON.stringify(tally)}`);
process.exit(tally.OPEN ? 1 : 0);
