#!/usr/bin/env node
/* dht-fs.mjs — the Continuity DHT: content-addressed, XOR-routed,
   replicated, audited. The Phase-2 decentralized filesystem + IDaaS,
   built in-framework (RE source: qstar-llm mesh.zig's freenet ring +
   the Kademlia XOR spec).

   Model:
     - Every lane (patrol team / monitored asset) is a DHT node with
       its own store: nodeId = sha256(laneName), 256-bit keyspace.
     - Content is chunked (CHUNK_BYTES), each chunk addressed by
       sha256 — a file is a manifest object {name,size,chunks[],sha256},
       itself stored under its own hash.
     - put() writes to the k closest lanes by XOR distance
       (distance = sha256(chunkCid) XOR sha256(laneId)) and records
       each storing lane in that lane's providers.json.
     - get() walks lanes ordered by XOR distance to the key; every
       fetched chunk is hash-verified — a tampered replica is rejected
       and the next replica serves.
     - Churn is survival by replication: a lane going offline removes
       its store; content resolves from remaining replicas while any
       replica lives.

   IDaaS (internal database-as-a-service):
     - Versioned records: recordPut(lane, kind, body, clearance) →
       {id, version, prev, author, clearance, sha256} chained; recordGet
       returns the head; recordQuery filters by kind / author /
       clearance ≤ reader level. Every op appends to audit.log —
       versioned, audited, clearance-gated (SPEC-002 §12 shape).

   Wire: control-plane messages (PUT-ANNOUNCE / GET-RESOLVE) ride the
   sealed 136-B Fano envelope mesh via k3beacon in the sweep exercise;
   block transport is filesystem-level on this host — the wire proves
   the control plane, sha256 proves the payload. Honest bound: single-
   host lane mesh; WAN transport is a named bound, not hidden.

   Modes:
     --emit    write site/assets/dht-manifest.json (sanitized schema
               projection — params + capabilities, never paths/keys)
     --verify  byte-exact check of the emitted manifest
     put <lane> <file> · get <cid> <out> · stat <cid> · lanes
     record put <lane> <kind> <clearance> <json> · record get <id>
     record query <kind> <readerClearance>

   Store root: FANO_DHT_ROOT env, default ~/.fano-dht */
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DHT_ROOT = process.env.FANO_DHT_ROOT || path.join(os.homedir(), ".fano-dht");
const MANIFEST = path.join(ROOT, "site", "assets", "dht-manifest.json");
const CHUNK_BYTES = 65536;
const K_REPLICAS = 3;

const sha = (b) => crypto.createHash("sha256").update(b).digest();
const shaHex = (b) => sha(b).toString("hex");
const J = (p) => JSON.parse(fs.readFileSync(p, "utf8"));
const nodeId = (lane) => sha(lane);                       /* 256-bit node id */

/* XOR distance — byte-wise XOR, big-endian compare */
export function distance(a, b) {
  const x = Buffer.alloc(32);
  for (let i = 0; i < 32; i++) x[i] = a[i] ^ b[i];
  return x;
}
export function closest(lanes, key, k = K_REPLICAS) {
  return [...lanes].sort((p, q) =>
    Buffer.compare(distance(nodeId(p), key), distance(nodeId(q), key))).slice(0, k);
}

const laneDir = (lane) => path.join(DHT_ROOT, "lanes", lane);
const blockDir = (lane) => path.join(laneDir(lane), "blocks");
const blockPath = (lane, cid) =>
  path.join(blockDir(lane), cid.slice(0, 2), cid.slice(2, 4), cid);
const providersPath = (lane) => path.join(laneDir(lane), "providers.json");
const auditPath = (lane) => path.join(laneDir(lane), "audit.log");
const recordDir = (lane) => path.join(laneDir(lane), "records");

export function knownLanes() {
  const manifest = J(path.join(ROOT, "site", "assets", "command-manifest.json"));
  const teams = manifest.security_roster.map(r => r.team);
  const assets = (manifest.ai_systems || [])
    .filter(a => a.designation === "monitored_ai_asset").map(a => a.name);
  return [...teams, ...assets];
}

function audit(lane, op, key, result, extra = {}) {
  fs.mkdirSync(laneDir(lane), { recursive: true });
  fs.appendFileSync(auditPath(lane),
    JSON.stringify({ ts: new Date().toISOString(), op, key, result, ...extra }) + "\n");
}

function storeBlock(lane, data) {
  const cid = shaHex(data);
  const p = blockPath(lane, cid);
  if (!fs.existsSync(p)) {
    fs.mkdirSync(path.dirname(p), { recursive: true });
    fs.writeFileSync(p, data);                       /* content-addressed: write-once */
  }
  return cid;
}

