// ASCII lilies and roses: the scene is painted with vector shapes onto a tiny offscreen
// canvas (one pixel per character cell), then every pixel is redrawn as a
// coloured ASCII glyph whose density follows the pixel's brightness.
//
// The bloom follows how cut lilies actually open: a bunch of tall leafy stems,
// each ending in a cluster of long green buds. Buds swell and blush, then split
// into six tepals that curl back to show the stamens. Some buds stay green.
// Roses on their own stems open between the lilies: tight buds wrapped in sepals
// unfurl ring by ring around a dark spiral heart.
// Once the last lily is open, a red heart and a message arrive below them.
(() => {
  'use strict';

  const RAMP = ' .:-=+*cxoaX#%&@';
  const MONO = 'Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const WORLD_W = 1000;
  const WORLD_H = 1220;
  const FPS = 60;

  const PALETTES = [
    { // white oriental lilies with red roses: the default, the two read apart at a glance
      petal: '#f6f2ea', edge: '#ffffff', blush: '#d8dcc0', throat: '#c8d87a', vein: 'rgba(120,130,90,0.4)',
      anther: '#8a3a16', spots: false, rose: { deep: '#55000f', mid: '#c8001f', edge: '#ff5a70' },
      wrap: { light: '#6e4652', mid: '#5c3844', dark: '#2e1a22', edge: '#d8a8b6', fold: '#3a222b' },
      ribbon: { light: '#f4ead8', mid: '#e2d2b4', dark: '#bfae8e' },
    },
    { // cherry red lilies with blush pink roses
      petal: ['#f0103c', '#c00d2b', '#ff3b5c', '#d81a34'], edge: '#ffb0c0',
      blush: '#c46a72', throat: '#cfd87e', vein: 'rgba(70,4,14,0.5)', anther: '#3a160a', spots: true,
      rose: { deep: '#7a1e3c', mid: '#ee7fa0', edge: '#ffd3df' },   // blush pink roses against the red
      wrap: { light: '#4a4440', mid: '#3c3733', dark: '#1e1b19', edge: '#cfc4b8', fold: '#2a2624' },
      ribbon: { light: '#ff5f7a', mid: '#e0284a', dark: '#a8122e' },
    },
    { // mixed garden, like the ASCII video
      petal: ['#e3233a', '#d24aa9', '#f08a2a', '#e9c63c', '#f1e4c6', '#f39ab2'], edge: null,
      blush: '#c98a7a', throat: '#e8d070', vein: 'rgba(80,10,20,0.45)', anther: '#3a160a', spots: true,
      rose: { deep: '#6a0a3a', mid: '#e0457b', edge: '#ffc0d2' },   // pink garden roses
      wrap: { light: '#8a6a4a', mid: '#76593c', dark: '#3a2a1c', edge: '#e0c49a', fold: '#4a3624' },
      ribbon: { light: '#f4ead8', mid: '#e2d2b4', dark: '#bfae8e' },
    },
  ];

  // ---------- helpers ----------
  function rng(seed) {
    return () => {
      seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const prog = (T, start, dur) => clamp((T - start) / dur, 0, 1);
  const easeOut = (t) => 1 - Math.pow(1 - t, 3);
  const easeInOut = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const easeOutBack = (t) => { const c = 1.70158, u = t - 1; return 1 + (c + 1) * u * u * u + c * u * u; };
  const smooth = (a, b, t) => { const x = clamp((t - a) / (b - a), 0, 1); return x * x * (3 - 2 * x); };
  const rad = (d) => (d * Math.PI) / 180;

  function rgbOf(c) {
    if (c[0] === '#') {
      const n = parseInt(c.slice(1), 16);
      return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
    }
    return c.match(/\d+/g).slice(0, 3).map(Number);
  }
  function mix(a, b, t) {
    const A = rgbOf(a), B = rgbOf(b);
    return `rgb(${Math.round(lerp(A[0], B[0], t))},${Math.round(lerp(A[1], B[1], t))},${Math.round(lerp(A[2], B[2], t))})`;
  }

  function bez(p, t) {
    const u = 1 - t;
    return [
      u * u * u * p[0][0] + 3 * u * u * t * p[1][0] + 3 * u * t * t * p[2][0] + t * t * t * p[3][0],
      u * u * u * p[0][1] + 3 * u * u * t * p[1][1] + 3 * u * t * t * p[2][1] + t * t * t * p[3][1],
    ];
  }
  function bezAngle(p, t) {
    const a = bez(p, Math.max(0, t - 0.01)), b = bez(p, Math.min(1, t + 0.01));
    return Math.atan2(b[1] - a[1], b[0] - a[0]);
  }

  // Gentle breeze: higher points drift further, so the whole bunch bends together.
  // T is bloom time, which runs SPEED× faster than the clock; the breeze, the
  // heartbeat and the glyph shimmer keep to real seconds (NOW) so they stay calm.
  const SPEED = 1.3;
  let T = 0, NOW = 0;
  function sway(x, y) {
    const lift = clamp((1090 - y) / 800, 0, 1);
    return [x + Math.sin(NOW * 0.9 + y * 0.006) * 8 * lift + Math.sin(NOW * 0.43 + x * 0.004) * 4 * lift, y];
  }

  // ---------- scene ----------
  // Timeline (seconds): stems rise, leaves unfurl, buds swell and blush, then open one by one.
  const STEM_START = 0, STEM_DUR = 2.6;
    const BUD_START = 2.2;
  const BLUSH_START = 3.6;
  const OPEN_START = 5.0, OPEN_DUR = 3.2;

  function buildScene() {
    const r = rng(11);
    const S = { stems: [], leaves: [], buds: [] };

    // A florist's hand-tied bouquet, mirrored about x = 500: a neat dome of roses,
    // lilies fanned around its rim, every stem gathered into a paper wrap.
    // Lilies: [tip x, tip y, facing (deg), opening group]
    const LILIES = [
      [500, 225, -90, 0],
      [282, 268, -132, 1], [718, 268, -48, 1],
      [160, 470, -164, 2], [840, 470, -16, 2],
    ];
    // Roses: rows of the dome, back to front, as [tip x, tip y]
    const ROSE_ROWS = [
      [[424, 305], [576, 305]],
      [[350, 405], [500, 400], [650, 405]],
      [[274, 508], [424, 500], [576, 500], [726, 508]],
      [[350, 605], [500, 598], [650, 605]],
    ];

    const addStem = (tip, ctrl, start, kind) => {
      const bx = 500 + (tip[0] - 500) * 0.06;
      const pts = [[bx, BASE_Y], [bx, 820], ctrl, tip];
      const ref = { pts, start, kind };
      S.stems.push(ref);
      return ref;
    };

    LILIES.forEach(([tx, ty, face, group], i) => {
      const dir = rad(face);
      const side = Math.sign(face + 90);           // -1 left, 0 centre, 1 right
      const stemRef = addStem([tx, ty], [tx - Math.cos(dir) * 170, ty - Math.sin(dir) * 170], STEM_START + group * 0.15, 'lily');
      stemRef.tint = i;
      S.buds.push({
        stem: stemRef.pts, stemRef, at: 1, ped: null, dir,
        len: 150, width: 29, squash: 0.74, twist: 0.25 * side, droop: rad(16) * side,
        blushCol: '#e7b4b6', colorIdx: i, rnd: Array.from({ length: 12 }, r),
        depth: ty, grow: BUD_START + group * 0.3,
        maxOpen: 1, blush: 0.28, openAt: OPEN_START + group * 1.1,
      });
    });

    ROSE_ROWS.forEach((row, ri) => {
      row.forEach(([tx, ty]) => {
        const off = Math.abs(tx - 500) / 140;      // 0 in the middle, growing outwards
        const stemRef = addStem([tx, ty], [lerp(500, tx, 0.9), ty + 160], STEM_START + 0.1 + off * 0.1, 'rose');
        stemRef.tint = ri;
        const key = ri * 0.85 + off * 0.6;          // open from the back-centre outwards
        S.buds.push({
          stem: stemRef.pts, stemRef, at: 1, ped: null, rose: true,
          dir: rad(-90 + (tx - 500) * 0.06),
          R: lerp(74, 82, ri / 3), spin: r() * 72, rnd: Array.from({ length: 12 }, r),
          depth: 1000 + ty, grow: BUD_START + key * 0.25,
          maxOpen: 1, blush: 1, openAt: OPEN_START + 0.5 + key * 0.75,
        });
      });
    });

    addFillers(S);
    return S;
  }

  // Ruscus greenery frames the flowers, fanned symmetrically behind them.
  const RUSCUS_START = 0.6;

  function addFillers(S) {
    const r = rng(29);
    S.ruscus = [];
    const base = [500, 720];
    for (const [ex, ey, start] of [[150, 610, 0.9], [215, 335, 0.7], [390, 140, 0.6]]) {
      const len = Math.hypot(ex - base[0], ey - base[1]);
      const bend = -len * 0.08;
      const leaves = [];
      for (let t = 0.3, i = 0; t <= 1; t += 0.085, i++) {
        leaves.push({ t, side: i % 2 ? 1 : -1, len: 38 + r() * 10, w: 12, tint: r() });
      }
      leaves.push({ t: 1, side: 0, len: 50, w: 12, tint: r() });
      for (const m of [1, -1]) {                   // left sprig, then its mirror image
        const end = [500 + (ex - 500) * m, ey];
        const pts = [base,
          [lerp(base[0], end[0], 0.33) + bend * m, lerp(base[1], end[1], 0.33)],
          [lerp(base[0], end[0], 0.7) + bend * 0.5 * m, lerp(base[1], end[1], 0.7)], end];
        S.ruscus.push({ pts, start: RUSCUS_START + start, leaves: leaves.map((l) => ({ ...l, side: l.side * m })) });
      }
    }
  }

  // ---------- wrap and ribbon ----------
  // Two paper panels cross in a V over the stems; a satin bow ties them at the neck.
  const BASE_Y = 1000;
  const WRAP_L = [[205, 610], [524, 672], [536, 958], [452, 958]];
  const NECK = [500, 952];

  function wrapGrow() {
    return easeOut(prog(T, 0.3, 1.8));
  }

  function drawWrap(g, pal) {
    const p = wrapGrow();
    if (!p) return;
    const w = pal.wrap;
    g.save();
    g.translate(NECK[0], NECK[1]);
    g.scale(lerp(0.5, 1, p), p);
    g.translate(-NECK[0], -NECK[1]);
    for (const m of [1, -1]) {                     // left panel, then the right one over it
      const pts = WRAP_L.map(([x, y]) => sway(500 + (x - 500) * m, y));
      g.beginPath();
      pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
      g.closePath();
      const grad = g.createLinearGradient(pts[0][0], pts[0][1], pts[2][0], pts[2][1]);
      grad.addColorStop(0, m > 0 ? w.light : w.mid);
      grad.addColorStop(1, w.dark);
      g.fillStyle = grad;
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.85)';
      g.lineWidth = 7;
      g.stroke();
      g.strokeStyle = w.edge;                       // the cut edge of the paper catches the light
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(pts[0][0], pts[0][1]); g.lineTo(pts[1][0], pts[1][1]); g.stroke();
      // one soft fold down each panel
      const a = sway(500 + (330 - 500) * m, 650), b = sway(500 + (478 - 500) * m, 945);
      g.strokeStyle = w.fold;
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(a[0], a[1]); g.lineTo(b[0], b[1]); g.stroke();
    }
    g.restore();
  }

  function drawBow(g, pal) {
    const p = easeOutBack(prog(T, 1.6, 0.8));
    if (p <= 0) return;
    const [x, y] = sway(NECK[0], NECK[1]);
    const c = pal.ribbon;
    g.save();
    g.translate(x, y);
    g.scale(p, p);
    const shape = (draw, fill) => {
      draw();
      g.fillStyle = fill;
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.8)';
      g.lineWidth = 5;
      g.stroke();
    };
    for (const m of [1, -1]) {
      // tail
      shape(() => {
        g.beginPath();
        g.moveTo(4 * m, 6);
        g.lineTo(34 * m, 66);
        g.lineTo(20 * m, 58);
        g.lineTo(10 * m, 72);
        g.lineTo(-6 * m, 10);
        g.closePath();
      }, c.dark);
      // loop
      shape(() => {
        g.beginPath();
        g.moveTo(0, 0);
        g.bezierCurveTo(30 * m, -48, 86 * m, -36, 70 * m, 2);
        g.bezierCurveTo(60 * m, 26, 22 * m, 18, 0, 0);
      }, c.light);
    }
    shape(() => { g.beginPath(); g.ellipse(0, 0, 15, 12, 0, 0, Math.PI * 2); }, c.mid);
    g.restore();
  }

  // ---------- drawing ----------
  function strokeCurve(g, pts, from, upto, width, color) {
    if (upto <= from) return;
    const N = 36;
    g.beginPath();
    for (let i = 0; i <= N; i++) {
      const p = bez(pts, lerp(from, upto, i / N));
      const q = sway(p[0], p[1]);
      i ? g.lineTo(q[0], q[1]) : g.moveTo(q[0], q[1]);
    }
    g.lineWidth = width;
    g.strokeStyle = color;
    g.lineCap = 'round';
    g.stroke();
  }

  function stemProgress(st) {
    return easeInOut(prog(T, st.start, STEM_DUR));
  }

  // One tepal along +x. Closed, six of these overlap into the club-shaped bud;
  // open, they fan out and their tips curl back.
  function tepal(g, L, W, color, edge, throat, vein, open, curl, spots, rnd) {
    const rc = smooth(0.45, 1, open);
    const tipX = L * (1 - 0.12 * rc), tipY = curl * W * 1.6 * rc;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.3, -W * 0.85, L * 0.72, -W * 1.05 + tipY * 0.3, tipX, tipY);
    g.bezierCurveTo(L * 0.72, W * 1.05 + tipY * 0.3, L * 0.3, W * 0.85, 0, 0);
    const grad = g.createLinearGradient(0, 0, L, 0);
    grad.addColorStop(0, throat);
    grad.addColorStop(lerp(0.45, 0.22, open), color);
    grad.addColorStop(1, edge);
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.65)';
    g.lineWidth = 6;
    g.stroke();
    // seam on the bud, nectar groove on the open tepal
    g.strokeStyle = open > 0.2 ? vein : 'rgba(40,70,20,0.55)';
    g.lineWidth = 5;
    g.beginPath(); g.moveTo(L * 0.05, 0); g.quadraticCurveTo(L * 0.6, tipY * 0.2, tipX * 0.94, tipY * 0.9); g.stroke();
    if (spots && open > 0.6) {
      g.fillStyle = `rgba(110,15,40,${(open - 0.6) * 2})`;
      for (let i = 0; i < 4; i++) {
        g.beginPath();
        g.arc(L * (0.18 + rnd[i] * 0.22), (rnd[i + 4] - 0.5) * W * 0.8, 3.5, 0, Math.PI * 2);
        g.fill();
      }
    }
  }

  function budState(b) {
    const grow = easeOut(prog(T, b.grow, 2.2));
    const blush = smooth(0, 1, prog(T, BLUSH_START + (b.grow - BUD_START), 2.5)) * b.blush;
    const open = easeInOut(prog(T, b.openAt, OPEN_DUR)) * b.maxOpen;
    return { grow, blush, open };
  }

  function drawBud(g, b, pal) {
    const sp = stemProgress(b.stemRef);
    if (b.ped) {
      if (sp < b.at) return;
      const pp = easeOut(prog(T, b.stemRef.start + STEM_DUR * b.at, 1.0));
      strokeCurve(g, b.ped, 0, pp, 5, '#5f9a34');
      if (pp < 0.6) return;
    } else if (sp < 0.98) {
      return;
    }
    const { grow, blush, open } = budState(b);
    if (!grow) return;

    const base = b.ped ? b.ped[3] : bez(b.stem, 1);
    const [x, y] = sway(base[0], base[1]);
    if (b.rose) { drawRose(g, b, pal, x, y, grow, blush, open); return; }
    const multi = Array.isArray(pal.petal);
    const petal = multi ? pal.petal[b.colorIdx % pal.petal.length] : pal.petal;
    const edge = pal.edge || mix(petal, '#ffffff', 0.25);

    // bud colour: green → dusty pink as it matures → petal colour as it opens
    const budCol = mix('#9cc63e', b.blushCol || pal.blush, blush);
    const color = mix(budCol, petal, smooth(0.05, 0.45, open));
    const edgeCol = mix(mix('#b4d860', b.blushCol || pal.blush, blush), edge, smooth(0.05, 0.45, open));
    const throat = mix('#8fbf3a', pal.throat, open);

    const L = b.len * (0.3 + 0.7 * grow) * (1 + 0.3 * open);
    const W = b.width * (0.6 + 0.4 * grow) * (1 + 1.4 * open);

    g.save();
    g.translate(x, y);
    g.rotate(b.dir + b.droop * open);
    g.scale(1, lerp(1, b.squash, open * 0.45));
    // short green receptacle where the bud meets the pedicel
    g.fillStyle = '#5f9a34';
    g.beginPath(); g.ellipse(0, 0, 9, 7, 0, 0, Math.PI * 2); g.fill();
    g.rotate(b.twist * open);
    // back three tepals first, then the front three
    for (const k of [3, 1, -1, 2, -2, 0]) {
      g.save();
      g.rotate(rad(k * 60) * open);
      const wob = 1 + (b.rnd[(k + 3) % 12] - 0.5) * 0.12 * open;
      tepal(g, L * wob, W, color, edgeCol, throat, pal.vein, open, k === 0 ? 0.3 : Math.sign(k) || 1, pal.spots, b.rnd);
      g.restore();
    }
    // stamens and pistil reach out once the tepals have parted
    const st = smooth(0.55, 1, open);
    if (st > 0) {
      for (let i = 0; i < 6; i++) {
        const a = rad(-28 + i * 11);
        const l = L * 0.72 * st * (0.92 + b.rnd[i] * 0.16);
        g.strokeStyle = '#d6dca8';
        g.lineWidth = 3;
        g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(l * 0.5, a * l * 0.3, Math.cos(a) * l, Math.sin(a) * l); g.stroke();
        g.fillStyle = pal.anther;
        g.beginPath(); g.ellipse(Math.cos(a) * l, Math.sin(a) * l, 11, 4.5, a + Math.PI / 2, 0, Math.PI * 2); g.fill();
      }
      const pl = L * 0.82 * st;
      g.strokeStyle = '#cfe0a0';
      g.lineWidth = 4;
      g.beginPath(); g.moveTo(0, 0); g.lineTo(pl, 0); g.stroke();
      g.fillStyle = '#86a83c';
      g.beginPath(); g.arc(pl, 0, 7, 0, Math.PI * 2); g.fill();
    }
    g.restore();
  }

  function leafShape(g, L, W, bend) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.25, -W, L * 0.7, -W * 0.8 + bend * 0.5, L, bend);
    g.bezierCurveTo(L * 0.7, W * 0.8 + bend * 0.5, L * 0.25, W, 0, 0);
  }

  function drawRuscus(g, S) {
    for (const sp of S.ruscus) {
      const p = easeOut(prog(T, sp.start, 2.2));
      if (!p) continue;
      strokeCurve(g, sp.pts, 0, p, 4, '#4f7a34');
      for (const lf of sp.leaves) {
        const lp = easeOut(prog(p, lf.t - 0.04, 0.22));
        if (!lp) continue;
        const a = bez(sp.pts, lf.t);
        const [x, y] = sway(a[0], a[1]);
        g.save();
        g.translate(x, y);
        g.rotate(bezAngle(sp.pts, lf.t) + lf.side * rad(38));
        const L = lf.len * lp, W = lf.w * lp;
        leafShape(g, L, W, lf.side * L * 0.08);
        const grad = g.createLinearGradient(0, -W, L, W);
        grad.addColorStop(0, lf.tint > 0.5 ? '#356a2c' : '#2c5f30');
        grad.addColorStop(0.55, lf.tint > 0.5 ? '#5aa046' : '#4c9240');
        grad.addColorStop(1, '#3a7436');
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.6)';
        g.lineWidth = 4;
        g.stroke();
        g.strokeStyle = 'rgba(150,190,110,0.5)';
        g.lineWidth = 2;
        g.beginPath(); g.moveTo(0, 0); g.lineTo(L * 0.85, lf.side * L * 0.06); g.stroke();
        g.restore();
      }
    }
  }

  // ---------- roses ----------
  // One rose petal along +x: narrow at the base, broad and rounded at the lip.
  function rosePetal(g, r, w) {
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(r * 0.12, -w * 0.95, r * 0.86, -w * 1.15, r, -w * 0.2);
    g.quadraticCurveTo(r * 1.05, 0, r, w * 0.2);
    g.bezierCurveTo(r * 0.86, w * 1.15, r * 0.12, w * 0.95, 0, 0);
  }

  // A rose seen a little from above: green sepals, then rings of petals from the
  // outside in, each ring darker, around a tight spiral heart. The bud is just the
  // heart, taller than wide and wrapped in sepals; the outer rings unfurl as it opens.
  const ROSE_RINGS = [
    { n: 5, r: 1.0, w: 0.64, rot: 0, from: 0.0, to: 0.65, dark: 0.0 },
    { n: 5, r: 0.78, w: 0.62, rot: 36, from: 0.12, to: 0.78, dark: 0.18 },
    { n: 5, r: 0.56, w: 0.6, rot: 14, from: 0.24, to: 0.9, dark: 0.34 },
  ];
  function drawRose(g, b, pal, x, y, grow, blush, open) {
    const rc = pal.rose;
    const R = b.R * (0.3 + 0.7 * grow);
    const ripe = clamp(blush * 0.75 + open, 0, 1);   // green bud → petal colour
    g.save();
    g.translate(x, y);
    g.rotate(b.dir + Math.PI / 2);
    // sepals hug the bud, then fold down under the open flower
    for (let i = 0; i < 5; i++) {
      g.save();
      g.rotate(rad(-90 + (i - 2) * lerp(16, 58, open)));
      leafShape(g, R * lerp(0.95, 0.7, open), R * 0.13, 0);
      g.fillStyle = '#3d7a2a';
      g.fill();
      g.strokeStyle = 'rgba(0,0,0,0.6)';
      g.lineWidth = 3;
      g.stroke();
      g.restore();
    }
    g.fillStyle = '#4f8a2e';
    g.beginPath(); g.ellipse(0, 0, 10, 8, 0, 0, Math.PI * 2); g.fill();

    g.translate(0, -R * lerp(0.5, 0.6, open));
    g.scale(1, lerp(1.45, 0.84, open));
    g.rotate(rad(b.spin));
    const mid = mix('#86b03c', mix(rc.mid, b.rnd[5] > 0.5 ? rc.deep : rc.edge, (b.rnd[6] - 0.3) * 0.25), ripe);
    const edge = mix('#a9cc5a', rc.edge, ripe);
    const deep = mix('#3f6a1e', rc.deep, ripe);
    for (const ring of ROSE_RINGS) {
      const o = smooth(ring.from, ring.to, open);
      if (!o) continue;
      const rr = R * ring.r * (0.35 + 0.65 * o);
      const col = mix(mid, rc.deep, ring.dark);
      for (let k = 0; k < ring.n; k++) {
        g.save();
        g.rotate(rad(ring.rot + (k * 360) / ring.n + (b.rnd[k] - 0.5) * 14));
        rosePetal(g, rr, rr * ring.w);
        const grad = g.createRadialGradient(0, 0, 0, 0, 0, rr);
        grad.addColorStop(0, deep);
        grad.addColorStop(0.55, col);
        grad.addColorStop(1, edge);
        g.fillStyle = grad;
        g.fill();
        g.strokeStyle = 'rgba(0,0,0,0.7)';
        g.lineWidth = 5;
        g.stroke();
        g.restore();
      }
    }
    // the heart: a tight cup of petals with a dark spiral where they wrap
    const hr = R * lerp(0.42, 0.36, open);
    const hg = g.createRadialGradient(-hr * 0.2, -hr * 0.3, 0, 0, 0, hr);
    hg.addColorStop(0, edge);
    hg.addColorStop(0.6, mid);
    hg.addColorStop(1, deep);
    g.fillStyle = hg;
    g.beginPath(); g.ellipse(0, 0, hr, hr * 0.92, 0, 0, Math.PI * 2); g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.75)';
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = mix(rc.deep, '#000000', 0.45);
    g.lineWidth = 4;
    g.beginPath();
    for (let i = 0; i <= 40; i++) {
      const a = i * 0.32;
      const s = hr * (0.08 + (i / 40) * 0.8);
      const px = Math.cos(a) * s, py = Math.sin(a) * s * 0.9;
      i ? g.lineTo(px, py) : g.moveTo(px, py);
    }
    g.stroke();
    g.restore();
  }
  // ---------- the love note ----------
  // A red heart, then the message handwritten underneath. The heart is a vector
  // shape like the flowers, so it becomes ascii too. The words are real type: a
  // script set crisply over the ascii (see #note in index.html), revealed left to
  // right like ink, because a flowing hand turns to mush at character resolution.
  const LOVE_NAME = 'Maria';
  const LOVE_TEXT = `Te amo ${LOVE_NAME}`;
  const LOVE_START = 13.2;                       // just after the last lily opens
  const LOVE_TOP = 1125;                         // world y of the caption's centre line
  const LOVE_FONT = '"Great Vibes", "Snell Roundhand", "Segoe Script", cursive';
  const LOVE_WIDTH = 0.66;                       // caption width, as a share of the bouquet's

  const NOTES = [
    { el: document.getElementById('note'), text: LOVE_TEXT, start: LOVE_START + 0.6, dur: 2.4 },
  ];
  for (const n of NOTES) n.el.firstElementChild.textContent = n.text;
  let noteFit = 0;                               // font px per px of caption width
  function fitNote() {
    const g = document.createElement('canvas').getContext('2d');
    g.font = `100px ${LOVE_FONT}`;
    noteFit = 100 / g.measureText(LOVE_TEXT).width;
    noteKey = '';
  }
  let noteKey = '';
  function placeNote() {
    const key = `${cols}x${rows}:${noteFit}`;
    const relayout = key !== noteKey;            // layout only changes on resize or font load
    noteKey = key;
    const size = WORLD_W * view.sx * LOVE_WIDTH * cellW * noteFit;
    NOTES.forEach((n) => {
      const written = showNote ? prog(T, n.start, n.dur) : 0;
      n.el.style.visibility = written ? 'visible' : 'hidden';
      if (relayout) {
        n.el.style.fontSize = `${size.toFixed(1)}px`;
        n.el.style.left = `${((view.ox + 500 * view.sx) * cellW).toFixed(1)}px`;
        n.el.style.top = `${((view.oy + LOVE_TOP * view.sy) * cellH).toFixed(1)}px`;
      }
      if (!written) return;
      // once the ink is down, drop the mask so the glow composites cleanly
      n.el.classList.toggle('done', written >= 1);
      if (written < 1) n.el.style.setProperty('--ink', `${(easeInOut(written) * 112).toFixed(1)}%`);
    });
  }
  fitNote();
  if (document.fonts) document.fonts.load(`64px ${LOVE_FONT}`, LOVE_TEXT).then(fitNote, () => {});

  // a soft double thump, one beat every ~1.7 s
  function heartbeat(t) {
    const p = (t * 0.6) % 1;
    return Math.exp(-Math.pow(p * 7, 2)) + 0.55 * Math.exp(-Math.pow((p - 0.22) * 9, 2));
  }

  // wide notch, round lobes, sharp tip
  function heartPath(g, s) {
    g.beginPath();
    g.moveTo(0, s);
    g.bezierCurveTo(-0.27 * s, 0.7 * s, -s, 0.45 * s, -s, 0.03 * s);
    g.bezierCurveTo(-s, -0.44 * s, -0.72 * s, -0.8 * s, -0.4 * s, -0.8 * s);
    g.lineTo(-0.05 * s, -0.36 * s);
    g.quadraticCurveTo(0, -0.3 * s, 0.05 * s, -0.36 * s);
    g.lineTo(0.4 * s, -0.8 * s);
    g.bezierCurveTo(0.72 * s, -0.8 * s, s, -0.44 * s, s, 0.03 * s);
    g.bezierCurveTo(s, 0.45 * s, 0.27 * s, 0.7 * s, 0, s);
    g.closePath();
  }

  function drawHeart(g) {
    const pop = easeOutBack(prog(T, LOVE_START, 0.9));
    if (!pop) return;
    const beat = 1 + 0.04 * heartbeat(NOW);
    const s = 82 * pop * beat;
    if (s < 2) return;

    const [x, y] = sway(500, 790);
    g.save();
    g.translate(x, y);
    // a dark ring first, so the red silhouette stays clean over the greenery
    heartPath(g, s);
    g.strokeStyle = 'rgba(0,0,0,0.92)';
    g.lineWidth = 18;
    g.stroke();
    heartPath(g, s);
    // flat, saturated red reads best once it is quantised into glyphs
    const grad = g.createLinearGradient(0, -0.8 * s, 0, s);
    grad.addColorStop(0, '#f4163d');
    grad.addColorStop(0.6, '#e60c33');
    grad.addColorStop(1, '#bb0029');
    g.fillStyle = grad;
    g.fill();
    // one small glint on the left lobe
    g.fillStyle = 'rgba(255,245,248,0.92)';
    g.beginPath();
    g.arc(-0.5 * s, -0.5 * s, 0.085 * s, 0, Math.PI * 2);
    g.fill();
    g.restore();
  }

  function drawScene(g, S, pal) {
    drawRuscus(g, S);
    for (const st of S.stems) strokeCurve(g, st.pts, 0, stemProgress(st), 9, '#5a9a30');
    // fixed depth order: buds and flowers that open never swap in front of each other
    const sorted = S.buds.slice().sort((a, b) => a.depth - b.depth);
    for (const b of sorted) drawBud(g, b, pal);
    drawWrap(g, pal);
    drawBow(g, pal);
    if (showNote) drawHeart(g);
  }

  // ---------- prelude ----------
  // Before the bouquet: a night sky, a line typed like a terminal, and a sealed
  // envelope. Tapping it breaks the heart seal, the flap swings open and a warm
  // light rises out; then the bloom begins. The tap also starts the music box,
  // since browsers only allow sound after a gesture.
  const INTRO_LINE = `> ${LOVE_NAME}, tengo algo para ti`;
  const OPEN_SEQ = 2.2;                          // seconds from the tap to the first stem
  const ENV = { x0: 265, x1: 735, y0: 470, y1: 775 };   // envelope body, world units
  const ENV_C = [500, 655];                      // where the flap tip and seal meet

  let stage = 'intro';                           // 'intro' → 'opening' → 'bloom'
  let INTRO = 0, OPEN = -1;                      // seconds since load / since the tap

  // stars live in screen space so they fill the whole window, not just the bouquet
  const STARS = (() => {
    const r = rng(7);
    return Array.from({ length: 150 }, () => ({
      fx: r(), fy: r(), ph: r() * 6.3, sp: 0.6 + r() * 1.8, b: 0.35 + r() * 0.65,
    }));
  })();
  const STAR_GLYPHS = [RAMP.indexOf('.'), RAMP.indexOf('+'), RAMP.indexOf('*')];

  function starAlpha() {
    const appear = smooth(0, 1.2, INTRO);
    return stage === 'bloom' ? appear * lerp(1, 0.5, smooth(0, 3, T)) : appear;
  }

  // written straight into the cell grid, so each star is one crisp glyph
  function applyStars(cells, glowPx) {
    const a = starAlpha();
    if (a <= 0.01) return;
    for (const s of STARS) {
      const x = Math.floor(s.fx * cols), y = Math.floor(s.fy * rows);
      const i = (y * cols + x) * 4;
      if (cells[i + 3]) continue;               // never on top of the flowers
      const tw = 0.5 + 0.5 * Math.sin(NOW * s.sp + s.ph);
      const v = s.b * (0.35 + 0.65 * tw) * a;
      if (v < 0.12) continue;
      const c = 255 * v;
      cells[i] = c; cells[i + 1] = c * 0.94; cells[i + 2] = c * 0.88;
      cells[i + 3] = STAR_GLYPHS[v > 0.75 ? 2 : v > 0.45 ? 1 : 0];
      glowPx[i] = c * 0.5; glowPx[i + 1] = c * 0.45; glowPx[i + 2] = c * 0.45;
    }
  }

  function polygon(g, pts, fill) {
    g.beginPath();
    pts.forEach(([x, y], i) => (i ? g.lineTo(x, y) : g.moveTo(x, y)));
    g.closePath();
    g.fillStyle = fill;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.85)';
    g.lineWidth = 7;
    g.stroke();
  }

  function drawEnvelope(g) {
    if (stage === 'bloom' && (OPEN < 0 || OPEN > OPEN_SEQ + 0.6)) return;
    const appear = easeOut(prog(INTRO, 1.4, 1.2));
    if (!appear) return;
    const leave = OPEN < 0 ? 0 : smooth(1.2, 2.3, OPEN);
    const alpha = appear * (1 - leave);
    if (alpha <= 0.01) return;
    const { x0, x1, y0, y1 } = ENV;
    const [cx, cy] = ENV_C;
    const bob = Math.sin(NOW * 1.3) * 6 * (1 - leave);
    g.save();
    g.globalAlpha = alpha;
    g.translate(0, (1 - appear) * 70 + leave * 50 + bob);

    // the flap: folded down over the body, then swung up behind it
    const flip = OPEN < 0 ? 0 : easeInOut(prog(OPEN, 0.3, 0.65));
    const flapY = (y) => y0 + (y - y0) * (1 - 2 * flip);
    const flap = () => polygon(g, [[x0, y0], [cx, flapY(cy)], [x1, y0]], mix('#f3ebdf', '#d9c8b4', flip));
    if (flip > 0.5) flap();                      // open: it now sits behind the body

    // body and the three folded panels that form its face
    const body = g.createLinearGradient(0, y0, 0, y1);
    body.addColorStop(0, '#e9dfd0');
    body.addColorStop(1, '#cdbba6');
    polygon(g, [[x0, y0], [x1, y0], [x1, y1], [x0, y1]], body);
    // light pours out of the open envelope
    if (OPEN >= 0) {
      const glowA = smooth(0.4, 0.9, OPEN) * (1 - smooth(1.4, 2.2, OPEN));
      if (glowA > 0) {
        const lg = g.createRadialGradient(cx, y0, 0, cx, y0, 220);
        lg.addColorStop(0, `rgba(255,236,196,${0.95 * glowA})`);
        lg.addColorStop(1, 'rgba(255,236,196,0)');
        g.fillStyle = lg;
        g.fillRect(x0, y0 - 220, x1 - x0, 260);
      }
    }
    polygon(g, [[x0, y0 + 8], [cx - 30, (y0 + y1) / 2 + 20], [x0, y1]], '#d8c9b5');
    polygon(g, [[x1, y0 + 8], [cx + 30, (y0 + y1) / 2 + 20], [x1, y1]], '#d8c9b5');
    polygon(g, [[x0, y1], [cx, cy - 28], [x1, y1]], '#e2d5c3');
    if (flip <= 0.5) flap();

    // the wax seal: a beating red heart that breaks when tapped
    const pop = OPEN < 0 ? 0 : prog(OPEN, 0, 0.32);
    if (pop < 1) {
      const s = 54 * (1 + 0.05 * heartbeat(NOW)) * (1 + 0.5 * easeOut(pop));
      g.save();
      g.globalAlpha = alpha * (1 - pop);
      g.translate(cx, flapY(cy) - 6);
      heartPath(g, s);
      g.strokeStyle = 'rgba(0,0,0,0.9)';
      g.lineWidth = 12;
      g.stroke();
      heartPath(g, s);
      const sg = g.createLinearGradient(0, -0.8 * s, 0, s);
      sg.addColorStop(0, '#f4163d');
      sg.addColorStop(1, '#a8001f');
      g.fillStyle = sg;
      g.fill();
      g.restore();
    }
    g.restore();
  }

  // the light that carries the gift out: rises, swells, then gives way to the bloom
  function drawRisingLight(g) {
    if (OPEN < 0.5 || OPEN > OPEN_SEQ + 1.2) return;
    const rise = easeInOut(prog(OPEN, 0.5, 1.3));
    const a = smooth(0.5, 0.9, OPEN) * (1 - smooth(OPEN_SEQ - 0.2, OPEN_SEQ + 1.1, OPEN));
    if (a <= 0) return;
    // then it sinks into the wrap, where the stems are about to spring from
    const sink = easeInOut(prog(OPEN, OPEN_SEQ - 0.5, 1.4));
    const x = ENV_C[0], y = lerp(ENV.y0, 430, rise) + sink * 380;
    const r = lerp(40, 190, rise) * (1 - 0.55 * sink);
    const lg = g.createRadialGradient(x, y, 0, x, y, r);
    lg.addColorStop(0, `rgba(255,250,236,${a})`);
    lg.addColorStop(0.35, `rgba(255,214,170,${0.75 * a})`);
    lg.addColorStop(1, 'rgba(255,170,150,0)');
    g.fillStyle = lg;
    g.beginPath(); g.arc(x, y, r, 0, Math.PI * 2); g.fill();
  }

  // the typed line and the hint are real type over the ascii, like the love note
  const introEl = document.getElementById('intro');
  const introTyped = introEl.querySelector('.typed');
  const hintEl = document.getElementById('hint');
  let introKey = '', typedCount = -1;
  function placeIntro() {
    const done = stage !== 'intro';
    introEl.classList.toggle('gone', done);
    hintEl.classList.toggle('gone', done || INTRO < 3.4);
    if (stage === 'bloom' && (OPEN < 0 || OPEN > OPEN_SEQ + 1)) { introEl.hidden = hintEl.hidden = true; return; }
    introEl.hidden = hintEl.hidden = false;
    const n = clamp(Math.floor((INTRO - 0.6) * 20), 0, INTRO_LINE.length);
    if (n !== typedCount) { typedCount = n; introTyped.textContent = INTRO_LINE.slice(0, n); }
    const key = `${cols}x${rows}`;
    if (key === introKey) return;
    introKey = key;
    const px = (wx, wy) => [(view.ox + wx * view.sx) * cellW, (view.oy + wy * view.sy) * cellH];
    const size = clamp(WORLD_W * view.sx * cellW * 0.034, 14, 30);
    const [lx, ly] = px(500, 390);
    introEl.style.cssText = `left:${lx}px;top:${ly}px;font-size:${size.toFixed(1)}px;visibility:visible`;
    const [hx, hy] = px(500, 860);
    hintEl.style.cssText = `left:${hx}px;top:${hy}px;font-size:${(size * 0.72).toFixed(1)}px;visibility:visible`;
  }

  // ---------- music box ----------
  // A slow, quiet lullaby, synthesised: unhurried arpeggios over C, Am, F and G in a
  // low, warm register, one soft note at a time, each left to ring out in a hall.
  const Music = (() => {
    let ac = null, master = null, bus = null, on = true, level = 0.11;
    let step = 0, next = 0, timer = 0;
    const STEP = 0.92;                           // seconds between notes
    // four notes per chord, rising then settling; 0 is a rest
    const TUNE = [
      60, 64, 67, 64,   57, 60, 64, 60,   53, 57, 60, 57,   55, 59, 62, 0,
      60, 64, 67, 72,   57, 60, 64, 69,   53, 57, 60, 65,   55, 59, 67, 0,
    ];
    const BASS = [48, 45, 41, 43];               // one per chord, under its first note
    const hz = (m) => 440 * Math.pow(2, (m - 69) / 12);

    function reverb() {
      const len = ac.sampleRate * 3.4;
      const buf = ac.createBuffer(2, len, ac.sampleRate);
      for (let ch = 0; ch < 2; ch++) {
        const d = buf.getChannelData(ch);
        for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 3);
      }
      const c = ac.createConvolver();
      c.buffer = buf;
      return c;
    }

    function pluck(m, t, vel) {
      const f = hz(m);
      for (const [mul, amp, decay] of [[1, 1, 2.8], [2, 0.07, 1.2]]) {   // warm: no bright overtone
        const o = ac.createOscillator();
        const g = ac.createGain();
        o.type = 'sine';
        o.frequency.value = f * mul;
        g.gain.setValueAtTime(0, t);
        g.gain.linearRampToValueAtTime(vel * amp, t + 0.02);   // soft attack, no click
        g.gain.exponentialRampToValueAtTime(0.0001, t + decay);
        o.connect(g).connect(bus);
        o.start(t);
        o.stop(t + decay + 0.05);
      }
    }

    function schedule() {
      while (next < ac.currentTime + 0.25) {
        const i = step % TUNE.length;
        if (TUNE[i]) pluck(TUNE[i], next, 0.26 - (i % 4) * 0.02);   // each chord fades as it climbs
        if (i % 4 === 0) pluck(BASS[(i / 4) % BASS.length], next, 0.2);
        next += STEP * (1 + (Math.random() - 0.5) * 0.03);       // unhurried, slightly human
        step++;
      }
    }

    function ramp(v, secs) {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(v, t + secs);
    }

    return {
      start() {
        const AC = window.AudioContext || window.webkitAudioContext;
        if (!AC) return;
        if (!ac) {
          ac = new AC();
          master = ac.createGain();
          master.gain.value = 0;
          master.connect(ac.destination);
          bus = ac.createGain();
          const wet = ac.createGain();
          wet.gain.value = 0.6;
          bus.connect(master);
          bus.connect(reverb()).connect(wet).connect(master);
          next = ac.currentTime + 0.15;
          timer = setInterval(schedule, 60);
        }
        if (ac.state === 'suspended') ac.resume();
        if (on) ramp(level, 2.5);
      },
      lift() {                                   // a touch louder for the love note
        if (level >= 0.14) return;
        level = 0.14;
        if (ac && on) ramp(level, 3);
      },
      toggle() {
        on = !on;
        if (ac) ramp(on ? level : 0, 0.6);   // before the letter opens, just remember it
      },
      get started() { return !!timer; },
    };
  })();

  // ---------- ascii renderer ----------
  // The scene is drawn into a tiny canvas (one pixel per cell) and read back. Each
  // cell becomes a colour plus a glyph index, which WebGL turns into glyphs from a
  // pre-rendered atlas in a single draw call. A blurred copy of the cell colours sits
  // behind the glyphs as a soft CRT-style bloom, scaled and blurred by the compositor.
  const screen = document.getElementById('screen');
  const glow = document.getElementById('glow');
  const glowCtx = glow.getContext('2d');
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });

  let cols = 0, rows = 0, cellW = 0, cellH = 0, cwPx = 0, chPx = 0, dpr = 1;
  const view = { ox: 0, oy: 0, sx: 1, sy: 1 };   // world → cell projection
  let cells = null, glowImg = null, atlas = null;

  const gl = screen.getContext('webgl', { alpha: true, premultipliedAlpha: true, antialias: false });
  const sctx = gl ? null : screen.getContext('2d');   // fallback when WebGL is unavailable
  let glProg, uGrid, uCell, uRes, uGlyphs, cellTex, atlasTex;

  function initGL() {
    const shader = (type, src) => {
      const s = gl.createShader(type);
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(s));
      return s;
    };
    glProg = gl.createProgram();
    gl.attachShader(glProg, shader(gl.VERTEX_SHADER, 'attribute vec2 p;void main(){gl_Position=vec4(p,0.,1.);}'));
    gl.attachShader(glProg, shader(gl.FRAGMENT_SHADER, `
      #ifdef GL_FRAGMENT_PRECISION_HIGH
      precision highp float;
      #else
      precision mediump float;
      #endif
      uniform sampler2D uCells, uAtlas;
      uniform vec2 uGrid, uCell, uRes;
      uniform float uGlyphs;
      void main() {
        vec2 p = vec2(gl_FragCoord.x, uRes.y - gl_FragCoord.y);
        vec2 c = floor(p / uCell);
        vec4 cell = texture2D(uCells, (c + 0.5) / uGrid);
        float gi = floor(cell.a * 255.0 + 0.5);
        vec2 l = (p - c * uCell) / uCell;
        float a = texture2D(uAtlas, vec2((gi + l.x) / uGlyphs, l.y)).a;
        gl_FragColor = vec4(cell.rgb * a, a);
      }`));
    gl.linkProgram(glProg);
    gl.useProgram(glProg);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
    const loc = gl.getAttribLocation(glProg, 'p');
    gl.enableVertexAttribArray(loc);
    gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
    uGrid = gl.getUniformLocation(glProg, 'uGrid');
    uCell = gl.getUniformLocation(glProg, 'uCell');
    uRes = gl.getUniformLocation(glProg, 'uRes');
    uGlyphs = gl.getUniformLocation(glProg, 'uGlyphs');
    gl.uniform1i(gl.getUniformLocation(glProg, 'uCells'), 0);
    gl.uniform1i(gl.getUniformLocation(glProg, 'uAtlas'), 1);
    const tex = () => {
      const t = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, t);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
      return t;
    };
    cellTex = tex();
    atlasTex = tex();
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    // phones get a finer grid: with their dense screens the small glyphs stay sharp,
    // and the bouquet needs ~200 columns across to read as roses rather than smudges
    const minFont = dpr >= 2 ? 4 : 6;
    const fontSize = clamp(Math.floor(Math.min(w / 150, h / 125)), minFont, 12);
    const font = `bold ${fontSize * dpr}px ${MONO}`;
    // whole device pixels per cell, so glyphs land exactly on the pixel grid
    atlas = document.createElement('canvas');
    const a = atlas.getContext('2d');
    a.font = font;
    cwPx = Math.max(1, Math.round(a.measureText('M').width));
    chPx = Math.round(fontSize * dpr);
    cellW = cwPx / dpr;
    cellH = chPx / dpr;
    screen.width = Math.round(w * dpr);
    screen.height = Math.round(h * dpr);
    // size the canvas in px from the same innerWidth/innerHeight the glow uses: on
    // phones 100vh counts the hidden URL bar, which stretched the glyphs off the glow
    screen.style.width = `${w}px`;
    screen.style.height = `${h}px`;
    cols = Math.ceil(screen.width / cwPx);
    rows = Math.ceil(screen.height / chPx);
    off.width = glow.width = cols;
    off.height = glow.height = rows;
    glow.style.width = `${cols * cellW}px`;
    glow.style.height = `${rows * cellH}px`;
    glow.style.filter = `blur(${(cellH * 0.6).toFixed(1)}px)`;
    cells = new Uint8Array(cols * rows * 4);
    glowImg = glowCtx.createImageData(cols, rows);

    atlas.width = cwPx * RAMP.length;
    atlas.height = chPx;
    a.font = font;
    a.textBaseline = 'top';
    a.fillStyle = '#fff';
    for (let i = 0; i < RAMP.length; i++) a.fillText(RAMP[i], i * cwPx, 0);
    if (gl) {
      gl.activeTexture(gl.TEXTURE1);
      gl.bindTexture(gl.TEXTURE_2D, atlasTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, atlas);
      gl.viewport(0, 0, screen.width, screen.height);
      gl.uniform2f(uGrid, cols, rows);
      gl.uniform2f(uCell, cwPx, chPx);
      gl.uniform2f(uRes, screen.width, screen.height);
      gl.uniform1f(uGlyphs, RAMP.length);
    }
  }

  function render(S, pal) {
    // paint the scene into the low-res buffer, correcting for tall character cells
    const aspect = cellH / cellW;
    const sx = Math.min(cols / WORLD_W, (rows * aspect) / WORLD_H) * 0.96;
    view.sx = sx;
    view.sy = sx / aspect;
    view.ox = (cols - WORLD_W * sx) / 2;
    view.oy = (rows - WORLD_H * view.sy) / 2;
    octx.setTransform(1, 0, 0, 1, 0, 0);
    octx.fillStyle = '#000';
    octx.fillRect(0, 0, cols, rows);
    octx.setTransform(sx, 0, 0, view.sy, view.ox, view.oy);
    drawEnvelope(octx);
    drawScene(octx, S, pal);
    drawRisingLight(octx);

    // brightness picks the glyph, the pixel colour (lifted a little) tints it
    const data = octx.getImageData(0, 0, cols, rows).data;
    const gp = glowImg.data;
    const n = RAMP.length - 1;
    const flick = Math.floor(NOW * 8);
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i += 4) {
        const r = data[i], g = data[i + 1], b = data[i + 2];
        gp[i] = r; gp[i + 1] = g; gp[i + 2] = b; gp[i + 3] = 255;
        const m = Math.max(r, g, b);
        if (m < 14) { cells[i + 3] = 0; continue; }
        const v = m / 255;
        // a little shimmer so the glyphs feel alive
        const hsh = ((x * 73856093) ^ (y * 19349663) ^ (flick * 83492791)) >>> 0;
        const j = hsh % 9 === 0 ? (hsh & 16 ? 1 : -1) : 0;
        const k = Math.min(1.25, (40 + 215 * v) / m);
        cells[i] = Math.min(255, r * k);
        cells[i + 1] = Math.min(255, g * k);
        cells[i + 2] = Math.min(255, b * k);
        cells[i + 3] = clamp(Math.round(Math.pow(v, 0.7) * n) + j, 1, n);
      }
    }
    applyStars(cells, gp);
    glowCtx.putImageData(glowImg, 0, 0);
    placeNote();
    placeIntro();

    if (gl) {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, cellTex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, cols, rows, 0, gl.RGBA, gl.UNSIGNED_BYTE, cells);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
      return;
    }
    // 2D fallback: one fillText per lit cell
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.clearRect(0, 0, screen.width, screen.height);
    sctx.font = `bold ${chPx}px ${MONO}`;
    sctx.textBaseline = 'top';
    for (let y = 0, i = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++, i += 4) {
        if (!cells[i + 3]) continue;
        sctx.fillStyle = `rgb(${cells[i]},${cells[i + 1]},${cells[i + 2]})`;
        sctx.fillText(RAMP[cells[i + 3]], x * cwPx, y * chPx);
      }
    }
  }

  // ---------- loop ----------
  const S = buildScene();
  let palette = 0;
  let showNote = true;
  const boot = performance.now();
  let t0 = 0, openAt = 0, last = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    NOW = (now - boot) / 1000;
    INTRO = NOW;
    OPEN = openAt ? (now - openAt) / 1000 : -1;
    if (stage === 'opening' && OPEN >= OPEN_SEQ) { stage = 'bloom'; t0 = now; }
    T = stage === 'bloom' ? ((now - t0) / 1000) * SPEED : 0;
    if (T > LOVE_START && showNote) Music.lift();
    render(S, PALETTES[palette]);
  }

  function openLetter() {
    if (stage !== 'intro') return;
    stage = 'opening';
    openAt = performance.now();
    Music.start();
  }
  const replay = () => { if (stage === 'bloom') t0 = performance.now(); };
  window.addEventListener('resize', resize);
  if (window.visualViewport) visualViewport.addEventListener('resize', resize);   // phone URL bar
  screen.addEventListener('click', () => (stage === 'intro' ? openLetter() : replay()));
  window.addEventListener('keydown', (e) => {
    const k = e.key.toLowerCase();
    if (stage === 'intro' && (k === ' ' || k === 'enter')) { e.preventDefault(); openLetter(); return; }
    if (k === ' ' || k === 'r') replay();
    if (k === 'p' || k === 'c') { palette = (palette + 1) % PALETTES.length; replay(); }
    if (k === 's') Music.toggle();
  });

  // ?t=8 starts 8s into the bloom (skipping the letter), ?intro=0 skips the letter,
  // ?p=1 picks a palette, ?m=0 hides the heart and the note
  const q = new URLSearchParams(location.search);
  if (q.has('p')) palette = clamp(+q.get('p') | 0, 0, PALETTES.length - 1);
  if (q.has('t') || q.get('intro') === '0') {
    stage = 'bloom';
    t0 = performance.now() - ((+q.get('t') || 0) * 1000) / SPEED;   // ?t is in bloom time
  }
  if (q.get('m') === '0') showNote = false;

  if (gl) initGL();
  resize();
  requestAnimationFrame(frame);
})();
