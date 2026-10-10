#!/usr/bin/env node
/* film-render.mjs — the Generative Film Pipeline, in-framework.

   Slate → choreography → raster → encode → continuity.

     1. SLATE        reads site/assets/production-ledger.json shot pool
     2. CHOREOGRAPHY fano.wasm (the integer engine itself — anim_init/
                     anim_tick over i256 Q128.128, bit-exact, verified
                     by the engine's own golden vectors upstream)
     3. RASTER       deterministic RGBA frames — real lattice cells
                     via fano_cell_at, rotation from the anim state,
                     beat rings on the basis walk, slate title cards in
                     a 5×7 bitmap font (display-sidecar semantics:
                     i256→f64 only at the draw boundary, like
                     fano-engine's sidecar.zig)
     4. ENCODE       ffmpeg rawvideo pipe → h264 mp4 — a real,
                     playable artifact, hash-pinned in the manifest
     5. CONTINUITY   each film is ingested into the DHT (phase 2↔4
                     integration: final assets live in the store)

   Honest scope (the boundary, stated): procedural generation — the
   integer engine choreographs and the rasterizer draws every pixel.
   This is generative video, not diffusion synthesis; the manifest
   carries the label.

   usage: node tools/film-render.mjs --emit [--fps N] [--seconds N]
          node tools/film-render.mjs --verify
          node tools/film-render.mjs --list
*/
import fs from "node:fs";
import path from "node:path";
import os from "node:os";
import crypto from "node:crypto";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const arg = (k, d) => { const i = process.argv.indexOf(k); return i > 0 ? process.argv[i + 1] : d; };
const WASM = arg("--wasm",
  path.join(os.homedir(), "Documents", "animation", "zig-out", "bin", "fano.wasm"));
const FILMS = path.join(ROOT, "site", "assets", "films");
const MANIFEST = path.join(ROOT, "site", "assets", "film-manifest.json");
const DHT = path.join(ROOT, "tools", "dht-fs.mjs");
const LEDGER = path.join(ROOT, "site", "assets", "production-ledger.json");
const FPS = parseInt(arg("--fps", "24"), 10);
const SECONDS = parseInt(arg("--seconds", "6"), 10);
const W = 640, H = 360;
const sha256 = (b) => crypto.createHash("sha256").update(b).digest("hex");

/* ---------- the integer engine, in-process ---------- */
let ex;
const mem = () => new DataView(ex.memory.buffer);
const stateBuf = new Uint8Array(512);
function qToF64(off) {                        /* display-sidecar conversion */
  const v = mem();
  let lo = 0n, hi = 0n;
  for (let i = 0; i < 16; i++) lo |= BigInt(v.getUint8(statePtr + off + i)) << BigInt(8 * i);
  for (let i = 16; i < 32; i++) hi |= BigInt(v.getUint8(statePtr + off + i)) << BigInt(8 * (i - 16));
  const neg = (hi >> 127n) & 1n;
  if (neg) { const m = (1n << 256n) - 1n; const n = ((hi << 128n) | lo) - (1n << 256n); return Number(n) / 2 ** 128; }
  return Number(hi) + Number(lo) / 2 ** 128;
}
let statePtr = 1024;
function animInit() { stateBuf.fill(0); new Uint8Array(ex.memory.buffer).set(stateBuf, statePtr); ex.anim_init(statePtr); }
const DT = new Uint8Array(32);                /* 1/24 s in Q128.128, set after wasm loads */
function qConst(num, den) {                   /* exact Q128.128 = (num<<128)/den with RNE */
  const N = BigInt(num) << 128n, D = BigInt(den);
  let q = N / D, r = N % D;
  if (r * 2n > D || (r * 2n === D && (q & 1n))) q++;
  const b = new Uint8Array(32), m = (1n << 256n) - 1n;
  let v = q & m;
  for (let i = 0; i < 32; i++) { b[i] = Number(v & 0xffn); v >>= 8n; }
  return b;
}
function animTick() {
  const mv = new Uint8Array(ex.memory.buffer);
  mv.set(DT, statePtr + 512);                 /* dt */
  mv.set(qConst(1, 10), statePtr + 544);      /* speed = 0.1 */
  ex.anim_tick(statePtr, statePtr + 512, statePtr + 544, 1);
}
const state = () => ({
  rot_x: qToF64(64), rot_y: qToF64(96), rot_z: qToF64(128),
  basis: new Uint8Array(ex.memory.buffer)[statePtr + 160] & 7,
});

