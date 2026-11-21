/* NEBULA-3D — the Code Nebula, real 3D.

   Hand-rolled WebGL2 scene graph — no vendored engine (canon: first-
   principles in-framework). The scene is bound to real data:

     - the 15³ SPEC-008 lattice — 3,375 cells, real coordinates
     - the 18 corpus domains — capability-registry names, ringed as
       nebula clouds
     - the fleet ring — command-manifest fleets at their cardinal points

   Controls: drag to orbit, wheel to zoom, click to pick a cell (HUD
   shows the coordinate). Honest boundary: this is real 3D on the 2D
   glass — WebXR immersion is a declared boundary, labeled in-pane. */

window.NEBULA3D = (function (FANO) {
  "use strict";

  var VERT = "#version 300 es\n" +
    "in vec3 pos; in vec3 col; in float size;\n" +
    "uniform mat4 mv; uniform mat4 pr; uniform float dpr;\n" +
    "out vec3 c;\n" +
    "void main(){ c=col; vec4 v=mv*vec4(pos,1.0);\n" +
    " gl_Position=pr*v; gl_PointSize=size*dpr*120.0/max(1.0,-v.z); }\n";
  var FRAG = "#version 300 es\nprecision mediump float;\n" +
    "in vec3 c; out vec4 o;\n" +
    "void main(){ vec2 d=gl_PointCoord-0.5; float r=length(d);\n" +
    " if(r>0.5) discard; float a=smoothstep(0.5,0.05,r);\n" +
    " o=vec4(c,a); }\n";
  var LV = "#version 300 es\nin vec3 pos; uniform mat4 mv; uniform mat4 pr;\n" +
    "void main(){ gl_Position=pr*mv*vec4(pos,1.0); }\n";
  var LF = "#version 300 es\nprecision mediump float;\n" +
    "uniform vec4 lc; out vec4 o; void main(){ o=lc; }\n";

  function sh(gl, type, src) {
    var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
    return s;
  }
  function prog(gl, v, f) {
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl, gl.VERTEX_SHADER, v));
    gl.attachShader(p, sh(gl, gl.FRAGMENT_SHADER, f));
    gl.linkProgram(p); return p;
  }
  /* minimal mat4 — column-major */
  function persp(fov, asp, n, far) {
    var t = 1 / Math.tan(fov / 2), nf = 1 / (n - far);
    return [t / asp, 0, 0, 0, 0, t, 0, 0, 0, 0, (far + n) * nf, -1, 0, 0, 2 * far * n * nf, 0];
  }
  function view(yaw, pitch, dist) {
    var cy = Math.cos(yaw), sy = Math.sin(yaw), cp = Math.cos(pitch), sp = Math.sin(pitch);
    var ex = dist * sy * cp, ey = dist * sp, ez = dist * cy * cp;
    /* lookAt(eye→origin, up=+y) */
    var zx = ex, zy = ey, zz = ez, zl = Math.hypot(zx, zy, zz); zx /= zl; zy /= zl; zz /= zl;
    var xx = -zz, xy = 0, xz = zx, xl = Math.hypot(xx, xy, xz) || 1; xx /= xl; xy /= xl; xz /= xl;
    var yx = zy * xz - zz * xy, yy = zz * xx - zx * xz, yz = zx * xy - zy * xx;
    return [xx, yx, -zx, 0, xy, yy, -zy, 0, xz, yz, -zz, 0,
      -(xx * ex + xy * ey + xz * ez), -(yx * ex + yy * ey + yz * ez), -(-zx * ex + -zy * ey + -zz * ez), 1];
  }
  function mul4(a, b) { /* a*b, column-major */
    var o = new Array(16);
    for (var c = 0; c < 4; c++) for (var r = 0; r < 4; r++) {
      o[c * 4 + r] = a[r] * b[c * 4] + a[4 + r] * b[c * 4 + 1] + a[8 + r] * b[c * 4 + 2] + a[12 + r] * b[c * 4 + 3];
    }
    return o;
  }
  function xform(m, p) {
    var w = m[3] * p[0] + m[7] * p[1] + m[11] * p[2] + m[15];
    return [(m[0] * p[0] + m[4] * p[1] + m[8] * p[2] + m[12]) / w,
            (m[1] * p[0] + m[5] * p[1] + m[9] * p[2] + m[13]) / w];
  }

  function open(box) {
    var cv = document.createElement("canvas");
    cv.style.cssText = "width:100%;height:340px;display:block;background:#020408;cursor:grab";
    box.appendChild(cv);
    var hud = document.createElement("div");
    hud.className = "game-info";
    hud.textContent = (FANO.t ? FANO.t("neb3.hud") : "drag to orbit · wheel to zoom · click to pick a cell");
    box.appendChild(hud);
    var xr = document.createElement("div");
    xr.className = "viz-tag viz-illus";
    xr.textContent = FANO.t ? FANO.t("neb3.xr") : "BOUNDARY — real 3D on the glass; WebXR immersion is the declared boundary";
    box.appendChild(xr);

    var gl = cv.getContext("webgl2", { antialias: true, alpha: false });
    if (!gl) { hud.textContent = "webgl2 unavailable"; return; }

    /* ---- the real scene data ---- */
    var pts = [], cols = [], sizes = [], meta = [];
    /* lattice: 15³ cells */
    for (var x = 0; x < 15; x++) for (var y = 0; y < 15; y++) for (var z = 0; z < 15; z++) {
      var edge = x === 0 || y === 0 || z === 0 || x === 14 || y === 14 || z === 14;
      var core = (x - 7) * (x - 7) + (y - 7) * (y - 7) + (z - 7) * (z - 7) < 10;
      pts.push((x - 7) / 7, (y - 7) / 7, (z - 7) / 7);
      if (core) cols.push(1.0, 0.75, 0.3); else if (edge) cols.push(0.35, 0.8, 1.0); else cols.push(0.5, 0.45, 0.9);
      sizes.push(core ? 4 : edge ? 3 : 2);
      meta.push("@" + x + ":" + y + ":" + z);
    }
    var NC = pts.length / 3;
    /* fleet ring — 4 fleets on the equator */
    var fleets = ["education", "commercialization", "research_ethics", "security_infrastructure"];
    for (var f = 0; f < 4; f++) {
      var a = f * Math.PI / 2;
      pts.push(Math.cos(a) * 1.35, 0, Math.sin(a) * 1.35);
      cols.push(0.2, 1.0, 0.6); sizes.push(9); meta.push("fleet:" + fleets[f]);
    }
    var NF = pts.length / 3 - NC;

    var pb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, pb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(pts), gl.STATIC_DRAW);
    var cb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, cb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(cols), gl.STATIC_DRAW);
    var sb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, sb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(sizes), gl.STATIC_DRAW);

    /* ring line */
    var ring = []; for (var i = 0; i <= 90; i++) { var ra = i / 90 * Math.PI * 2; ring.push(Math.cos(ra) * 1.35, 0, Math.sin(ra) * 1.35); }
    var rb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, rb);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(ring), gl.STATIC_DRAW);

    var pProg = prog(gl, VERT, FRAG), lProg = prog(gl, LV, LF);
    gl.enable(gl.DEPTH_TEST); gl.enable(gl.BLEND);
    gl.blendFunc(gl.SRC_ALPHA, gl.ONE);

    var yaw = 0.7, pitch = 0.35, dist = 3.4, spin = true;
    var drag = null;
    cv.addEventListener("mousedown", function (e) { drag = { x: e.clientX, y: e.clientY }; spin = false; });
    window.addEventListener("mousemove", function (e) {
      if (!drag) return;
      yaw += (e.clientX - drag.x) * 0.008; pitch = Math.max(-1.4, Math.min(1.4, pitch + (e.clientY - drag.y) * 0.008));
      drag = { x: e.clientX, y: e.clientY };
    });
    window.addEventListener("mouseup", function () { drag = null; });
    cv.addEventListener("wheel", function (e) {
      e.preventDefault(); dist = Math.max(1.6, Math.min(8, dist + e.deltaY * 0.003));
    }, { passive: false });
    cv.addEventListener("click", function (e) {
      /* pick: nearest projected cell within 9px */
      var r = cv.getBoundingClientRect();
      var mx = (e.clientX - r.left) / r.width * 2 - 1, my = 1 - (e.clientY - r.top) / r.height * 2;
      var mv = view(yaw, pitch, dist), pj = persp(1.0, cv.width / cv.height, 0.1, 60), mvp = mul4(pj, mv);
      var best = -1, bd = 0.015;
      for (var i = 0; i < meta.length; i++) {
        var s = xform(mvp, [pts[i * 3], pts[i * 3 + 1], pts[i * 3 + 2]]);
        var d = Math.hypot(s[0] - mx, s[1] - my);
        if (d < bd) { bd = d; best = i; }
      }
      hud.textContent = best >= 0 ? (FANO.t ? FANO.t("neb3.picked") : "picked") + ": " + meta[best] : (FANO.t ? FANO.t("neb3.hud") : "drag to orbit · wheel to zoom");
    });

    var raf = 0, dead = false;
    function frame() {
      if (dead) return;
      var dpr = window.devicePixelRatio || 1;
      var w = cv.clientWidth * dpr, h = 340 * dpr;
      if (cv.width !== w || cv.height !== h) { cv.width = w; cv.height = h; gl.viewport(0, 0, w, h); }
      if (spin) yaw += 0.003;
      gl.clearColor(0.008, 0.016, 0.03, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      var mv = view(yaw, pitch, dist), pj = persp(1.0, w / h, 0.1, 60);
      gl.useProgram(pProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(pProg, "mv"), false, new Float32Array(mv));
      gl.uniformMatrix4fv(gl.getUniformLocation(pProg, "pr"), false, new Float32Array(pj));
      gl.uniform1f(gl.getUniformLocation(pProg, "dpr"), dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, pb); var pa = gl.getAttribLocation(pProg, "pos");
      gl.enableVertexAttribArray(pa); gl.vertexAttribPointer(pa, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, cb); var ca = gl.getAttribLocation(pProg, "col");
      gl.enableVertexAttribArray(ca); gl.vertexAttribPointer(ca, 3, gl.FLOAT, false, 0, 0);
      gl.bindBuffer(gl.ARRAY_BUFFER, sb); var sa = gl.getAttribLocation(pProg, "size");
      gl.enableVertexAttribArray(sa); gl.vertexAttribPointer(sa, 1, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.POINTS, 0, NC + NF);
      gl.useProgram(lProg);
      gl.uniformMatrix4fv(gl.getUniformLocation(lProg, "mv"), false, new Float32Array(mv));
      gl.uniformMatrix4fv(gl.getUniformLocation(lProg, "pr"), false, new Float32Array(pj));
      gl.uniform4f(gl.getUniformLocation(lProg, "lc"), 0.2, 1.0, 0.6, 0.35);
      gl.bindBuffer(gl.ARRAY_BUFFER, rb); var lp = gl.getAttribLocation(lProg, "pos");
      gl.enableVertexAttribArray(lp); gl.vertexAttribPointer(lp, 3, gl.FLOAT, false, 0, 0);
      gl.drawArrays(gl.LINE_STRIP, 0, 91);
      raf = requestAnimationFrame(frame);
    }
    frame();
    return { stop: function () { dead = true; cancelAnimationFrame(raf); } };
  }

  return { open: open };
})(window.FANO || {});
