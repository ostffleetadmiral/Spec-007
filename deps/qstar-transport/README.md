# Qstar-Transport

14 independent modules for encoding data across physical media. Zero dependencies.

## Quick Start

```bash
zig build test          # 122 tests
zig build run           # QR + polyglot + LoRa demo
```

## What This Is

Multi-modal data transport — encode data as QR codes, audio, video, cassette tapes, polyglot executables, steganographic images, LoRa radio packets, and more.

## Usage

```zig
const qr = @import("transport_qr");
const polyglot = @import("transport_polyglot");
const lora = @import("transport_lora");

// QR encoding
const encoded = try qr.encode(allocator, "HELLO WORLD");
const decoded = try qr.decode(allocator, encoded);

// Polyglot container (PNG+ZIP+JAR+PYZ)
const jar = try polyglot.encode(allocator, payload, .jar);
const data = try polyglot.decode(allocator, jar, .jar);

// LoRa packet
const packet = try lora.encode(allocator, payload, sf, freq);
```

## Modules

| Module | Lines | Tests | Description |
|--------|-------|-------|-------------|
| transport_qr.zig | 202 | 6 | QR code encoding with Huffman compression |
| transport_optar.zig | 217 | 5 | High-density optical storage with exact Golay page extents |
| transport_paperback.zig | 248 | 6 | Printable 2-of-3 Shamir book format for archiving |
| transport_audio.zig | 151 | 3 | GF(256) parity lane; detects corruption and refuses damaged output |
| transport_cassette.zig | 183 | 3 | Cassette AFSK with canonical WAV extent and alignment checks |
| transport_polyglot.zig | 673 | 22 | PNG/MP4/HTML/PDF/ZIP plus CRC-checked stored-entry JAR/PYZ containers |
| transport_convert.zig | 209 | 6 | Format conversion utilities |
| transport_video.zig | 143 | 4 | Data encoded in video frames |
| transport_quine.zig | 107 | 3 | Self-reproducing code containers |
| transport_stega.zig | 172 | 4 | Bounded LSB embedding with declared-length validation |
| transport_wifi.zig | 108 | 4 | WiFi packet transport |
| transport_p2p.zig | 224 | 6 | Peer-to-peer transport |
| transport_lora.zig | 846 | 22 | Sub-GHz ISM radio with exact frames, FEC, and ACK bookkeeping |
| maypole_bridge.zig | 695 | 28 | ESP32 WiFi-to-LoRa bridge with live credential indexes |

**Total: 4,178 lines, 122 tests. Zero dependencies (std only).**

## Origin

Extracted from Qstar. Fully standalone, no dependency on Qstar at build time.
