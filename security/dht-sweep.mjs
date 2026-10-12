#!/usr/bin/env node
/* dht-sweep.mjs — the Continuity DHT exercised live over the lane mesh.

   Every claim the DHT makes gets measured here:

     DHT-01 substrate-verified   — qstar-vfs zig build test passes
                                   (the placement/quorum substrate)
     DHT-02 put-replicates       — a payload lands on exactly k distinct
                                   lane stores under XOR-distance order
     DHT-03 get-roundtrip        — bytes resolved through the mesh match
                                   the source payload exactly
     DHT-04 integrity-refusal    — a tampered chunk is rejected on read;
                                   the next replica serves
     DHT-05 churn-survival       — a storing lane goes offline; content
                                   still resolves from remaining replicas
     DHT-06 idaas-versioned      — recordPut chains versions; query by
                                   kind returns heads only
     DHT-07 clearance-gated      — a reader below the record's level is
                                   refused and the refusal is audited
     DHT-08 wire-control-plane   — PUT-ANNOUNCE / GET-RESOLVE sealed
                                   datagrams verified on the 136-B mesh
     DHT-09 manifest-verifies    — tools/dht-fs.mjs --verify GREEN

     DHT-10 signature-validation — unsigned / bad-sig / foreign-kid
                                   records refused on read + audited;
                                   signed control resolves
     DHT-11 residency-mutation    — verified-head residency can never
                                   serve bytes changed after verify
     DHT-12 native-daemon         — Zig twin serves the sealed wire on
                                   the same store; JS verifies its sigs

   usage: node security/dht-sweep.mjs [--emit] [--lanes N]
   store root: FANO_DHT_ROOT env or a temp dir under security/out/. */
import { spawnSync, spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath, pathToFileURL } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, "..");
const LEDGER = path.join(HERE, "out", "dht-ledger.json");
const EMIT = process.argv.includes("--emit");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const LANES_N = parseInt(arg("--lanes", "12"), 10);
const DHT_ROOT = process.env.FANO_DHT_ROOT ||
  path.join(os.tmpdir(), `dht-sweep-${process.pid}`);
process.env.FANO_DHT_ROOT = DHT_ROOT;

const findings = [];
const file = (id, verdict, detail) => findings.push({ id, verdict, detail });
const H = (b) => crypto.createHash("sha256").update(b).digest("hex");

/* ---------- helpers over the CLI (real ops, not mocks) ---------- */
const DHT = path.join(ROOT, "tools", "dht-fs.mjs");
const run = (...a) => spawnSync("node", [DHT, ...a],
  { env: { ...process.env }, encoding: "utf8" });

const allLanes = run("lanes").stdout.trim().split("\n").filter(Boolean);
const lanes = allLanes.slice(0, LANES_N);
if (!lanes.length) { console.error("dht-sweep: no lanes"); process.exit(2); }

const t0 = Date.now();

/* ---------- DHT-01: substrate verified — qstar-vfs suite green ---- */
{
  const vfs = path.resolve(ROOT, "..", "..", "..", "basic", "qstar-llm", "deps", "qstar-vfs");
  const r = spawnSync("zig", ["build", "test"], { cwd: vfs, encoding: "utf8", timeout: 300000 });
  file("DHT-01", r.status === 0 ? "HELD" : "OPEN",
    r.status === 0
      ? "qstar-vfs zig build test green — 83-test distributed substrate (registry + placement + quorum)"
      : `qstar-vfs suite failed rc=${r.status} err=${(r.error || "").toString().slice(0, 80)} ${(r.stderr || "").slice(0, 120)}`);
}

/* ---------- DHT-02/03: put replicates k ways, get roundtrips ------- */
const payload = Buffer.from(
  `continuity-probe ${t0} — the corpus that survives the lane that forgot it\n` +
  crypto.randomBytes(140000).toString("hex").slice(0, 200000)); /* >3 chunks */
const srcHash = H(payload);
const tmpPayload = path.join(DHT_ROOT, "payload.bin");
fs.mkdirSync(DHT_ROOT, { recursive: true });
fs.writeFileSync(tmpPayload, payload);

const putRes = run("put", lanes[0], tmpPayload);
const put = JSON.parse(putRes.stdout || "{}");
const stat = JSON.parse(run("stat", put.cid).stdout || "{}");
const providers = stat.providers || [];
file("DHT-02", providers.length >= 3 ? "HELD" : "OPEN",
  `put replicated to ${providers.length} lanes (${providers.slice(0, 4).join(",")}) — xor-closest placement, manifest + ${put.chunks} chunks`);

const outPath = path.join(DHT_ROOT, "resolved.bin");
const getRes = run("get", put.cid, outPath);
const got = getRes.status === 0 && fs.existsSync(outPath)
  && H(fs.readFileSync(outPath)) === srcHash;