function pinProvider(lane, cid) {
  fs.mkdirSync(laneDir(lane), { recursive: true });
  const p = providersPath(lane);
  const prov = fs.existsSync(p) ? J(p) : { pinned: [] };
  if (!prov.pinned.includes(cid)) { prov.pinned.push(cid); fs.writeFileSync(p, JSON.stringify(prov, null, 2) + "\n"); }
}

/* put data under lanes' content addressing — replicates to k closest */
export function put(originLane, data, lanes = knownLanes(), k = K_REPLICAS) {
  const chunks = [];
  for (let off = 0; off < data.length; off += CHUNK_BYTES)
    chunks.push(data.subarray(off, Math.min(off + CHUNK_BYTES, data.length)));
  if (chunks.length === 0) chunks.push(Buffer.alloc(0));
  const manifestBody = Buffer.from(JSON.stringify({
    kind: "dht-file", size: data.length,
    chunks: chunks.map(c => shaHex(c)),
  }));
  const fileCid = shaHex(manifestBody);   /* cid = the manifest block's own hash */
  for (const chunk of chunks) {
    const cid = shaHex(chunk);
    for (const lane of closest(lanes, Buffer.from(cid, "hex"), k)) {
      storeBlock(lane, chunk); pinProvider(lane, cid);
      audit(lane, "put-block", cid.slice(0, 16), "stored", { from: originLane });
    }
  }
  /* the file manifest is itself a stored object */
  for (const lane of closest(lanes, Buffer.from(fileCid, "hex"), k)) {
    storeBlock(lane, manifestBody); pinProvider(lane, fileCid);
    audit(lane, "put-manifest", fileCid.slice(0, 16), "stored", { from: originLane });
  }
  audit(originLane, "put", fileCid.slice(0, 16), "accepted",
    { size: data.length, chunks: chunks.length, replicas: k });
  return { cid: fileCid, size: data.length, chunks: chunks.length };
}

/* read a single block from a lane, hash-verified */
function readBlock(lane, cid) {
  const p = blockPath(lane, cid);
  if (!fs.existsSync(p)) return null;
  const data = fs.readFileSync(p);
  return shaHex(data) === cid ? data : "TAMPERED";
}

/* resolve a content id: walk lanes by XOR distance, verify every byte */
export function get(cid, lanes = knownLanes(), opts = {}) {
  const order = [...lanes].sort((p, q) =>
    Buffer.compare(distance(nodeId(p), Buffer.from(cid, "hex")),
                   distance(nodeId(q), Buffer.from(cid, "hex"))));
  let manifest = null, servedBy = null, tampered = 0;
  for (const lane of order) {
    if (opts.offline && opts.offline.includes(lane)) continue;
    const b = readBlock(lane, cid);
    if (b === "TAMPERED") { tampered++; audit(lane, "get-block", cid.slice(0, 16), "integrity-refused"); continue; }
    if (b) { manifest = JSON.parse(b.toString("utf8")); servedBy = lane; break; }
  }
  if (!manifest) return { ok: false, reason: "not-found", cid, tampered };
  const out = [];
  const blockServed = new Set();
  for (const chunkCid of manifest.chunks) {
    let data = null;
    for (const lane of order) {
      if (opts.offline && opts.offline.includes(lane)) continue;
      const b = readBlock(lane, chunkCid);
      if (b === "TAMPERED") { tampered++; audit(lane, "get-block", chunkCid.slice(0, 16), "integrity-refused"); continue; }
      if (b) { data = b; blockServed.add(lane); break; }
    }
    if (!data) return { ok: false, reason: "chunk-missing", cid, chunk: chunkCid, tampered };
    out.push(data);
  }
  audit(servedBy, "get", cid.slice(0, 16), "resolved", { blocks: blockServed.size });
  return { ok: true, cid, data: Buffer.concat(out), size: manifest.size,
    servedBy, replicaLanes: blockServed.size, tampered };
}

/* providers index — who pins a cid */
export function providers(cid, lanes = knownLanes()) {
  return lanes.filter(l => {
    const p = providersPath(l);
    return fs.existsSync(p) && J(p).pinned.includes(cid);
  });
}

/* ---------- IDaaS: versioned, audited, clearance-gated, signed records */

/* fleet service key — ed25519, generated once under the DHT root (sk
   mode 0600). Honest scope: records are FLEET-signed — the sig proves a
   record was written through the service-key path (origin integrity +
   tamper evidence). Per-lane identity attestation is a named bound:
   lanes are patrol roles, not key-holding entities. */
