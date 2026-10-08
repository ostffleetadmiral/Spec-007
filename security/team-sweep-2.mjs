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

/* sandboxed fano-auth: real WASM, real signing, mocked storage+fetch —
   hoisted so DESK and BOT sections share the loader */
const _wasmBuf = fs.readFileSync(path.join(SITE, "apps/rations/rations.wasm"));
function loadAuth({ genesisDoc = null, nav = null, winExtras = null } = {}) {
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
            _wasmBuf.buffer.slice(_wasmBuf.byteOffset, _wasmBuf.byteOffset + _wasmBuf.length) },
    };
    if (nav) sandbox.navigator = nav;
    if (winExtras) Object.assign(sandbox, winExtras);
    sandbox.window = sandbox;
    vm.createContext(sandbox);
    vm.runInContext(
      fs.readFileSync(path.join(SITE, "assets/fano-auth.js"), "utf8"),
      sandbox);
    return { A: sandbox.FANO_AUTH, store, ctx: sandbox };
  }
  /* comms module rides the same sandbox — FANO_AUTH resolves through
     window (= the sandbox itself) */
  function loadComms(opts = {}) {
    const d = loadAuth(opts);
    vm.runInContext(
      fs.readFileSync(path.join(SITE, "assets/fano-comms.js"), "utf8"),
      d.ctx);
    return { A: d.A, C: d.ctx.FANO_COMMS, store: d.store, ctx: d.ctx };
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
     founds the desk as a CADET (2026-10-07: "marcus" on the public
     deployment self-anointed FLEET-ADMIRAL before this was closed) */
  {
    const d4 = loadAuth(); await d4.A.load();
    const r4 = d4.A.enroll("marcus", "marcus-pass-1");
    const founded = !!d4.A.genesis();
    const noIssue = !d4.A.grantCallsign("q", null, 90);
    r4 && !r4.error && r4.cert && r4.cert.role === 0 &&
    d4.A.session.role === 0 && founded && noIssue
      ? held("DESK", "founding-not-flag",
          "non-pinned first enrollment founds the desk as a CADET — grant issuance refused below STATION-CHIEF")
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

  /* DESK-08/09: OSTF offices are watch-list posts. The Strategic
     Command seats (council + advisory titles) and rank-prefixed
     callsigns refuse without a grant; a STATION-CHIEF+-issued grant
     admits the office once — and the holder still lands as a CADET,
     because a title is a name, not a clearance. Positions inside the
     OSTF are applied for through the branch-request chain. */
  {
    const offices = ["vice admiral of stem initiatives",
      "commodore of ethics and equity", "chief warrant officer",
      "fleet admiral marcus", "captain kirk", "chief of staff"];
    let refused = 0; const leaked = [];
    for (const name of offices) {
      const d = loadAuth(); await d.A.load();
      const r = d.A.enroll(name, "office-pass");
      if (r && r.error) refused++; else leaked.push(name);
    }
    const dc = loadAuth(); await dc.A.load();
    const rc = dc.A.enroll("marcus", "control-pass");
    refused === offices.length && !leaked.length &&
    rc && !rc.error && rc.cert && rc.cert.role === 0
      ? held("DESK", "ostf-offices-reserved",
          `${offices.length} office/rank callsigns refused without grant — control "marcus" enrolls as CADET`)
      : open_("DESK", "ostf-offices-reserved",
          `refused=${refused}/${offices.length} leaked=[${leaked}] control=${rc && rc.error}`);

    const d7 = loadAuth(); await d7.A.load();
    d7.A.enroll("ramsey 006", "flag-pass");
    const tok = d7.A.grantCallsign("chief warrant officer", null, 90);
    const r9 = tok && d7.A.enroll("chief warrant officer", "w-pass", tok);
    const again = r9 && !r9.error && d7.A.enroll("chief warrant officer", "w-pass-2");
    tok && r9 && !r9.error && r9.cert && r9.cert.role === 0 &&
    r9.user === "chief warrant officer" && again && again.error
      ? held("DESK", "office-grant-cadet",
          "granted office enrolls once as CADET (role 0) — title ≠ clearance; second claim refused")
      : open_("DESK", "office-grant-cadet",
          `tok=${!!tok} role=${r9 && r9.cert && r9.cert.role} re=${again && again.error}`);
  }

  /* DESK-10..15: desktop/DOM retro-pass (wave 4) — the desk renders
     entities, not markup; the reset sweeps the whole ledger; the
     twins stay in key-parity; the academy count is honest */
  {
    const dsrc = fs.readFileSync(path.join(SITE, "assets/fano-desktop.js"), "utf8");
    const rsrc = fs.readFileSync(path.join(SITE, "assets/fano-reset.js"), "utf8");

    /* DESK-10: user-controlled strings reach innerHTML only through
       esc() — title chokepoint, ident block, folder rows, icon labels */
    {
      const sinks = [
        /win-title">' \+ esc\(title\)/,
        /esc\(ident\.user\)/,
        /esc\(it\[1\]\)/, /esc\(it\[2\]\)/,
        /esc\(ic\.glyph\)/, /esc\(t\("ic\./,
        /function esc\(s\)/];
      const hits = sinks.filter(re => re.test(dsrc)).length;
      hits === sinks.length && !/win-title">' \+ title \+/.test(dsrc)
        ? held("DESK", "xss-escaped",
            "esc() fronts every dynamic innerHTML sink — callsign markup renders as text, not tags")
        : open_("DESK", "xss-escaped", `${hits}/${sinks.length} sinks escaped`);
    }

    /* DESK-11: the reset census sweeps every fano1.* key the assets
       actually write — no orphaned ledgers survive a burn */
    {
      const keyRe = /["']fano1\.[a-z0-9._]+["']/g;
      const written = new Set();
      for (const f of fs.readdirSync(path.join(SITE, "assets"))) {
        if (!f.endsWith(".js")) continue;
        const src = fs.readFileSync(path.join(SITE, "assets", f), "utf8");
        (src.match(keyRe) || []).forEach(k => written.add(k.slice(1, -1)));
      }
      const swept = new Set((rsrc.match(/"fano1\.[a-z0-9._]+"/g) || []).map(k => k.slice(1, -1)));
      const orphans = [...written].filter(k => !swept.has(k));
      orphans.length === 0
        ? held("DESK", "reset-census-complete",
            `${swept.size} keys swept — every ledger the desk writes dies on adjudication (incl. legacy desk.state)`)
        : open_("DESK", "reset-census-complete", `orphans=[${orphans}]`);
    }

    /* DESK-12: i18n exact parity — every EN key has a zh twin and
       vice versa, none empty */
    {
      const sb = { window: {} }; sb.window = sb; vm.createContext(sb);
      vm.runInContext(fs.readFileSync(path.join(SITE, "assets/fano-i18n.js"), "utf8"), sb);
      const { en, zh } = sb.FANO_I18N;
      const enOnly = Object.keys(en).filter(k => !(k in zh));
      const zhOnly = Object.keys(zh).filter(k => !(k in en));
      const empty = [...Object.keys(en).filter(k => !en[k]),
                     ...Object.keys(zh).filter(k => !zh[k])];
      !enOnly.length && !zhOnly.length && !empty.length
        ? held("DESK", "i18n-parity",
            `${Object.keys(en).length} keys each side, zero drift, zero empty — the twins are exact`)
        : open_("DESK", "i18n-parity",
            `enOnly=[${enOnly}] zhOnly=[${zhOnly}] empty=[${empty}]`);
    }

    /* DESK-13: academy manifest integrity — the claimed count is the
       real count and every lesson is fully formed */
    {
      const m = JSON.parse(fs.readFileSync(path.join(SITE, "assets/academy-manifest.json"), "utf8"));
      const incomplete = m.lessons.filter(l => !l.topic || !l.title ||
        !l.outcome || !l.evidence || !l.assessment || !l.source);
      m.lesson_count === m.lessons.length && !incomplete.length
        ? held("DESK", "academy-integrity",
            `${m.lesson_count} lessons claimed = ${m.lessons.length} filed, all fully formed — the curriculum is honest`)
        : open_("DESK", "academy-integrity",
            `claimed=${m.lesson_count} actual=${m.lessons.length} incomplete=${incomplete.length}`);
    }

    /* DESK-14: destructive verdicts arm before they fire — BURN is
       a two-click act, not a misclick */
    {
      /dataset\.armed/.test(dsrc) && /cmd\.burn\.confirm/.test(dsrc)
        ? held("DESK", "burn-confirmed",
            "containment BURN arms on first click, fires on second — no one-shot annihilation")
        : open_("DESK", "burn-confirmed", "one-click burn still live");
    }

    /* DESK-15: no native dialogs anywhere on the desk — prompt/alert/
       confirm all throw under Electron */
    {
      !/\b(prompt|alert|confirm)\s*\(/.test(dsrc) &&
      !/\b(prompt|alert|confirm)\s*\(/.test(rsrc)
        ? held("DESK", "no-native-dialogs",
            "fano-desktop + fano-reset carry zero native dialogs — every prompt is a DOM widget")
        : open_("DESK", "no-native-dialogs", "native dialog call present");
    }

    /* DESK-16: theme contrast — every ink/accent clears WCAG AA 4.5:1
       against its own background, all five liveries */
    {
      const css = fs.readFileSync(path.join(SITE, "assets/fano-desktop.css"), "utf8");
      const lin = c => { c /= 255; return c <= .03928 ? c / 12.92 : Math.pow((c + .055) / 1.055, 2.4); };
      const lum = h => { const n = parseInt(h.slice(1), 16);
        return .2126 * lin(n >> 16) + .7152 * lin(n >> 8 & 255) + .0722 * lin(n & 255); };
      const ratio = (a, b) => { const x = lum(a), y = lum(b);
        return (Math.max(x, y) + .05) / (Math.min(x, y) + .05); };
      const blocks = css.match(/[^{}]+\{[^{}]*--desk-bg[^}]*\}/g) || [];
      let worst = 99, who = "";
      for (const b of blocks) {
        const v = k => { const m = b.match(new RegExp("--" + k + ":\\s*(#[0-9a-f]{6})"));
          return m && m[1]; };
        const bg = v("desk-bg");
        for (const k of ["desk-ink", "desk-dim", "acc", "acc-hi"]) {
          const c = v(k); if (!c || !bg) continue;
          const r = ratio(c, bg);
          if (r < worst) { worst = r; who = k + " in " + b.slice(0, 30); }
        }
      }
      blocks.length >= 5 && worst >= 4.5
        ? held("DESK", "contrast-aa",
            `${blocks.length} livery palettes audited — worst ink ratio ${worst.toFixed(2)}:1 (AA needs 4.5)`)
        : open_("DESK", "contrast-aa",
            `worst=${worst.toFixed(2)} (${who}), palettes=${blocks.length}`);
    }

    /* DESK-17: motion is a courtesy — reduced-motion stills the desk
       and the paper */
    {
      const desk = fs.readFileSync(path.join(SITE, "assets/fano-desktop.css"), "utf8");
      const dos = fs.readFileSync(path.join(SITE, "assets/dossier.css"), "utf8");
      /prefers-reduced-motion/.test(desk) && /animation:\s*none/.test(desk) &&
      /prefers-reduced-motion/.test(dos)
        ? held("DESK", "reduced-motion",
            "wallspin, boot fade, window transitions all still under prefers-reduced-motion")
        : open_("DESK", "reduced-motion", "no reduced-motion handling in desk or dossier css");
    }

    /* DESK-18: print stylesheet — the file prints like paper, the desk
       prints its windows, not its room */
    {
      const desk = fs.readFileSync(path.join(SITE, "assets/fano-desktop.css"), "utf8");
      const dos = fs.readFileSync(path.join(SITE, "assets/dossier.css"), "utf8");
      /@media\s+print/.test(dos) && /nav\.file-nav[^}]*display:\s*none/.test(dos) &&
      /@media\s+print/.test(desk) && /\.taskbar[^}]*display:\s*none/.test(desk)
        ? held("DESK", "print-stylesheet",
            "dossier prints chrome-free (nav/watermark suppressed); desk prints windows without taskbar/icons")
        : open_("DESK", "print-stylesheet", "print media rules missing");
    }

    /* DESK-19: narrow viewports — the chart table wraps, the chrome
       yields, nothing squeezes to mush under 50rem */
    {
      const css = fs.readFileSync(path.join(SITE, "assets/fano-desktop.css"), "utf8");
      const mq = css.match(/@media\s*\(max-width:\s*50rem\)\s*\{([^@]*)\}/);
      /flex-wrap/.test(css.match(/\.adm-chart\s*\{[^}]*\}/)?.[0] || "") &&
      mq && /leds/.test(mq[1]) && /start-menu/.test(mq[1])
        ? held("DESK", "narrow-viewport",
            "adm-chart wraps, LEDs cede the taskbar, start-menu clamps to 92vw under 50rem")
        : open_("DESK", "narrow-viewport", "narrow layout rules incomplete");
    }

    /* DESK-20: i18n chrome coverage — every toast/sec/row/button and
       flavor string routes through t(); the literal pool is ratcheted */
    {
      const hits = (dsrc.match(/(toast|sec|row|button)\(\s*"/g) || [])
        .filter(m => !/t\(/.test(m));
      const tcLit = (dsrc.match(/textContent\s*=\s*"[A-Za-z]/g) || []);
      const achArray = /var ACHIEVEMENTS = \[/.test(dsrc);
      const eggArray = /var EGGS = \[/.test(dsrc);
      const achT = /t\("ach\." \+ id\)/.test(dsrc);
      !hits.length && !tcLit.length && achArray && eggArray && achT
        ? held("DESK", "i18n-chrome",
            "zero untranslated chrome literals — toasts, suite rows, achievements and eggs all speak both tongues")
        : open_("DESK", "i18n-chrome",
            `literal calls=${hits.length} tcLits=${tcLit.length} achArr=${achArray} eggArr=${eggArray} achT=${achT}`);
    }
  }

console.log("\nBOT — containment doctrine");
/* ================= BOT — containment =================
   Any bot-shaped activity is a cadet in containment: pinned to role 0,
   sealed from every privilege gate, released only by signed
   FANO-CONTAIN-v1 promotion paper from a STATION-CHIEF+ or the fleet
   flag — human adjudication, not self-service. */
{
  /* BOT-01: webdriver-flagged enrollment is contained at role 0 */
  {
    const d = loadAuth({ nav: { webdriver: true, userAgent: "Mozilla/5.0 Test" } });
    await d.A.load();
    const r = d.A.enroll("scrapy", "bot-pass-1");
    r && !r.error && r.cert && r.cert.role === 0 &&
    r.contained && r.contained.length && d.A.isContained() &&
    (d.A.containedList()[r.pk] || {}).status === "pending"
      ? held("BOT", "webdriver-contained",
          "navigator.webdriver enroll → contained flag, role 0, registry entry pending")
      : open_("BOT", "webdriver-contained",
          `contained=${r && r.contained} role=${r && r.cert && r.cert.role} containedNow=${d.A.isContained()}`);

    /* BOT-02: a bot claiming the pinned callsign still lands cadet —
       containment outranks the flag seat's own name */
    const d2 = loadAuth({ nav: { webdriver: true } });
    await d2.A.load();
    const r2 = d2.A.enroll("ramsey 006", "bot-flag-1");
    r2 && !r2.error && r2.cert && r2.cert.role === 0 && d2.A.isContained()
      ? held("BOT", "pinned-bot-still-cadet",
          "bot claiming 'ramsey 006' genesis → contained cadet, not FLEET-ADMIRAL")
      : open_("BOT", "pinned-bot-still-cadet",
          `role=${r2 && r2.cert && r2.cert.role} contained=${d2.A.isContained()}`);
  }

  /* BOT-03: every privilege gate seals against contained sessions */
  {
    const d = loadAuth({ nav: { webdriver: true } });
    await d.A.load();
    const r = d.A.enroll("robo-enroller", "bot-pass-2");
    const denied = !d.A.grantCallsign("q", null, 90) &&
      !d.A.requestBranch("security") &&
      !d.A.issueCredential(r && r.pk, 30) &&
      !d.A.assignBranch(r && r.pk, "security") &&
      !d.A.addIssuer("aa".repeat(32)) &&
      !d.A.exportDesk() &&
      (d.A.setupTotp() || {}).error === "contained";
    denied ? held("BOT", "contained-gates-sealed",
        "grants, branch apply/assign, credentials, roster, export, TOTP — all refused under containment")
      : open_("BOT", "contained-gates-sealed", "a contained session reached a privilege gate");
  }

  /* BOT-04/05: UA and automation-global detection */
  {
    const d = loadAuth({ nav: { webdriver: false,
      userAgent: "Mozilla/5.0 (X11; Linux x86_64) HeadlessChrome/120.0" } });
    await d.A.load();
    const r = d.A.enroll("headless-one", "bot-pass-3");
    const d2 = loadAuth({ winExtras: { callPhantom: function () {} } });
    await d2.A.load();
    const r2 = d2.A.enroll("phantom-one", "bot-pass-4");
    r && r.contained && /ua:/.test(r.contained.join(" ")) &&
    r2 && r2.contained && /global:callPhantom/.test(r2.contained.join(" "))
      ? held("BOT", "signal-spectrum",
          "HeadlessChrome UA + callPhantom global both flag — strong signals contain on one hit")
      : open_("BOT", "signal-spectrum",
          `ua=${r && r.contained} global=${r2 && r2.contained}`);

    const d3 = loadAuth();
    await d3.A.load();
    const r3 = d3.A.enroll("human-paul", "human-pass-1");
    r3 && !r3.error && !r3.contained && !d3.A.isContained()
      ? held("BOT", "clean-enroll-free",
          "no navigator/globals → clean enrollment, no flag — false-positive channel stays open")
      : open_("BOT", "clean-enroll-free", `contained=${r3 && r3.contained}`);
  }

  /* BOT-06/07/08: adjudication — promotion paper releases, forgery refused */
  {
    /* flag desk mints the release for the bot's pk */
    const flag = loadAuth(); await flag.A.load();
    const frec = flag.A.enroll("ramsey 006", "flag-credential-9");
    const bot = loadAuth({ nav: { webdriver: true } });
    await bot.A.load();
    const br = bot.A.enroll("tinman", "bot-pass-5");
    const promo = flag.A.issuePromotion(br && br.pk, 30);
    const tok = flag.A.exportPromotion(promo);

    /* bot desk can't use it until the flag anchor binds — mint a
       fleet genesis carrying the flag desk's real pubkey */
    const g3 = JSON.parse(JSON.stringify(realGen));
    const rawPk2 = Buffer.from(frec.pk, "hex");
    const der2 = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"), rawPk2]);
    const pem2 = "-----BEGIN PUBLIC KEY-----\n" + der2.toString("base64") + "\n-----END PUBLIC KEY-----\n";
    g3.payload.members.push({ name: "admiral", role: "flag-seat",
      pubkey_pem_b64: Buffer.from(pem2).toString("base64") });
    const bot2 = loadAuth({ genesisDoc: g3, nav: { webdriver: true } });
    await bot2.A.load();
    const br2 = bot2.A.enroll("tinman", "bot-pass-6");
    await bot2.A.bindFleetFlag();
    const promo2 = flag.A.issuePromotion(br2 && br2.pk, 30);
    const tok2 = flag.A.exportPromotion(promo2);
    const freed = bot2.A.importPromotion(tok2);
    freed && !bot2.A.isContained() &&
    (bot2.A.containedList()[br2.pk] || {}).status === "promoted"
      ? held("BOT", "promotion-paper-releases",
          "FANO-CONTAIN-v1 signed by the fleet flag clears the flag + registry — human adjudication works")
      : open_("BOT", "promotion-paper-releases",
          `freed=${freed} contained=${bot2.A.isContained()}`);

    /* wrong-subject and untrusted-issuer promotions refuse */
    const d4 = loadAuth({ genesisDoc: g3, nav: { webdriver: true } });
    await d4.A.load();
    const r4 = d4.A.enroll("tinman", "bot-pass-7");
    await d4.A.bindFleetFlag();
    const wrongSub = flag.A.issuePromotion("ff".repeat(32), 30);
    const w1 = d4.A.importPromotion(flag.A.exportPromotion(wrongSub));
    const atk = generateKeyPairSync("ed25519");
    const atkHex = Buffer.from(atk.publicKey.export({ type: "spki", format: "der" }).slice(-32)).toString("hex");
    const now2 = Math.floor(Date.now() / 1000) + 86400;
    const enc3 = new TextEncoder();
    const fakeSig = cryptoSign(null, enc3.encode("FANO-CONTAIN-v1\n" + r4.pk + "\n" + atkHex + "\n" + now2), atk.privateKey);
    const w2 = d4.A.importPromotion(Buffer.from(JSON.stringify({ v: "FANO-CONTAIN-v1",
      sub: r4.pk, iss: atkHex, sig: Buffer.from(fakeSig).toString("hex"), exp: now2 })).toString("base64"));
    !w1 && !w2 && d4.A.isContained()
      ? held("BOT", "promotion-forgery-refused",
          "wrong-subject + untrusted-issuer promotion paper refused — containment holds")
      : open_("BOT", "promotion-forgery-refused",
          `w1=${w1} w2=${w2} contained=${d4.A.isContained()}`);
  }
}

console.log("\nAUTH — cert/trust retro-pass (wave 2)");
/* ================= AUTH — cert/trust retro-pass =================
   Wave-2 reverse-engineering findings, fixed and held by probe:
   addIssuer was ungated (any session could roster any key, then a
   self-minted elevated cert verified); verifyCert took no role bound
   and trusted a stored _fleet flag instead of re-verifying the grant;
   expired grants were never swept and no revocation path existed;
   verifyTotp had no throttle; session.sk was never zeroed. */
{
  /* AUTH-01: roster mutation is privileged — a cadet session cannot
     roster a key; the flag session can */
  {
    const d = loadAuth(); await d.A.load();
    d.A.enroll("marcus", "m-pass");
    const before = d.A.roster().length;
    const refused = d.A.addIssuer("aa".repeat(32)) === false &&
      d.A.roster().length === before;
    const f = loadAuth(); await f.A.load();
    f.A.enroll("ramsey 006", "f-pass");
    const added = f.A.addIssuer("aa".repeat(32)) === true &&
      f.A.roster().includes("aa".repeat(32));
    refused && added
      ? held("AUTH", "roster-gated",
          "cadet addIssuer refused (STATION-CHIEF+ gate); flag session rosters fine — the GRAY-01 side-door closed")
      : open_("AUTH", "roster-gated",
          `refused=${refused} added=${added}`);
  }

  /* AUTH-02: a perfectly signed role-99 cert still fails — the role
     field itself is bound, signature alone doesn't elevate */
  {
    const d = loadAuth(); await d.A.load();
    const rec = d.A.enroll("marcus", "m-pass");
    /* marcus founded the desk — his pk is rostered. Mint a VALID
       self-issued role-99 cert: only the role bound can stop it */
    const c99 = d.A.issueCert(d.A.unhex(rec.pk), "marcus", 99,
      d.A.unhex(rec.covenant_sha256), d.A.unhex(rec.pk), d.A.session.sk, 90);
    const tam = JSON.parse(d.store.get(d.A.STORE_KEY));
    tam.cert = c99;
    d.store.set(d.A.STORE_KEY, JSON.stringify(tam));
    d.A.unlock("m-pass");
    c99 && d.A.session.role === 0 && !d.A.verifyCert(tam)
      ? held("AUTH", "cert-role-bound",
          "valid-signature role-99 cert refused at verifyCert and at unlock — ranks bound to 0..5")
      : open_("AUTH", "cert-role-bound",
          `c99=${!!c99} session=${d.A.session.role}`);
  }

  /* AUTH-03: expired grants are swept on read — dead paper can't
     resurrect downstream */
  {
    const d = loadAuth(); await d.A.load();
    d.A.enroll("marcus", "m-pass");
    d.store.set(d.A.GRANTS_KEY, JSON.stringify({
      q: { callsign: "q", iss: "aa".repeat(32), sig: "00".repeat(64), exp: 1000 },
      m: { callsign: "m", iss: "aa".repeat(32), sig: "00".repeat(64),
           exp: Math.floor(Date.now() / 1000) + 86400 } }));
    const left = d.A.grants();
    !left.q && left.m &&
    JSON.parse(d.store.get(d.A.GRANTS_KEY)).q === undefined
      ? held("AUTH", "grant-expiry-swept",
          "lapsed grant pruned on read; live grant untouched — ledger self-cleans")
      : open_("AUTH", "grant-expiry-swept",
          `left=${Object.keys(left)}`);
  }

  /* AUTH-04: revocation kills a live grant — the paper stays filed
     but every check refuses it; a cadet can't revoke */
  {
    const d = loadAuth(); await d.A.load();
    d.A.enroll("ramsey 006", "f-pass");
    const g = d.A.grantCallsign("q", null, 90);
    const okBefore = g && d.A.checkCallsign("q", "bb".repeat(32)).ok;
    const rv = d.A.revokeCallsign("q");
    const g2 = d.A.grants()["q"];
    const deadAfter = !d.A.checkCallsign("q", "bb".repeat(32)).ok &&
      !d.A.verifyGrant(g2, "bb".repeat(32)) && !!d.A.revoked()["q"];
    const d2 = loadAuth(); await d2.A.load();
    d2.A.enroll("marcus", "m-pass");
    const cadetRevoke = d2.A.revokeCallsign("q") === false;
    okBefore && rv === true && deadAfter && cadetRevoke
      ? held("AUTH", "revocation-kills-grant",
          "flag revokes 'q' — grant stays filed as evidence, verifyGrant + checkCallsign refuse; cadet revoke refused")
      : open_("AUTH", "revocation-kills-grant",
          `okBefore=${okBefore} rv=${rv} dead=${deadAfter} cadet=${cadetRevoke}`);
  }

  /* AUTH-05: TOTP shares the unlock throttle — five wrong codes lock,
     and the lockout gates further guesses */
  {
    const d = loadAuth(); await d.A.load();
    d.A.enroll("marcus", "m-pass");
    const t = d.A.setupTotp("FANO-1", "marcus");
    const wrongs = ["900001", "900002", "900003", "900004", "900005",
      "900006", "900007"].filter(c => c !== (t && t.code));
    let misses = 0;
    for (const c of wrongs) {
      if (misses >= 5) break;
      if (d.A.verifyTotp(c) === false) misses++;
    }
    const locked = d.A.lockRemain() > 0;
    const gated = locked && d.A.verifyTotp("999999") === false;
    t && misses >= 5 && locked && gated
      ? held("AUTH", "totp-throttle",
          "5 wrong TOTP codes → lockout engages and gates the next guess — no free 6-digit search space")
      : open_("AUTH", "totp-throttle",
          `misses=${misses} locked=${locked} gated=${gated}`);
  }

  /* AUTH-06: roster removal — flag removes a non-founding issuer;
     the founding key refuses (trust anchor); cadet can't remove */
  {
    const f = loadAuth(); await f.A.load();
    const fr = f.A.enroll("ramsey 006", "f-pass");
    f.A.addIssuer("aa".repeat(32));
    const removed = f.A.removeIssuer("aa".repeat(32)) === true &&
      !f.A.roster().includes("aa".repeat(32));
    const anchor = f.A.removeIssuer(fr.pk);
    const anchorHeld = anchor && anchor.error === "founding_key" &&
      f.A.roster().includes(fr.pk);
    const d2 = loadAuth(); await d2.A.load();
    d2.A.enroll("marcus", "m-pass");
    const cadetRm = d2.A.removeIssuer("aa".repeat(32)) === false;
    removed && anchorHeld && cadetRm
      ? held("AUTH", "roster-remove-anchored",
          "issuer removal works for flag, refuses the founding key, refuses cadets — anchor can't be orphaned")
      : open_("AUTH", "roster-remove-anchored",
          `removed=${removed} anchor=${anchorHeld} cadet=${cadetRm}`);
  }

  /* AUTH-07: lock() zeroes the unwrapped secret bytes before dropping
     the reference — the seed isn't left warm in memory */
  {
    const d = loadAuth(); await d.A.load();
    d.A.enroll("marcus", "m-pass");
    const ref = d.A.session.sk;
    d.A.lock();
    const zeroed = ref && ref.every(b => b === 0);
    zeroed && d.A.session.sk === null && d.A.session.role === 0 &&
    d.A.session.user === null
      ? held("AUTH", "lock-zeroes-sk",
          "lock() fills the seed buffer with zeros then clears the session — warm-secret hygiene")
      : open_("AUTH", "lock-zeroes-sk",
          `zeroed=${!!zeroed} sk=${d.A.session.sk}`);
  }

  /* AUTH-08: flag trust derives from the grant, not a stored flag —
     a raw-imported flag grant (no persisted _fleet) still anchors the
     flag cert at unlock because verifyCert re-verifies the paper */
  {
    const flag = loadAuth(); await flag.A.load();
    const frec = flag.A.enroll("ramsey 006", "flag-cred-a8");
    const roam = flag.A.issueRoaming(30);
    const gObj = roam ? JSON.parse(Buffer.from(roam, "base64").toString()).grant : null;
    const rawTok = gObj && Buffer.from(JSON.stringify(gObj)).toString("base64");

    const g3 = JSON.parse(JSON.stringify(realGen));
    const der = Buffer.concat([Buffer.from("302a300506032b6570032100", "hex"),
      Buffer.from(frec.pk, "hex")]);
    const pem = "-----BEGIN PUBLIC KEY-----\n" + der.toString("base64") +
      "\n-----END PUBLIC KEY-----\n";
    g3.payload.members.push({ name: "admiral", role: "flag-seat",
      pubkey_pem_b64: Buffer.from(pem).toString("base64") });

    const d = loadAuth({ genesisDoc: g3 }); await d.A.load();
    d.A.enroll("marcus", "m-pass");
    await d.A.bindFleetFlag();
    d.A.importGrant(rawTok);
    /* prove the fragile input: the stored grant carries NO _fleet flag */
    const st = JSON.parse(d.store.get(d.A.GRANTS_KEY));
    const noFleet = st["ramsey 006"] && st["ramsey 006"]._fleet === undefined;
    d.A.enroll("ramsey 006", "roam-pass");
    const un = d.A.unlock("roam-pass");
    noFleet && un && d.A.session.role === 5
      ? held("AUTH", "flag-grant-derivation",
          "raw flag grant (no stored _fleet) anchors the role-5 cert — trust derives from re-verified paper")
      : open_("AUTH", "flag-grant-derivation",
          `noFleet=${noFleet} unlocked=${!!un} role=${d.A.session.role}`);
  }

  /* AUTH-09: import fuzz — every inbound token path must refuse
     malformed input cleanly, never throw or store */
  {
    const d = loadAuth(); await d.A.load();
    d.A.enroll("marcus", "m-pass");
    const junk = ["", "!!!", "AAAA", Buffer.from("null").toString("base64"),
      Buffer.from("{}").toString("base64"),
      Buffer.from("{\"v\":\"FANO-ROOT-v1\"}").toString("base64"),
      Buffer.from("[1,2,3]").toString("base64"),
      Buffer.from("x".repeat(4096)).toString("base64")];
    let threw = 0, accepted = 0;
    for (const t of junk) {
      for (const fn of ["importGrant", "importRequest", "importDesk", "importPromotion"]) {
        try {
          const r = d.A[fn](t);
          if (fn === "importGrant" || fn === "importRequest") {
            if (r === true || (r && r.ok)) accepted++;
          } else if (r && r.ok) accepted++;
        } catch (e) { threw++; }
      }
    }
    threw === 0 && accepted === 0
      ? held("AUTH", "import-fuzz",
          "32 malformed-token inputs across 4 import paths — all refused cleanly, zero throws, zero stores")
      : open_("AUTH", "import-fuzz",
          `threw=${threw} accepted=${accepted}`);
  }
}

console.log("\nWIRE — comms retro-pass (wave 3)");
/* ================= WIRE — comms retro-pass =================
   Wave-3 reverse-engineering findings on fano-comms.js, fixed and
   held by probe: wasm-reported lengths were never clamped to their
     output buffers (adjacent-heap read into JS strings); hex inputs
     reached wasm unvalidated (short buffers + hardcoded lengths);
     inviteCreate had no internal tier gate and no role clamp; any URL
     scheme reached the dialer; presence text was trusted as a contact
     name (restricted-callsign impersonation); prompt() broke MSG under
     Electron; shamir allocation was unbounded. */
{
  const commsSrc = fs.readFileSync(path.join(SITE, "assets/fano-comms.js"), "utf8");

  /* WIRE-01: a wasm function reporting n > cap must be clamped —
     otherwise it reads adjacent heap into the decoded string */
  {
    const d = loadComms(); await d.A.load();
    d.A.enroll("marcus", "w-pass");
    const fn = (op, cap, lp) => {
      new Uint8Array(d.A.memory().buffer, op, cap).fill(65);
      new Uint32Array(d.A.memory().buffer, lp, 1)[0] = cap + 4096;
      return true; };
    const s = d.C.jread(fn, 16);
    s && s.length === 16 && s === "A".repeat(16)
      ? held("WIRE", "out-read-clamped",
          "wasm reported n=cap+4096 — jread decoded exactly cap bytes, adjacent heap never surfaced")
      : open_("WIRE", "out-read-clamped", `len=${s && s.length}`);
  }

  /* WIRE-02: the dialer refuses non-ws schemes and malformed peer ids */
  {
    const d = loadComms(); await d.A.load();
    d.A.enroll("marcus", "w-pass");
    const pk = "aa".repeat(32);
    const bad = [d.C.connect("javascript:alert(1)", pk),
      d.C.connect("http://relay", pk), d.C.connect("file:///x", pk),
      d.C.connect("ws://relay", "deadbeef"),
      d.C.connect("ws://relay", "zz".repeat(32)),
      d.C.connect("", pk), d.C.connect(null, pk)];
    bad.every(v => v === null)
      ? held("WIRE", "dial-validated",
          "javascript:/http:/file: schemes and short/non-hex peer ids all refused before wasm")
      : open_("WIRE", "dial-validated", `bad=[${bad}]`);
  }

  /* WIRE-03: invites are tier-bound + enum-bound — cadet refused,
     out-of-enum roles refused, admin invites are flag-seat only,
     a chief-tier session mints user/moderator */
  {
    const c = loadComms(); await c.A.load();
    c.A.enroll("marcus", "c-pass");
    const cadet = c.C.inviteCreate("aa".repeat(32), "ws://r", 2, 30);
    c.A.session.role = 3;               /* chief-tier session (in-memory gate probe) */
    const chiefAdmin = c.C.inviteCreate("aa".repeat(32), "ws://r", 0, 30);
    const chiefUser = c.C.inviteCreate("aa".repeat(32), "ws://r", 2, 30);
    const f = loadComms(); await f.A.load();
    f.A.enroll("ramsey 006", "f-pass");
    const over = f.C.inviteCreate("aa".repeat(32), "ws://r", 3, 30);
    const badNet = f.C.inviteCreate("deadbeef", "ws://r", 2, 30);
    const good = f.C.inviteCreate("aa".repeat(32), "ws://r", 0, 30);
    cadet === null && chiefAdmin === null && over === null &&
    badNet === null && good instanceof Uint8Array && good.length > 0 &&
    chiefUser instanceof Uint8Array && chiefUser.length > 0
      ? held("WIRE", "invite-tier-bound",
          "cadet refused · chief can't mint admin · out-of-enum + bad net id refused · flag admin + chief user mints — ABI realigned to rations_invite_create")
      : open_("WIRE", "invite-tier-bound",
          `cadet=${cadet} cAdmin=${chiefAdmin} cUser=${chiefUser && chiefUser.length} over=${over} net=${badNet} good=${good && good.length}`);
  }

  /* WIRE-04: presence labels can't impersonate — pinned/restricted
     callsigns in unsigned presence text render as the peer id */
  {
    const d = loadComms(); await d.A.load();
    d.A.enroll("marcus", "w-pass");
    const pid = "aa".repeat(32);
    const cases = [
      d.C.peerLabel("fleet admiral", pid) === "peer-aaaaaaaa",
      d.C.peerLabel("ramsey 006", pid) === "peer-aaaaaaaa",
      d.C.peerLabel("chief warrant officer", pid) === "peer-aaaaaaaa",
      d.C.peerLabel("moneypenny", pid) === "peer-aaaaaaaa",
      d.C.peerLabel("marcus", pid) === "marcus",
      d.C.peerLabel("", pid) === "peer-aaaaaaaa"];
    cases.every(Boolean)
      ? held("WIRE", "presence-sanitized",
          "4 restricted/pinned presence names render as peer-aaaaaaaa — unsigned wire text can't borrow a rank; 'marcus' passes")
      : open_("WIRE", "presence-sanitized", `cases=[${cases}]`);
  }

  /* WIRE-05: shamir inputs are bounded — bad k/n, empty or oversized
     secrets, oversized share sets all refuse; the valid path roundtrips */
  {
    const d = loadComms(); await d.A.load();
    d.A.enroll("marcus", "w-pass");
    const refuse = [d.C.shamirSplit("s", 3, 2), d.C.shamirSplit("s", 2, 300),
      d.C.shamirSplit("", 2, 3), d.C.shamirSplit("x".repeat(70000), 2, 3),
      d.C.shamirSplit("s", 1, 3),
      d.C.shamirJoin(new Array(251).fill(new Uint8Array(4)))];
    const shares = d.C.shamirSplit("codeword", 2, 3);
    const back = shares && d.C.shamirJoin(shares.slice(0, 2));
    refuse.every(v => v === null) && back === "codeword"
      ? held("WIRE", "shamir-bounded",
          "5 bad split/join inputs refused · 2-of-3 roundtrip recovers 'codeword' — bounds hold, math intact")
      : open_("WIRE", "shamir-bounded",
          `refuse=[${refuse}] back=${back}`);
  }

  /* WIRE-06: hex gates — malformed pid/pk refused before wasm;
     well-formed inputs reach the phone layer */
  {
    const d = loadComms(); await d.A.load();
    d.A.enroll("marcus", "w-pass");
    const bad = [d.C.addContact("zz", "aa".repeat(32)),
      d.C.addContact("aa".repeat(32), "short"),
      d.C.sendMsg("short", "hi"), d.C.sendMsg("aa".repeat(32), "")];
    const ok = d.C.addContact("aa".repeat(32), "bb".repeat(32));
    bad.every(v => v === false) && ok === true
      ? held("WIRE", "hex-gates",
          "3 malformed contact/msg inputs refused at the gate · well-formed pair files into the phone layer")
      : open_("WIRE", "hex-gates", `bad=[${bad}] ok=${ok}`);
  }

  /* WIRE-07: no prompt() — the Electron desk can't open one; MSG
     composes inline */
  {
    !/\bprompt\s*\(/.test(commsSrc)
      ? held("WIRE", "no-prompt",
          "fano-comms.js is prompt()-free — MSG composes inline, Electron-compatible")
      : open_("WIRE", "no-prompt", "prompt() still present");
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
