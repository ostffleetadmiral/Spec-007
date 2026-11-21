#!/usr/bin/env node
/* reviews-manifest.mjs — bind the external-review report corpus.

   The external-review lanes stay pending_external_evidence by design —
   code cannot close them. What it CAN do is file real, seat-signed
   review reports: one <lane>.md per lane under site/security/reviews/,
   each carrying a detached ed25519 signature (.sig, base64url) from the
   reviewing seat (digit or sheraton fleet identities).

   --emit    recompute digests + verify sigs → REVIEWS-MANIFEST.json
   --verify  reproduce the manifest byte-for-byte and re-check every sig

   Seat pubkeys live in reviews/seats/*.pub.pem so the corpus verifies
   self-contained. A report declares its seat via the
   `- reviewing seat: `<seat>`` line; the seat must have a pubkey file. */

import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");
const DIR = path.join(ROOT, "site", "security", "reviews");
const OUT = path.join(DIR, "REVIEWS-MANIFEST.json");
const LANES_JSON = path.join(ROOT, "site", "assets", "external-review.json");
const EMIT = process.argv.includes("--emit");
const VERIFY = process.argv.includes("--verify");

const sha = (b) => crypto.createHash("sha256").update(b).digest("hex");

function seats() {
  const dir = path.join(DIR, "seats");
  const out = {};
  for (const f of fs.readdirSync(dir).filter((f) => f.endsWith(".pub.pem"))) {
    const pem = fs.readFileSync(path.join(dir, f), "utf8");
    out[f.replace(/-ed25519\.pub\.pem$/, "")] = { pem, sha256: sha(pem) };
  }
  return out;
}

function laneEntry(file) {
  const bytes = fs.readFileSync(path.join(DIR, file));
  const text = bytes.toString("utf8");
  const lane = file.replace(/\.md$/, "");
  const seatM = text.match(/reviewing seat:\s*`(\w[\w-]*)`/);
  if (!seatM) throw new Error(`${file}: no 'reviewing seat' declaration`);
  const seat = seatM[1];
  const sigFile = file + ".sig";
  let sig = null;
  if (fs.existsSync(path.join(DIR, sigFile)))
    sig = fs.readFileSync(path.join(DIR, sigFile), "utf8").trim();
  return { lane, file, seat, sig, bytes };
}

function manifest() {
  const seatMap = seats();
  const lanes = fs.readdirSync(DIR)
    .filter((f) => f.endsWith(".md") && f !== "REVIEWS.md")
    .map(laneEntry)
    .sort((a, b) => a.lane.localeCompare(b.lane));

  const entries = lanes.map((l) => {
    const seat = seatMap[l.seat];
    if (!seat) throw new Error(`${l.file}: unknown seat '${l.seat}'`);
    let sig_ok = false;
    if (l.sig) {
      try {
        sig_ok = crypto.verify(null, l.bytes,
          crypto.createPublicKey(seat.pem), Buffer.from(l.sig, "base64url"));
      } catch { sig_ok = false; }
    }
    return {
      lane_id: l.lane,
      report: l.file,
      report_sha256: sha(l.bytes),
      seat: l.seat,
      seat_pubkey_sha256: seat.sha256,
      sig_b64: l.sig,
      sig_ok,
    };
  });

  const required = JSON.parse(fs.readFileSync(LANES_JSON, "utf8"))
    .lanes.map((l) => l.id).sort();
  const covered = entries.map((e) => e.lane_id);
  const missing = required.filter((r) => !covered.includes(r));

  return {
    spec: "EXTREVIEWSv1",
    generated: new Date().toISOString(),
    note: "seat-signed external review corpus — lanes stay pending_external_evidence in the deploy manifest; these are the filed acceptance reports under delegated cluster seats",
    seats: Object.fromEntries(Object.entries(seatMap)
      .map(([k, v]) => [k, { pubkey_sha256: v.sha256 }])),
    lane_count: entries.length,
    required_lane_count: required.length,
    missing_lanes: missing,
    lanes: entries,
  };
}

if (EMIT) {
  const m = manifest();
  fs.writeFileSync(OUT, JSON.stringify(m, null, 2) + "\n");
  const bad = m.lanes.filter((l) => !l.sig_ok).map((l) => l.lane_id);
  console.log(`reviews → ${path.relative(ROOT, OUT)} — ${m.lane_count}/${m.required_lane_count} lanes` +
    (bad.length ? ` · UNSIGNED/INVALID: ${bad.join(",")}` : " · all sigs verify"));
  process.exit(bad.length || m.missing_lanes.length ? 1 : 0);
} else if (VERIFY) {
  const live = manifest();
  const committed = fs.existsSync(OUT)
    ? JSON.parse(fs.readFileSync(OUT, "utf8")) : null;
  if (!committed) { console.error("reviews verify: manifest absent — --emit first"); process.exit(1); }
  const { generated: _a, ...a } = live;
  const { generated: _b, ...b } = committed;
  const ok = JSON.stringify(a) === JSON.stringify(b);
  const bad = live.lanes.filter((l) => !l.sig_ok).map((l) => l.lane_id);
  ok && !bad.length && !live.missing_lanes.length
    ? console.log(`reviews verify: GREEN — ${live.lane_count}/${live.required_lane_count} lanes, all seat sigs verify`)
    : console.error(`reviews verify: DRIFT${bad.length ? ` invalid sigs: ${bad.join(",")}` : ""}${live.missing_lanes.length ? ` missing: ${live.missing_lanes.join(",")}` : ""}`);
  process.exit(ok && !bad.length && !live.missing_lanes.length ? 0 : 1);
} else {
  const m = manifest();
  console.log(`dry-run — ${m.lane_count}/${m.required_lane_count} lanes · --emit to write, --verify to check`);
}
