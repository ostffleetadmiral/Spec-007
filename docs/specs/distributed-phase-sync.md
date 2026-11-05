# SPEC — Distributed phase sync across lattice nodes
## Problem
Every node's crystal drifts independently (~1–100ppm). Phase-coherent
acoustic/RF work across nodes collapses without a common timebase.
## Design — PULSE frame sync protocol
PULSE = {seq, t1, t2} — master broadcasts seq+transmit-ts; slave stamps
arrival; two-way exchange yields offset+drift. Clock sync over wlan0
segment (PTP-class, software-level; hardware PTP = elevation).
## First measurement (this session)
Loopback/self-probe: ping RTT variance on the LAN segment = the jitter
floor any sync protocol inherits. File: artifacts/second-order/sync-rtt.txt
## Elevation
Hardware PTP (IEEE 1588) or RF carrier sync for sub-µs coherence.