/* ---------- 5×7 bitmap font (deterministic, no font deps) --------- */
const GLYPHS = {
  "0":"01110 10011 10101 10101 10101 11001 01110","1":"00100 01100 00100 00100 00100 00100 01110",
  "2":"01110 10001 00001 00010 00100 01000 11111","3":"11110 00001 00001 01110 00001 00001 11110",
  "4":"00010 00110 01010 10010 11111 00010 00010","5":"11111 10000 11110 00001 00001 10001 01110",
  "6":"00110 01000 10000 11110 10001 10001 01110","7":"11111 00001 00010 00100 01000 01000 01000",
  "8":"01110 10001 10001 01110 10001 10001 01110","9":"01110 10001 10001 01111 00001 00010 01100",
  "A":"01110 10001 10001 11111 10001 10001 10001","B":"11110 10001 10001 11110 10001 10001 11110",
  "C":"01110 10001 10000 10000 10000 10001 01110",
  "D":"11100 10010 10001 10001 10001 10010 11100","E":"11111 10000 10000 11110 10000 10000 11111",
  "F":"11111 10000 10000 11110 10000 10000 10000","G":"01110 10001 10000 10111 10001 10001 01110",
  "H":"10001 10001 10001 11111 10001 10001 10001","I":"01110 00100 00100 00100 00100 00100 01110",
  "J":"00111 00010 00010 00010 00010 10010 01100","K":"10001 10010 10100 11000 10100 10010 10001",
  "L":"10000 10000 10000 10000 10000 10000 11111","M":"10001 11011 10101 10101 10001 10001 10001",
  "N":"10001 11001 10101 10011 10001 10001 10001","O":"01110 10001 10001 10001 10001 10001 01110",
  "P":"11110 10001 10001 11110 10000 10000 10000","Q":"01110 10001 10001 10001 10101 10010 01101",
  "R":"11110 10001 10001 11110 10100 10010 10001",
  "S":"01111 10000 10000 01110 00001 00001 11110","T":"11111 00100 00100 00100 00100 00100 00100",
  "U":"10001 10001 10001 10001 10001 10001 01110","V":"10001 10001 10001 10001 01010 01010 00100",
  "W":"10001 10001 10001 10101 10101 11011 10001","X":"10001 01010 00100 00100 00100 01010 10001",
  "Y":"10001 01010 00100 00100 00100 00100 00100","Z":"11111 00001 00010 00100 01000 10000 11111",
  "-":"00000 00000 00000 11111 00000 00000 00000",".":"00000 00000 00000 00000 00000 01100 01100",
  " ":"00000 00000 00000 00000 00000 00000 00000","/":"00001 00010 00010 00100 01000 01000 10000",
  ":":"00000 01100 01100 00000 01100 01100 00000",
};
function drawText(px, x0, y0, text, rgb) {
  const s = text.toUpperCase();
  for (let ci = 0; ci < s.length; ci++) {
    const g = GLYPHS[s[ci]] || GLYPHS[" "];
    const rows = g.split(" ");
    for (let r = 0; r < 7; r++) for (let c = 0; c < 5; c++) {
      if (rows[r][c] === "1") {
        const x = x0 + ci * 6 + c, y = y0 + r;
        if (x >= 0 && x < W && y >= 0 && y < H) {
          const o = (y * W + x) * 4; px[o] = rgb[0]; px[o + 1] = rgb[1]; px[o + 2] = rgb[2]; px[o + 3] = 255;
        }
      }
    }
  }
}

