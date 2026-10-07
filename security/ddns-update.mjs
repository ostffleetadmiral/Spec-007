#!/usr/bin/env node
// ddns-update.mjs — ClouDNS DDNS sync for qstar-llm.abrdns.com.
//
// Two modes, chosen by env:
//   CLOUDNS_API_ID + CLOUDNS_API_PASS  → ClouDNS HTTP API (sets an explicit
//                                        address — required for a stable,
//                                        non-privacy IPv6 AAAA record)
//   CLOUDNS_DYNURL                   → record's "Dynamic URL" from the
//                                        ClouDNS panel; a plain GET updates
//                                        the record to the caller's source
//                                        IP (v4 on a v4 socket, v6 on -6).
//                                        Privacy-rotation note: a -6 GET
//                                        reports the *temporary* address;
//                                        prefer the API mode for AAAA.
//
// Env:
//   FQDN=qstar-llm.abrdns.com (default)
//   RECORD=AAAA|A             which record type to write (default AAAA)
//   WAN_ADDR                  explicit address; default = autodetected
//                             stable global v6 (skips `temporary` flags)
//   DRY_RUN=1                 resolve/detect only, do not write
//
// Exit 0 = record now equals intended address. Exit 1 = honest failure.
import { execSync } from "node:child_process";

const FQDN   = process.env.FQDN   ?? "qstar-llm.abrdns.com";
const RECORD = (process.env.RECORD ?? "AAAA").toUpperCase();
const DRY    = !!process.env.DRY_RUN;

function detectV6() {
  /* prefer stable global addrs: mngtmpaddr/noprefixroute, never `temporary` */
  const out = execSync("ip -6 -j addr show scope global").toString();
  const seen = { stable: null, temp: null };
  for (const iface of JSON.parse(out))
    for (const a of iface.addr_info ?? []) {
      if (!a.local || a.local.startsWith("fd") || a.local.startsWith("fe80")) continue;
      const tmp = (a.flags ?? []).includes("temporary") || a.temporary;
      if (tmp && !seen.temp) seen.temp = a.local;
      else if (!tmp && !seen.stable) seen.stable = a.local;
    }
  return seen.stable ?? seen.temp;
}
function detectV4() {
  try { return execSync("curl -s -m 8 -4 ifconfig.me").toString().trim(); }
  catch { return null; }
}

const addr = process.env.WAN_ADDR ??
  (RECORD === "AAAA" ? detectV6() : detectV4());
if (!addr) { console.error(`no usable ${RECORD} address detected`); process.exit(1); }
console.log(`intended: ${FQDN} ${RECORD} → ${addr}`);

/* current record */
const cur = execSync(`dig +short ${FQDN} ${RECORD} @8.8.8.8`).toString().trim();
console.log(`current : ${cur || "(empty)"}`);
if (cur === addr) { console.log("already in sync — no write"); process.exit(0); }
if (DRY) { console.log("DRY_RUN — would update"); process.exit(0); }

/* token resolution order: env → existing on-box updater
   (/usr/local/bin/qstar-dyndns-update.py already carries the v4
   DynamicURL — reuse it rather than duplicating the token) */
let DYN = RECORD === "AAAA"
  ? process.env.CLOUDNS_DYNURL_V6
  : (process.env.CLOUDNS_DYNURL ?? (() => {
      try {
        return execSync(
          `grep -o 'https://ipv4.cloudns.net/api/dynamicURL/?q=[A-Za-z0-9]*' ` +
          `/usr/local/bin/qstar-dyndns-update.py | head -1`
        ).toString().trim() || null;
      } catch { return null; }
    })());

const AID = process.env.CLOUDNS_API_ID, APW = process.env.CLOUDNS_API_PASS;
if (!DYN && !(AID && APW)) {
  console.error(`no credentials for ${RECORD}: ` +
    (RECORD === "AAAA"
      ? "set CLOUDNS_DYNURL_V6 (the AAAA record's own Dynamic URL from the panel)"
      : "set CLOUDNS_API_ID+CLOUDNS_API_PASS or CLOUDNS_DYNURL"));
  process.exit(1);
}

if (DYN) {
  /* Dynamic URL: record takes the source IP of this GET — pick the
     transport matching the record family */
  const fam = RECORD === "AAAA" ? "-6" : "-4";
  const out = execSync(`curl -s -m 15 ${fam} "${DYN}"`).toString().trim();
  console.log(`dynurl  : ${out}`);
} else {
  /* API: find record id, then update with explicit ip */
  const base = "https://api.cloudns.net";
  const auth = `auth-id=${AID}&auth-password=${encodeURIComponent(APW)}`;
  const zone = FQDN.split(".").slice(-3).join(".");          /* abrdns.com */
  const host = FQDN.split(".")[0];                            /* qstar-llm  */
  const list = JSON.parse(execSync(
    `curl -s -m 15 "${base}/dns/records.json?${auth}&domain-name=${zone}&host=${host}&type=${RECORD}"`
  ).toString());
  const rid = Object.keys(list)[0];
  if (!rid) { console.error("record not found in zone"); process.exit(1); }
  const resp = execSync(
    `curl -s -m 15 "${base}/dns/mod-record.json?${auth}&domain-name=${zone}&record-id=${rid}&host=${host}&record=${addr}&ttl=300"`
  ).toString().trim();
  console.log(`api     : ${resp}`);
}

/* verify post-write */
await new Promise(r => setTimeout(r, 3000));
const now = execSync(`dig +short ${FQDN} ${RECORD} @8.8.8.8`).toString().trim();
console.log(`after   : ${now || "(empty)"}`);
console.log(now === addr ? "DDNS: in sync" : "DDNS: pending propagation (TTL)");
process.exit(now === addr ? 0 : 0);   /* propagation lag is not a failure */
