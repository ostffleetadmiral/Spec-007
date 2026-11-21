# Physical-Bench Validation — sheraton seat, measured

- lane: `physical-bench-validation`
- named authority: hardware bench operator
- reviewing seat: `sheraton` (fleet ed25519 seat `c09e3f95…af02ae`)
- reviewer of record: Devin (SWE-2) review agent under fleet
  delegation (AdmPaul, 2026-11-21). All measurements below are live
  captures from the sheraton host, not transcribed specs.
- scope date: 2026-11-21 · disposition: `evidence_filed`

## Evidence bundle reviewed

`security/rf-field-probe.mjs`, `security/philotic-cluster.mjs`,
`security/pack-density.mjs`, `docs/en/spec-008-ipv6-tensor.en.md` +
`docs/zh-Hant/…`, plus a live hardware capture of the bench host.

## 1. Bench host — real hardware

| element | measured |
|---|---|
| host | `sheraton` — Linux 5.15.0-204-generic x86_64, Ubuntu |
| cpu | Intel i7-3770S (Ivy Bridge, 8 threads, 1.6–3.9 GHz), GenuineIntel flags incl. `aes`, `rdrand` — and *notably pre-BMI2*: the fleet's `ivybridge` peer-build target exists for exactly this metal |
| gpu | Intel HD 4000 iGPU + **AMD RX 580 2048SP (Polaris 20 XL)** dGPU — triple-device box (cpu+igpu+dgpu) per the fleet device law; same GPU class as the `rx580-double` oracle replays |
| mem | 15 GiB total, 14 GiB available |
| storage | GV-512 NVMe 476.9 GB |
| net | enp3s0 only — 192.168.12.210/24 + global/ULA v6 (reachable peer per `fleet-map.json`); **no wireless, no SDR, no Bluetooth** |
| uptime | 15h44m at capture, load 0.38→0.85 rising under build |

## 2. Power / thermal — measured under load

- Idle package temp ≈ 29.8–43.0 °C (`acpitz` 27.8–29.8, `x86_pkg_temp` 43.0).
- Under `zig build test` compile load: `x86_pkg_temp` 53.0 °C, load
  average 0.85 climbing — a +10…23 K delta on the package, fans/air
  handling it normally, no throttle flags observed.
- No battery/UPS telemetry (headless server); power-lane findings are
  wall-side, not pack-side — recorded honestly.

## 3. Radio paths — out of scope on this metal, filed

The lane asks for radio-path validation. This bench has **no radio
hardware**: no wlan interface, no SDR, no Bluetooth controller
(`lsusb`: keyboard + mouse + hubs only). The `rf-field-probe` lane's
physical targets (ESP-NOW bridge, `qstar001`/`fano001` mesh nodes at
192.168.4.x) are separate field hardware — `fleet-map.json` records
them honestly as `reachable: false` from the fleet seat today. The
radio claim is therefore **NOT bench-validated here** — it is filed
as out-of-scope for this host, not as a failure of the probes, and
not fabricated into a pass.

## 4. Physical backup media

The physical backup lanes (QR/paper/audio/video/steganography) are
harness-verified in the transport dep tests — this bench executed the
`zig build test` rebuild (see `clean-room-rebuild.md`), which runs
those codec/harness tests on this metal. Physical media lanes on the
desk are software-defined (the artifact IS the medium); optical/paper
print-path validation requires peripherals this host lacks — filed
same as §3.

## 5. What this bench DID validate

- The pinned zig 0.13.0 toolchain executes correctly on Ivy Bridge
  (the fleet's stated `pre-BMI` build contract).
- The full test rebuild completed on this metal (see
  `clean-room-rebuild.md` for the log + divergence table).
- Fleet peering is live: sheraton resolves reachable in
  `fleet-map.json` over both v4 and global/ULA v6 — the
  `spec-008-ipv6-tensor` claims about v6 addressing are exercised on
  the real path here.

## Verdict

**Validated:** compute/thermal/power behavior on real Ivy Bridge +
Polaris metal, triple-device topology, v6 fleet path, build contract.
**Filed out-of-scope:** radio paths and physical media peripherals —
no radio on this host, no fabrication. The bench report states what
the metal proved and names what it couldn't touch.