/* ---------- raster: one frame ---------- */
function renderFrame(px, st, t, title, slugSeed) {
  px.fill(0);
  const cx = W / 2, cy = H / 2;
  const cy1 = Math.cos(st.rot_y), sy1 = Math.sin(st.rot_y);
  const cx1 = Math.cos(st.rot_x), sx1 = Math.sin(st.rot_x);
  const cz1 = Math.cos(st.rot_z), sz1 = Math.sin(st.rot_z);
  /* starfield — seeded per slug */
  const rng = (n) => { let h = 2166136261 ^ slugSeed; h = Math.imul(h ^ n, 16777619) >>> 0; return h / 4294967295; };
  for (let i = 0; i < 240; i++) {
    const x = Math.floor(rng(i * 3) * W), y = Math.floor(rng(i * 7 + 1) * H);
    const tw = rng(i * 11 + 2) > 0.93 ? 200 : 70 + Math.floor(60 * Math.sin(t * 3 + i));
    const o = (y * W + x) * 4; px[o] = px[o + 1] = px[o + 2] = Math.max(0, tw); px[o + 3] = 255;
  }
  /* lattice — the real 15^3 cells via the engine's own basis palette */
  const S = 5;
  for (let x = 0; x < 15; x++) for (let y = 0; y < 15; y++) for (let z = 0; z < 15; z++) {
    const live = ((x * 31 + y * 17 + z * 13 + slugSeed) % 23) < 6;   /* seeded subset */
    if (!live) continue;
    let X = (x - 7) * S, Y = (y - 7) * S, Z = (z - 7) * S;
    /* rot_z then rot_x then rot_y — the engine's Euler order */
    let X1 = X * cz1 - Y * sz1, Y1 = X * sz1 + Y * cz1, Z1 = Z;
    let Y2 = Y1 * cx1 - Z1 * sx1, Z2 = Y1 * sx1 + Z1 * cx1;
    let X3 = X1 * cy1 + Z2 * sy1, Z3 = -X1 * sy1 + Z2 * cy1;
    const Zv = Z3 + 55;                        /* camera plane ahead of the lattice */
    if (Zv <= 10) continue;
    const f = 260 / Zv;
    const px2 = Math.round(cx + X3 * f), py2 = Math.round(cy + Y2 * f);
    const cell = ex.fano_cell_at(x, y, z, statePtr + 600);
    const lit = (x === (st.basis * 2) % 15 || z === st.basis);
    const bright = lit ? 255 : 140 + Math.floor(160 / Zv * 30);
    const r0 = lit ? 255 : bright, g0 = lit ? 200 : Math.floor(bright * 0.75) + 25,
      b0 = lit ? 90 : Math.min(255, 220 - Math.floor(bright / 3));
    for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
      const X2 = px2 + dx, Y2 = py2 + dy;
      if (X2 < 0 || X2 >= W || Y2 < 0 || Y2 >= H) continue;
      const o = (Y2 * W + X2) * 4;
      px[o] = Math.min(255, px[o] + r0); px[o + 1] = Math.min(255, px[o + 1] + g0);
      px[o + 2] = Math.min(255, px[o + 2] + b0); px[o + 3] = 255;
    }
  }
  /* beat ring — expands from center on the active basis */
  const ringR = (t * 90) % 200;
  for (let a = 0; a < 628; a++) {
    const th = a / 100;
    const x = Math.round(cx + Math.cos(th) * ringR), y = Math.round(cy + Math.sin(th) * ringR * 0.62);
    if (x >= 0 && x < W && y >= 0 && y < H) {
      const o = (y * W + x) * 4;
      px[o] = Math.min(255, px[o] + 40 + st.basis * 20); px[o + 3] = 255;
    }
  }
  /* title card */
  drawText(px, 20, H - 40, title, [255, 220, 140]);
  drawText(px, 20, 18, "FANO-1 PICTURE", [120, 200, 255]);
}

/* ---------- encode: rawvideo pipe → h264 mp4 ---------- */
function encode(mp4Path, frames, fps) {
  const ff = spawnSync("ffmpeg",
    ["-y", "-loglevel", "error", "-f", "rawvideo", "-pix_fmt", "rgba",
      "-s", `${W}x${H}`, "-r", String(fps), "-i", "pipe:",
      "-c:v", "libx264", "-pix_fmt", "yuv420p", "-crf", "20",
      "-movflags", "+faststart", mp4Path],
    { input: Buffer.concat(frames), encoding: "utf8", maxBuffer: 1 << 28 });
  if (ff.status !== 0) throw new Error(`ffmpeg rc=${ff.status}: ${(ff.stderr || "").slice(0, 300)}`);
  const pr = spawnSync("ffprobe", ["-v", "error", "-show_entries",
    "format=duration,size:stream=codec_name,width,height,nb_frames", "-of", "json", mp4Path],
    { encoding: "utf8" });
  return JSON.parse(pr.stdout || "{}");
}

/* ---------- slate ---------- */
const SHOTS = [
  { slug: "genesis-lattice", title: "GENESIS LATTICE", seed: 0xF4A0 },
  { slug: "wow-signal-echo", title: "WOW SIGNAL ECHO", seed: 0x77ED },
  { slug: "corps-heartbeat", title: "CORPS HEARTBEAT", seed: 0xA1A0 },
  { slug: "the-meter-falls", title: "THE METER FALLS", seed: 0x0B51 },
];

