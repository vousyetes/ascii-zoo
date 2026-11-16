/**
 * Salamandres : petites bêtes fines qui marchent chacune seule (pas de troupeau).
 *
 * Corps = chaîne de 17 points (follow-the-leader) dessinée en capsules dans un seul
 * pen.shape par bête, avec boîtes englobantes précalculées pour rester rapide.
 * 6 motifs (axolotl, feu, gecko, triton, scinque, émeraude). Un clic lâche des
 * grillons : les salamandres les traquent (sprint / gel) puis coup de langue.
 * L'état partagé (grillons, ondes) vit au niveau du module.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import type { Pen } from "../renderer";
import { INK_DARK, INK_SCALE, ink } from "../ink";
import { angleDiff, clamp, hash3, rand, smoothstep, TAU } from "../math";
import { seg, toSegment } from "./shapes";

const N = 17;
const RADII = [0.9, 1.05, 0.78, 1.1, 1.22, 1.25, 1.22, 1.12, 0.98, 0.82, 0.68, 0.56, 0.46, 0.37, 0.3, 0.24, 0.2];
type RGB = [number, number, number];

const PATTERNS = ["axolotl", "feu", "gecko", "triton", "scinque", "emeraude"] as const;
const BASE: RGB[] = [[244, 168, 190], [70, 74, 90], [236, 198, 108], [242, 128, 58], [128, 82, 52], [104, 198, 122]];

interface Salamander extends Creature {
  /** Chaîne, tête d'abord : [x0, y0, x1, y1, ...]. */
  nodes: Float32Array;
  pattern: number;
  /** Taille aléatoire 0.9 à 1.22. */
  size: number;
  gait: number;
  /** "walk" | "pause" | "hunt", et temps restant. */
  mode: number;
  until: number;
  /** Virage de promenade (rad/s). */
  wander: number;
  seed: number;
  /** Phase sprint/gel pendant la traque. */
  sprint: boolean;
  sprintUntil: number;
  /** Langue : progression en s (< 0 = rangée), grillon visé. */
  tongue: number;
  prey: Cricket | null;
  preyX: number;
  preyY: number;
}

interface Cricket {
  x: number;
  y: number;
  fx: number;
  fy: number;
  tx: number;
  ty: number;
  /** Progression du saut 0..1 (>= 1 : posé), durée, délai avant le prochain. */
  p: number;
  dur: number;
  wait: number;
  dead: boolean;
}
interface Wave {
  x: number;
  y: number;
  born: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  fog: 0.1,
  density: 1,
  speed: 1,
  sway: 0,
  spread: 0,
  crossflow: 0,
  farthest: 0.72,
  farBias: 1,
  grip: 2,
  separation: 0,
  trail: 0.6,
  trailFade: 0.4,
  shimmer: 0.08,
  sparkle: 0.02,
};

// État partagé au niveau du module : grillons et ondes du clic.
let crickets: Cricket[] = [];
let waves: Wave[] = [];
let lastTime = 0;

const CRICKET: RGB = [190, 240, 80];
const TONGUE: RGB = [255, 112, 150];
const GILL: RGB = [236, 96, 120];
const unitOf = (f: Salamander) => f.span * 0.055 * f.size;

// Capsules du frame : ax, ay, bx, by, ra, rb, kind (0 corps, 1 patte, 2 branchie, 3 langue), idx, boîte x0 x1 y0 y1.
const STRIDE = 12;
const caps = new Float32Array(48 * STRIDE);

