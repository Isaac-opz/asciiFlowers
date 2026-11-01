// ASCII lilies: the scene is painted with vector shapes onto a tiny offscreen
// canvas (one pixel per character cell), then every pixel is redrawn as a
// coloured ASCII glyph whose density follows the pixel's brightness.
//
// The bloom follows how cut lilies actually open: a bunch of tall leafy stems,
// each ending in a cluster of long green buds. Buds swell and blush, then split
// into six tepals that curl back to show the stamens. Some buds stay green.
// Once the last lily is open, a red heart and a message arrive below them.
(() => {
  'use strict';

  const RAMP = ' .:-=+*cxoaX#%&@';
  const MONO = 'Menlo, Consolas, "DejaVu Sans Mono", monospace';
  const WORLD_W = 1000;
  const WORLD_H = 1100;
  const FPS = 30;

  const PALETTES = [
    { // cherry red and ivory lilies
      petal: ['#cf112f', '#f7f0e2', '#b00d24', '#fcf8ef', '#d81a34', '#efe4cf'], edge: null,
      blush: '#dda6a8', throat: '#e6cf74', vein: 'rgba(90,8,22,0.45)', anther: '#3a160a', spots: true,
    },
    { // white oriental lilies
      petal: '#f6f2ea', edge: '#ffffff', blush: '#d8dcc0', throat: '#c8d87a', vein: 'rgba(120,130,90,0.4)',
      anther: '#8a3a16', spots: false,
    },
    { // mixed garden, like the ASCII video
      petal: ['#e3233a', '#d24aa9', '#f08a2a', '#e9c63c', '#f1e4c6', '#f39ab2'], edge: null,
      blush: '#c98a7a', throat: '#e8d070', vein: 'rgba(80,10,20,0.45)', anther: '#3a160a', spots: true,
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
  let T = 0;
  function sway(x, y) {
    const lift = clamp((1090 - y) / 800, 0, 1);
    return [x + Math.sin(T * 0.9 + y * 0.006) * 8 * lift + Math.sin(T * 0.43 + x * 0.004) * 4 * lift, y];
  }

  // ---------- scene ----------
  // Timeline (seconds): stems rise, leaves unfurl, buds swell and blush, then open one by one.
  const STEM_START = 0, STEM_DUR = 2.6;
  const LEAF_START = 1.0;
  const BUD_START = 2.2;
  const BLUSH_START = 3.6;
  const OPEN_START = 5.0, OPEN_GAP = 0.62, OPEN_DUR = 3.2;

  function buildScene() {
    const r = rng(11);
    const S = { stems: [], leaves: [], buds: [] };

    // [top x, top y, side pedicels]
    const tops = [
      [255, 505, 1], [310, 470, 2], [395, 360, 2], [455, 258, 2], [500, 300, 3],
      [560, 252, 1], [600, 350, 2], [700, 420, 2], [740, 500, 1], [775, 530, 1],
      [350, 560, 1], [650, 560, 1],
    ];
    for (const [tx, ty, sides] of tops) {
      const bx = 485 + r() * 30;
      const stem = [[bx, 1090], [bx + (tx - bx) * 0.1, 860], [lerp(bx, tx, 0.7), ty + 220], [tx, ty]];
      const lean = (tx - 500) * 0.1;
      const stemRef = { pts: stem, start: STEM_START + r() * 0.4 };
      S.stems.push(stemRef);

      // lance-shaped leaves spiral up the middle of each stem
      const n = 5 + Math.floor(r() * 3);
      for (let i = 0; i < n; i++) {
        const t = 0.22 + (i / n) * 0.5 + r() * 0.04;
        const side = i % 2 ? 1 : -1;
        S.leaves.push({
          stem, t, side, len: 85 + r() * 55, w: 13 + r() * 6,
          spread: rad(28 + r() * 26), start: LEAF_START + t * 1.5 + r() * 0.3, tint: r(),
        });
      }

      // buds: one at the tip, the rest on short pedicels branching just below it
      S.buds.push({ stem, stemRef, at: 1, ped: null, dir: rad(-90 + lean + (r() - 0.5) * 10) });
      for (let k = 0; k < sides; k++) {
        const side = k % 2 ? 1 : -1;
        const at = 0.82 + r() * 0.12;
        const base = bez(stem, at);
        const ang = rad(-90 + lean + side * (30 + r() * 25));
        const len = 40 + r() * 45;
        const end = [base[0] + Math.cos(ang) * len, base[1] + Math.sin(ang) * len];
        const ped = [base, [lerp(base[0], end[0], 0.3), base[1] - len * 0.35], [lerp(base[0], end[0], 0.8), lerp(base[1], end[1], 0.7)], end];
        S.buds.push({ stem, stemRef, at, ped, dir: ang });
      }
    }

    // decide each bud's fate: about half open fully, a few only blush, the rest stay green
    const order = S.buds.map((_, i) => i).sort(() => r() - 0.5);
    order.forEach((idx, rank) => {
      const b = S.buds[idx];
      b.len = 120 + r() * 40;
      b.width = 19 + r() * 5;
      b.squash = 0.6 + r() * 0.25;
      b.twist = (r() - 0.5) * 0.8;
      b.droop = rad((b.dir > rad(-90) ? 1 : -1) * (15 + r() * 20));
      b.colorIdx = rank;
      b.rnd = Array.from({ length: 12 }, r);
      b.grow = BUD_START + r() * 1.2;
      if (rank < 10) {
        b.maxOpen = 1; b.blush = 1; b.openAt = OPEN_START + rank * OPEN_GAP + r() * 0.3;
      } else if (rank < 15) {
        b.maxOpen = 0.08; b.blush = 0.8; b.openAt = OPEN_START + 2 + r() * 4;
      } else {
        b.maxOpen = 0; b.blush = 0.1 + r() * 0.2; b.openAt = Infinity; b.len *= 0.75;
      }
    });
    addFillers(S);
    return S;
  }

  // Ruscus and baby's breath fill out the bunch around the lilies.
  const RUSCUS_START = 0.6;
  const GYP_START = 2.4;

  function addFillers(S) {
    const r = rng(29);
    S.ruscus = [];
    S.gyp = [];

    // ruscus: long arching sprigs with glossy leaves alternating up the stem
    const sprig = (base, ang, len, start, depth) => {
      const end = [base[0] + Math.cos(ang) * len, base[1] + Math.sin(ang) * len];
      const bend = (r() - 0.5) * len * 0.3;
      const pts = [base, [lerp(base[0], end[0], 0.33) + bend, lerp(base[1], end[1], 0.33)],
        [lerp(base[0], end[0], 0.7) + bend * 0.5, lerp(base[1], end[1], 0.7)], end];
      const leaves = [];
      for (let t = 0.2 + r() * 0.08, i = 0; t <= 1; t += 0.075 + r() * 0.035, i++) {
        leaves.push({ t, side: i % 2 ? 1 : -1, len: 34 + r() * 18, w: 10 + r() * 4, tint: r() });
      }
      leaves.push({ t: 1, side: 0, len: 46 + r() * 16, w: 11, tint: r() });
      S.ruscus.push({ pts, leaves, start });
      if (depth > 0) {
        for (let k = 0; k < 2; k++) {
          const t = 0.35 + r() * 0.35;
          const p = bez(pts, t);
          const side = k ? 1 : -1;
          sprig(p, ang + side * rad(25 + r() * 20), len * (0.4 + r() * 0.2), start + t * 1.4, depth - 1);
        }
      }
    };
    // a few sprigs tucked behind the lilies, ending just inside the bouquet's outline
    for (const end of [[210, 560], [270, 340], [420, 215], [600, 205], [750, 320], [810, 560]]) {
      const base = [490 + r() * 20, 820 - r() * 40];
      const ang = Math.atan2(end[1] - base[1], end[0] - base[0]);
      sprig(base, ang, Math.hypot(end[0] - base[0], end[1] - base[1]), RUSCUS_START + r() * 0.8, 0);
    }

    // baby's breath: thin stems that fork again and again into clouds of tiny white flowers
    // small sprays tucked between the lilies, as in a florist's bouquet
    const clouds = [
      [340, 460], [660, 430], [500, 330], [280, 610], [740, 610],
      [450, 610], [590, 640], [400, 340], [620, 340], [520, 520],
      [330, 300], [675, 295], [250, 400], [760, 390],
    ];
    clouds.forEach(([cx, cy], ci) => {
      const base = [485 + r() * 30, 1000 + r() * 60];
      const start = GYP_START + ci * 0.12 + r() * 0.4;
      const outward = Math.atan2(cy - 620, cx - 500);
      const segs = [], flowers = [];
      const branch = (x, y, ang, len, depth, t) => {
        const x2 = x + Math.cos(ang) * len, y2 = y + Math.sin(ang) * len;
        segs.push({ x, y, x2, y2, t, w: 1.5 + depth * 0.8 });
        const t2 = t + 0.18;
        if (depth === 0) {
          flowers.push({ x: x2, y: y2, s: 4.5 + r() * 3.5, t: t2 + r() * 0.3, puffs: 2 + Math.floor(r() * 2) });
          return;
        }
        if (depth < 3 && r() < 0.75) flowers.push({ x: x2, y: y2, s: 3.5 + r() * 2.5, t: t2 + r() * 0.3, puffs: 1 });
        const kids = 2 + (r() < 0.45 ? 1 : 0);
        for (let k = 0; k < kids; k++) {
          const spread = rad(lerp(-70, 70, kids === 1 ? 0.5 : k / (kids - 1)) + (r() - 0.5) * 30);
          // children lean back toward upward/outward so the cloud stays rounded
          const target = lerp(ang + spread, outward, 0.25);
          branch(x2, y2, target, len * (0.4 + r() * 0.45), depth - 1, t2);
        }
      };
      const main = [[base[0], base[1]], [lerp(base[0], cx, 0.2), lerp(base[1], cy, 0.5)], [lerp(base[0], cx, 0.8), cy + 60], [cx, cy + 40]];
      branch(cx, cy + 40, outward * 0.5 - Math.PI / 4, 40 + r() * 10, 4, 0.6);
      S.gyp.push({ main, segs, flowers, start, front: ci % 2 === 1 });
    });
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

  function drawLeaf(g, lf) {
    const p = easeOut(prog(T, lf.start, 1.4));
    if (!p) return;
    const a = bez(lf.stem, lf.t);
    const [x, y] = sway(a[0], a[1]);
    const ang = bezAngle(lf.stem, lf.t) + lf.side * lf.spread * (0.4 + 0.6 * p);
    const L = lf.len * p, W = lf.w * (0.4 + 0.6 * p);
    g.save();
    g.translate(x, y);
    g.rotate(ang);
    // the tip arches away from the stem
    const bend = lf.side * L * 0.18;
    g.beginPath();
    g.moveTo(0, 0);
    g.bezierCurveTo(L * 0.3, -W, L * 0.7, -W * 0.8 + bend * 0.5, L, bend);
    g.bezierCurveTo(L * 0.7, W * 0.8 + bend * 0.5, L * 0.3, W, 0, 0);
    const grad = g.createLinearGradient(0, 0, L, 0);
    grad.addColorStop(0, '#2e6e22');
    grad.addColorStop(0.5, lf.tint > 0.5 ? '#4c9a2e' : '#3f8a2a');
    grad.addColorStop(1, '#78bc44');
    g.fillStyle = grad;
    g.fill();
    g.strokeStyle = 'rgba(0,0,0,0.55)';
    g.lineWidth = 5;
    g.stroke();
    g.strokeStyle = 'rgba(20,60,15,0.8)';
    g.lineWidth = 3;
    g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(L * 0.6, bend * 0.3, L * 0.95, bend * 0.95); g.stroke();
    g.restore();
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
    const multi = Array.isArray(pal.petal);
    const petal = multi ? pal.petal[b.colorIdx % pal.petal.length] : pal.petal;
    const edge = pal.edge || mix(petal, '#ffffff', 0.25);

    // bud colour: green → dusty pink as it matures → petal colour as it opens
    const budCol = mix('#9cc63e', pal.blush, blush);
    const color = mix(budCol, petal, smooth(0.05, 0.45, open));
    const edgeCol = mix(mix('#b4d860', pal.blush, blush), edge, smooth(0.05, 0.45, open));
    const throat = mix('#8fbf3a', pal.throat, open);

    const L = b.len * (0.3 + 0.7 * grow) * (1 + 0.3 * open);
    const W = b.width * (0.6 + 0.4 * grow) * (1 + 1.4 * open);

    g.save();
    g.translate(x, y);
    g.rotate(b.dir + b.droop * open);
    g.scale(1, lerp(1, b.squash, open));
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

  function drawGyp(g, S, front) {
    for (const c of S.gyp) {
      if (c.front !== front) continue;
      const p = prog(T, c.start, 3.2);
      if (!p) continue;
      strokeCurve(g, c.main, 0, easeOut(Math.min(1, p * 3)), 3, '#6b8a4a');
      const local = p * 3.2 - 0.6; // seconds since the branching began
      g.strokeStyle = '#6f8f50';
      for (const sg of c.segs) {
        const k = clamp((local - sg.t) / 0.25, 0, 1);
        if (!k) continue;
        const [x, y] = sway(sg.x, sg.y), [x2, y2] = sway(sg.x2, sg.y2);
        g.lineWidth = sg.w;
        g.beginPath(); g.moveTo(x, y); g.lineTo(lerp(x, x2, k), lerp(y, y2, k)); g.stroke();
      }
      for (const f of c.flowers) {
        const k = easeOut(clamp((local - f.t) / 0.5, 0, 1));
        if (!k) continue;
        const [x, y] = sway(f.x, f.y);
        const tw = 0.88 + 0.12 * Math.sin(T * 2.5 + f.x * 0.3);
        g.fillStyle = `rgba(252,250,244,${tw})`;
        for (let i = 0; i < f.puffs; i++) {
          g.beginPath();
          g.arc(x + (i - (f.puffs - 1) / 2) * f.s * 0.9, y - (i % 2) * f.s * 0.6, f.s * k, 0, Math.PI * 2);
          g.fill();
        }
      }
    }
  }

  // ---------- the love note ----------
  // A red heart, then the message typed out in block letters. The heart is a
  // vector shape like the flowers, so it too becomes ascii; the letters are
  // built from the same glyphs on the same grid, so they stay crisp at any size.
  const LOVE_NAME = 'Maria';
  const LOVE_TEXT = `Te amo ${LOVE_NAME}`;
  const LOVE_START = 14.3;                       // just after the last lily opens
  const LOVE_TOP = 961;                          // world y of the caption's top row
  const LOVE_ROWS = 7;

  // 5x7 block letters, one lit pixel per character cell
  const LOVE_GLYPHS = {
    ' ': ['00000', '00000', '00000', '00000', '00000', '00000', '00000'],
    T: ['11111', '00100', '00100', '00100', '00100', '00100', '00000'],
    t: ['00000', '00100', '01111', '00100', '00100', '01100', '00010'],
    e: ['00000', '01110', '10001', '11111', '10000', '01110', '00000'],
    a: ['00000', '01110', '00001', '01111', '10001', '01111', '00000'],
    m: ['00000', '11011', '10101', '10101', '10101', '10101', '00000'],
    o: ['00000', '01110', '10001', '10001', '10001', '01110', '00000'],
    M: ['10001', '11011', '10101', '10001', '10001', '10001', '00000'],
    r: ['00000', '10110', '11001', '10000', '10000', '10000', '00000'],
    i: ['00100', '00000', '01100', '00100', '00100', '01110', '00000'],
  };

  // flatten the message into the cells that carry a glyph, left to right
  const LOVE_ART = (() => {
    const cells = [];
    let x = 0;
    for (const ch of LOVE_TEXT) {
      const glyph = LOVE_GLYPHS[ch];
      if (!glyph && ch !== ' ') console.warn(`ascii lilies: no 5x7 glyph for "${ch}"`);
      const rows = glyph || LOVE_GLYPHS[' '];
      for (let row = 0; row < LOVE_ROWS; row++) {
        for (let col = 0; col < 5; col++) {
          if (rows[row][col] === '1') cells.push([x + col, row]);
        }
      }
      x += ch === ' ' ? 4 : 6;
    }
    return { cells, w: x - 1 };
  })();

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
    const beat = 1 + 0.04 * heartbeat(T - LOVE_START);
    const s = 134 * pop * beat;
    if (s < 2) return;

    const [x, y] = sway(500, 786);
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

  // screen-space pass: real glyphs on the cell grid, typed in column by column
  function drawNote(sctx) {
    const typed = prog(T, LOVE_START + 0.6, 1.8);
    if (!typed) return;
    const x0 = Math.round(view.ox + 500 * view.sx - LOVE_ART.w / 2);
    const y0 = Math.round(view.oy + LOVE_TOP * view.sy);
    const shown = Math.floor(typed * (LOVE_ART.w + 0.5));

    // knock the bouquet out from under each letter cell so the words stay clean
    sctx.fillStyle = '#000';
    for (const [cx, cy] of LOVE_ART.cells) {
      if (cx < shown) sctx.fillRect((x0 + cx) * cellW, (y0 + cy) * cellH, cellW + 0.5, cellH + 0.5);
    }
    const grad = sctx.createLinearGradient(x0 * cellW, 0, (x0 + LOVE_ART.w) * cellW, 0);
    grad.addColorStop(0, '#fff6f2');
    grad.addColorStop(0.5, '#ffc2d0');
    grad.addColorStop(1, '#ff2d55');
    sctx.save();
    sctx.font = `bold ${fontSize}px ${MONO}`;
    sctx.textBaseline = 'top';
    sctx.fillStyle = grad;
    sctx.shadowColor = 'rgba(255,50,90,0.55)';
    sctx.shadowBlur = fontSize * 0.8;
    for (const [cx, cy] of LOVE_ART.cells) {
      if (cx < shown) sctx.fillText('@', (x0 + cx) * cellW, (y0 + cy) * cellH);
    }
    sctx.restore();
  }

  function drawScene(g, S, pal) {
    drawRuscus(g, S);
    drawGyp(g, S, false);
    for (const st of S.stems) strokeCurve(g, st.pts, 0, stemProgress(st), 9, '#5a9a30');
    for (const lf of S.leaves) drawLeaf(g, lf);
    // closed buds behind, then open flowers in the order they opened
    const sorted = S.buds.slice().sort((a, b) => budState(a).open - budState(b).open || (a.openAt - b.openAt || 0));
    for (const b of sorted) drawBud(g, b, pal);
    drawGyp(g, S, true);
    if (showNote) drawHeart(g);
  }

  // ---------- ascii renderer ----------
  const screen = document.getElementById('screen');
  const sctx = screen.getContext('2d');
  const off = document.createElement('canvas');
  const octx = off.getContext('2d', { willReadFrequently: true });

  let cols = 0, rows = 0, cellW = 0, cellH = 0, fontSize = 0, dpr = 1;
  const view = { ox: 0, oy: 0, sx: 1, sy: 1 };   // world → cell projection, for the note
  const styleCache = new Map();
  function style(r, g, b) {
    const key = (r << 16) | (g << 8) | b;
    let s = styleCache.get(key);
    if (!s) { s = `rgb(${r},${g},${b})`; styleCache.set(key, s); }
    return s;
  }

  function resize() {
    dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = window.innerWidth, h = window.innerHeight;
    fontSize = clamp(Math.floor(Math.min(w / 100, h / 85)), 5, 11);
    sctx.font = `bold ${fontSize}px ${MONO}`;
    cellW = sctx.measureText('M').width || fontSize * 0.6;
    cellH = fontSize;
    screen.width = Math.floor(w * dpr);
    screen.height = Math.floor(h * dpr);
    cols = Math.ceil(w / cellW);
    rows = Math.ceil(h / cellH);
    off.width = cols;
    off.height = rows;
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

    drawScene(octx, S, pal);

    const data = octx.getImageData(0, 0, cols, rows).data;
    sctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    sctx.fillStyle = '#000';
    sctx.fillRect(0, 0, screen.width, screen.height);
    // soft glow of the same image underneath the glyphs, like a CRT bloom
    sctx.save();
    sctx.globalAlpha = 0.42;
    sctx.filter = `blur(${Math.round(cellH * 0.4)}px)`;
    sctx.imageSmoothingEnabled = true;
    sctx.drawImage(off, 0, 0, cols * cellW, rows * cellH);
    sctx.restore();
    sctx.textBaseline = 'top';
    const n = RAMP.length - 1;
    const flick = Math.floor(T * 8);
    for (let y = 0; y < rows; y++) {
      for (let x = 0; x < cols; x++) {
        const i = (y * cols + x) * 4;
        const r = data[i], g = data[i + 1], b = data[i + 2];
        const m = Math.max(r, g, b);
        if (m < 14) continue;
        const v = m / 255;
        // a little shimmer so the glyphs feel alive
        const h = ((x * 73856093) ^ (y * 19349663) ^ (flick * 83492791)) >>> 0;
        const j = h % 7 === 0 ? (h & 8 ? 1 : -1) : 0;
        const idx = clamp(Math.round(Math.pow(v, 0.7) * n) + j, 1, n);
        const k = Math.min(1.25, (40 + 215 * v) / m);
        sctx.fillStyle = style(Math.min(255, (r * k) | 0) & 0xf8, Math.min(255, (g * k) | 0) & 0xf8, Math.min(255, (b * k) | 0) & 0xf8);
        sctx.fillText(RAMP[idx], x * cellW, y * cellH);
      }
    }
    if (showNote) drawNote(sctx);
  }

  // ---------- loop ----------
  const S = buildScene();
  let palette = 0;
  let showNote = true;
  let t0 = performance.now();
  let last = 0;

  function frame(now) {
    requestAnimationFrame(frame);
    if (now - last < 1000 / FPS) return;
    last = now;
    T = (now - t0) / 1000;
    render(S, PALETTES[palette]);
  }

  const replay = () => { t0 = performance.now(); };
  window.addEventListener('resize', resize);
  screen.addEventListener('click', replay);
  window.addEventListener('keydown', (e) => {
    if (e.key === ' ' || e.key === 'r') replay();
    if (e.key === 'p' || e.key === 'c') { palette = (palette + 1) % PALETTES.length; replay(); }
  });

  // ?t=8 starts 8s into the bloom, ?p=1 picks a palette, ?m=0 hides the note
  const q = new URLSearchParams(location.search);
  if (q.has('p')) palette = clamp(+q.get('p') | 0, 0, PALETTES.length - 1);
  if (q.has('t')) t0 = performance.now() - +q.get('t') * 1000;
  if (q.get('m') === '0') showNote = false;

  resize();
  requestAnimationFrame(frame);
})();