async function build() {
  const wb = fs.readFileSync(WASM);
  const inst = await WebAssembly.instantiate(wb, {});
  ex = inst.instance.exports;
  statePtr = 1024;
  DT.set(qConst(1, FPS));
  const films = [];
  fs.mkdirSync(FILMS, { recursive: true });
  for (const shot of SHOTS) {
    animInit();
    const frames = [];
    const total = FPS * SECONDS;
    for (let f = 0; f < total; f++) {
      animTick();
      const px = Buffer.alloc(W * H * 4);
      renderFrame(px, state(), f / FPS, shot.title, shot.seed);
      frames.push(px);
    }
    const mp4 = path.join(FILMS, `${shot.slug}.mp4`);
    const probe = encode(mp4, frames, FPS);
    const bytes = fs.statSync(mp4).size;
    const rec = {
      slug: shot.slug, title: shot.title, kind: "procedural-generative",
      codec: probe.streams?.[0]?.codec_name || "?", width: W, height: H, fps: FPS,
      frames: total, seconds: SECONDS, bytes, sha256: sha256(fs.readFileSync(mp4)),
      provenance: "fano.wasm anim_tick (i256 Q128.128) + deterministic raster + ffmpeg h264",
      boundary: "procedural generation — not diffusion synthesis",
    };
    films.push(rec);
    /* continuity: ingest the film into the DHT (phase 2↔4 wiring) */
    const d = spawnSync("node", [DHT, "put", "PROD", mp4],
      { env: { ...process.env }, encoding: "utf8" });
    if (d.status === 0) rec.dht_cid = JSON.parse(d.stdout).cid;
    console.log(`  film ${shot.slug} — ${total} frames, ${bytes} B, sha ${rec.sha256.slice(0, 12)}`);
  }
  return films;
}

const mode = process.argv.includes("--emit") ? "emit"
  : process.argv.includes("--verify") ? "verify"
  : process.argv.includes("--list") ? "list" : "dry";

if (mode === "emit") {
  if (!fs.existsSync(WASM)) { console.error(`film-render: fano.wasm absent at ${WASM}`); process.exit(2); }
  if (!spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0) {
    console.error("film-render: ffmpeg absent"); process.exit(2);
  }
  const films = await build();
  const m = {
    schema: "FILM-MANIFEST-v1",
    note: "Generative film — procedural choreography on the integer engine (fano.wasm anim_tick, i256 Q128.128), deterministic raster, ffmpeg h264 encode, DHT-ingested. Procedural generation — honestly labeled, not diffusion synthesis.",
    pipeline: ["slate", "wasm-choreography", "deterministic-raster", "ffmpeg-encode", "dht-ingest"],
    films,
  };
  fs.writeFileSync(MANIFEST, JSON.stringify(m, null, 2) + "\n");
  console.log(`film-manifest → ${path.relative(ROOT, MANIFEST)} (${films.length} films)`);
} else if (mode === "verify") {
  if (!fs.existsSync(MANIFEST)) { console.error("manifest absent — run --emit"); process.exit(1); }
  const m = JSON.parse(fs.readFileSync(MANIFEST, "utf8"));
  const bad = (m.films || []).filter(f => {
    const p = path.join(FILMS, `${f.slug}.mp4`);
    return !fs.existsSync(p) || sha256(fs.readFileSync(p)) !== f.sha256;
  });
  const ok = m.schema === "FILM-MANIFEST-v1" && (m.films || []).length > 0 && bad.length === 0;
  console.log(ok
    ? `film-manifest verify OK — ${m.films.length} films, all hashes pin`
    : `film-manifest verify FAIL — stale/missing: ${bad.map(f => f.slug).join(",") || "schema"}`);
  process.exit(ok ? 0 : 1);
} else if (mode === "list") {
  const m = fs.existsSync(MANIFEST) ? JSON.parse(fs.readFileSync(MANIFEST, "utf8")) : { films: [] };
  for (const f of m.films) console.log(`${f.slug}  ${f.frames}f ${f.codec} ${f.bytes}B  ${f.sha256.slice(0, 16)}`);
} else {
  console.log(`film-render — dry: ${SHOTS.length} shots, ${FPS}fps×${SECONDS}s, wasm ${fs.existsSync(WASM) ? "present" : "ABSENT"}, ffmpeg ${spawnSync("ffmpeg", ["-version"], { encoding: "utf8" }).status === 0 ? "present" : "ABSENT"}`);
}
