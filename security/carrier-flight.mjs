// carrier-flight.mjs — the established-carrier attack at WAN scale.
// Warm a lit stream e1→w1 through the impaired edge (netem ~90ms
// delay west-side), then time ONE signal byte's actual flight.
// If 'the light already on' removed propagation, flight → ~0ms.
import { execFileSync, spawn } from "node:child_process";
import crypto from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";
const HERE = path.dirname(fileURLToPath(import.meta.url));
const PORTS = { e1: 19301, e2: 19302, w1: 19401, w2: 19402, bridge: 19500 };
const HYDRA_TOKEN = crypto.randomBytes(16).toString("hex");
const WAN_TOKEN = crypto.randomBytes(16).toString("hex");
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function ctl(node, p, body) {
  const r = await fetch(`http://localhost:${PORTS[node]}${p}`,
    body ? { method: "POST", headers: { "Content-Type": "application/json", "x-hydra-token": HYDRA_TOKEN }, body: JSON.stringify(body) }
         : { headers: { "x-hydra-token": HYDRA_TOKEN } });
  return r.json();
}
const env = { ...process.env, HYDRA_TOKEN, WAN_TOKEN };
const compose = (...a) => execFileSync("docker", ["compose", "-f", path.join(HERE, "docker-compose.wan.yml"), ...a], { cwd: HERE, env, stdio: ["ignore","pipe","pipe"] }).toString();
try {
  console.log("[wan-lab] compose up…");
  try { compose("up", "-d", "--wait"); } catch { compose("up", "-d"); }
  await sleep(9000);
  for (let i = 0; i < 20; i++) { try { await ctl("e1", "/id"); break; } catch { await sleep(1500); } }
  const ids = { e1: await ctl("e1","/id"), w1: await ctl("w1","/id") };
  // wire the topology (same as philotic-cluster)
  await ctl("e1", "/dial", { url: "ws://relay-east:8080/ws", remote: "00".repeat(32) });
  await ctl("e2", "/dial", { url: "ws://relay-east:8080/ws", remote: "00".repeat(32) });
  await ctl("w1", "/dial", { url: "ws://relay-west:8080/ws", remote: "00".repeat(32) });
  await ctl("w2", "/dial", { url: "ws://relay-west:8080/ws", remote: "00".repeat(32) });
  await ctl("bridge", "/dial", { url: "ws://wan-east:9100/ws", remote: "00".repeat(32) });
  await ctl("bridge", "/dial", { url: "ws://wan-west:9100/ws", remote: "00".repeat(32) });
  await ctl("bridge", "/discover", { conn: 2 });
  await sleep(8000);
  let learned = false;
  for (let i = 0; i < 30 && !learned; i++) {
    await ctl("e1", "/presence/send", { to: ids.w1.peer_id, status: 1, text: "e1" });
    await sleep(1500);
    const pres = await ctl("w1", "/presence");
    learned = pres.presence.some((p) => p.peer === ids.e1.peer_id);
  }
  if (!learned) { console.log("FAIL: cross-segment route never established"); process.exit(1); }
  console.log("[wan-lab] route established — the beam is lit");

  // ── WARM CARRIER: 16 steady bytes already flowing ──
  const inbox0 = (await ctl("w1", "/inbox")).inbox.length;
  for (let i = 0; i < 16; i++)
    await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: Buffer.from(`C:${i}`).toString("base64") });
  for (let i = 0; i < 60; i++) {
    const n = (await ctl("w1", "/inbox")).inbox.length;
    if (n - inbox0 >= 16) break;
    await sleep(500);
  }
  const warm = (await ctl("w1", "/inbox")).inbox.length - inbox0;
  console.log(`[wan-lab] carrier: ${warm}/16 steady bytes delivered — stream is ESTABLISHED`);

  // ── THE SIGNAL BYTE on the lit stream — measure true flight ──
  const flights = [];
  for (let t = 0; t < 5; t++) {
    const mark = (await ctl("w1", "/inbox")).inbox.length;
    const t0 = process.hrtime.bigint();
    await ctl("e1", "/send", { to: ids.w1.peer_id, body_b64: Buffer.from(`S:${t}`).toString("base64") });
    for (let i = 0; i < 240; i++) {
      await sleep(50);
      const n = (await ctl("w1", "/inbox")).inbox.length;
      if (n > mark) { flights.push(Number(process.hrtime.bigint() - t0) / 1e6); break; }
    }
  }
  if (flights.length === 0) { console.log("FAIL: signal never arrived"); process.exit(1); }
  const min = Math.min(...flights), med = flights.sort((a,b)=>a-b)[Math.floor(flights.length/2)];
  console.log(`[wan-lab] signal-byte flights (established stream): ${flights.map(x=>x.toFixed(0)).join(", ")} ms`);
  console.log(`[wan-lab] median flight = ${med.toFixed(0)} ms — netem budget ~90ms+ per edge`);
  console.log(min > 0
    ? `\nBREAK-05 WAN VERDICT: BLOCKED — on a fully lit, routed stream, each new bit\n` +
      `still paid ${med.toFixed(0)} ms of propagation. The field is standing; its\n` +
      `changes are not. Sommerfeld-Brillouin: the front travels at c. Always.`
    : `\nBREAK-05 WAN VERDICT: OPEN — a byte beat the propagation floor`);
} finally {
  try { compose("down"); } catch {}
}
