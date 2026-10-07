// lattice-probe.mjs — land the canonical i-vector lattice in the fabric.
//
// Runs TheUE's `ivector-export` step (the Zig core emits the 15³ cube,
// census, layer labels, dual ladder, and algebra table as JSON + a
// sha256 digest over the 3375 e-labels) and writes the artifact to
// security/out/ivector-lattice.json for the bridge's /lattice surface.
//
// The deck replays this artifact — the lattice math never leaves the
// integer core.
import fs from "node:fs";
import path from "node:path";
import { execFileSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));
const THEUE = path.resolve(HERE, "..", "..", "TheUE");
const OUT = path.join(HERE, "out", "ivector-lattice.json");

const out = execFileSync("zig", ["build", "ivector-export"], { cwd: THEUE, timeout: 120_000, maxBuffer: 4 << 20 });
const lattice = JSON.parse(out.toString("utf8"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
fs.writeFileSync(OUT, JSON.stringify(lattice));
console.log(`lattice: edge=${lattice.edge} cells=${lattice.cells.length} census=[${lattice.census}] digest=${lattice.digest.slice(0, 16)}…`);