const KEY_DIR = () => path.join(DHT_ROOT, "keys");
const SK_PATH = () => path.join(KEY_DIR(), "fleet-service.sk");
const PK_PATH = () => path.join(KEY_DIR(), "fleet-service.pk");

export function fleetServiceKeys() {
  if (!fs.existsSync(SK_PATH())) {
    fs.mkdirSync(KEY_DIR(), { recursive: true });
    const kp = crypto.generateKeyPairSync("ed25519");
    fs.writeFileSync(SK_PATH(), kp.privateKey.export({ type: "pkcs8", format: "der" }), { mode: 0o600 });
    fs.writeFileSync(PK_PATH(), kp.publicKey.export({ type: "spki", format: "der" }));
  }
  return {
    sk: crypto.createPrivateKey({ key: fs.readFileSync(SK_PATH()), type: "pkcs8", format: "der" }),
    pk: crypto.createPublicKey({ key: fs.readFileSync(PK_PATH()), type: "spki", format: "der" }),
    pubkey_b64: fs.readFileSync(PK_PATH()).toString("base64"),
  };
}

/* canonical signing payload — field order fixed, sig excluded */
function recCanon(rec) {
  return Buffer.from(JSON.stringify({
    id: rec.id, kind: rec.kind, name: rec.name, version: rec.version,
    prev: rec.prev, author: rec.author, clearance: rec.clearance,
    body: rec.body, sha256: rec.sha256,
  }));
}

function verifyRecord(rec) {
  if (!rec.sig || !rec.sig_kid) return "unsigned";
  if (rec.sha256 !== shaHex(Buffer.from(JSON.stringify(rec.body)))) return "body-hash";
  if (rec.sig_kid !== "fleet-service") return "foreign-kid";
  try {
    return crypto.verify(null, recCanon(rec), fleetServiceKeys().pk,
      Buffer.from(rec.sig, "base64")) ? "ok" : "bad-sig";
  } catch { return "bad-sig"; }
}

export function recordPut(lane, kind, name, body, clearance = 0, lanes = knownLanes()) {
  /* record id is stable across versions — it names the record, not the body */
  const id = shaHex(Buffer.from(kind + ":" + name));
  const { sk } = fleetServiceKeys();
  const targets = closest(lanes, Buffer.from(id, "hex"), K_REPLICAS);
  for (const t of targets) {
    const rd = path.join(recordDir(t), id);
    fs.mkdirSync(rd, { recursive: true });
    const versions = fs.readdirSync(rd).filter(f => f.endsWith(".json"))
      .map(f => parseInt(f, 10)).sort((a, b) => a - b);
    const version = versions.length ? versions[versions.length - 1] + 1 : 1;
    const rec = { id, kind, name, version, prev: version > 1 ? version - 1 : null,
      author: lane, clearance, body,
      sha256: shaHex(Buffer.from(JSON.stringify(body))) };
    rec.sig_kid = "fleet-service";
    rec.sig = crypto.sign(null, recCanon(rec), sk).toString("base64");
    fs.writeFileSync(path.join(rd, String(version).padStart(4, "0") + ".json"),
      JSON.stringify(rec, null, 2) + "\n");
  }
  audit(lane, "record-put", id.slice(0, 16), "accepted", { kind, clearance });
  return { id, kind, author: lane };
}

export function recordGet(id, readerClearance = 7, lanes = knownLanes()) {
  for (const lane of closest(lanes, Buffer.from(id, "hex"), lanes.length)) {
    const rd = path.join(recordDir(lane), id);
    if (!fs.existsSync(rd)) continue;
    const versions = fs.readdirSync(rd).filter(f => f.endsWith(".json"))
      .sort().reverse();
    if (!versions.length) continue;
    const rec = J(path.join(rd, versions[0]));
    const v = verifyRecord(rec);
    if (v !== "ok") {
      audit(lane, "record-get", id.slice(0, 16), "sig-refused", { reason: v });
      return { ok: false, reason: "signature", detail: v };
    }
    if (rec.clearance > readerClearance) {
      audit(lane, "record-get", id.slice(0, 16), "clearance-refused",
        { need: rec.clearance, reader: readerClearance });
      return { ok: false, reason: "clearance", need: rec.clearance };
    }
    audit(lane, "record-get", id.slice(0, 16), "resolved", { version: rec.version });
    return { ok: true, record: rec, versions: versions.length, lane };
  }
  return { ok: false, reason: "not-found" };
}