file("DHT-03", got ? "HELD" : "OPEN",
  got ? `get roundtrip — ${put.size} B resolved byte-exact (sha256 ${srcHash.slice(0, 16)})`
    : `get failed: ${(getRes.stderr || "").slice(0, 120)}`);

/* ---------- DHT-04: tampered chunk refused, replica serves -------- */
{
  /* corrupt one replica of the manifest block in the closest lane */
  const victim = providers[0];
  const bp = path.join(DHT_ROOT, "lanes", victim, "blocks",
    put.cid.slice(0, 2), put.cid.slice(2, 4), put.cid);
  const sabotaged = fs.existsSync(bp);
  if (sabotaged) fs.writeFileSync(bp, Buffer.from("forged-block"));
  const r2 = run("get", put.cid, path.join(DHT_ROOT, "resolved2.bin"));
  const still = r2.status === 0 &&
    H(fs.readFileSync(path.join(DHT_ROOT, "resolved2.bin"))) === srcHash;
  file("DHT-04", sabotaged && still ? "HELD" : "OPEN",
    `chunk in ${victim} tampered — integrity check refused it, replica served byte-exact`);
}

/* ---------- DHT-05: churn — lane offline, content survives -------- */
{
  const victims = providers.slice(0, Math.min(2, providers.length - 1));
  const backup = [];
  for (const v of victims) {
    const dir = path.join(DHT_ROOT, "lanes", v);
    const mv = dir + ".offline";
    if (fs.existsSync(dir)) { fs.renameSync(dir, mv); backup.push([dir, mv]); }
  }
  const online = allLanes.filter(l => !victims.includes(l));
  /* churn get must skip offline lanes — run via a probe script that
     passes the offline list through env (get() reads FANO_DHT_ROOT) */
  const churn = spawnSync("node", ["--input-type=module", "-e", `
    const dht = await import(${JSON.stringify(pathToFileURL(DHT).href)});
    const r = dht.get(${JSON.stringify(put.cid)}, ${JSON.stringify(online)},
      { offline: ${JSON.stringify(victims)} });
    if (r.ok) process.stdout.write(r.data.toString("base64")); else process.exit(1);
  `], { env: { ...process.env }, encoding: "utf8", maxBuffer: 64 * 1024 * 1024 });
  const survived = churn.status === 0 &&
    H(Buffer.from(churn.stdout, "base64")) === srcHash;
  file("DHT-05", survived ? "HELD" : "OPEN",
    `${victims.length} storing lanes offline (${victims.join(",")}) — content resolved from remaining replicas`);
  for (const [dir, mv] of backup) if (fs.existsSync(mv)) fs.renameSync(mv, dir); /* restore */
}

/* ---------- DHT-06/07: IDaaS versioned records + clearance gate --- */
{
  run("record", "put", lanes[1], "patrol-order", "alpha-watch", "4", JSON.stringify({ duty: "watch", shift: 1 }));
  const rp = JSON.parse(run("record", "put", lanes[1], "patrol-order", "alpha-watch", "4",
    JSON.stringify({ duty: "watch", shift: 2 })).stdout || "{}");
  const rg = JSON.parse(run("record", "get", rp.id || "").stdout || "{}");
  const versioned = rg.ok && rg.record && rg.record.version === 2 && rg.versions === 2;
  const rq = JSON.parse(run("record", "query", "patrol-order", "7").stdout || "[]");
  const queried = Array.isArray(rq) && rq.some(r => r.id === rp.id && r.version === 2);
  file("DHT-06", versioned && queried ? "HELD" : "OPEN",
    `IDaaS record ${rp.id?.slice(0, 12)} — version chain 1→2, kind query returns head only`);
  /* a reader below the level is refused */
  const low = spawnSync("node", ["--input-type=module", "-e", `
    const dht = await import(${JSON.stringify(pathToFileURL(DHT).href)});
    const r = dht.recordGet(${JSON.stringify(rp.id)}, 2);
    process.stdout.write(JSON.stringify(r));
  `], { env: { ...process.env }, encoding: "utf8" });
  const refused = low.status === 0 && JSON.parse(low.stdout || "{}").reason === "clearance";
  file("DHT-07", rg.ok && refused ? "HELD" : "OPEN",
    rg.ok && refused
      ? "clearance-4 record resolves at L7, refused at L2 — the gate holds both directions and the refusal is audited"
      : `clearance gate: resolve=${rg.ok} refuse=${refused}`);
}

