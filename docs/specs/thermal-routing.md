# SPEC — Acoustic/RF thermal routing (phase-conjugate + radiative window)
Claim: acoustic+EM interference patterns route thermal energy out through
the atmospheric window. Four testable layers, each graded by instrument.

## T1 — phase-conjugate acoustic cancellation (VERIFIED, live hardware)
Instrument: aplay/arecord on card-1 analog (SN6140), 1 kHz stereo drive.
- in-phase pair: +6.4 dB vs single channel (theory +6.02 dB)
- anti-phase: −4.0 dB uncalibrated / −6.98 dB amplitude-matched
  (EQ-calibrated via hw-map per-channel arrival ratio 1.433)
Swing = 13.4 dB phase-dependent with calibration — destructive
interference executes on real hardware and deepens under per-channel
EQ matching. Reproducer: artifacts/thermal-lane/t1_phase_null.py,
calibration artifacts/hw-map/.

## T2 — thermoacoustic transfer at laptop scale (UNSUPPORTED at scale)
Instrument: hwmon sensors, 30s baseline vs 30s 1 kHz drive.
- amdgpu −0.62°C, nvme −0.40°C — ambient-drift magnitude, not signal
- BAT0 +1.2°C — drive amp's own dissipation (conservation: counter-wave
  relocates energy, does not erase it)
Honest null filed; elevation = enclosed-cavity apparatus (BOM).

## T3 — RF-thermal correlate (registered, not run)
wlan0 traffic → chip-region thermal delta; em_monitor lane exists.

## T4 — atmospheric-window radiative discharge (ELEVATION)
No IR instrument on this machine. Sim lane: wave_solver boundary
emission. Physical lane: sky-facing radiator + thermocouple (BOM).

## Verdict summary
| Layer | Verdict | Basis |
|---|---|---|
| Destructive interference | VERIFIED | 13.4 dB swing, calibrated, live card |
| Thermoacoustic routing | UNSUPPORTED | null at laptop scale; cavity apparatus named |
| RF-thermal correlate | registered | wlan0+em_monitor lane, not run |
| Radiative window | elevation | needs radiator apparatus (BOM) |
Mechanism is real physics; thermodynamic routing at laptop scale is not
demonstrable — interference relocates wave energy, not net heat.
