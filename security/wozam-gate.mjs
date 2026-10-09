// wozam-gate.mjs — Layer-3 runtime continuity gate: the deployed wasm32
// artifacts re-executed under `k3w` (zig-k3-port/wasmrt), the in-tree
// wasm32+wasm64(memory64) interpreter. The substrate claim is tested, not
// asserted: the same guest bytes must produce bit-identical results in the
// browser (quine self-check), the Python dialect twin, and the interpreter.
//
//   Probes:
//     WZ-01 runtime-resident  — k3w binary present (zig build if absent)
//     WZ-02 fano-golden       — the quine's own 3 vectors verify under k3w
//     WZ-03 fano-build-parity — interpreted build ≡ Python twin bytes
//     WZ-04 fano-forge        — tampered wire refused under k3w
//     WZ-05 determinism       — identical build run twice → identical wire
//     WZ-06 rations-sha256    — interpreted hash ≡ node crypto, imported mem
//     WZ-07 rations-ed25519   — RFC 8032 vector bit-identical + sign/verify
//
//   Golden vectors are extracted live from site/apps/fano/index.html — the
//   same bytes the browser quine runs; a drifted source is a drifted gate.
//
//   node security/wozam-gate.mjs          # run + verdicts
//   node security/wozam-gate.mjs --emit   # + out/wozam-gate.json
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";
import { execFileSync, execSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const K3W = path.resolve(ROOT, "..", "zig-k3-port", "wasmrt", "zig-out", "bin", "k3w");
const K3W_SRC = path.resolve(ROOT, "..", "zig-k3-port", "wasmrt");
const FANO = path.join(ROOT, "site", "apps", "fano", "fano.wasm");
const FANO_HTML = path.join(ROOT, "site", "apps", "fano", "index.html");
const RATIONS = path.join(ROOT, "site", "apps", "rations", "rations.wasm");
const DIALECT = path.join(HERE, "fano_dialect.py");
const OUT = path.join(HERE, "out", "wozam-gate.json");

const findings = [];
const say = (id, verdict, detail) => {
  findings.push({ id, verdict, detail });
  console.log(` ${verdict.padEnd(8)} ${id}  ${detail}`);
};
const k3w = (wasm, args) =>
  execFileSync(K3W, [wasm, ...args], { timeout: 300_000, encoding: "utf8" });
const callRes = (out, name) =>
  Number((out.match(new RegExp(`call ${name.replace(/\$/g, "")} result\\[0\\] = (\\d+)`)) || [])[1]);
const peekHex = (out, addr) =>
  (out.match(new RegExp(`peek ${addr.toString(16)}:\\d+ = ([0-9a-f]+)`)) || [])[1];

/* WZ-01 — the interpreter must exist */
try {
  if (!fs.existsSync(K3W)) execSync("zig build", { cwd: K3W_SRC, stdio: "pipe" });
  k3w(FANO, ["--poke=0:00", "--call", "fano_basis_at", "--arg", "7", "--arg", "7", "--arg", "7"]);
  say("WZ-01", "HELD", `k3w resident at zig-k3-port/wasmrt — wasm32+wasm64(memory64) interpreter`);
} catch (e) {
  say("WZ-01", "BLOCKED", `k3w unavailable — ${String(e).slice(0, 120)}`);
}

if (findings[0].verdict !== "BLOCKED") {
  /* golden vectors — the same hex the browser quine executes */
  const html = fs.readFileSync(FANO_HTML, "utf8");
  const vecBlock = html.slice(html.indexOf("const VECS"), html.indexOf("];", html.indexOf("const VECS")));
  const vecs = vecBlock.split(/,\s*\n/)
    .map(entry => [...entry.matchAll(/"([0-9a-f]+)"/g)].map(m => m[1]).join(""))
    .filter(h => h.length === 272); /* 136 B wires only — layout edits can't shrink a vector silently */

  /* WZ-02 — golden vectors verify under interpretation */
  let ok = 0;
  for (const v of vecs) {
    const out = k3w(FANO, ["--poke=0:" + v, "--call", "fano_packet_verify", "--arg", "0"]);
    if (callRes(out, "fano_packet_verify") === 1) ok++;
  }
  say("WZ-02", ok === vecs.length && vecs.length === 3 ? "HELD" : "OPEN",
    `${ok}/${vecs.length} firmware golden wires verify under k3w (source: the quine's own VECS)`);

  /* WZ-03 — interpreted build ≡ Python twin, byte for byte */
  const payload = Buffer.from("quine-self-check");
  const pyWire = execSync(`python3 -c "import sys; sys.path.insert(0,'${HERE}'); ` +
    `import fano_dialect as f; print(f.build(1,2,3,13,14,14,0x5157,bytes.fromhex('${payload.toString("hex")}')).hex())"`,
    { encoding: "utf8" }).trim();
  const buildOut = k3w(FANO, [
    `--poke=1024:${payload.toString("hex")}`,
    "--call", "fano_packet_build",
    "--arg", "1", "--arg", "2", "--arg", "3", "--arg", "13", "--arg", "14", "--arg", "14",
    "--arg", "20823", "--arg", "1024", "--arg", String(payload.length), "--arg", "0",
    "--peek=0:136"]);
  const wire = peekHex(buildOut, 0);
  const wireOk = wire === pyWire && callRes(buildOut, "fano_packet_build") === 136;
  say("WZ-03", wireOk ? "HELD" : "OPEN",
    wireOk ? "k3w-interpreted build ≡ Python dialect twin ≡ browser quine — 136 B byte-identical"
           : `wire mismatch — interpreted ${String(wire).slice(0, 32)}… vs twin ${pyWire.slice(0, 32)}…`);

  /* WZ-04 — a forged wire refuses under interpretation */
  const forged = wire.slice(0, 90) + (wire[90] === "f" ? "e" : "f") + wire.slice(91);
  const fOut = k3w(FANO, ["--poke=0:" + forged, "--call", "fano_packet_verify", "--arg", "0"]);
  say("WZ-04", callRes(fOut, "fano_packet_verify") === 0 ? "HELD" : "OPEN",
    "forged payload byte → verify returns 0 under k3w");

  /* WZ-05 — determinism: identical invocation, identical wire */
  const again = peekHex(k3w(FANO, [
    `--poke=1024:${payload.toString("hex")}`,
    "--call", "fano_packet_build",
    "--arg", "1", "--arg", "2", "--arg", "3", "--arg", "13", "--arg", "14", "--arg", "14",
    "--arg", "20823", "--arg", "1024", "--arg", String(payload.length), "--arg", "0",
    "--peek=0:136"]), 0);
  say("WZ-05", again === wire ? "HELD" : "OPEN", "two interpreted runs emit byte-identical wires");

  /* WZ-06 — rations under imported env.memory: sha256 ≡ node crypto */
  const msg = Buffer.from("wozam64-continuity-probe");
  const rOut = k3w(RATIONS, [
    "--mem-pages=512", `--poke=262144:${msg.toString("hex")}`,
    "--call", "rations_sha256", "--arg", "262144", "--arg", String(msg.length), "--arg", "8912896",
    "--peek=8912896:32"]);
  const want = crypto.createHash("sha256").update(msg).digest("hex");
  const got = peekHex(rOut, 8912896);
  say("WZ-06", got === want ? "HELD" : "OPEN",
    got === want ? `rations_sha256 under k3w ≡ node crypto — ${got.slice(0, 16)}…`
                 : `hash mismatch — ${String(got).slice(0, 32)} vs ${want.slice(0, 32)}`);

  /* WZ-07 — ed25519: RFC 8032 keypair + sign/verify roundtrip */
  const seed = "9d61b19deffd5a60ba844af492ec2cc44449c5697b326919703bac031cae7f60";
  const rfcPk = "d75a980182b10ab7d54bfed3c964073a0ee172f3daa62325af021a68f707511a";
  const kpOut = k3w(RATIONS, [
    "--mem-pages=512", `--poke=262144:${seed}`,
    "--call", "rations_ed25519_keypair_seed", "--arg", "262144", "--arg", "32",
    "--arg", "8912896", "--arg", "8916992", "--peek=8912896:32", "--peek=8916992:64"]);
  const pk = peekHex(kpOut, 8912896), sk = peekHex(kpOut, 8916992);
  const pkOk = pk === rfcPk;
  /* sign under k3w with the derived secret key, verify in the same run */
  const sigOut = k3w(RATIONS, [
    "--mem-pages=512", `--poke=262144:${sk}`, `--poke=524288:${msg.toString("hex")}`,
    "--call", "rations_ed25519_sign", "--arg", "524288", "--arg", String(msg.length),
    "--arg", "262144", "--arg", "64", "--arg", "9175040",
    "--peek=9175040:64"]);
  const sig = peekHex(sigOut, 9175040);
  const vOut = k3w(RATIONS, [
    "--mem-pages=512", `--poke=524288:${msg.toString("hex")}`, `--poke=9175040:${sig}`,
    `--poke=8912896:${pk}`,
    "--call", "rations_ed25519_verify",
    "--arg", "524288", "--arg", String(msg.length), "--arg", "9175040", "--arg", "64",
    "--arg", "8912896", "--arg", "32"]);
  const vOk = callRes(vOut, "rations_ed25519_verify") === 1;
  say("WZ-07", pkOk && vOk ? "HELD" : "OPEN",
    pkOk && vOk
      ? "RFC 8032 pk bit-identical under interpretation; sign→verify roundtrip holds"
      : `ed25519 boundary — pk ${pkOk ? "ok" : "MISMATCH"}, verify ${vOk ? "ok" : "REFUSED"}`);
}

const held = findings.filter(f => f.verdict === "HELD").length;
const open = findings.filter(f => f.verdict === "OPEN").length;
console.log(`\nwozam-gate: ${held} HELD · ${open} OPEN · ${findings.length - held - open} other`);
if (process.argv.includes("--emit")) {
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  fs.writeFileSync(OUT, JSON.stringify({ ts: new Date().toISOString(), gate: "WOZAM-64", findings }, null, 2) + "\n");
  console.log(`emitted → ${path.relative(ROOT, OUT)}`);
}
process.exit(open ? 1 : 0);
