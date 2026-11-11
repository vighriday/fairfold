/* Fairfold landing: background thread field.
 *
 * One woven sheet that folds into a box, a rope, a ring and a fan as the page scrolls (the shapes,
 * keyframes and colours come from the design export). The export stroked it on a full-screen 2D
 * canvas three times per frame; here it is drawn by WebGL in a handful of instanced draw calls with
 * shader anti-aliasing, so the main thread only projects 1,024 points per frame and the GPU does the
 * rest. The dark Proof Ledger panel and the purple console panel recolour the threads through a
 * rounded-rectangle test in the fragment shader instead of extra clipped passes.
 * Falls back to an optimised 2D canvas renderer when WebGL is unavailable.
 */
(function () {
  'use strict';

  var U = 64, V = 16, NP = U * V, TAU = Math.PI * 2;
  var WEFT_COLS = 16;                          // cross threads, edge to edge
  var COLS = [];                               // their column indices; knots sit on the crossings
  for (var c0 = 0; c0 < WEFT_COLS; c0++) COLS.push(Math.round(c0 * (U - 1) / (WEFT_COLS - 1)));
  var NDOTS = WEFT_COLS * V;

  function mk(fn) {
    var a = new Float32Array(NP * 3);
    for (var j = 0; j < V; j++) for (var i = 0; i < U; i++) {
      var p = fn(i / (U - 1), j / (V - 1)), k = (j * U + i) * 3;
      a[k] = p[0]; a[k + 1] = p[1]; a[k + 2] = p[2];
    }
    return a;
  }

  // sheet, box, rope, ring, fan: unchanged from the design
  var SHAPES = [
    mk(function (u, v) { return [(u - .5) * 4.6, (v - .5) * 2, 0]; }),
    mk(function (u, v) { var a = u * 4, s = Math.min(3, a | 0), e = (a - s) * 1.7 - .85, w = .85; return [s === 0 ? e : s === 1 ? w : s === 2 ? -e : -w, (v - .5) * 1.5, s === 0 ? w : s === 1 ? -e : s === 2 ? -w : e]; }),
    mk(function (u, v) { var a = u * TAU * 2.4 + v * TAU, r = .46 + .1 * Math.sin(u * TAU * 3); return [r * Math.cos(a), (u - .5) * 4.4, r * Math.sin(a)]; }),
    mk(function (u, v) { var A = u * TAU, B = v * TAU + A * 2, r = 1.15 + .36 * Math.cos(B); return [r * Math.cos(A), .36 * Math.sin(B), r * Math.sin(A)]; }),
    mk(function (u, v) { var x = (u - .5) * 4; return [x, (v - .5) * 2, .7 - Math.abs(x) * .8]; })
  ];

  // Projects the morph between two shapes into screen space (CSS px) exactly as the design did.
  // out: NP * 4 floats = x, y, depth z, perspective factor.
  function project(out, P) {
    var A = SHAPES[P.a], B = SHAPES[P.b], e = P.e;
    var cy = Math.cos(P.ry), sy = Math.sin(P.ry), cx = Math.cos(P.rx), sx = Math.sin(P.rx);
    var S = P.S, PX = P.PX, PY = P.PY, tw = P.tw;
    for (var k = 0, n = 0, o = 0; n < NP; n++, k += 3, o += 4) {
      var x = A[k] + (B[k] - A[k]) * e;
      var y = A[k + 1] + (B[k + 1] - A[k + 1]) * e + 0.05 * Math.sin((n % U) * 0.32 + tw + ((n / U) | 0) * 0.5);
      var z = A[k + 2] + (B[k + 2] - A[k + 2]) * e;
      var x1 = x * cy + z * sy, z1 = z * cy - x * sy, y1 = y * cx - z1 * sx, z2 = y * sx + z1 * cx, pp = 5 / (5 - z2);
      out[o] = PX + x1 * S * pp; out[o + 1] = PY + y1 * S * pp; out[o + 2] = z2; out[o + 3] = pp;
    }
  }

  function hex(c) { var n = parseInt(c.slice(1), 16); return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]; }

  /* ------------------------------------------------------------------ WebGL */

  var LINE_VS = [
    'precision highp float;',
    'attribute vec2 aCorner;',          // x: which end (0|1), y: side (-1|1)
    'attribute vec4 aP0;',              // segment start: x, y (css px), depth z, valid flag
    'attribute vec4 aP1;',              // segment end
    'uniform vec2 uRes;',
    'uniform float uHalf;',             // half width incl. anti-alias fringe, css px
    'varying float vZ;',
    'varying float vD;',
    'void main() {',
    '  vec2 a = aP0.xy, b = aP1.xy, d = b - a;',
    '  float L = length(d);',
    '  vec2 t = L > 1e-4 ? d / L : vec2(1.0, 0.0);',
    '  vec2 p = mix(a, b, aCorner.x) + vec2(-t.y, t.x) * aCorner.y * uHalf;',
    '  vZ = mix(aP0.z, aP1.z, aCorner.x);',
    '  vD = aCorner.y * uHalf;',
    '  vec2 c = p / uRes * 2.0 - 1.0;',
    '  gl_Position = aP0.w > 0.5 ? vec4(c.x, -c.y, 0.0, 1.0) : vec4(2.0, 2.0, 2.0, 1.0);',
    '}'
  ].join('\n');

  var DOT_VS = [
    'precision highp float;',
    'attribute vec4 aP;',               // x, y, depth z, perspective
    'uniform vec2 uRes;',
    'uniform float uDpr;',
    'uniform float uSize;',
    'varying float vZ;',
    'varying float vR;',
    'void main() {',
    '  vec2 c = aP.xy / uRes * 2.0 - 1.0;',
    '  gl_Position = vec4(c.x, -c.y, 0.0, 1.0);',
    '  float r = 0.5 * uSize * aP.w * aP.w * uDpr;',   // nearer knots read slightly larger
    '  vR = r;',
    '  gl_PointSize = 2.0 * r + 2.0;',
    '  vZ = aP.z;',
    '}'
  ].join('\n');

  // shared colouring: base thread colour, recoloured inside the ledger / console panels
  var COLOUR_FS = [
    'precision highp float;',
    'uniform float uDpr;',
    'uniform float uH;',                // drawing buffer height, device px
    'uniform vec4 uZ1;',                // ledger panel rect (css px, top-left origin)
    'uniform vec4 uZ2;',                // console panel rect
    'uniform float uZR;',               // panel corner radius
    'uniform vec4 uC0;',                // rgb + alpha: page
    'uniform vec4 uC1;',                // ledger
    'uniform vec4 uC2;',                // console panel
    'uniform float uMul;',
    'float rbox(vec2 p, vec4 r, float rad) {',
    '  vec2 q = abs(p - (r.xy + r.zw * 0.5)) - r.zw * 0.5 + rad;',
    '  return length(max(q, 0.0)) + min(max(q.x, q.y), 0.0) - rad;',
    '}',
    'vec4 tint(float z, float cover) {',
    '  vec2 p = vec2(gl_FragCoord.x, uH - gl_FragCoord.y) / uDpr;',
    '  float i1 = clamp(0.5 - rbox(p, uZ1, uZR) * uDpr, 0.0, 1.0);',
    '  float i2 = clamp(0.5 - rbox(p, uZ2, uZR) * uDpr, 0.0, 1.0);',
    '  vec4 c = mix(mix(uC0, uC1, i1), uC2, i2);',
    '  float depth = clamp(0.6 + z * 0.45, 0.28, 1.0);',   // the design's depth fade, now per pixel
    '  float a = c.a * depth * cover * uMul;',
    '  return vec4(c.rgb * a, a);',                        // premultiplied
    '}'
  ].join('\n');

  var LINE_FS = COLOUR_FS + [
    '',
    'uniform float uCore;',             // half core width, css px
    'varying float vZ;',
    'varying float vD;',
    'void main() {',
    '  float cover = clamp((uCore - abs(vD)) * uDpr + 0.5, 0.0, 1.0);',
    '  if (cover <= 0.0) discard;',
    '  gl_FragColor = tint(vZ, cover);',
    '}'
  ].join('\n');

  var DOT_FS = COLOUR_FS + [
    '',
    'varying float vZ;',
    'varying float vR;',
    'void main() {',
    '  float d = length(gl_PointCoord - 0.5) * (2.0 * vR + 2.0);',
    '  float cover = clamp(vR - d + 0.5, 0.0, 1.0);',
    '  if (cover <= 0.0) discard;',
    '  gl_FragColor = tint(vZ, cover);',
    '}'
  ].join('\n');

  function compile(gl, vs, fs) {
    function sh(type, src) {
      var s = gl.createShader(type); gl.shaderSource(s, src); gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s) || 'shader');
      return s;
    }
    var p = gl.createProgram();
    gl.attachShader(p, sh(gl.VERTEX_SHADER, vs)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, fs));
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p) || 'link');
    var u = {}, n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS);
    for (var i = 0; i < n; i++) { var info = gl.getActiveUniform(p, i); u[info.name] = gl.getUniformLocation(p, info.name); }
    return { p: p, u: u, a: function (name) { return gl.getAttribLocation(p, name); } };
  }

  function WebGLThreads(canvas) {
    var gl = canvas.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false, depth: false, stencil: false, preserveDrawingBuffer: false, powerPreference: 'low-power' });
    if (!gl) throw new Error('no webgl');
    var inst = gl.getExtension('ANGLE_instanced_arrays');
    if (!inst) throw new Error('no instancing');
    var line = compile(gl, LINE_VS, LINE_FS), dot = compile(gl, DOT_VS, DOT_FS);

    var pts = new Float32Array(NP * 4);                 // projected points
    var warp = new Float32Array(NP * 4);                // row threads, w = segment valid
    var weft = new Float32Array(WEFT_COLS * V * 4);     // column threads
    var dots = new Float32Array(NDOTS * 4);

    var quad = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([0, -1, 1, -1, 0, 1, 1, 1]), gl.STATIC_DRAW);
    function dyn(size) { var b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, size * 4, gl.DYNAMIC_DRAW); return b; }
    var warpBuf = dyn(warp.length), weftBuf = dyn(weft.length), dotBuf = dyn(dots.length);

    var L = { corner: line.a('aCorner'), p0: line.a('aP0'), p1: line.a('aP1') }, D = { p: dot.a('aP') };
    var W = 1, H = 1, dpr = 1;

    gl.disable(gl.DEPTH_TEST);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.clearColor(0, 0, 0, 0);

    function shared(prog, P) {
      var u = prog.u;
      gl.uniform1f(u.uDpr, dpr); gl.uniform1f(u.uH, canvas.height);
      gl.uniform4fv(u.uZ1, P.z1); gl.uniform4fv(u.uZ2, P.z2); gl.uniform1f(u.uZR, 36);
      gl.uniform4fv(u.uC0, P.c0); gl.uniform4fv(u.uC1, P.c1); gl.uniform4fv(u.uC2, P.c2);
      if (u.uRes) gl.uniform2f(u.uRes, W, H);
    }

    function drawThreads(buf, count, mul, core) {
      gl.uniform1f(line.u.uMul, mul);
      gl.uniform1f(line.u.uCore, core);
      gl.uniform1f(line.u.uHalf, core + 1 / dpr);
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.vertexAttribPointer(L.p0, 4, gl.FLOAT, false, 16, 0);
      gl.vertexAttribPointer(L.p1, 4, gl.FLOAT, false, 16, 16);
      inst.drawArraysInstancedANGLE(gl.TRIANGLE_STRIP, 0, 4, count - 1);
    }

    return {
      mode: 'webgl',
      resize: function (w, h, d) {
        W = w; H = h; dpr = d;
        canvas.width = Math.max(1, Math.round(w * d)); canvas.height = Math.max(1, Math.round(h * d));
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      draw: function (P) {
        project(pts, P);
        // warp: each row is a polyline; the last point of a row starts no segment
        for (var n = 0, o = 0; n < NP; n++, o += 4) {
          warp[o] = pts[o]; warp[o + 1] = pts[o + 1]; warp[o + 2] = pts[o + 2]; warp[o + 3] = (n % U) === U - 1 ? 0 : 1;
        }
        // weft threads run top to bottom; knots sit where they cross the warp rows
        for (var c = 0, w = 0; c < WEFT_COLS; c++) {
          for (var j = 0; j < V; j++, w += 4) {
            var s = (j * U + COLS[c]) * 4;
            weft[w] = pts[s]; weft[w + 1] = pts[s + 1]; weft[w + 2] = pts[s + 2]; weft[w + 3] = j === V - 1 ? 0 : 1;
            dots[w] = pts[s]; dots[w + 1] = pts[s + 1]; dots[w + 2] = pts[s + 2]; dots[w + 3] = pts[s + 3];
          }
        }

        gl.clear(gl.COLOR_BUFFER_BIT);

        gl.useProgram(line.p);
        shared(line, P);
        gl.bindBuffer(gl.ARRAY_BUFFER, quad);
        gl.enableVertexAttribArray(L.corner);
        gl.vertexAttribPointer(L.corner, 2, gl.FLOAT, false, 0, 0);
        inst.vertexAttribDivisorANGLE(L.corner, 0);
        gl.enableVertexAttribArray(L.p0); gl.enableVertexAttribArray(L.p1);
        inst.vertexAttribDivisorANGLE(L.p0, 1); inst.vertexAttribDivisorANGLE(L.p1, 1);
        gl.bindBuffer(gl.ARRAY_BUFFER, weftBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, weft);
        drawThreads(weftBuf, WEFT_COLS * V, 0.42, 0.42);
        gl.bindBuffer(gl.ARRAY_BUFFER, warpBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, warp);
        drawThreads(warpBuf, NP, 1, 0.5);
        inst.vertexAttribDivisorANGLE(L.p0, 0); inst.vertexAttribDivisorANGLE(L.p1, 0);
        gl.disableVertexAttribArray(L.corner); gl.disableVertexAttribArray(L.p0); gl.disableVertexAttribArray(L.p1);

        gl.useProgram(dot.p);
        shared(dot, P);
        gl.uniform1f(dot.u.uMul, 1.15);
        gl.uniform1f(dot.u.uSize, 2.5);
        gl.bindBuffer(gl.ARRAY_BUFFER, dotBuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, dots);
        gl.enableVertexAttribArray(D.p);
        gl.vertexAttribPointer(D.p, 4, gl.FLOAT, false, 0, 0);
        gl.drawArrays(gl.POINTS, 0, NDOTS);
        gl.disableVertexAttribArray(D.p);
      },
      lost: function () { return gl.isContextLost(); }
    };
  }

  /* --------------------------------------------------------- 2D fallback */

  function CanvasThreads(canvas) {
    var g2 = canvas.getContext('2d');
    var pts = new Float32Array(NP * 4), W = 1, H = 1, dpr = 1;
    function pass(col, base) {
      g2.strokeStyle = col; g2.fillStyle = col; g2.lineWidth = 1;
      for (var j = 0; j < V; j++) {
        var zs = 0; g2.beginPath();
        for (var i = 0; i < U; i++) { var k = (j * U + i) * 4; zs += pts[k + 2]; if (i) g2.lineTo(pts[k], pts[k + 1]); else g2.moveTo(pts[k], pts[k + 1]); }
        g2.globalAlpha = base * Math.max(0.28, Math.min(1, 0.6 + zs / U * 0.45)); g2.stroke();
        for (var m = 0; m < WEFT_COLS; m++) { var q = (j * U + COLS[m]) * 4; g2.fillRect(pts[q] - 1.2, pts[q + 1] - 1.2, 2.4, 2.4); }
      }
    }
    return {
      mode: '2d',
      resize: function (w, h, d) { W = w; H = h; dpr = Math.min(d, 1.5); canvas.width = Math.round(w * dpr); canvas.height = Math.round(h * dpr); },
      draw: function (P) {
        project(pts, P);
        g2.setTransform(dpr, 0, 0, dpr, 0, 0); g2.globalAlpha = 1; g2.clearRect(0, 0, W, H);
        pass(P.hex0, P.c0[3]);
        [[P.z1, P.hex1, P.c1[3]], [P.z2, P.hex2, P.c2[3]]].forEach(function (zn) {
          var r = zn[0]; if (r[2] <= 0 || r[1] + r[3] < 0 || r[1] > H) return;
          g2.save(); g2.beginPath();
          if (g2.roundRect) g2.roundRect(r[0], r[1], r[2], r[3], 36); else g2.rect(r[0], r[1], r[2], r[3]);
          g2.clip(); g2.clearRect(0, 0, W, H); pass(zn[1], zn[2]); g2.restore();
        });
      },
      lost: function () { return false; }
    };
  }

  window.FairfoldThreads = {
    create: function (canvas) {
      try { return WebGLThreads(canvas); }
      catch (e) {
        // a canvas that tried WebGL may refuse 2d: swap in a fresh one with the same styling
        var fresh = canvas.cloneNode(false);
        canvas.parentNode.replaceChild(fresh, canvas);
        return CanvasThreads(fresh);
      }
    },
    colours: function (page, ledger, panel) {
      return { c0: hex(page[0]).concat(page[1]), c1: hex(ledger[0]).concat(ledger[1]), c2: hex(panel[0]).concat(panel[1]), hex0: page[0], hex1: ledger[0], hex2: panel[0] };
    }
  };
})();
