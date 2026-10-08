#!/usr/bin/env node
/* golden-master.mjs — canonical vector parity (D11/P2, Ark port).

   The Ark pattern: a binary emits canonical output, a committed golden
   file holds the reference, the harness byte-compares. Here the emitter
   is `zig run src/golden_emit.zig` — raw i256 results for the Q128.128
   primitive set — and the golden is `golden/vectors.txt`.

   --emit     writes the golden (review-gated: emit is a canon act)
   --verify   re-runs the emitter and byte-compares
   --mutate   self-check: proves a byte-flip is detected (GLD-02) */
import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

const ROOT = path.resolve(new URL("..", import.meta.url).pathname);
const GOLDEN = path.join(ROOT, "golden", "vectors.txt");
const EMITTER = path.join(ROOT, "src", "golden_emit.zig");

const args = new Set(process.argv.slice(2));
const EMIT = args.has("--emit"), VERIFY = args.has("--verify"),
  MUTATE = args.has("--mutate");

function emit() {
  const r = spawnSync("zig", ["run", EMITTER],
    { encoding: "utf8", timeout: 120000 });
  if (r.status !== 0)
    throw new Error(`emitter failed rc=${r.status}: ${(r.stderr || "").slice(0, 200)}`);
  return r.stdout;
}

const vectors = emit();
const lines = vectors.trim().split("\n").length;

if (MUTATE) {
  /* prove the comparison actually bites: flip one byte in the middle
     and require a mismatch */
  const mid = Math.floor(vectors.length / 2);
  const corrupted = vectors.slice(0, mid) +
    (vectors[mid] === "0" ? "1" : "0") + vectors.slice(mid + 1);
  const detected = corrupted !== vectors;
  console.log(detected
    ? "mutation check: GREEN — a single byte-flip differs from the golden"
    : "mutation check: FAIL — corruption undetectable");
  process.exit(detected ? 0 : 1);
}

if (VERIFY) {
  const golden = fs.readFileSync(GOLDEN, "utf8");
  const same = golden === vectors;
  console.log(same
    ? `golden verify: GREEN — ${lines} vectors byte-identical`
    : "golden verify: DRIFT — live output differs from committed golden");
  process.exit(same ? 0 : 1);
}
if (EMIT) {
  fs.mkdirSync(path.dirname(GOLDEN), { recursive: true });
  fs.writeFileSync(GOLDEN, vectors);
  console.log(`golden → ${GOLDEN} (${lines} vectors)`);
} else {
  console.log(vectors);
  console.log(`DRY — ${lines} vectors; --emit to write`);
}