export const salamander: Animal<Salamander> = {
  key: "salamander",
  label: "salamandre",
  swatch: [246, 198, 52],
  defaults: DEFAULTS,
  controls: [],
  area: 100000,
  max: 14,
  scale: 1,
  speed: 50,
  trail: { light: [120, 110, 70], dark: [150, 140, 90] },

  create: (c, flock) => ({
    ...c,
    nodes: new Float32Array(N * 2),
    pattern: Math.floor(hash3(c.id, 5, 9) * PATTERNS.length),
    size: rand(0.9, 1.22),
    gait: rand(0, TAU),
    mode: 1,
    until: rand(0.2, 1),
    wander: 0,
    seed: Math.floor(rand(0, 1000)),
    sprint: true,
    sprintUntil: 0,
    tongue: -1,
    prey: null,
    preyX: 0,
    preyY: 0,
    heading: rand(0, TAU),
    x: rand(40, flock.width - 40),
    y: rand(40, flock.height - 40),
  }),

  enter(f, flock) {
    // On les répartit au hasard sur l'écran, chaîne tendue derrière la tête.
    f.x = rand(40, flock.width - 40);
    f.y = rand(40, flock.height - 40);
    f.heading = rand(0, TAU);
    const sp = 0.9 * unitOf(f);
    for (let k = 0; k < N; k++) {
      f.nodes[k * 2] = f.x - Math.cos(f.heading) * sp * k;
      f.nodes[k * 2 + 1] = f.y - Math.sin(f.heading) * sp * k;
    }
  },

  /** Grillons : sauts en petit arc, plus vifs quand une tête approche. */
  prepare(flock, dt) {
    if (flock.time < lastTime) {
      crickets = [];
      waves = [];
    }
    lastTime = flock.time;
    const W = flock.width;
    const H = flock.height;
    for (const c of crickets) {
      if (c.p < 1) {
        c.p = Math.min(1, c.p + dt / c.dur);
        c.x = c.fx + (c.tx - c.fx) * c.p;
        c.y = c.fy + (c.ty - c.fy) * c.p;
        continue;
      }
      c.wait -= dt;
      let near: Salamander | null = null;
      for (const f of flock.creatures) if (Math.hypot(f.x - c.x, f.y - c.y) < 80) near = f;
      if (c.wait > 0 && !near) continue;
      const a = near ? Math.atan2(c.y - near.y, c.x - near.x) + rand(-0.6, 0.6) : rand(0, TAU);
      const d = rand(18, 40);
      c.fx = c.x;
      c.fy = c.y;
      c.tx = clamp(c.x + Math.cos(a) * d, 12, W - 12);
      c.ty = clamp(c.y + Math.sin(a) * d, 12, H - 12);
      c.p = 0;
      c.dur = near ? 0.22 : 0.35;
      c.wait = near ? rand(0.15, 0.5) : rand(0.6, 2.2);
    }
    crickets = crickets.filter((c) => !c.dead);
    waves = waves.filter((w) => flock.time - w.born < 0.8);
  },

  /** Clic : 6 ou 7 grillons et une onde. */
  tap(x, y, flock) {
    const n = 6 + Math.floor(Math.random() * 2);
    for (let i = 0; i < n; i++) {
      const a = rand(0, TAU);
      const r = 36 * Math.sqrt(Math.random());
      const cx = clamp(x + Math.cos(a) * r, 12, flock.width - 12);
      const cy = clamp(y + Math.sin(a) * r, 12, flock.height - 12);
      crickets.push({ x: cx, y: cy, fx: cx, fy: cy, tx: cx, ty: cy, p: 1, dur: 0.35, wait: rand(0.1, 1.2), dead: false });
    }
    if (crickets.length > 40) crickets.splice(0, crickets.length - 40);
    waves.push({ x, y, born: flock.time });
  },

  update(f, flock, dt) {
    const u = unitOf(f);
    const W = flock.width;
    const H = flock.height;
    const n = f.nodes;
    let speed = 0;
    let want = f.heading;
    let turnMax = 2.2;
    // Langue en cours : on ne bouge plus.
    if (f.tongue >= 0) {
      f.tongue += dt;
      const c = f.prey;
      if (c) {
        const hx = n[0];
        const hy = n[1];
        const p = f.tongue < 0.13 ? f.tongue / 0.13 : 2 - f.tongue / 0.13;
        if (f.tongue >= 0.13) {
          c.x = hx + (f.preyX - hx) * Math.max(0, p);
          c.y = hy + (f.preyY - hy) * Math.max(0, p);
        }
      }
      if (f.tongue >= 0.26) {
        if (c) c.dead = true;
        f.tongue = -1;
        f.prey = null;
        f.mode = 1;
        f.until = rand(0.3, 0.6);
      }
    } else {
      // Grillon le plus proche ?
      let best: Cricket | null = null;
      let bd = Infinity;
      for (const c of crickets) {
        if (c.dead) continue;
        const d = Math.hypot(c.x - f.x, c.y - f.y);
        if (d < bd) {
          bd = d;
          best = c;
        }
      }
      if (best) {
        f.mode = 2;
        const aim = Math.atan2(best.y - f.y, best.x - f.x);
        const off = angleDiff(f.heading, aim);
        want = aim;
        turnMax = 6;
        f.sprintUntil -= dt;
        if (f.sprintUntil <= 0) {
          f.sprint = !f.sprint;
          f.sprintUntil = f.sprint ? rand(0.2, 0.45) : rand(0.1, 0.5);
        }
        if (f.sprint) speed = 11 * u * smoothstep(0, 9 * u, bd) * 0.65 + 4 * u;
        if (bd < 4.6 * u && Math.abs(off) < 0.5) {
          f.tongue = 0;
          f.prey = best;
          f.preyX = best.x;
          f.preyY = best.y;
          f.heading = aim;
        }
      } else {
        if (f.mode === 2) {
          f.mode = 1;
          f.until = 0.4;
        }
        f.until -= dt;
        if (f.until <= 0) {
          f.mode = f.mode === 0 ? 1 : 0;
          f.until = f.mode === 0 ? rand(0.7, 2.9) : rand(0.35, 1.5);
          f.wander = rand(-1.2, 1.2);
        }
        if (f.mode === 0) speed = 9 * u;
        else f.heading += Math.sin(flock.time * 2.6 + f.seed) * 0.35 * dt;
        want = f.heading + f.wander * dt * 4;
        // Murs doux : on revient vers le centre près des bords.
        const m = 70;
        const pen = Math.max(0, m - f.x, f.x - (W - m), m - f.y, f.y - (H - m)) / m;
        if (pen > 0) {
          const c = Math.atan2(H / 2 - f.y, W / 2 - f.x);
          want += angleDiff(f.heading, c) * clamp(pen, 0, 1);
        }
      }
      const turn = turnMax * dt;
      f.heading += clamp(angleDiff(f.heading, want), -turn, turn);
    }
    const dist = speed * dt;
    // Ondulation latérale, liée à la distance parcourue.
    f.gait += (dist / u) * 0.5;
    f.heading += Math.sin(f.gait) * 0.42 * (dist / u) * 0.35;
    f.x = clamp(f.x + Math.cos(f.heading) * dist, 4, W - 4);
    f.y = clamp(f.y + Math.sin(f.heading) * dist, 4, H - 4);
    f.vx = Math.cos(f.heading) * speed;
    f.vy = Math.sin(f.heading) * speed;
    // Suivi du chef : chaque point reste à 0.9 u derrière le précédent.
    n[0] = f.x;
    n[1] = f.y;
    const sp = 0.9 * u;
    for (let i = 1; i < N; i++) {
      let dx = n[i * 2] - n[i * 2 - 2];
      let dy = n[i * 2 + 1] - n[i * 2 - 1];
      const l = Math.hypot(dx, dy) || 1;
      dx /= l;
      dy /= l;
      n[i * 2] = n[i * 2 - 2] + dx * sp;
      n[i * 2 + 1] = n[i * 2 - 1] + dy * sp;
    }
  },

  drawAll(flock, pen) {
    for (const f of flock.creatures) drawSal(f, pen, flock.time);
    const t = flock.time;
    for (const c of crickets) {
      const arc = c.p < 1 ? Math.sin(Math.PI * c.p) * 9 : 0;
      const back = c.p < 1 ? 1 : 0.3;
      const a = Math.atan2(c.ty - c.fy, c.tx - c.fx);
      pen.spot(c.x - Math.cos(a) * pen.cw * back, c.y - Math.sin(a) * pen.cw * back + 1, ".", CRICKET, [60, 90, 20], 0.8);
      pen.spot(c.x, c.y - arc, "x", [10, 20, 0], CRICKET, 1);
    }
    for (const w of waves) {
      const p = (t - w.born) / 0.8;
      const r = 8 * pen.cw * (1 - (1 - p) ** 2);
      const k = Math.max(10, Math.round((TAU * r) / pen.cw));
      for (let i = 0; i < k; i++) {
        const a = (i / k) * TAU;
        pen.spot(w.x + Math.cos(a) * r, w.y + Math.sin(a) * r, "o", [190, 240, 120], [20, 40, 20], 1 - p);
      }
    }
  },
};