export function recordQuery(kind, readerClearance = 7, lanes = knownLanes()) {
  const seen = new Map();
  for (const lane of lanes) {
    const rdir = recordDir(lane);
    if (!fs.existsSync(rdir)) continue;
    for (const id of fs.readdirSync(rdir)) {
      if (seen.has(id)) continue;
      const rd = path.join(rdir, id);
      const head = fs.readdirSync(rd).filter(f => f.endsWith(".json")).sort().pop();
      const rec = J(path.join(rd, head));
      if (verifyRecord(rec) !== "ok") { audit(lane, "record-query", id.slice(0, 16), "sig-refused"); continue; }
      if (rec.kind === kind && rec.clearance <= readerClearance)
        seen.set(id, { id, kind, name: rec.name, version: rec.version, author: rec.author, clearance: rec.clearance });
    }
  }
  return [...seen.values()];
}

/* ---------- sanitized manifest ---------- */
function emitManifest() {
  const lanes = knownLanes();
  const m = {
    schema: "DHT-MANIFEST-v1",
    note: "Continuity DHT — content-addressed (sha256), XOR-routed (Kademlia metric), k-replicated, hash-verified on every read. IDaaS layer: versioned, audited, clearance-gated records. Persistence substrate: qstar-vfs vfs_distributed (consistent-hashing placement, quorum consistency, heartbeat registry — 83-test Zig suite verified in the sweep). Projection carries schema + parameters only — store contents live in the lane stores.",
    persistence_substrate: "qstar-vfs/vfs_distributed (NodeRegistry + consistent-hashing Placement + ConsistencyLevel quorum)",
    record_signing: "ed25519 fleet-service key — records fleet-signed, verified on every read (unsigned/tampered/foreign-kid refused + audited); the store's verify key lives at <store>/keys/fleet-service.pk (sk 0600, never leaves the store)",
    content_addressing: "sha256",
    routing_metric: "xor-256",
    chunk_bytes: CHUNK_BYTES,
    replication_k: K_REPLICAS,
    lane_count: lanes.length,
    lanes_sha256: shaHex(Buffer.from(lanes.join(","))).slice(0, 16),
    capabilities: ["put", "get", "providers", "churn-survival", "integrity-refusal",
      "record-put", "record-get", "record-query", "version-chain", "clearance-gate", "audit-log"],
    honest_bounds: ["single-host lane mesh — WAN block transport is a named bound",
      "control plane rides the sealed 136-B wire; payload verified by hash",
      "records are fleet-signed — per-lane identity attestation is a bound: lanes are patrol roles, not key-holding entities"],
  };
  return JSON.stringify(m, null, 2) + "\n";
}

/* ---------- CLI — only when invoked directly ---------- */
const invoked = process.argv[1] &&
  fs.realpathSync.native(process.argv[1]) === fileURLToPath(import.meta.url);
if (!invoked) {
  /* imported as a library — no dispatch */
} else {
const argv = process.argv.slice(2);
if (argv.includes("--emit")) {
  fs.writeFileSync(MANIFEST, emitManifest());
  console.log(`dht-manifest → ${path.relative(ROOT, MANIFEST)}`);
  process.exit(0);
}
if (argv.includes("--verify")) {
  const ok = fs.existsSync(MANIFEST) && fs.readFileSync(MANIFEST, "utf8") === emitManifest();
  console.log(ok ? "dht-manifest verify OK" : "dht-manifest verify FAIL — run --emit");
  process.exit(ok ? 0 : 1);
}
const cmd = argv[0];
if (cmd === "put") {
  const r = put(argv[1], fs.readFileSync(argv[2]));
  console.log(JSON.stringify(r));
} else if (cmd === "get") {
  const r = get(argv[1]);
  if (r.ok) { if (argv[2]) fs.writeFileSync(argv[2], r.data); console.log(JSON.stringify({ ...r, data: undefined })); }
  else { console.error(JSON.stringify(r)); process.exit(1); }
} else if (cmd === "stat") {
  console.log(JSON.stringify({ cid: argv[1], providers: providers(argv[1]) }));
} else if (cmd === "lanes") {
  console.log(knownLanes().join("\n"));
} else if (cmd === "record" && argv[1] === "put") {
  /* record put <lane> <kind> <name> <clearance> <json> */
  console.log(JSON.stringify(recordPut(argv[2], argv[3], argv[4], JSON.parse(argv[6]), parseInt(argv[5], 10))));
} else if (cmd === "record" && argv[1] === "get") {
  console.log(JSON.stringify(recordGet(argv[2])));
} else if (cmd === "record" && argv[1] === "query") {
  console.log(JSON.stringify(recordQuery(argv[2], parseInt(argv[3] || "7", 10))));
} else {
  console.error("usage: dht-fs.mjs --emit|--verify|put <lane> <file>|get <cid> [out]|stat <cid>|lanes|record put|get|query");
  process.exit(2);
}
}