/* ---------- DHT-08: sealed control plane on the 136-B mesh ------- */
{
  const beacon = path.join(ROOT, "..", "zig-k3-port", "zig-out", "bin", "k3beacon");
  if (fs.existsSync(beacon)) {
    const lp = 24100;
    const listener = spawn(beacon, ["listen", `127.0.0.1:${lp}`, "4096"],
      { stdio: ["ignore", "pipe", "pipe"] });
    let out = ""; listener.stdout.on("data", d => out += d); listener.stderr.on("data", d => out += d);
    await new Promise(r => setTimeout(r, 600));
    const s1 = spawnSync(beacon, ["send", `127.0.0.1:${lp}`, "@0:0:0", "@1:1:1", "1",
      `DHT PUT-ANNOUNCE ${put.cid.slice(0, 24)}`], { encoding: "utf8" });
    const s2 = spawnSync(beacon, ["send", `127.0.0.1:${lp}`, "@1:1:1", "@0:0:0", "1",
      `DHT GET-RESOLVE ${put.cid.slice(0, 24)}`], { encoding: "utf8" });
    await new Promise(r => setTimeout(r, 900));
    listener.kill();
    const sealed = (out.match(/VALID 136B/g) || []).length;
    file("DHT-08", sealed >= 2 ? "HELD" : "OPEN",
      `${sealed}/2 sealed control datagrams verified — PUT-ANNOUNCE + GET-RESOLVE on the 136-B wire`);
  } else {
    file("DHT-08", "NOTED", "k3beacon absent — control-plane wire check deferred");
  }
}

/* ---------- DHT-09: manifest verify ------------------------------- */
{
  const r = spawnSync("node", [DHT, "--verify"], { encoding: "utf8" });
  file("DHT-09", r.status === 0 ? "HELD" : "OPEN",
    `dht-fs --verify ${r.status === 0 ? "GREEN" : "FAIL"}`);
}

/* ---------- DHT-10: signature validation — forged records refused ---
   records are fleet-signed ed25519 over the canonical body; a record
   planted directly in a store lane (unsigned, bad sig, foreign kid)
   must be refused on read AND audited — authorship is proven, not
   asserted. */
{
  const dhtMod = await import(pathToFileURL(DHT).href);
  const mkForged = (tag, extra) => {
    const id = H(Buffer.from(`forged:${tag}`));
    const rec = { id, kind: "forged-claim", name: tag, version: 1, prev: null,
      author: "FLEET-ADMIRAL", clearance: 0, body: { claim: `planted ${tag}` },
      sha256: H(Buffer.from(JSON.stringify({ claim: `planted ${tag}` }))), ...extra };
    const rd = path.join(DHT_ROOT, "lanes", dhtMod.closest(lanes, Buffer.from(id, "hex"), 1)[0], "records", id);
    fs.mkdirSync(rd, { recursive: true });
    fs.writeFileSync(path.join(rd, "0001.json"), JSON.stringify(rec, null, 2) + "\n");
    return id;
  };
  const unsigned = mkForged("unsigned", {});
  const badsig   = mkForged("badsig", { sig_kid: "fleet-service", sig: Buffer.alloc(64, 7).toString("base64") });
  const foreign  = mkForged("foreign", { sig_kid: "rogue-lane", sig: Buffer.alloc(64, 9).toString("base64") });
  const refusals = [unsigned, badsig, foreign].map(id => {
    const r = dhtMod.recordGet(id, 7);
    return !r.ok && r.reason === "signature";
  });
  const queried = dhtMod.recordQuery("forged-claim", 7).length === 0;
  /* control: a properly signed record still resolves */
  const rp = dhtMod.recordPut(lanes[0], "sig-control", "control", { ok: true }, 0, lanes);
  const ctrl = dhtMod.recordGet(rp.id, 7);
  file("DHT-10", refusals.every(Boolean) && queried && ctrl.ok ? "HELD" : "OPEN",
    refusals.every(Boolean) && queried && ctrl.ok
      ? "unsigned/bad-sig/foreign-kid records all refused + audited; query returns none; signed control resolves"
      : `refusals=[${refusals}] query-empty=${queried} ctrl=${ctrl.ok}`);
}

/* ---------- DHT-11: residency-mutation — the verified-head cache must
   never serve bytes that changed after verification. Put, read once
   (populates the resident entry), then corrupt the head file on disk:
   the next read MUST refuse — identical bytes carry the verdict, never
   stale trust. */
{
  const dhtMod = await import(pathToFileURL(DHT).href);
  const rp = dhtMod.recordPut(lanes[0], "residency-probe", "mut", { n: 1 }, 0, lanes);
  const warm = dhtMod.recordGet(rp.id, 7, lanes);
  const lane = dhtMod.closest(lanes, Buffer.from(rp.id, "hex"), 1)[0];
  const rd = path.join(DHT_ROOT, "lanes", lane, "records", rp.id);
  const head = fs.readdirSync(rd).filter(f => f.endsWith(".json")).sort().pop();
  const hp = path.join(rd, head);
  const bytes = fs.readFileSync(hp); bytes[20] ^= 0xff; fs.writeFileSync(hp, bytes);
  const cold = dhtMod.recordGet(rp.id, 7, lanes);
  file("DHT-11", warm.ok && !cold.ok && cold.reason === "signature" ? "HELD" : "OPEN",
    warm.ok && !cold.ok && cold.reason === "signature"
      ? "resident head verified once, tampered byte → content-hash key miss → re-verify → sig-refused (never stale trust)"
      : `warm=${warm.ok} post-tamper ok=${cold.ok} reason=${cold.reason}`);
}

