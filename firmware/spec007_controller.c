/*
 * SPEC-007 cartridge controller — ESP32-S3 firmware scaffold.
 *
 * Authority model (canon §10.1): this firmware OPERATES the drip, the state
 * machine, and the sensors. It does not hold safety authority. The quench,
 * the thermal fuse, the mechanical relief, and the hardware supervisor all
 * act without asking this code anything. Firmware that believes it is in
 * charge is firmware that has not read the hazard register.
 *
 * Integer-only, per fleet rule: rates in microlitres/min, temperatures in
 * deciKelvin, pressure in pascals. No float in the control path; the sidecar
 * can have its f64 for telemetry export.
 *
 * Target: ESP32-S3, ESP-IDF v5.x. Duty-cycled: ULP coprocessor watches
 * sensors in deep sleep; the main core wakes on threshold or tick.
 *
 * Status: SCAFFOLD — compiles as host C for review; not yet flashed,
 * not yet bench-validated. Do not wire to hardware without the safety
 * review the dossier requires. The numbers it embodies are screened values
 * from spec007_dynamics_calculations.zig, not measured constants.
 *
 * (Easter egg: ST_SAFE is state 0 because zero is the only state the
 *  hardware trusts without asking permission. Kincade's rule.)
 *
 * Build (host review): gcc -std=c11 -Wall -Wextra -o /dev/null -c spec007_controller.c
 * Build (ESP-IDF):     copy into a project's main/ and idf.py build.
 */

#include <stdint.h>
#include <stdbool.h>

/* ---------- screened constants (traceable to spec007_dynamics_calculations.zig) ---------- */

enum {
    T_AMB_DK          = 2981,  /* 25.0 °C — deciKelvin                          */
    T_NOVEC_GATE_DK   = 4231,  /* 150.0 °C — practical evaporator ceiling        */
    T_SLAB_TRIP_DK    = 5731,  /* 300.0 °C — TEG continuous ceiling; hardware
                                   trips BELOW this, firmware only watches      */
    P_BURST_W         = 5300,  /* burst thermal input, W                         */
    P_SUSTAIN_W       = 530,   /* low-duty thermal input, W                      */
    DRIP_NOM_ULMIN    = 800,   /* 0.80 mL/min nominal drip, microlitres/min      */
    DRIP_MAX_ULMIN    = 1600,  /* 1.60 mL/min ceiling — above this the gas
                                   outruns the burner                           */
    WATER_INV_UL      = 168600,/* 168.6 mL charge                                */
    GAS_NOM_CLMIN     = 50,    /* 0.50 L/min at nominal drip                     */
    SUPERVISOR_TICK_MS= 100,   /* main-loop control tick                         */
    ULP_WATCH_MS      = 20,    /* ULP sentinel poll cadence                      */
    WDT_KICK_LIMIT    = 3,     /* missed kicks before supervisor forces SAFE     */
    QUENCH_WITNESS_MS = 50,    /* firmware must OBSERVE quench_fired within
                                   this window and log the telltale — the
                                   hardware acts; firmware testifies        */
    COOL_TAU_S        = 250,   /* slab loss constant C/k = 5000/20 — five tau
                                   to ambient after charge depletion
                                   (see slabCoolStep in the dynamics harness)*/
    CHARGE_WATER_UL   = 168600,/* one charge = one magazine of water —
                                   the reservoir is single-shot by stoich   */
};

/* ---------- operating states (canon §10) ---------- */

typedef enum {
    ST_SAFE = 0,     /* everything off, quench armed — the ground state      */
    ST_CHARGED,      /* cartridge seated, dry, awaiting first drip           */
    ST_PRIME,        /* wetting the bed — first seconds of hydrolysis        */
    ST_RUN_LOW,      /* sustained duty: ~530 W branch                        */
    ST_RUN_BURST,    /* burst duty: ~5.3 kW branch                           */
    ST_COOLDOWN,     /* drip stopped, slab coasting down                     */
    ST_FAULT,        /* sensor/plausibility fault — drip cut, awaiting reset */
    ST_QUENCHED,     /* hardware quench fired — firmware is a witness only   */
} spec007_state_t;

/* ---------- sensor frame (filled by ULP + ADC service) ---------- */

typedef struct {
    uint32_t t_slab_dk;      /* slab thermocouple, deciKelvin               */
    uint32_t t_bus_dk;       /* oil-bus temperature                         */
    uint32_t t_evap_dk;      /* Novec evaporator temperature                */
    uint32_t p_gas_pa;       /* gas-path pressure                           */
    uint32_t gas_clmin;      /* measured gas rate, cL/min                   */
    uint32_t water_rem_ul;   /* remaining charge water                      */
    bool     cartridge_seated;
    bool     supervisor_ok;  /* external watchdog heartbeat                 */
    bool     quench_fired;   /* hardware quench telltale                    */
} sensors_t;

/* ---------- controller ---------- */

typedef struct {
    spec007_state_t st;
    uint32_t drip_ulmin;     /* commanded drip rate                          */
    uint32_t drip_integral;  /* microlitres delivered this charge            */
    uint32_t state_ms;       /* time in current state                        */
    uint8_t  wdt_misses;
    /* PID registers, per-mille gains — integer all the way down */
    int32_t  gas_err_i;      /* integral of gas-rate error, cL/min·ticks     */
    int32_t  gas_err_prev;
} ctrl_t;

/* gas target for a drip command: cL/min = uL/min × 5/8 ÷ 10  (0.80→50)      */
static uint32_t gas_target_clmin(uint32_t drip_ulmin) {
    return (drip_ulmin * 5) / 80;
}

