/* QUPLINK VIZ — the render deck. Everything drawable in the family,
   split honestly: DATA-BACKED panes render only what harnesses and
   sources promote; ILLUSTRATIVE panes are labeled as schematics.
   Canon discipline applies to pixels too.

   <!-- Q could draw anything. He chose to draw the truth. --> */

window.QUVIZ = (function (FANO) {
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

  function truthTag(label, backed) {
    /* each viz gets a truth tag — the dossier's own honesty, in chrome */
    var tag = document.createElement("div");
    tag.className = "viz-tag " + (backed ? "viz-real" : "viz-illus");
    tag.textContent = backed
      ? (FANO.t ? FANO.t("viz.real") : "DATA-BACKED — ") + label
      : (FANO.t ? FANO.t("viz.illus") : "ILLUSTRATIVE — ") + label;
    return tag;
  }

  /* ================= DATA-BACKED ================= */

  /* --- sankey: the energy ledger drawn to width --- */
  function vizSankey(cv, ui) {
    var duty = 5300;
    var slider = document.createElement("input");
    slider.type = "range"; slider.min = 530; slider.max = 5300; slider.step = 10; slider.value = 5300;
    slider.className = "viz-slider";
    var lab = document.createElement("div");
    lab.className = "game-info";
    ui.appendChild(lab); ui.appendChild(slider);
    loadWasm(function (E) {
      function draw() {
        lab.textContent = "thermal input: " + duty + " W — widths ∝ watts";
        var x = cv.getContext("2d");
        x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
        var bus = E ? E.bus_power_w(Math.min(1020, duty * 1020 / 5300 | 0), 700, 900, 1000) : 642;
        var econ = Math.min(duty * 0.08 | 0, 1430);
        var evap = duty - econ - (duty * 0.04 | 0);
        var reject = duty - bus - econ;
        function flow(y0, w0, y1, w1, x0, x1, color, name, val) {
          x.fillStyle = color;
          x.beginPath();
          x.moveTo(x0, y0 - w0 / 2); x.lineTo(x1, y1 - w1 / 2);
          x.lineTo(x1, y1 + w1 / 2); x.lineTo(x0, y0 + w0 / 2); x.fill();
          x.fillStyle = FANO.col("--desk-ink","#c8c4b4"); x.font = "10px monospace"; x.textAlign = "left";
          x.fillText(name + " " + val + " W", x1 + 4, y1);
        }
        var S = 0.045; // px per watt
        x.fillStyle = FANO.col("--stamp","#8b1a1a"); x.fillRect(8, 140 - duty * S / 2, 14, duty * S);
        x.fillStyle = "#d8d4c8"; x.font = "10px monospace";
        x.fillText("burner", 4, 130);
        flow(140, duty * S, 100, evap * S, 22, 220, "rgba(" + FANO.col("--acc-rgb", "201,164,74") + ",.55)", "novec evap", evap);
        flow(140, duty * S, 210, econ * S, 22, 220, "rgba(139,170,80,.55)", "economizer", econ);
        flow(140, duty * S, 300, (duty * 0.04) * S, 22, 220, "rgba(107,103,90,.55)", "loop loss", duty * 0.04 | 0);
        x.fillStyle = "#c9a44a"; x.fillRect(220, 100 - evap * S / 2, 12, evap * S);
        flow(100, evap * S, 90, bus * S * 6, 232, 420, "rgba(" + FANO.col("--ok-rgb", "53,216,84") + ",.6)", "path-A bus", bus);
        flow(100, evap * S, 230, (evap - bus) * S * 0.8, 232, 420, "rgba(139,26,26,.45)", "condenser+reject", evap - bus);
        x.fillStyle = "#35d854"; x.fillRect(420, 90 - bus * S * 3, 12, bus * S * 6);
        x.fillStyle = FANO.col("--desk-ink","#c8c4b4"); x.fillText("bus out", 434, 95);
        x.fillText("≈" + (bus * 0.35 / 10).toFixed(1) + " Wh/charge at this duty", 434, 115);
        x.fillStyle = FANO.col("--desk-dim","#6b675a"); x.fillText("the floor draws itself — every width is a number the harness owns", 22, 330);
      }
      slider.addEventListener("input", function () { duty = +slider.value; draw(); });
      draw();
    });
  }

  /* --- thermal recorder: live strip-chart of the real Euler sim --- */
  function vizRecorder(cv, ui) {
    var info = document.createElement("div");
    info.className = "game-info";
    info.textContent = "spec007.wasm slab_step replayed at ~120× — slab heat-up, gas lag, charge drain.";
    ui.appendChild(info);
    loadWasm(function (E) {
      if (!E) { info.textContent = "wasm absent."; return; }
      var T = 2981, rem = 0, s = 0, g = 0, water = 16860, hist = [];
      var raf;
      function frame() {
        if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
        for (var k = 0; k < 120 && s < 3600; k++) {
          var st = E.slab_step(T, 5300, rem);
          T = st >> 16; rem = st & 0xffff;
          g += (50 * 64 - g) / 8;
          water -= 800 / 60;
          s++;
          if (s % 10 === 0) hist.push([T, g / 64, water]);
        }
        var x = cv.getContext("2d");
        x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
        /* axes: temp dK → y, seconds → x */
        function ty(dk) { return 320 - (dk - 2981) * 0.11; }
        x.strokeStyle = FANO.col("--grid","#2c333e"); x.beginPath();
        [2981, 4231, 5631, 5731].forEach(function (dk) {
          x.moveTo(30, ty(dk)); x.lineTo(630, ty(dk));
        });
        x.stroke();
        x.fillStyle = FANO.col("--desk-dim","#6b675a"); x.font = "9px monospace";
        x.fillText("25°C", 4, ty(2981)); x.fillText("150°C gate", 4, ty(4231));
        x.fillText("290°C eq", 4, ty(5631)); x.fillText("300°C TEG", 4, ty(5731));
        /* curves */
        x.strokeStyle = FANO.col("--acc", "#c9a44a"); x.lineWidth = 1.5; x.beginPath();
        hist.forEach(function (h, i) { var px = 30 + i * 600 / 360; var py = ty(h[0]); i ? x.lineTo(px, py) : x.moveTo(px, py); });
        x.stroke();
        x.strokeStyle = FANO.col("--ok", "#35d854"); x.beginPath();
        hist.forEach(function (h, i) { var px = 30 + i * 600 / 360; var py = 320 - h[1] * 2.2; i ? x.lineTo(px, py) : x.moveTo(px, py); });
        x.stroke();
        /* charge bar */
        var remFrac = Math.max(0, water) / 16860;
        x.fillStyle = "rgba(139,170,80,.5)";
        x.fillRect(30, 326, 600 * remFrac, 8);
        x.fillStyle = FANO.col("--desk-ink","#c8c4b4"); x.font = "10px monospace";
        x.fillText("t=" + s + "s  T=" + (T / 10 - 273.15).toFixed(1) + "°C  gas=" + (g / 64).toFixed(1) + "cL/min  water=" + (water / 100).toFixed(1) + "mL", 30, 20);
        if (s < 3600) raf = requestAnimationFrame(frame);
        else {
          x.fillStyle = FANO.col("--stamp","#8b1a1a");
          x.fillText("charge spent — the lamp goes out on schedule", 30, 60);
        }
      }
      frame();
    });
  }

  /* --- claim constellation: the real C01–C52 as a star map --- */
  var CLAIMS = [
    ["C01", "amber"], ["C02", "amber"], ["C03", "amber"], ["C04", "red"], ["C05", "red"],
    ["C06", "grey"], ["C07", "red"], ["C08", "red"], ["C09", "grey"], ["C10", "red"],
    ["C11", "amber"], ["C12", "amber"], ["C13", "red"], ["C14", "amber"], ["C15", "grey"],
    ["C16", "red"], ["C17", "red"], ["C18", "grey"], ["C19", "amber"], ["C20", "red"],
    ["C21", "grey"], ["C22", "amber"], ["C23", "amber"], ["C24", "green"], ["C25", "amber"],
    ["C26", "grey"], ["C27", "amber"], ["C28", "grey"], ["C29", "grey"], ["C30", "amber"],
    ["C31", "amber"], ["C32", "amber"], ["C33", "red"], ["C34", "grey"], ["C35", "red"],
    ["C36", "green"], ["C37", "amber"], ["C38", "amber"], ["C39", "amber"], ["C40", "green"],
    ["C41", "amber"], ["C42", "amber"], ["C43", "grey"], ["C44", "red"], ["C45", "amber"],
    ["C46", "teal"], ["C47", "teal"], ["C48", "teal"], ["C49", "teal"], ["C50", "green"],
    ["C51", "amber"], ["C52", "grey"],
  ];
  var GRADE_COLORS = {
    green: "#35d854", teal: "#4ecdc4", amber: "#c9a44a",
    grey: "#5a5648", red: "#8b3a3a",
  };
  var GRADE_LABELS = {
    green: "VERIFIED", teal: "VERIFIED-WITH-CORRECTION", amber: "CONDITIONAL/DESIGN",
    grey: "UNVERIFIED/SUPERSEDED", red: "CONTRADICTED/BLOCKED",
  };
  function vizClaims(cv, ui) {
    var info = document.createElement("div");
    info.className = "game-info";
    info.innerHTML = "the File as a constellation — hover a star for its claim. " +
      Object.keys(GRADE_LABELS).map(function (g) {
        return '<span style="color:' + GRADE_COLORS[g] + '">■</span> ' + GRADE_LABELS[g];
      }).join(" · ");
    ui.appendChild(info);
    var tip = document.createElement("div");
    tip.className = "game-info";
    tip.id = "claim-tip";
    ui.appendChild(tip);
    var x = cv.getContext("2d");
    var stars = CLAIMS.map(function (c, i) {
      var a = i * 2.39996, r = 12 + 148 * Math.sqrt(i / CLAIMS.length);
      return { id: c[0], g: c[1], x: 320 + r * Math.cos(a), y: 170 + r * Math.sin(a) };
    });
    function draw(hover) {
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
      stars.forEach(function (s) {
        x.fillStyle = GRADE_COLORS[s.g];
        x.globalAlpha = hover && hover !== s ? 0.3 : 1;
        x.beginPath(); x.arc(s.x, s.y, s === hover ? 7 : 4, 0, 7); x.fill();
        x.globalAlpha = 1;
        if (s === hover) {
          x.fillStyle = FANO.col("--acc-hi","#e8c76a"); x.font = "10px monospace"; x.textAlign = "center";
          x.fillText(s.id, s.x, s.y - 11);
        }
      });
    }
    cv.addEventListener("pointermove", function (e) {
      var r = cv.getBoundingClientRect();
      var mx = e.clientX - r.left, my = e.clientY - r.top, hit = null;
      stars.forEach(function (s) { if (Math.hypot(s.x - mx, s.y - my) < 10) hit = s; });
      draw(hit);
      tip.textContent = hit ? hit.id + " — " + GRADE_LABELS[hit.g] : " ";
    });
    draw(null);
  }

  /* --- e8: 240 real roots, 8D → 2D rotating projection --- */
  function vizE8(cv) {
    /* E8 roots: all permutations of (±1,±1,0×6) [112] + (±½)⁸ even minus [128] */
    var roots = [];
    var i, j;
    for (i = 0; i < 8; i++) for (j = i + 1; j < 8; j++)
      [[1, 1], [1, -1], [-1, 1], [-1, -1]].forEach(function (sg) {
        var v = [0, 0, 0, 0, 0, 0, 0, 0]; v[i] = sg[0]; v[j] = sg[1]; roots.push(v);
      });
    for (var m = 0; m < 256; m += 2) { /* even parity = even # of - signs */
      var v = [];
      for (i = 0; i < 8; i++) v.push((m >> i & 1) ? -0.5 : 0.5);
      var neg = v.filter(function (x) { return x < 0; }).length;
      if (neg % 2 === 0) roots.push(v);
    }
    var raf, t = 0;
    function frame() {
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      t += 0.004;
      var x = cv.getContext("2d");
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
      /* rotate in 4 independent 2-planes */
      var pts = roots.map(function (v) {
        var w = v.slice();
        for (var p = 0; p < 4; p++) {
          var a = 2 * p, b = 2 * p + 1, c = Math.cos(t * (1 + p * 0.37)), s = Math.sin(t * (1 + p * 0.37));
          var na = w[a] * c - w[b] * s, nb = w[a] * s + w[b] * c;
          w[a] = na; w[b] = nb;
        }
        return w;
      });
      pts.forEach(function (w) {
        var px = 320 + w[0] * 105, py = 170 + w[1] * 105;
        var d = 0.35 + 0.65 * (w[2] + 2) / 4;
        x.fillStyle = "rgba(" + FANO.col("--acc-rgb", "201,164,74") + "," + d.toFixed(2) + ")";
        x.fillRect(px, py, 2, 2);
      });
      x.fillStyle = FANO.col("--desk-dim","#6b675a"); x.font = "9px monospace";
      x.fillText("240 roots · rotating through 4 planes · dims 3–8 hidden in the glow", 12, 330);
      raf = requestAnimationFrame(frame);
    }
    frame();
  }

  /* --- smith chart: real circles, real Γ transform, draggable --- */
  function vizSmith(cv, ui) {
    var info = document.createElement("div");
    info.className = "game-info";
    info.id = "smith-read";
    ui.appendChild(info);
    var G = { x: 0.3, y: 0.2 }; /* start inside the unit circle */
    function draw() {
      var x = cv.getContext("2d");
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
      var cx = 320, cy = 170, R = 150;
      x.strokeStyle = FANO.col("--grid","#2c333e");
      x.beginPath(); x.arc(cx, cy, R, 0, 7); x.stroke(); /* unit circle */
      /* constant-r circles: r=0.33,1,3 */
      [0.33, 1, 3].forEach(function (r) {
        var rc = R / (1 + r);
        x.beginPath(); x.arc(cx + R - rc, cy, rc, 0, 7); x.stroke();
      });
      /* constant-x arcs ±1 */
      x.beginPath(); x.arc(cx + R, cy - R, R, Math.PI / 2, Math.PI);
      x.moveTo(cx + R, cy + R); x.arc(cx + R, cy + R, R, Math.PI, Math.PI * 1.5);
      x.stroke();
      x.beginPath(); x.moveTo(cx - R, cy); x.lineTo(cx + R, cy); x.stroke();
      /* Γ point + z readout: z = (1+Γ)/(1-Γ) */
      var px = cx + G.x * R, py = cy - G.y * R;
      x.fillStyle = FANO.col("--acc-hi","#e8c76a"); x.beginPath(); x.arc(px, py, 6, 0, 7); x.fill();
      var nr = 1 - G.x * G.x - G.y * G.y, ni = 2 * G.y;
      var dd = (1 - G.x) * (1 - G.x) + G.y * G.y;
      var zr = nr / dd, zi = ni / dd;
      info.textContent = "Γ = " + G.x.toFixed(2) + (G.y >= 0 ? "+" : "") + G.y.toFixed(2) +
        "j   →   z = " + zr.toFixed(2) + (zi >= 0 ? "+" : "") + zi.toFixed(2) + "j Ω̄   (drag the point)";
    }
    cv.addEventListener("pointerdown", function (e) {
      function mv(ev) {
        var r = cv.getBoundingClientRect();
        G.x = (ev.clientX - r.left - 320) / 150;
        G.y = -(ev.clientY - r.top - 170) / 150;
        var m = Math.hypot(G.x, G.y);
        if (m > 0.97) { G.x *= 0.97 / m; G.y *= 0.97 / m; }
        draw();
      }
      mv(e);
      document.addEventListener("pointermove", mv);
      document.addEventListener("pointerup", function () {
        document.removeEventListener("pointermove", mv);
      }, { once: true });
    });
    draw();
  }

  /* --- cartridge cutaway: the real volume budget --- */
  function vizCartridge(cv, ui) {
    var info = document.createElement("div");
    info.className = "game-info";
    info.textContent = "50×200 mm interior — 332 mL. volumes are the harness's: carbide 136 · water 169 · CaO 15 · headspace 12.";
    ui.appendChild(info);
    var t0 = performance.now(), raf;
    var parts = [
      ["water pouch", 169, "#4e6d8c"], ["carbide bed", 136, FANO.col("--desk-dim","#6b675a")],
      ["CaO quench", 15, "#8aa550"], ["headspace", 12, FANO.col("--stamp","#8b1a1a")],
    ];
    function frame(now) {
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      var t = (now - t0) / 1000;
      var x = cv.getContext("2d");
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
      var x0 = 250, y0 = 20, w = 140, h = 300, per = h / 332;
      x.strokeStyle = FANO.col("--desk-ink","#c8c4b4"); x.strokeRect(x0, y0, w, h);
      var y = y0;
      parts.forEach(function (p) {
        var ph = p[1] * per;
        x.fillStyle = p[2]; x.globalAlpha = p[0] === "headspace" ? 0.25 + 0.15 * Math.sin(t * 2) : 0.75;
        x.fillRect(x0, y, w, ph); x.globalAlpha = 1;
        x.fillStyle = FANO.col("--desk-ink","#c8c4b4"); x.font = "10px monospace"; x.textAlign = "left";
        x.fillText(p[0] + " " + p[1] + " mL", x0 + w + 8, y + ph / 2 + 3);
        y += ph;
      });
      /* drip animation: drops fall from water into carbide */
      x.fillStyle = "#9fc4e8";
      for (var i = 0; i < 3; i++) {
        var dy = ((t * 60 + i * 57) % (169 * per));
        x.fillRect(x0 + 20 + (i % 2) * 40, y0 + dy, 3, 6);
      }
      x.fillStyle = FANO.col("--desk-dim","#6b675a"); x.font = "9px monospace"; x.textAlign = "left";
      x.fillText("12 mL of air — <4% margin, +~14% sludge growth promised", x0 - 110, 335);
      raf = requestAnimationFrame(frame);
    }
    raf = requestAnimationFrame(frame);
  }

  /* ================= ILLUSTRATIVE ================= */

  /* --- tesla spiral: gap streamlines (schematic, labeled) --- */
  function vizTesla(cv) {
    var raf, t = 0;
    function frame() {
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      t += 0.02;
      var x = cv.getContext("2d");
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
      var cx = 320, cy = 170;
      x.strokeStyle = FANO.col("--grid","#2c333e");
      x.beginPath(); x.arc(cx, cy, 130, 0, 7); x.stroke();
      x.beginPath(); x.arc(cx, cy, 124, 0, 7); x.stroke();
      x.beginPath(); x.arc(cx, cy, 20, 0, 7); x.stroke();
      /* particles spiraling inward between the discs */
      x.fillStyle = FANO.col("--acc", "#c9a44a");
      for (var i = 0; i < 60; i++) {
        var ph = i / 60 * Math.PI * 2 + t * 3;
        var rr = 130 - ((t * 30 + i * 9) % 110);
        if (rr < 22) continue;
        var px = cx + rr * Math.cos(ph - (130 - rr) * 0.09);
        var py = cy + rr * Math.sin(ph - (130 - rr) * 0.09);
        x.fillRect(px, py, 2, 2);
      }
      x.fillStyle = FANO.col("--desk-dim","#6b675a"); x.font = "9px monospace";
      x.fillText("boundary-layer drag does the work — no blades, just patience at 25k RPM", 12, 330);
      raf = requestAnimationFrame(frame);
    }
    frame();
  }

  /* --- lattice15: the 421-node cloud, schematic 3D --- */
  function vizLattice(cv) {
    var pts = [];
    var GA = Math.PI * (3 - Math.sqrt(5));
    for (var i = 0; i < 421; i++) {
      var y = 1 - (i / 420) * 2, r = Math.sqrt(1 - y * y), th = i * GA;
      pts.push([r * Math.cos(th), y, r * Math.sin(th)]);
    }
    var raf, t = 0;
    function frame() {
      if (!cv.isConnected) { cancelAnimationFrame(raf); return; }
      t += 0.01;
      var x = cv.getContext("2d");
      x.fillStyle = FANO.col("--console-bg","#0b0e13"); x.fillRect(0, 0, 640, 340);
      pts.forEach(function (p) {
        var c = Math.cos(t), s = Math.sin(t);
        var px = p[0] * c - p[2] * s, pz = p[0] * s + p[2] * c;
        var sc = 1 / (2.6 - pz);
        var X = 320 + px * 330 * sc, Y = 170 + p[1] * 330 * sc;
        var a = 0.25 + 0.75 * (pz + 1) / 2;
        x.fillStyle = "rgba(78,205,196," + a.toFixed(2) + ")";
        x.fillRect(X, Y, 2.4, 2.4);
      });
      x.fillStyle = FANO.col("--desk-dim","#6b675a"); x.font = "9px monospace";
      x.fillText("421 e0 nodes — fibonacci-sphere projection of the 15³ lattice", 12, 330);
      raf = requestAnimationFrame(frame);
    }
    frame();
  }

  /* ================= registry ================= */

  var VIZ = [
    ["sankey", "Energy Sankey", "the ledger drawn to width", vizSankey, true],
    ["recorder", "Thermal Recorder", "wasm Euler sim, live strip-chart", vizRecorder, true],
    ["claims", "Claim Constellation", "C01–C52 as a star map", vizClaims, true],
    ["e8", "E8 Roots", "240 real roots rotating", vizE8, true],
    ["smith", "Smith Chart", "drag Γ, read z — real RF math", vizSmith, true],
    ["cartridge", "Cartridge Cutaway", "the 332 mL budget, animated", vizCartridge, true],
    ["tesla", "Tesla Gap Flow", "boundary-layer streamlines", vizTesla, false],
    ["lattice", "15³ Projection", "the lattice on a sphere", vizLattice, false],
  ];

  /* direct entry for the palette/terminal — the deck opens on command */
  function openViz(name) {
    var v = VIZ.find(function (x) { return x[0] === name || x[1].toLowerCase().indexOf(name) === 0; });
    if (!v) return false;
    var cv = document.createElement("canvas");
    cv.width = 640; cv.height = 340;
    cv.className = "viz-cv";
    var ui = document.createElement("div");
    var wrap = document.createElement("div");
    wrap.appendChild(ui); wrap.appendChild(cv);
    var win = FANO.makeWindow(v[1] + " — viz", wrap);
    wrap.insertBefore(truthTag(v[2], v[4]), wrap.firstChild);
    win.style.width = "43rem"; win.style.height = "27rem";
    v[3](cv, ui);
    if (FANO.vizSeen) FANO.vizSeen(v[0]);
    FANO.award(2, "viz: " + v[0]);
    return true;
  }
  function vizPaneList() { return VIZ.map(function (v) { return v[0]; }); }

  function vizPane(pane) {
    var grid = document.createElement("div");
    grid.className = "qp-grid";
    VIZ.forEach(function (v) {
      var card = document.createElement("div");
      card.className = "qp-card";
      card.innerHTML = "<div class='qp-card-t'>" + v[1] + "</div><div class='qp-card-d'>" + v[2] +
        (v[4] ? " · <span style='color:#35d854'>data</span>" : " · <span style='color:#8aa550'>illus</span>") + "</div>";
      card.addEventListener("click", function () { openViz(v[0]); });
      grid.appendChild(card);
    });
    pane.appendChild(grid);
    var note = document.createElement("div");
    note.className = "game-info";
    var ta = FANO.t ? FANO.t("qp.note.viz.a") : "DATA-BACKED";
    var tb = FANO.t ? FANO.t("qp.note.viz.b") : "ILLUSTRATIVE";
    note.innerHTML = (FANO.lang && FANO.lang() === "zh" && FANO.t)
      ? FANO.t("qp.note.viz")
      : "two honesty tags: <span style='color:#35d854'>" + ta + "</span> renders only promoted numbers; " +
        "<span style='color:#8aa550'>" + tb + "</span> is schematic and says so. The dossier grades its own pictures.";
    pane.appendChild(note);
  }

  return { vizPane: vizPane, openViz: openViz, vizPaneList: vizPaneList };
})(window.FANO);
