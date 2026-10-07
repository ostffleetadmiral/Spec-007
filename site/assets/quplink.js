/* QUPLINK — the sandbox uplink. Where the family's real artifacts become
   playable: the Fano plane is a puzzle, the codon router is a quiz, the
   integer floor is a boss you cannot beat. Everything here is built from
   pieces of the sister projects — nothing is pretend.

   <!-- The sandbox is where the quartermaster lets you touch the live ammo.
        Carefully. --> */

window.QUPLINK = (function (FANO) {
  "use strict";

  var wasm = null;
  function loadWasm(cb) {
    if (wasm) return cb(wasm);
    fetch("assets/spec007.wasm")
      .then(function (r) { return r.arrayBuffer(); })
      .then(function (b) { return WebAssembly.instantiate(b); })
      .then(function (o) { wasm = o.instance.exports; cb(wasm); })
      .catch(function () { cb(null); });
  }

  /* ================= GAMES ================= */

  /* --- fano_lines: find the 7 lines of the Fano plane --- */
  var FANO_PTS = [ // label, x, y — same geometry as the wallpaper
    ["A", 100, 20], ["B", 30, 150], ["C", 170, 150],
    ["D", 65, 85], ["E", 135, 85], ["F", 100, 150], ["G", 100, 107],
  ];
  var FANO_LINES = [
    [0, 3, 1], [0, 4, 2], [1, 5, 2], [0, 6, 5],
    [1, 6, 4], [2, 6, 3], [3, 4, 5],
  ];

  function gameFanoLines(body) {
    var cv = document.createElement("canvas");
    cv.width = 220; cv.height = 190;
    var info = document.createElement("div");
    info.className = "game-info";
    info.textContent = "click 3 points that share a line. find all 7 lines.";
    body.appendChild(info);
    body.appendChild(cv);
    var sel = [], found = [];
    function draw() {
      var x = cv.getContext("2d");
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 220, 190);
      FANO_LINES.forEach(function (ln, i) {
        if (found.indexOf(i) < 0) return;
        x.strokeStyle = FANO.col("--ok","#35d854"); x.lineWidth = 2; x.beginPath();
        ln.forEach(function (p, j) {
          var pt = FANO_PTS[p];
          if (!j) x.moveTo(pt[1] + 10, pt[2] + 10); else x.lineTo(pt[1] + 10, pt[2] + 10);
        });
        x.stroke();
      });
      FANO_PTS.forEach(function (p, i) {
        x.fillStyle = sel.indexOf(i) >= 0 ? FANO.col("--acc-hi","#e8c76a") : FANO.col("--acc","#c9a44a");
        x.beginPath(); x.arc(p[1] + 10, p[2] + 10, 7, 0, 7); x.fill();
        x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.font = "9px monospace"; x.textAlign = "center";
        x.fillText(p[0], p[1] + 10, p[2] + 13);
      });
      info.textContent = "lines found: " + found.length + "/7" +
        (sel.length ? " · selected: " + sel.map(function (i) { return FANO_PTS[i][0]; }).join("") : "");
    }
    cv.addEventListener("pointerdown", function (e) {
      var r = cv.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top;
      var hit = -1;
      FANO_PTS.forEach(function (p, i) {
        if (Math.hypot(p[1] + 10 - mx, p[2] + 10 - my) < 12) hit = i;
      });
      if (hit < 0) return;
      var at = sel.indexOf(hit);
      if (at >= 0) sel.splice(at, 1); else sel.push(hit);
      if (sel.length === 3) {
        var s = sel.slice().sort().join(",");
        var idx = FANO_LINES.findIndex(function (ln, i) {
          return found.indexOf(i) < 0 && ln.slice().sort().join(",") === s;
        });
        if (idx >= 0) {
          found.push(idx);
          FANO.sfx.egg();
          if (found.length === 7) {
            FANO.toast("FANO COMPLETE — the smallest projective plane, mapped", "ach");
            FANO.award(25, "seven lines, one plane");
            FANO.egg("fano7");
          }
        } else {
          info.textContent = "not a line — the plane disagrees.";
        }
        sel = [];
      }
      draw();
    });
    draw();
  }

  /* --- triad: tune φ^a·π^b·φ^c to hit the target --- */
  var TRIAD_TARGETS = [2.71828, 4.0, 6.28318, 10.0, 8.53973];
  function gameTriad(body) {
    var target = TRIAD_TARGETS[Math.floor(Math.random() * TRIAD_TARGETS.length)];
    var PHI = 1.618033988749895, PI = 3.141592653589793;
    var ui = document.createElement("div");
    ui.className = "game-ui";
    ui.innerHTML =
      "<div class='game-info'>T(a,b,c) = φ<sup>a</sup> · π<sup>b</sup> · φ<sup>c</sup> — hit the target within 0.01. f64 sidecar math, all sins forgiven.</div>" +
      "<div class='triad-target'>TARGET: " + target.toFixed(5) + "</div>";
    var vals = { a: 0, b: 0, c: 0 };
    var out = document.createElement("div");
    out.className = "triad-out";
    ["a", "b", "c"].forEach(function (k) {
      var row = document.createElement("div");
      row.className = "triad-row";
      row.innerHTML = "<span>" + k + "</span><input type='range' min='-2' max='4' step='1' value='0'><span class='tv' id='tv-" + k + "'>0</span>";
      row.querySelector("input").addEventListener("input", function (ev) {
        vals[k] = +ev.target.value;
        document.getElementById("tv-" + k).textContent = ev.target.value;
        var t = Math.pow(PHI, vals.a) * Math.pow(PI, vals.b) * Math.pow(PHI, vals.c);
        var d = Math.abs(t - target);
        out.textContent = "T(" + vals.a + "," + vals.b + "," + vals.c + ") = " + t.toFixed(5) + "   Δ = " + d.toFixed(5);
        if (d < 0.01) {
          out.textContent += "  — HIT. the triad answers.";
          FANO.sfx.chime();
          FANO.award(20, "triad tuned");
        }
      });
      ui.appendChild(row);
    });
    ui.appendChild(out);
    body.appendChild(ui);
  }

  /* --- mobius: rotate the mirrors, route the signal --- */
  function gameMobius(body) {
    /* 4×4 grid; '/' and '\' mirrors, '·' clear. Source left row 1 →
       collector right row 2. Click tiles to cycle · / \ */
    var grid = ["····", "····", "····", "····"].map(function (r) { return r.split(""); });
    var cv = document.createElement("canvas");
    cv.width = 240; cv.height = 240;
    var info = document.createElement("div");
    info.className = "game-info";
    info.textContent = "rotate the gates. the signal enters left, must exit right.";
    var btn = document.createElement("button");
    btn.className = "game-btn";
    btn.textContent = "FIRE Γ";
    body.appendChild(info); body.appendChild(cv); body.appendChild(btn);
    function trace() {
      var x = 0, y = 1, dx = 1, dy = 0, path = [[x, y]], steps = 0;
      while (steps++ < 40) {
        x += dx; y += dy;
        if (x > 3) return { win: y === 2, path: path };
        if (x < 0 || y < 0 || y > 3) return { win: false, path: path };
        path.push([x, y]);
        var t = grid[y][x];
        if (t === "/") { var ndx = -dy, ndy = -dx; dx = ndx; dy = ndy; }
        else if (t === "\\") { var edx = dy, edy = dx; dx = edx; dy = edy; }
      }
      return { win: false, path: path };
    }
    function draw(path) {
      var x2 = cv.getContext("2d");
      x2.fillStyle = FANO.col("--console-bg","#0b0e13"); x2.fillRect(0, 0, 240, 240);
      for (var y = 0; y < 4; y++) for (var gx = 0; gx < 4; gx++) {
        x2.strokeStyle = FANO.col("--grid","#2c333e"); x2.strokeRect(gx * 55 + 10, y * 55 + 10, 55, 55);
        x2.fillStyle = FANO.col("--acc","#c9a44a"); x2.font = "22px monospace"; x2.textAlign = "center";
        x2.fillText(grid[y][gx] === "·" ? "" : grid[y][gx], gx * 55 + 37, y * 55 + 47);
      }
      x2.fillStyle = FANO.col("--stamp","#8b1a1a"); x2.fillText("→", 8, 55 + 47);
      x2.fillStyle = FANO.col("--ok","#35d854"); x2.fillText("◉", 232, 110 + 47 - 55);
      if (path) {
        x2.strokeStyle = FANO.col("--acc-hi","#e8c76a"); x2.lineWidth = 2; x2.beginPath();
        path.forEach(function (p, i) {
          var px = p[0] * 55 + 37, py = p[1] * 55 + 37;
          if (!i) x2.moveTo(px, py); else x2.lineTo(px, py);
        });
        x2.stroke();
      }
    }
    cv.addEventListener("pointerdown", function (e) {
      var r = cv.getBoundingClientRect();
      var gx = Math.floor((e.clientX - r.left - 10) / 55), gy = Math.floor((e.clientY - r.top - 10) / 55);
      if (gx < 0 || gx > 3 || gy < 0 || gy > 3) return;
      var cyc = { "·": "/", "/": "\\", "\\": "·" };
      grid[gy][gx] = cyc[grid[gy][gx]];
      draw();
    });
    btn.addEventListener("click", function () {
      var r = trace();
      draw(r.path);
      if (r.win) {
        FANO.toast("Γ ROUTED — the Möbius boundary held the signal", "ach");
        FANO.sfx.chime(); FANO.award(20, "signal routed");
      } else {
        FANO.sfx.denied();
        info.textContent = "signal lost off-grid. re-route.";
      }
    });
    draw();
  }

  /* --- codon_lab: route the codon home --- */
  var CODONS = [
    ["AUG", "Methionine", "the start codon — ChemistrySignatureBuilder's E6 outlier"],
    ["GCA", "Alanine", "PlaceholderSignatureBuilder's own outlier"],
    ["UUU", "Phenylalanine", null], ["GGU", "Glycine", null],
    ["UAA", "STOP", "E2 phase-space rule — the chain ends here"],
    ["CAC", "Histidine", null], ["AAA", "Lysine", null],
    ["UGU", "Cysteine", null], ["GAU", "Aspartate", null],
    ["CGU", "Arginine", null], ["UAC", "Tyrosine", null], ["AGC", "Serine", null],
  ];
  var AMINOS = ["Methionine", "Alanine", "Phenylalanine", "Glycine", "STOP",
    "Histidine", "Lysine", "Cysteine", "Aspartate", "Arginine", "Tyrosine", "Serine"];
  function gameCodon(body) {
    var streak = 0, asked = 0;
    var ui = document.createElement("div");
    ui.className = "game-ui";
    body.appendChild(ui);
    function round() {
      asked++;
      var c = CODONS[Math.floor(Math.random() * CODONS.length)];
      var wrong = AMINOS.filter(function (a) { return a !== c[1]; })
        .sort(function () { return Math.random() - 0.5; }).slice(0, 3);
      var opts = wrong.concat([c[1]]).sort(function () { return Math.random() - 0.5; });
      ui.innerHTML = "<div class='game-info'>which amino acid does <b>" + c[0] + "</b> route to?" +
        " streak: " + streak + "</div>";
      opts.forEach(function (o) {
        var b = document.createElement("button");
        b.className = "game-btn opt";
        b.textContent = o;
        b.addEventListener("click", function () {
          if (o === c[1]) {
            streak++;
            FANO.sfx.toast();
            var note = c[2] ? " — " + c[2] : "";
            FANO.toast("correct" + note);
            if (streak === 5) { FANO.award(20, "5-codon streak"); FANO.sfx.chime(); }
          } else {
            streak = 0;
            FANO.sfx.denied();
          }
          if (asked < 60) round();
        });
        ui.appendChild(b);
      });
    }
    round();
  }

  /* --- beat_the_floor: the boss you cannot beat (real wasm) --- */
  function gameFloor(body) {
    var ui = document.createElement("div");
    ui.className = "game-ui";
    body.appendChild(ui);
    loadWasm(function (E) {
      if (!E) { ui.innerHTML = "<div class='game-info'>spec007.wasm absent — the floor declines to appear.</div>"; return; }
      var attempts = 0;
      ui.innerHTML =
        "<div class='game-info'>the floor: ~155–266 Wh per charge (Path A screen), " +
        "210 min at 0.8 mL/min. tune the inputs. try to beat it. <b>you cannot — " +
        "that is the game.</b></div>" +
        "<div class='triad-row'>drip mL/min×100 <input id='bf-drip' type='range' min='20' max='160' value='80'><span id='bf-dv'>80</span></div>" +
        "<div class='triad-row'>duty ‰ <input id='bf-duty' type='range' min='100' max='1000' value='300'><span id='bf-duv'>300</span></div>" +
        "<button class='game-btn' id='bf-go'>ATTEMPT THE FLOOR</button>" +
        "<div class='triad-out' id='bf-out'></div>";
      var drip = document.getElementById("bf-drip"), duty = document.getElementById("bf-duty");
      drip.oninput = function () { document.getElementById("bf-dv").textContent = drip.value; };
      duty.oninput = function () { document.getElementById("bf-duv").textContent = duty.value; };
      document.getElementById("bf-go").addEventListener("click", function () {
        attempts++;
        var d = +drip.value, du = +duty.value;
        var gas = E.drip_to_gas_clmin(d);
        var mins = E.charge_minutes(d);
        var eq = E.slab_equilibrium_dk(5300);
        var busA = E.bus_power_w(1020, 700, 900, 1000); /* isentropic shaft × Path A */
        var busB = E.bus_power_w(254, 220, 850, 1000); /* Path B chain */
        var wh = E.per_charge_wh_x10(busA, du);
        var verdict =
          "gas " + gas + " cL/min · charge " + mins + " min · slab eq " + (eq / 10 - 273.15).toFixed(0) + " °C\n" +
          "bus: A " + busA + " W · B " + busB + " W · per-charge ≈" + (wh / 10).toFixed(1) + " Wh\n" +
          "floor: the integer holds. attempt " + attempts + " logged.";
        document.getElementById("bf-out").textContent = verdict;
        if (attempts === 7) FANO.egg("sisyphus");
        if (attempts === 10) { FANO.award(15, "ten attempts against arithmetic"); FANO.toast("the archive records your persistence", "ach"); }
      });
    });
  }

  function gameCooldown(body) {
    var ui = document.createElement("div");
    ui.className = "game-ui";
    body.appendChild(ui);
    loadWasm(function (E) {
      if (!E) { ui.innerHTML = "<div class='game-info'>spec007.wasm absent — the slab stays hot.</div>"; return; }
      var hot = E.slab_equilibrium_dk(5300); // burst equilibrium, dK
      var t = hot, rem = 0, steps = 0;
      function render() {
        var c = (t / 10 - 273.15).toFixed(0);
        ui.querySelector("#cd-out").textContent =
          "slab " + c + " °C (" + t + " dK) · steps " + steps +
          (t <= 2981 ? "\nambient reached — the ledger gives it all back." : "");
      }
      ui.innerHTML =
        "<div class='game-info'>the charge is spent, the drip is cut. the slab starts at " +
        ((hot / 10) - 273.15).toFixed(0) + " °C and cools on k=20 W/K, C=5000 J/K " +
        "(tau = 250 s). coast it down — same ledger, opposite sign.</div>" +
        "<button class='game-btn' id='cd-step'>COOL 1 s</button> " +
        "<button class='game-btn' id='cd-100'>COOL 100 s</button> " +
        "<button class='game-btn' id='cd-tau'>COOL 1 TAU (250 s)</button>" +
        "<div class='triad-out' id='cd-out'></div>";
      function cool(n) {
        for (var i = 0; i < n && t > 2981; i++) {
          var packed = E.slab_cool_step(t, rem);
          t = packed >>> 16; rem = packed & 0xffff; steps++;
        }
        render();
      }
      document.getElementById("cd-step").addEventListener("click", function () { cool(1); });
      document.getElementById("cd-100").addEventListener("click", function () { cool(100); });
      document.getElementById("cd-tau").addEventListener("click", function () { cool(250); });
      render();
    });
  }

  /* ================= SANDBOX ================= */

  var FANOP_DEMO =
    "# demo.fanop - FANO-1 polyglot project: one file, three languages.\n" +
    "# py + js functions share the canonical i256 ABI; zig orchestrates.\n" +
    "name: demo\n\n" +
    "py fn add(a, b) {\n    return a + b\n}\n\n" +
    "js fn mulq(a, b) {\n    return (a * b) >> 128n\n}\n\n" +
    "zig fn main() {\n" +
    "    // 1.5 and 2.5 in Q128.128 fixed point.\n" +
    "    const a = poly.i256FromQ128(.{ .hi = 1, .lo = @as(u128, 1) << 127 });\n" +
    "    const b = poly.i256FromQ128(.{ .hi = 2, .lo = @as(u128, 1) << 127 });\n" +
    "    const sum = try py_add(a, b);    // 1.5 + 2.5 = 4.0\n" +
    "    const prod = try js_mulq(a, b);  // 1.5 * 2.5 = 3.75 (fixed-point)\n" +
    "    const sum_q = poly.i256ToQ128(sum);\n" +
    "    const prod_q = poly.i256ToQ128(prod);\n" +
    "    std.debug.print(\"py add  1.5 + 2.5 = {d}.{d}\\n\", .{ sum_q.hi, @as(u64, @intCast((@as(u256, sum_q.lo) * 1000) >> 128)) });\n" +
    "    std.debug.print(\"js mul  1.5 * 2.5 = {d}.{d}\\n\", .{ prod_q.hi, @as(u64, @intCast((@as(u256, prod_q.lo) * 1000) >> 128)) });\n" +
    "}";

  /* tiny poly evaluator: `return a OP b` and `(a OP b) >> Nn` — real parse, tiny grammar */
  function evalFn(src, a, b) {
    var m = src.match(/return\s+\(?\s*a\s*([+\-*\/])\s*b\s*\)?\s*(?:>>\s*(\d+)n?)?/);
    if (!m) return null;
    var op = m[1], shift = m[2] ? BigInt(m[2]) : 0n;
    var r;
    switch (op) {
      case "+": r = a + b; break;
      case "-": r = a - b; break;
      case "*": r = a * b; break;
      case "/": r = b !== 0n ? a / b : null; break;
    }
    if (r === null) return null;
    return r >> shift;
  }

  function sandboxFanop(body) {
    var ui = document.createElement("div");
    ui.className = "game-ui";
    ui.innerHTML =
      "<div class='game-info'>.fanop polyglot editor — real file from polyglot-ref/zig/poly. " +
      "edit the py/js bodies (a+b, a-b, a*b, a/b, optional >>128n), then assemble.</div>";
    var ta = document.createElement("textarea");
    ta.className = "fanop-edit";
    ta.value = FANOP_DEMO;
    var btn = document.createElement("button");
    btn.className = "game-btn";
    btn.textContent = "ASSEMBLE & RUN";
    var out = document.createElement("pre");
    out.className = "triad-out fanop-out";
    btn.addEventListener("click", function () {
      var src = ta.value;
      var fns = {};
      var re = /(py|js|zig)\s+fn\s+(\w+)\s*\(([^)]*)\)\s*\{([^}]*)\}/g, mm;
      var lines = ["assembly:"];
      while ((mm = re.exec(src))) {
        fns[mm[1] + "_" + mm[2]] = mm[4];
        lines.push("  " + mm[1] + " fn " + mm[2] + "(" + mm[3] + ") … bound to i256 ABI");
      }
      /* operands: 1.5 and 2.5 in Q128.128 = hi<<128 | 1<<127 */
      var S = 1n << 128n;
      var a = (1n << 128n) | (1n << 127n);
      var b = (2n << 128n) | (1n << 127n);
      lines.push("run zig main:");
      function fmt(v) {
        if (v === null) return "err";
        var hi = v >> 128n, lo = v - (hi << 128n);
        var milli = (lo * 1000n) >> 128n;
        return hi.toString() + "." + milli.toString().padStart(3, "0");
      }
      if (fns.py_add) {
        var sum = evalFn(fns.py_add, a, b);
        lines.push("  py add  1.5 + 2.5 = " + fmt(sum));
      }
      if (fns.js_mulq) {
        var prod = evalFn(fns.js_mulq, a, b);
        lines.push("  js mul  1.5 * 2.5 = " + fmt(prod) + "  (Q128.128)");
      }
      if (!fns.py_add && !fns.js_mulq) lines.push("  (no py/js fns found — main orchestrates nothing)");
      out.textContent = lines.join("\n");
      FANO.award(5, "assembled a .fanop");
    });
    ui.appendChild(ta); ui.appendChild(btn); ui.appendChild(out);
    body.appendChild(ui);
  }

  /* --- harness playground: the wasm as an instrument --- */
  function sandboxHarness(body) {
    var ui = document.createElement("div");
    ui.className = "game-ui";
    body.appendChild(ui);
    loadWasm(function (E) {
      if (!E) { ui.innerHTML = "<div class='game-info'>spec007.wasm absent.</div>"; return; }
      ui.innerHTML =
        "<div class='game-info'>spec007.wasm — the dossier's arithmetic, live. " +
        "canary: fano_alive() = " + E.fano_alive() + "</div>" +
        "<div class='triad-row'>drip mL/min×100 <input id='hp-d' type='range' min='20' max='200' value='80'><span id='hp-dv'>80</span></div>" +
        "<div class='triad-row'>slab power W <input id='hp-p' type='range' min='100' max='6000' step='50' value='5300'><span id='hp-pv'>5300</span></div>" +
        "<div class='triad-out' id='hp-out'></div>";
      var d = document.getElementById("hp-d"), p = document.getElementById("hp-p");
      function go() {
        document.getElementById("hp-dv").textContent = d.value;
        document.getElementById("hp-pv").textContent = p.value;
        var eq = E.slab_equilibrium_dk(+p.value);
        document.getElementById("hp-out").textContent =
          "gas " + E.drip_to_gas_clmin(+d.value) + " cL/min · charge " + E.charge_minutes(+d.value) +
          " min\nslab eq " + (eq / 10 - 273.15).toFixed(1) + " °C" +
          (eq > 4231 ? " (over the Novec gate)" : " (below the Novec gate)") +
          "\nheadspace " + E.cartridge_headspace_ml(300, 169, 15) + " mL";
      }
      d.oninput = go; p.oninput = go; go();
    });
  }

  /* --- proof console: classify the claim like the audit does --- */
  var CLAIMS = [
    ["The Fano plane has exactly 7 lines", "PROVEN", "countable — the game above proves it"],
    ["φ appears in lepton mass ratios", "INTERPRETATION", "real math, framework label"],
    ["300 g CaC₂ yields ~104.9 L gas", "PROVEN", "integer stoichiometry, harness-backed"],
    ["The cartridge is safe", "UNVERIFIED", "a target, not a barrier — canon §2.3"],
    ["CaO quench fires in 3 s", "UNVERIFIED", "kinetics never measured"],
    ["Tesla turbines beat scrolls at 500 W", "CONTRADICTED", "the literature says otherwise"],
  ];
  var VERDICTS = ["PROVEN", "INTERPRETATION", "NUMEROLOGY", "CONTRADICTED", "UNVERIFIED"];
  function sandboxProof(body) {
    var score = 0, n = 0;
    var ui = document.createElement("div");
    ui.className = "game-ui";
    body.appendChild(ui);
    function round() {
      if (n >= CLAIMS.length) {
        ui.innerHTML = "<div class='game-info'>audit complete: " + score + "/" + CLAIMS.length +
          " — " + (score === CLAIMS.length ? "you grade like the audit." : "the audit remains harder than it looks.") + "</div>";
        if (score === CLAIMS.length) FANO.award(25, "auditor's eye");
        return;
      }
      var c = CLAIMS[n];
      ui.innerHTML = "<div class='game-info'>classify: «" + c[0] + "»</div>";
      VERDICTS.forEach(function (v) {
        var b = document.createElement("button");
        b.className = "game-btn opt";
        b.textContent = v;
        b.addEventListener("click", function () {
          if (v === c[1]) { score++; FANO.toast("correct — " + c[2]); FANO.sfx.toast(); }
          else { FANO.toast("the audit says " + c[1] + " — " + c[2]); FANO.sfx.denied(); }
          n++; round();
        });
        ui.appendChild(b);
      });
    }
    round();
  }

  /* ================= shell ================= */

  var GAMES = [
    ["fano_lines", "Fano Lines", "map the 7 lines of the plane", gameFanoLines],
    ["triad", "Triad Tuner", "φ^a·π^b·φ^c — hit the target", gameTriad],
    ["mobius", "Möbius Reflector", "route Γ through the gates", gameMobius],
    ["codon", "Codon Lab", "route the codon to its amino acid", gameCodon],
    ["floor", "Beat the Floor", "spec007.wasm — the boss you cannot beat", gameFloor],
    ["cooldown", "Coast the Slab", "the ledger runs backward — cool the spent slab", gameCooldown],
  ];
  var SANDBOX = [
    ["fanop", ".fanop Editor", "polyglot source — assemble & run", sandboxFanop],
    ["harness", "Harness Playground", "live wasm instrument", sandboxHarness],
    ["proof", "Proof Console", "grade claims like the audit", sandboxProof],
  ];

  /* ================= FAMILY ================= */
  /* sibling projects of the fleet — facts cited from each tree's own
     README/AGENTS. nothing embellished; the dossier rule applies here too. */
  var FAMILY = [
    {
      id: "qstar-llm",
      name: "Qstar-LLM",
      tag: "the lattice IS the model — no transformer attention",
      home: "experiments/qstar-llm",
      rows: [
        ["Architecture", "15³ grid — 421 E0 nodes × 8 channels; octonion channel routing, no attention, no MLP"],
        ["Agent state", "53,888 bytes (~53 KB) Q64.64 — ~1,460× smaller than the Qwen1.5-0.5B reference"],
        ["Arithmetic", "integer-only fixed-point, two tiers: Q64.64 lattice (i128/i256), Q128.128 metacognition (i256/i512)"],
        ["Dependencies", "0 in core — ONNX Runtime + Vulkan via dlopen when present"],
        ["Subsystems", "129 src modules + vision + geoview, 58 tools, Ollama-compatible HTTP server, .qsc corpus (551 MB)"],
        ["Verification", "2,610+ tests; competitive bench vs Ollama/OpenAI/Maple; 8-dim sentience scorer"],
        ["Lineage", "Trivium + Quadrivium pipelines; dimensional modules 0D–10D; WASM exports"],
      ],
    },
    {
      id: "zig-k3",
      name: "zig-k3-port",
      tag: "2.78T parameters in a few GB — integer-only all the way down",
      home: "experiments/zig-k3-port",
      rows: [
        ["What it is", "Zig 0.13 port of kimi-k3-in-c — streams the Kimi K3 MoE (93 layers, 896 MXFP4 experts/layer)"],
        ["Arithmetic", "Q128.128 fixed-point core (i256, i512 intermediates, RNE); f64 lives only in sidecars"],
        ["Parity", "token-identical to the C engine; bit-identical on released checkpoint weights (rel = 0.000000)"],
        ["Tokenizer", "45/45 vs the tiktoken oracle on the released model"],
        ["Targets", "native + wasm32-wasi; wasm64 under the in-tree k3w interpreter; Vulkan backend bit-exact CPU≡GPU"],
        ["Fabric", "K3P1–P5 peer transport — byte-range serving, remote expert exec; K3RS1 parity shards; K3SS1 Shamir"],
        ["Memory", "packed-trunk streaming + LRU expert cache — trillion-param scale in GBs of RAM"],
      ],
    },
    {
      id: "digit",
      name: "Digit v0.0.0.1",
      tag: "the E5/E6 wrapper — deterministic lattice experiments",
      home: "digit @ firingline (192.168.12.210) — Desktop/Digit-v0.0.0.1",
      rows: [
        ["What it is", "Zig 0.13 foundation: deterministic lattice experiments, q128.128 state, E5/E6 reflection, scoped ONNX/Wasm boundary"],
        ["Charter", "distinguishes implemented software behavior from hypotheses about physics and sentience — said plainly, in the README"],
        ["Triad audit", "145-row dataset: 8 rows <0.01% abs error, 55 <0.1%, 131 <1% — fit statistics, not claimed derivations"],
        ["Ideatree", "finite evidence report: 240-root E8 construction, 15³/16³ + 421 identities, deterministic Fano tensor, E5/E6/E7/E0 branch growth"],
        ["Honesty", "E6 reflection is a bounded metacognition experiment — explicitly not evidence of subjective experience"],
        ["Cluster", "one development space with sheraton under the firingline rule"],
      ],
    },
  ];

  function tabbedWindow(title, tabs) {
    var wrap = document.createElement("div");
    wrap.className = "qp";
    var bar = document.createElement("div");
    bar.className = "qp-tabs";
    var pane = document.createElement("div");
    pane.className = "qp-pane";
    tabs.forEach(function (t, i) {
      var b = document.createElement("button");
      b.className = "qp-tab" + (i === 0 ? " on" : "");
      b.textContent = t[0];
      b.addEventListener("click", function () {
        bar.querySelectorAll(".qp-tab").forEach(function (x) { x.classList.remove("on"); });
        b.classList.add("on");
        pane.innerHTML = "";
        t[1](pane);
      });
      bar.appendChild(b);
    });
    wrap.appendChild(bar); wrap.appendChild(pane);
    var win = FANO.makeWindow(title, wrap);
    win.style.width = "32rem"; win.style.height = "34rem";
    tabs[0][1](pane);
    return win;
  }

  function gamesPane(pane) {
    var grid = document.createElement("div");
    grid.className = "qp-grid";
    GAMES.forEach(function (g) {
      var card = document.createElement("div");
      card.className = "qp-card";
      card.innerHTML = "<div class='qp-card-t'>" + g[1] + "</div><div class='qp-card-d'>" + g[2] + "</div>";
      card.addEventListener("click", function () {
        var win = FANO.makeWindow(g[1] + " — quplink", document.createElement("div"));
        win.style.width = "20rem"; win.style.height = "22rem";
        g[3](win.querySelector(".win-body"));
        win.querySelector(".win-body").classList.add("game-body");
      });
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    var note = document.createElement("div");
    note.className = "game-info";
    note.textContent = FANO.t ? FANO.t("qp.note.games") : "every game is a real piece of the family. no pretend math allowed.";
    pane.appendChild(note);
  }

  function sandboxPane(pane) {
    var grid = document.createElement("div");
    grid.className = "qp-grid";
    SANDBOX.forEach(function (g) {
      var card = document.createElement("div");
      card.className = "qp-card";
      card.innerHTML = "<div class='qp-card-t'>" + g[1] + "</div><div class='qp-card-d'>" + g[2] + "</div>";
      card.addEventListener("click", function () {
        tabbedWindow(g[1] + " — quplink", [["workbench", g[3]]]);
      });
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    var note = document.createElement("div");
    note.className = "game-info";
    note.textContent = FANO.t ? FANO.t("qp.note.sandbox") : "buildable pieces from the family: polyglot source, live wasm, the audit's own game.";
    pane.appendChild(note);
  }

  function familyDetail(f) {
    return function (pane) {
      var h = document.createElement("div");
      h.className = "game-info";
      h.innerHTML = "<b>" + f.name + "</b> — " + f.tag +
        "<br><span class='qp-faint'>" + f.home + "</span>";
      pane.appendChild(h);
      var tbl = document.createElement("table");
      tbl.className = "qp-facts";
      f.rows.forEach(function (r) {
        var tr = document.createElement("tr");
        var td1 = document.createElement("td");
        td1.textContent = r[0];
        var td2 = document.createElement("td");
        td2.textContent = r[1];
        tr.appendChild(td1); tr.appendChild(td2);
        tbl.appendChild(tr);
      });
      pane.appendChild(tbl);
    };
  }

  function familyPane(pane) {
    var grid = document.createElement("div");
    grid.className = "qp-grid";
    FAMILY.forEach(function (f) {
      var card = document.createElement("div");
      card.className = "qp-card";
      card.innerHTML = "<div class='qp-card-t'>" + f.name + "</div><div class='qp-card-d'>" + f.tag + "</div>";
      card.addEventListener("click", function () {
        tabbedWindow(f.name + " — family file", [["dossier", familyDetail(f)]]);
        if (FANO.egg) FANO.egg("genealogist");
      });
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    var note = document.createElement("div");
    note.className = "game-info";
    note.textContent = FANO.t ? FANO.t("qp.note.family") : "the sibling projects — every number cited from its own README. family files, not marketing.";
    pane.appendChild(note);
  }

  function open() {
    tabbedWindow("quplink — sandbox uplink", [
      [FANO.t ? FANO.t("qp.games") : "GAMES", gamesPane],
      [FANO.t ? FANO.t("qp.sandbox") : "SANDBOX", sandboxPane],
      [FANO.t ? FANO.t("qp.family") : "FAMILY", familyPane],
      [FANO.t ? FANO.t("qp.viz") : "VIZ", function (pane) {
        /* the render deck is its own module — the dossier grades its own pictures */
        if (window.QUVIZ) window.QUVIZ.vizPane(pane);
        else pane.textContent = "viz deck missing — check assets/quplink-viz.js";
      }],
    ]);
    FANO.award(3, "uplink opened");
  }

  return { open: open };
})(window.FANO);