function drawSal(f: Salamander, pen: Pen, time: number) {
  const n = f.nodes;
  const u = unitOf(f);
  const pat = f.pattern;
  let nc = 0;
  const add = (ax: number, ay: number, bx: number, by: number, ra: number, rb: number, kind: number, idx: number) => {
    const o = nc * STRIDE;
    caps[o] = ax;
    caps[o + 1] = ay;
    caps[o + 2] = bx;
    caps[o + 3] = by;
    caps[o + 4] = ra;
    caps[o + 5] = rb;
    caps[o + 6] = kind;
    caps[o + 7] = idx;
    const r = Math.max(ra, rb) + 1;
    caps[o + 8] = Math.min(ax, bx) - r;
    caps[o + 9] = Math.max(ax, bx) + r;
    caps[o + 10] = Math.min(ay, by) - r;
    caps[o + 11] = Math.max(ay, by) + r;
    nc++;
  };
  for (let i = 0; i < N - 1; i++) add(n[i * 2], n[i * 2 + 1], n[i * 2 + 2], n[i * 2 + 3], RADII[i] * u, RADII[i + 1] * u, 0, i);
  const nBody = nc;

  // Direction locale (vers la tête) et normale en un point de la chaîne.
  const frame = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(N - 1, i + 1);
    let tx = n[a * 2] - n[b * 2];
    let ty = n[a * 2 + 1] - n[b * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    return [tx, ty] as const;
  };
  // Pattes aux points 3 et 8 : cuisse + jambe finissant par un pied plus large, allure en diagonale.
  for (const [pair, i] of [[0, 3], [1, 8]] as const) {
    const [tx, ty] = frame(i);
    for (const side of [-1, 1]) {
      const nx = -ty * side;
      const ny = tx * side;
      const sw = Math.sin(f.gait * 2 + (side > 0 ? 0 : Math.PI) + pair * Math.PI);
      const hx = n[i * 2] + nx * RADII[i] * u * 0.7;
      const hy = n[i * 2 + 1] + ny * RADII[i] * u * 0.7;
      const kx = hx + nx * 1.4 * u + tx * sw * 1.1 * u;
      const ky = hy + ny * 1.4 * u + ty * sw * 1.1 * u;
      const fx = kx + nx * 0.4 * u + tx * (sw * 0.9 + 0.5) * u;
      const fy = ky + ny * 0.4 * u + ty * (sw * 0.9 + 0.5) * u;
      add(hx, hy, kx, ky, 0.45 * u, 0.4 * u, 1, 0);
      add(kx, ky, fx, fy, 0.38 * u, 0.55 * u, 1, 0);
    }
  }
  // Axolotl : 3 branchies de chaque côté de la tête, qui ondulent.
  if (pat === 0) {
    const [tx, ty] = frame(1);
    for (const side of [-1, 1]) {
      const nx = -ty * side;
      const ny = tx * side;
      for (let g = 0; g < 3; g++) {
        const a = 0.5 + g * 0.55 + Math.sin(time * 4 + g * 1.3 + side) * 0.18;
        const bx0 = n[2] + nx * 0.8 * u;
        const by0 = n[3] + ny * 0.8 * u;
        const dx = nx * Math.sin(a) - tx * Math.cos(a) * 0.6;
        const dy = ny * Math.sin(a) - ty * Math.cos(a) * 0.6;
        add(bx0, by0, bx0 + dx * 2.8 * u, by0 + dy * 2.8 * u, 0.35 * u, 0.2 * u, 2, 0);
      }
    }
  }
  // Langue : capsule rose qui part au grillon et revient.
  if (f.tongue >= 0 && f.prey) {
    const p = f.tongue < 0.13 ? f.tongue / 0.13 : Math.max(0, 2 - f.tongue / 0.13);
    add(n[0], n[1], n[0] + (f.preyX - n[0]) * p, n[1] + (f.preyY - n[1]) * p, 0.35 * u, 0.3 * u, 3, 0);
  }

  const mid = 8;
  const R = 14 * u;
  const pose = { x: n[mid * 2], y: n[mid * 2 + 1], heading: f.heading, span: f.span, depth: f.depth, id: f.id };
  const base = BASE[pat];
  const o = pen.ink;

  pen.shape(pose, R / f.span, (_u, _v, px, py) => {
    // Corps : la capsule dont on est le plus profondément dedans.
    let best = 1;
    let pos = 0;
    let lat = 0;
    for (let c = 0; c < nBody; c++) {
      const b = c * STRIDE;
      if (px < caps[b + 8] || px > caps[b + 9] || py < caps[b + 10] || py > caps[b + 11]) continue;
      const ax = caps[b];
      const ay = caps[b + 1];
      const d = toSegment(px, py, ax, ay, caps[b + 2], caps[b + 3]);
      const r = caps[b + 4] + (caps[b + 5] - caps[b + 4]) * seg.t;
      if (d / r < best) {
        best = d / r;
        pos = (caps[b + 7] + seg.t) * 0.9;
        const cr = (caps[b + 2] - ax) * (py - ay) - (caps[b + 3] - ay) * (px - ax);
        lat = (cr >= 0 ? d : -d) / u;
      }
    }
    if (best < 1) {
      o.au = pos / 15;
      o.av = lat / 2;
      const flank = 1 - 0.3 * Math.min(1, Math.abs(best));
      const h = hash3(Math.floor(pos * 1.15 + f.seed), Math.round(lat * 1.6), f.seed);
      let col = base;
      let dark = false;
      const s = pos / 14.4;
      switch (pat) {
        case 0:
          if (h > 0.86) col = [255, 226, 232];
          break;
        case 1:
          if (hash3(Math.floor(pos * 0.7 + f.seed), Math.round(lat * 0.9), f.seed) > 0.68) col = [246, 198, 52];
          break;
        case 2:
          if (h > 0.78) {
            col = [96, 58, 30];
            dark = true;
          }
          break;
        case 3:
          if (Math.abs(lat) < 0.55) col = [255, 200, 90];
          else if (h > 0.8) col = [222, 60, 40];
          break;
        case 4: {
          const al = Math.abs(lat);
          if (al > 0.55 && al < 1.05) col = [240, 226, 190];
          if (s > 0.55) {
            const k = smoothstep(0.55, 0.95, s);
            col = [col[0] + (76 - col[0]) * k, col[1] + (162 - col[1]) * k, col[2] + (255 - col[2]) * k];
          }
          break;
        }
        default:
          if (h > 0.86) col = [205, 242, 205];
      }
      return ink(o, col[0] * flank, col[1] * flank, col[2] * flank, dark ? INK_DARK : INK_SCALE);
    }
    for (let c = nBody; c < nc; c++) {
      const b = c * STRIDE;
      if (px < caps[b + 8] || px > caps[b + 9] || py < caps[b + 10] || py > caps[b + 11]) continue;
      const d = toSegment(px, py, caps[b], caps[b + 1], caps[b + 2], caps[b + 3]);
      if (d >= caps[b + 4] + (caps[b + 5] - caps[b + 4]) * seg.t) continue;
      o.au = 0.5;
      o.av = 0.5;
      const kind = caps[b + 6];
      if (kind === 3) return ink(o, ...TONGUE);
      if (kind === 2) return ink(o, ...GILL);
      return ink(o, base[0] * 0.8, base[1] * 0.8, base[2] * 0.8);
    }
    return false;
  });

  // Yeux : deux cases d'accent sur les côtés de la tête.
  const [tx, ty] = frame(0);
  const eye: RGB = pat === 1 ? [246, 198, 52] : [250, 246, 230];
  for (const side of [-1, 1]) {
    pen.spot(n[0] + tx * 0.1 * u - ty * side * 0.65 * u, n[1] + ty * 0.1 * u + tx * side * 0.65 * u, "o", eye, [14, 12, 16], f.depth);
  }
  pen.shed(n[(N - 1) * 2], n[(N - 1) * 2 + 1], 0.01 * f.depth);
}