/* PID on gas rate: keeps the fire matched to the drip. Kp/Ki per-mille,
   output clamped to [0, DRIP_MAX_ULMIN]. Deliberately conservative —
   the quench handles ambition. */
static uint32_t drip_pid(ctrl_t *c, const sensors_t *s) {
    int32_t target = (int32_t)gas_target_clmin(c->drip_ulmin);
    int32_t err = target - (int32_t)s->gas_clmin;
    c->gas_err_i += err;
    if (c->gas_err_i > 4000) c->gas_err_i = 4000;    /* anti-windup */
    if (c->gas_err_i < -4000) c->gas_err_i = -4000;
    int32_t deriv = err - c->gas_err_prev;
    c->gas_err_prev = err;
    /* Kp=200‰, Ki=20‰/tick, Kd=50‰ — screened, not tuned on hardware */
    int32_t out = (int32_t)c->drip_ulmin
                + (err * 200 + c->gas_err_i * 20 + deriv * 50) / 1000;
    if (out < 0) out = 0;
    if (out > DRIP_MAX_ULMIN) out = DRIP_MAX_ULMIN;
    return (uint32_t)out;
}

/* state machine — the AI's whole job is staying inside this fence */
static void step(ctrl_t *c, const sensors_t *s) {
    c->state_ms += SUPERVISOR_TICK_MS;

    /* hardware truths first — firmware acknowledges, never overrides */
    if (s->quench_fired) { c->st = ST_QUENCHED; c->drip_ulmin = 0; return; }
    if (!s->supervisor_ok) {
        if (++c->wdt_misses >= WDT_KICK_LIMIT) { c->st = ST_FAULT; c->drip_ulmin = 0; return; }
    } else {
        c->wdt_misses = 0;
    }
    /* plausibility trip: slab above gate while ORC not calling → fault */
    if (s->t_slab_dk > T_SLAB_TRIP_DK || s->t_evap_dk > T_NOVEC_GATE_DK) {
        c->st = ST_FAULT; c->drip_ulmin = 0; return;
    }

    switch (c->st) {
    case ST_SAFE:
        c->drip_ulmin = 0;
        if (s->cartridge_seated) { c->st = ST_CHARGED; c->state_ms = 0; }
        break;
    case ST_CHARGED:
        /* operator command required; on command → PRIME with nominal drip */
        break;
    case ST_PRIME:
        c->drip_ulmin = DRIP_NOM_ULMIN;
        if (s->gas_clmin >= GAS_NOM_CLMIN * 8 / 10) { c->st = ST_RUN_LOW; c->state_ms = 0; }
        if (c->state_ms > 30000) { c->st = ST_FAULT; c->drip_ulmin = 0; } /* no gas in 30 s = wet bed fault */
        break;
    case ST_RUN_LOW:
    case ST_RUN_BURST:
        c->drip_ulmin = drip_pid(c, s);
        /* charge bookkeeping: integral of the drip against the inventory */
        c->drip_integral += c->drip_ulmin * SUPERVISOR_TICK_MS / 60000;
        if (c->drip_integral >= s->water_rem_ul || s->water_rem_ul == 0)
            { c->st = ST_COOLDOWN; c->state_ms = 0; c->drip_ulmin = 0; }
        break;
    case ST_COOLDOWN:
        c->drip_ulmin = 0;
        if (s->t_slab_dk < T_AMB_DK + 200) { c->st = ST_SAFE; c->state_ms = 0; }
        break;
    case ST_FAULT:
    case ST_QUENCHED:
        c->drip_ulmin = 0; /* latched — manual reset only */
        break;
    }
}

/* ---------- host-review main (ESP-IDF entry is app_main below) ---------- */

#ifdef SPEC007_HOST_REVIEW
#include <stdio.h>
int main(void) {
    ctrl_t c = { .st = ST_SAFE };
    sensors_t s = { .t_slab_dk = T_AMB_DK, .t_bus_dk = T_AMB_DK, .t_evap_dk = T_AMB_DK,
                    .p_gas_pa = 101325, .gas_clmin = 0, .water_rem_ul = WATER_INV_UL,
                    .cartridge_seated = true, .supervisor_ok = true, .quench_fired = false };
    /* walk: seat → prime → gas on → run → drain the charge → cooldown */
    step(&c, &s);                       /* SAFE → CHARGED */
    c.st = ST_PRIME;                    /* operator command */
    for (int i = 0; i < 400; i++) { s.gas_clmin = 50; step(&c, &s); }
    s.water_rem_ul = c.drip_integral;   /* tank hits bottom */
    step(&c, &s);                       /* → COOLDOWN */
    s.t_slab_dk = T_AMB_DK + 100; step(&c, &s); /* → SAFE */
    printf("end state=%d drip=%u integral=%uuL\n", c.st, c.drip_ulmin, c.drip_integral);
    return (c.st == ST_SAFE) ? 0 : 1;
}
#else
/* ESP-IDF entry point — wire sensors_t from ULP/ADC service, then loop. */
void app_main(void) {
    ctrl_t c = { .st = ST_SAFE };
    for (;;) {
        sensors_t s;               /* filled by sensor service */
        step(&c, &s);
        /* TODO(hardware): actuate drip pump PWM with c.drip_ulmin;
           publish telemetry; kick the EXTERNAL supervisor watchdog;
           deep-sleep between ULP_WATCH_MS polls at low duty. */
    }
}
#endif