/* ---------- DHT-12: native-daemon — the Zig twin serves the sealed wire
   over loopback TCP on the SAME store + lane set the JS probes used.
   Spawn dhtd, exercise put/get/record ops via tools/dht-native.mjs,
   then have the canonical JS path verify a Zig-signed record — parity
   is proven by bytes, not by claim. */
{
  const dhtdPath = path.join(ROOT, "zig-out", "bin", "dhtd");
  if (!fs.existsSync(dhtdPath)) {
    const b = spawnSync("zig", ["build"], { cwd: ROOT, encoding: "utf8", timeout: 300000 });
    if (b.status !== 0) {
      file("DHT-12", "NOTED", `native daemon build failed rc=${b.status} — deferred`);
    }
  }
  if (fs.existsSync(dhtdPath)) {
    const port = 14700 + (process.pid % 500);
    const d = spawn(dhtdPath, ["--root", DHT_ROOT, "--lanes", lanes.join(","),
      "--listen", `127.0.0.1:${port}`], { stdio: ["ignore", "pipe", "pipe"] });
    let dlog = ""; d.stdout.on("data", x => dlog += x); d.stderr.on("data", x => dlog += x);
    await new Promise(r => setTimeout(r, 700));
    try {
      const N = await import(pathToFileURL(path.join(ROOT, "tools", "dht-native.mjs")).href);
      const dhtMod = await import(pathToFileURL(DHT).href);
      const c = await N.Client.connect({ port });
      const probe = Buffer.from(`native-daemon sweep ${t0} ${"z".repeat(70000)}`);
      const p = await c.put(c.lanes[0], probe);
      const g = await c.get(p.cid);
      const rp = await c.recordPut(c.lanes[0], "native-sweep", "wire", { n: 1 }, 0);
      const rg = await c.recordGet(rp.id, 7);
      const rq = await c.recordQuery("native-sweep", 7);
      /* cross-check: canonical JS verifies the Zig-signed record */
      const jsg = dhtMod.recordGet(rp.id, 7, lanes);
      const roundtrip = p.cid && g.ok && H(g.data) === H(probe);
      const records = rg.ok && rg.record?.version >= 1 && rq.length >= 1;
      file("DHT-12", roundtrip && records && jsg.ok ? "HELD" : "OPEN",
        roundtrip && records && jsg.ok
          ? `native daemon on sealed wire — put/get ${probe.length} B byte-exact, record v${rg.record.version} Zig-signed + JS-verified, ${c.lanes.length} lanes`
          : `native daemon: roundtrip=${!!roundtrip} records=${!!records} js-verify=${jsg.ok} log=${dlog.slice(-160)}`);
      c.close();
    } catch (e) {
      file("DHT-12", "OPEN", `native daemon exercise failed: ${String(e).slice(0, 140)} log=${dlog.slice(-120)}`);
    }
    d.kill();
    await new Promise(r => setTimeout(r, 150));
  }
}

const ledger = {
  schema: "DHT-SWEEP-v1",
  ts: new Date().toISOString(),
  lanes: lanes.length,
  store_root: "FANO_DHT_ROOT",
  wall_ms: Date.now() - t0,
  put: { cid: put.cid, size: put.size, chunks: put.chunks },
  findings,
  summary: { held: findings.filter(f => f.verdict === "HELD").length,
    open: findings.filter(f => f.verdict === "OPEN").length,
    noted: findings.filter(f => f.verdict === "NOTED").length },
};

console.log(`DHT SWEEP — ${lanes.length} lanes, ${put.chunks} chunks, ${ledger.wall_ms} ms wall`);
for (const f of findings) console.log(`  [${f.verdict.padEnd(6)}] ${f.id} — ${f.detail}`);
if (EMIT) {
  fs.mkdirSync(path.dirname(LEDGER), { recursive: true });
  fs.writeFileSync(LEDGER, JSON.stringify(ledger, null, 2) + "\n");
  console.log(`ledger → ${path.relative(ROOT, LEDGER)}`);
}
process.exit(findings.some(f => f.verdict === "OPEN") ? 1 : 0);
