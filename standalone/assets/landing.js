/* Fairfold landing: interaction and motion.
 *
 * Browser build of the design export's component logic, without the export's React runtime.
 * Behaviour and timing follow the design; the frame loop is reorganised so it never forces layout:
 * section positions are measured on resize (and when fonts or content settle) instead of calling
 * getBoundingClientRect / scrollHeight / offsetHeight between style writes on every frame, style
 * writes are skipped when the value has not changed, and every easing is frame-rate independent.
 */
(function () {
  'use strict';

  var doc = document, root = doc.documentElement;
  var PROPS = { autoRotate: true, parallax: 1, stepScroll: 75 };   // the design's defaults

  var q = function (s) { return doc.querySelector('[data-ff="' + s + '"]'); };
  var qa = function (s) { return Array.prototype.slice.call(doc.querySelectorAll('[data-ff="' + s + '"]')); };
  var clamp = function (v, a, b) { return Math.max(a, Math.min(b, v)); };
  var ease = function (x) { return x * x * (3 - 2 * x); };
  var RAD = Math.PI / 180;
  var GREEN = 'oklch(0.82 0.14 155)', RED = 'oklch(0.74 0.18 25)';

  // write a style property only when it changes (avoids needless style recalculation)
  function put(el, prop, v) {
    var c = el.__ff || (el.__ff = {});
    if (c[prop] !== v) { c[prop] = v; el.style[prop] = v; }
  }

  /* ---------------------------------------------------- Proof Ledger demo */

  var state = { sel: 3, tampered: false, stored: null, re: null, agent: 0 };

  function entries(t) {
    return [
      { seq: 1, type: 'captured', actor: 'paypal-webhook', time: '2026-10-27T08:14:02.118Z', payload: { capture: 'SEED-4KX91827', amount: '38.00 USD', seller_protection: 'ELIGIBLE' } },
      { seq: 2, type: 'photo', actor: 'station-1', time: '2026-10-27T08:29:40.007Z', payload: { label: 'batch_label', bytes: 418204 } },
      { seq: 3, type: 'attestation', actor: 'evidence-agent', time: '2026-10-27T08:29:44.530Z', payload: { status: 'match', size_label: t ? 'L' : 'M', batch: 'B17', confidence: 0.94 } },
      { seq: 4, type: 'sealed', actor: 'station-1', time: '2026-10-27T08:32:11.482Z', payload: { batch: 'B17', carrier: 'DHL', tracking: '7340118255' } },
      { seq: 5, type: 'tracking_pushed', actor: 'fairfold', time: '2026-10-27T08:32:12.901Z', payload: { notify_payer: true, paypal_status: 201 } },
      { seq: 6, type: 'delivered', actor: 'courier-scan', time: '2026-11-02T16:05:37.240Z', payload: { scan: 'Delivered', place: 'Columbus, OH' } }
    ];
  }

  async function sha(s) {
    try {
      var b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(s));
      return Array.from(new Uint8Array(b)).map(function (x) { return x.toString(16).padStart(2, '0'); }).join('');
    } catch (e) {
      // crypto.subtle needs a secure context; plain-http LAN hosts get the design's FNV stand-in
      var out = '';
      for (var k = 0; k < 8; k++) { var h = 2166136261 ^ (k * 374761393); for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } out += (h >>> 0).toString(16).padStart(8, '0'); }
      return out;
    }
  }

  async function chain(list) {
    var prev = '0'.repeat(64), out = [];
    for (var i = 0; i < list.length; i++) {
      var e = list[i];
      prev = await sha(prev + JSON.stringify({ actor: e.actor, payload: e.payload, seq: e.seq, server_time: e.time, type: e.type }));
      out.push(prev);
    }
    return out;
  }

  var AG = [
    { t: 'AttestationResult', c: '{\n  "items": [{\n    "seen": { "itemType": "hoodie", "colour": "navy",\n              "sizeLabel": "M", "quantity": 1 },\n    "matches": true, "confidence": 0.94 }],\n  "batchLabelText": "B17",\n  "defects": [],\n  "couldNotVerify": []\n}' },
    { t: 'ComplaintExtraction', c: '{\n  "category": "product_defect",\n  "component": "left sleeve seam",\n  "failureMode": "stitching came apart",\n  "severity": "functional",\n  "summary": "Seam on the left sleeve opened after first wear"\n}' },
    { t: 'EvidencePackDraft', c: '{\n  "recommendation": "inspect_first",\n  "rationale": [\n    "Linked hypothesis open: batch B17",\n    "Response due in more than 48 hours"\n  ],\n  "evidences": []\n}' },
    { t: 'ReviewThemes', c: '{\n  "themes": [\n    { "name": "Late delivery",\n      "reviewIds": ["rv_112", "rv_140"] },\n    { "name": "Runs small",\n      "reviewIds": ["rv_031", "rv_077", "rv_098"] }\n  ]\n}' },
    { t: 'MessageDraft', c: '{\n  "level": "suspected",\n  "subject": "A check on your recent hoodie",\n  "body": "We\'re checking a possible issue with some recent hoodies…",\n  "status": "draft, needs approval"\n}' }
  ];

  var B = {};
  Array.prototype.forEach.call(doc.querySelectorAll('[data-b]'), function (el) { B[el.dataset.b] = el; });
  var vState = q('vState'), card = q('agentCard');
  var cardH = 0;

  function text(k, v) { var el = B[k]; if (el && el.textContent !== v) el.textContent = v; }

  function render() {
    var s = state, e = entries(s.tampered)[s.sel];
    var ok = function (i) { return !s.stored || !s.re || s.stored[i] === s.re[i]; };
    var brokenAt = s.stored && s.re ? s.stored.findIndex(function (h, i) { return h !== s.re[i]; }) : -1;
    var short = function (h) { return h ? h.slice(0, 30) + '…' : 'computing…'; };
    for (var i = 0; i < 6; i++) text('h' + i, s.stored ? s.stored[i].slice(0, 14) + '…' : '…');
    text('d.head', String(e.seq).padStart(2, '0') + ' / 06 · ' + e.type);
    text('d.time', e.time);
    text('d.actor', e.actor);
    text('d.payload', JSON.stringify(e.payload));
    text('d.stored', short(s.stored && s.stored[s.sel]));
    text('d.re', short(s.re && s.re[s.sel]) + (ok(s.sel) ? '  ✓' : '  ✗ mismatch'));
    if (B['d.re']) put(B['d.re'], 'color', ok(s.sel) ? GREEN : RED);
    if (vState) put(vState, 'color', brokenAt < 0 ? GREEN : RED);
    text('vText', brokenAt < 0 ? 'verified: true' : 'verified: false · brokenAtSeq: ' + (brokenAt + 1));
    text('tamperLabel', s.tampered ? 'Restore entry 03' : 'Edit entry 03 directly in SQL');
    text('agentTitle', AG[s.agent].t);
    if (B.agentCode && B.agentCode.textContent !== AG[s.agent].c) { B.agentCode.textContent = AG[s.agent].c; cardH = 0; }
  }

  function setState(p) { Object.assign(state, p); render(); }

  async function toggleTamper() {
    var t = !state.tampered;
    var re = await chain(entries(t));
    setState({ tampered: t, re: re, sel: t ? 2 : state.sel });
  }

  /* ---------------------------------------------------------------- boot */

  function boot() {
    var reduce = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    var on = function (t, e, f, o) { if (t) t.addEventListener(e, f, o); };
    var M = { x: 0, y: 0, tx: 0, ty: 0, cx: -999, cy: -999 };
    on(window, 'pointermove', function (e) { M.tx = e.clientX / innerWidth * 2 - 1; M.ty = e.clientY / innerHeight * 2 - 1; M.cx = e.clientX; M.cy = e.clientY; }, { passive: true });

    // reveal on scroll
    var countUp = function (el) {
      var to = +el.dataset.count, dec = +(el.dataset.dec || 0), pre = el.dataset.pre || '', suf = el.dataset.suf || '', t0 = performance.now();
      var step = function (n) {
        var k = clamp((n - t0) / 1500, 0, 1), v = to * (1 - Math.pow(1 - k, 4));
        if (el.firstChild) el.firstChild.nodeValue = pre + (dec ? v.toFixed(dec) : Math.round(v).toLocaleString('en-US')) + suf;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    var targets = new Map();
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (en) {
        if (!en.isIntersecting) return;
        var el = targets.get(en.target); if (!el) return;
        el.style.opacity = '1'; el.style.transform = 'none';
        el.querySelectorAll('[data-count]').forEach(countUp);
        io.unobserve(en.target); targets.delete(en.target);
      });
    }, { threshold: 0.1 });
    doc.querySelectorAll('[data-rv]').forEach(function (el) {
      var line = el.dataset.rv === 'line';
      el.style.transition = 'none';
      if (line) el.style.transform = 'translateY(112%)'; else { el.style.opacity = '0'; el.style.transform = 'translateY(26px)'; }
      targets.set(line ? el.parentElement : el, el);
    });
    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        targets.forEach(function (el, key) {
          var d = (el.dataset.d || 0) + 'ms';
          el.style.transition = 'opacity .9s cubic-bezier(.2,.7,.2,1) ' + d + ', transform 1.1s cubic-bezier(.2,.7,.2,1) ' + d;
          io.observe(key);
        });
      });
    });

    // magnetic buttons (the button's box is read once per hover, not on every pointer move)
    doc.querySelectorAll('[data-magnet]').forEach(function (el) {
      var r = null;
      on(el, 'pointerenter', function () { el.style.transform = ''; r = el.getBoundingClientRect(); });
      on(el, 'pointermove', function (e) {
        if (!r) r = el.getBoundingClientRect();
        el.style.transform = 'translate(' + ((e.clientX - r.left - r.width / 2) * 0.22).toFixed(1) + 'px,' + ((e.clientY - r.top - r.height / 2) * 0.34).toFixed(1) + 'px)';
      });
      on(el, 'pointerleave', function () { el.style.transform = ''; r = null; });
    });

    // elements
    var hero = q('hero'), loop = q('loop'), ledger = q('ledger'), sticky = q('loopSticky'), cta = q('cta'), agentsSec = q('agents');
    var scene = q('scene'), parcel = q('parcel'), flapL = q('flapL'), flapR = q('flapR'), stamp = q('stamp'), ring = q('ring');
    var shadows = qa('shadow'), contact = q('contact');
    var lits = qa('lit'), evs = qa('ev'), chips = qa('chip'), lblS = q('lblSealed'), lblO = q('lblOpen');
    var prism = q('prism'), shades = qa('shade'), steps = qa('step'), bodies = qa('stepBody'), bar = q('loopBar'), loopH = q('loopH');
    var stack = q('stack'), plates = qa('plate'), agentList = q('agentList'), agents = qa('agent');

    // background thread field
    var threads = window.FairfoldThreads.create(q('bg'));
    var COL = window.FairfoldThreads.colours(['#6b3fe6', 0.3], ['#b79cff', 0.36], ['#ffffff', 0.36]);
    var BP = { a: 0, b: 1, e: 0, S: 1, PX: 0, PY: 0, rx: 0, ry: 0, tw: 0, z1: new Float32Array(4), z2: new Float32Array(4), c0: COL.c0, c1: COL.c1, c2: COL.c2, hex0: COL.hex0, hex1: COL.hex1, hex2: COL.hex2 };
    root.setAttribute('data-threads', threads.mode);

    // Adaptive background quality. The thread field is decoration, so it is what gives way when the GPU
    // runs short. Measured on an Intel Iris Xe at 150% scaling (3-run medians, steady scroll): drawing
    // the canvas at full resolution on every frame under the CSS 3D stages dropped 9% of frames;
    // redrawing it on every second frame dropped 0.6%, and at 1x resolution as well 0.4%.
    // High-DPI screens start at level 1; a frame-pacing governor steps down if frames are still missed.
    var QL = [{ every: 1, dpr: 2 }, { every: 2, dpr: 2 }, { every: 2, dpr: 1 }];
    var Q = { level: (window.devicePixelRatio || 1) > 1 ? 1 : 0, frame: 0, seen: -60, late: 0, force: true };
    var bgDpr = function () { return Math.min(QL[Q.level].dpr, window.devicePixelRatio || 1); };
    var govern = function (gap) {
      if (gap > 250) return;                   // tab switch or debugger pause, not a rendering problem
      if (++Q.seen <= 0) return;               // ignore the first second after load
      if (gap > 22) Q.late++;
      if (Q.seen < 90) return;
      if (Q.late > 8 && Q.level < QL.length - 1) { Q.level++; DPR = 0; measure(); }
      Q.seen = 0; Q.late = 0;
    };
    root.setAttribute('data-threads-level', Q.level);

    var K = [], BW = 0, BH = 0, DPR = 0, G = 0;
    var geo = { docH: 1, loop: null, ledger: null, cta: null };
    var box = function (el, sy) { var r = el.getBoundingClientRect(); return { top: r.top + sy, h: r.height, left: r.left, w: r.width }; };

    // all layout reads happen here, never inside the frame loop
    var measure = function () {
      var sy = window.scrollY, Hh = Math.max(1, root.scrollHeight - innerHeight);
      var mid = function (el) { var b = box(el, sy); return clamp((b.top + b.h / 2 - innerHeight / 2) / Hh, 0.01, 0.99); };
      K = [
        { g: 0, s: 0, x: .5, y: .84, sc: 1.2, rx: 1.14 },
        { g: mid(loop), s: 1, x: .7, y: .52, sc: 1.02, rx: .42 },
        { g: mid(ledger), s: 2, x: .72, y: .5, sc: .95, rx: .2 },
        { g: mid(agentsSec), s: 3, x: .86, y: .5, sc: .8, rx: 1.02 },
        { g: 1, s: 4, x: .5, y: .6, sc: 1.05, rx: 1 }
      ];
      geo.docH = root.scrollHeight;
      geo.loop = box(loop, sy); geo.ledger = box(ledger, sy); geo.cta = box(cta, sy);
      cardH = card.offsetHeight;
      var dpr = bgDpr();
      if (innerWidth !== BW || innerHeight !== BH || dpr !== DPR) {
        BW = innerWidth; BH = innerHeight; DPR = dpr; threads.resize(BW, BH, DPR);
        Q.force = true;                          // a resize clears the canvas: redraw on the next frame
        root.setAttribute('data-threads-level', Q.level);
      }
    };

    // fit fixed-size stages into their columns
    var fit = function () {
      var stacked = sticky.clientWidth < 880;
      loopH.style.display = stacked ? 'none' : '';
      qa('fit').forEach(function (el) {
        var w = +el.dataset.w, h = +el.dataset.h, vhf = el.dataset.vh ? (stacked ? 0.4 : +el.dataset.vh) : 9;
        var s = Math.min(1, el.parentElement.clientWidth / w, innerHeight * vhf / h);
        el.style.width = (w * s) + 'px'; el.style.height = (h * s) + 'px';
        el.firstElementChild.style.transform = 'scale(' + s.toFixed(4) + ')';
      });
    };
    loop.style.height = (100 + 4 * PROPS.stepScroll) + 'vh';
    fit(); measure();
    var pending = 0;
    var relayout = function () { if (pending) return; pending = requestAnimationFrame(function () { pending = 0; fit(); measure(); }); };
    on(window, 'resize', relayout);
    [600, 2000].forEach(function (ms) { setTimeout(measure, ms); });
    if (doc.fonts && doc.fonts.ready) doc.fonts.ready.then(measure);
    if (window.ResizeObserver) new ResizeObserver(function () { measure(); }).observe(q('root'));

    var vis = { hero: true, loop: false, ledger: false };
    var vio = new IntersectionObserver(function (es) { es.forEach(function (en) { vis[en.target.dataset.ff] = en.isIntersecting; }); }, { rootMargin: '140px' });
    [hero, loop, ledger].forEach(function (el) { vio.observe(el); });

    // parcel: drag to turn, click to unseal
    var P = { rx: -22, ry: -34, vx: 0, vy: 0, open: 1, o: 1, drag: false, moved: 0, lx: 0, ly: 0 };
    setTimeout(function () { P.open = 0; }, 1200);
    on(scene, 'pointerdown', function (e) { P.drag = true; P.moved = 0; P.lx = e.clientX; P.ly = e.clientY; try { scene.setPointerCapture(e.pointerId); } catch (x) {} scene.style.cursor = 'grabbing'; });
    on(scene, 'pointermove', function (e) {
      if (!P.drag) return;
      var dx = e.clientX - P.lx, dy = e.clientY - P.ly; P.lx = e.clientX; P.ly = e.clientY;
      P.moved += Math.abs(dx) + Math.abs(dy); P.vy = dx * 0.45; P.vx = -dy * 0.3;
      P.ry += P.vy; P.rx = clamp(P.rx + P.vx, -68, -4);
    });
    var up = function () { if (!P.drag) return; P.drag = false; scene.style.cursor = 'grab'; if (P.moved < 6) P.open = P.open ? 0 : 1; };
    on(scene, 'pointerup', up); on(scene, 'pointercancel', up);
    on(scene, 'keydown', function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); P.open = P.open ? 0 : 1; } });

    // loop steps: click to jump
    steps.forEach(function (el, i) { on(el, 'click', function () { var r = loop.getBoundingClientRect(); window.scrollTo({ top: window.scrollY + r.top + (i + 0.3) / 4 * (r.height - innerHeight), behavior: 'smooth' }); }); });

    // ledger plates + agent rows
    plates.forEach(function (el, i) { var pick = function () { if (state.sel !== i) setState({ sel: i }); }; on(el, 'pointerenter', pick); on(el, 'click', pick); });
    agents.forEach(function (el, i) { on(el, 'pointerenter', function () { if (state.agent !== i) setState({ agent: i }); }); });
    on(q('tamper'), 'click', toggleTamper);
    var A = { x: 0, y: 0, on: false };
    on(agentList, 'pointerenter', function () { A.on = true; A.x = M.cx; A.y = M.cy; card.style.opacity = '1'; });
    on(agentList, 'pointerleave', function () { A.on = false; card.style.opacity = '0'; });

    var L = { rot: 0, act: -1 }, Z = plates.map(function (_, i) { return i * 14; });
    var sig = '';
    var Lt = [-0.36, -0.76, 0.54];
    var last = performance.now(), drawn = '';

    var tick = function (now) {
      requestAnimationFrame(tick);
      govern(now - last);
      var dt = clamp((now - last) / 1000, 0, 0.1); last = now;
      var k60 = dt * 60;
      var lerp = function (k) { return 1 - Math.pow(1 - k, k60); };   // design constants were per 60 Hz frame
      var t = now / 1000, vh = BH, sy = window.scrollY, par = reduce ? 0 : PROPS.parallax;
      M.x += (M.tx - M.x) * lerp(0.07); M.y += (M.ty - M.y) * lerp(0.07);

      // background: one sheet that folds into a box, a rope and a ring as the page scrolls
      {
        var g = clamp(sy / Math.max(1, geo.docH - vh), 0, 1);
        G += (g - G) * lerp(0.07);
        var i = 0; while (i < K.length - 2 && G > K[i + 1].g) i++;
        var a = K[i], b = K[i + 1], e = ease(clamp((G - a.g) / Math.max(1e-4, b.g - a.g), 0, 1));
        var mix = function (p, r) { return p + (r - p) * e; };
        BP.a = a.s; BP.b = b.s; BP.e = e;
        BP.S = Math.min(BW, BH * 1.5) * 0.3 * mix(a.sc, b.sc); BP.PX = BW * mix(a.x, b.x); BP.PY = BH * mix(a.y, b.y);
        BP.ry = 0.5 + G * 9 + (reduce ? 0 : Math.sin(t * 0.12) * 0.28) + M.x * 0.12 * par;
        BP.rx = mix(a.rx, b.rx) + M.y * 0.06 * par;
        BP.tw = reduce ? 0 : t * 0.7;
        var zone = function (out, z) {
          var top = z.top - sy;
          if (top + z.h < 0 || top > BH) { out[0] = -1e5; out[1] = -1e5; out[2] = 0; out[3] = 0; }
          else { out[0] = z.left; out[1] = top; out[2] = z.w; out[3] = z.h; }
        };
        zone(BP.z1, geo.ledger); zone(BP.z2, geo.cta);
        // redraw at the governor's rate, and never redraw an identical frame (e.g. reduced motion, idle)
        var key = BP.a + ',' + BP.b + ',' + BP.e.toFixed(4) + ',' + BP.S.toFixed(1) + ',' + BP.PX.toFixed(1) + ',' + BP.PY.toFixed(1) + ',' + BP.rx.toFixed(4) + ',' + BP.ry.toFixed(4) + ',' + BP.tw.toFixed(3) + ',' + BP.z1[1].toFixed(1) + ',' + BP.z2[1].toFixed(1);
        if (Q.force || (key !== drawn && ++Q.frame % QL[Q.level].every === 0)) { threads.draw(BP); drawn = key; Q.force = false; }
      }

      if (vis.hero) {
        var auto = PROPS.autoRotate && !reduce;
        if (!P.drag) {
          P.vy += ((auto ? 0.16 : 0) - P.vy) * lerp(0.035); P.vx *= Math.pow(0.9, k60);
          P.ry += P.vy * k60; P.rx = clamp(P.rx + P.vx * k60 + ((-22 + M.y * 7 * par) - P.rx) * lerp(0.03), -68, -4);
        }
        P.o += (P.open - P.o) * lerp(0.085);
        var o = P.o, ra = P.rx * RAD, rb = P.ry * RAD, bob = reduce ? 0 : Math.sin(t * 1.1) * 7;
        parcel.style.transform = 'translateY(' + bob.toFixed(2) + 'px) rotateX(' + P.rx.toFixed(2) + 'deg) rotateY(' + P.ry.toFixed(2) + 'deg)';
        put(flapL, 'transform', 'rotateY(' + (-122 * o).toFixed(2) + 'deg)');
        put(flapR, 'transform', 'rotateY(' + (122 * o).toFixed(2) + 'deg)');
        var sa = Math.sin(ra), ca = Math.cos(ra), sb = Math.sin(rb), cb = Math.cos(rb);
        var N = { f: [sb, -sa * cb, ca * cb], r: [cb, sa * sb, -ca * sb], t: [0, -ca, -sa] };
        N.k = N.f.map(function (v) { return -v; }); N.l = N.r.map(function (v) { return -v; });
        for (var li = 0; li < lits.length; li++) {
          var n = N[lits[li].dataset.n];
          put(lits[li], 'opacity', (0.012 + 0.2 * Math.max(0, n[0] * Lt[0] + n[1] * Lt[1] + n[2] * Lt[2])).toFixed(3));
        }
        var evO = clamp(o * 1.6 - 0.1, 0, 1).toFixed(2);
        for (var ei = 0; ei < evs.length; ei++) {
          var ev = evs[ei];
          put(ev, 'opacity', evO);
          if (evO !== '0.00') ev.style.transform = 'translate3d(' + ev.dataset.x + 'px,' + (36 - 196 * o + Math.sin(t * 1.3 + ei * 2) * 4 * o).toFixed(1) + 'px,' + ev.dataset.z + 'px) rotateY(' + ev.dataset.r + 'deg) rotateZ(' + ((ei - 1) * 7 * o).toFixed(1) + 'deg)';
        }
        put(stamp, 'opacity', clamp(1 - o * 2.2, 0, 1).toFixed(2));
        put(stamp, 'transform', 'rotate(-12deg) scale(' + (1 + o * 0.5).toFixed(3) + ')');
        put(shadows[0], 'transform', 'scale(' + (1 - bob * 0.008).toFixed(3) + ')');
        if (contact) {
          put(contact, 'transform', 'scale(' + (1 - bob * 0.014).toFixed(3) + ')');
          put(contact, 'opacity', (0.78 - bob * 0.03).toFixed(3));
        }
        put(lblS, 'opacity', P.open ? '0' : '1'); put(lblO, 'opacity', P.open ? '1' : '0');
        ring.style.transform = 'rotate(' + (reduce ? 40 : t * 9).toFixed(2) + 'deg)';
        for (var ci = 0; ci < chips.length; ci++) {
          var d = +chips[ci].dataset.z;
          chips[ci].style.transform = 'translate3d(' + (-M.x * d * par).toFixed(1) + 'px,' + (-M.y * d * 0.7 * par + (reduce ? 0 : Math.sin(t * 0.9 + ci * 1.7) * 6)).toFixed(1) + 'px,0)';
        }
      }

      if (vis.loop) {
        var rTop = geo.loop.top - sy, p = clamp(-rTop / Math.max(1, geo.loop.h - vh), 0, 1);
        var seg = Math.min(3.9999, p * 4), si = Math.floor(seg), f = seg - si;
        var tt = si < 3 ? ease(clamp((f - 0.6) / 0.4, 0, 1)) : 0;
        L.rot += (-(si + tt) * 90 - L.rot) * lerp(0.11);
        put(prism, 'transform', 'translateZ(-220px) rotateX(' + (-M.y * 3 * par).toFixed(2) + 'deg) rotateY(' + (L.rot + M.x * 5 * par).toFixed(2) + 'deg)');
        for (var hi = 0; hi < shades.length; hi++) { var c = Math.cos((L.rot + 90 * hi) * RAD); put(shades[hi], 'opacity', (c > 0 ? (1 - c) * 0.55 : 0.55).toFixed(3)); }
        put(bar, 'transform', 'scaleY(' + p.toFixed(4) + ')');
        var act = clamp(Math.round(-L.rot / 90), 0, 3);
        if (act !== L.act) {
          L.act = act;
          steps.forEach(function (el, k) { el.style.opacity = k === act ? '1' : '.36'; });
          bodies.forEach(function (el, k) { el.style.gridTemplateRows = k === act ? '1fr' : '0fr'; });
        }
      }

      if (vis.ledger) {
        var S = state, lTop = geo.ledger.top - sy;
        var gap = 12 + ease(clamp((vh * 0.9 - lTop) / (vh * 0.8), 0, 1)) * 30;
        for (var pi = 0; pi < plates.length; pi++) {
          var tz = pi * gap + (pi > S.sel ? 42 : 0);
          Z[pi] += (tz - Z[pi]) * lerp(0.12);
          put(plates[pi], 'transform', 'translateZ(' + Z[pi].toFixed(1) + 'px)');
        }
        put(stack, 'transform', 'rotateX(58deg) rotateZ(' + (-40 + M.x * 5 * par).toFixed(2) + 'deg)');
        var ns = S.sel + '|' + S.tampered + '|' + (S.re ? S.re[5] : '');
        if (ns !== sig) {
          sig = ns;
          plates.forEach(function (el, i) {
            var bad = S.stored && S.re && S.stored[i] !== S.re[i], sel = i === S.sel;
            el.style.background = bad ? (sel ? 'oklch(0.5 0.19 25)' : 'oklch(0.3 0.09 25)') : sel ? 'oklch(0.53 0.23 295)' : '#221f2e';
            el.style.borderColor = bad ? 'oklch(0.72 0.19 25)' : sel ? 'oklch(0.82 0.12 295)' : 'rgba(255,255,255,.16)';
          });
        }
      }

      if (A.on) {
        if (!cardH) cardH = card.offsetHeight;   // only after the card's text changed
        A.x += (M.cx - A.x) * lerp(0.16); A.y += (M.cy - A.y) * lerp(0.16);
        put(card, 'transform', 'translate3d(' + clamp(A.x + 22, 8, BW - 356).toFixed(1) + 'px,' + clamp(A.y + 22, 8, vh - cardH - 8).toFixed(1) + 'px,0)');
      }
    };
    requestAnimationFrame(tick);
  }

  try {
    render();
    boot();
    chain(entries(false)).then(function (stored) { setState({ stored: stored, re: stored }); });
  } catch (err) {
    // never leave the page hidden behind the reveal styles
    root.classList.remove('js');
    doc.querySelectorAll('[data-rv]').forEach(function (el) { el.style.opacity = ''; el.style.transform = ''; });
    if (window.console) console.error('[fairfold] landing failed to start:', err);
  }
})();
