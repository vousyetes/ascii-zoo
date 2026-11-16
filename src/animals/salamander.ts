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
import { seg, spotted, toSegment } from "./shapes";

const N = 17;
// Museau rond, tête large, cou étroit, tronc plus large, longue queue qui s'affine.
const RADII = [0.85, 1.22, 0.8, 1.1, 1.26, 1.28, 1.22, 1.1, 0.95, 0.8, 0.64, 0.5, 0.4, 0.3, 0.22, 0.15, 0.1];
/** Espacement entre points (en u) : plus long dans la queue. */
const gap = (i: number) => (i >= 11 ? 1.2 : 0.95);
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
  /** Vitesse lissée (px/s) et son niveau 0..1. */
  spd: number;
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
const spine = new Float32Array(N * 2);

export const salamander: Animal<Salamander> = {
  key: "salamander",
  label: "Salamander",
  swatch: [246, 198, 52],
  defaults: DEFAULTS,
  controls: [],
  area: 125000,
  max: 10,
  scale: 1.3,
  speed: 50,
  trail: { light: [120, 110, 70], dark: [150, 140, 90] },

  create: (c, flock) => ({
    ...c,
    nodes: new Float32Array(N * 2),
    pattern: Math.floor(hash3(c.id, 5, 9) * PATTERNS.length),
    size: rand(0.9, 1.22),
    gait: rand(0, TAU),
    spd: 0,
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
    let acc = 0;
    for (let k = 0; k < N; k++) {
      f.nodes[k * 2] = f.x - Math.cos(f.heading) * acc;
      f.nodes[k * 2 + 1] = f.y - Math.sin(f.heading) * acc;
      acc += gap(k + 1) * unitOf(f);
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
        turnMax = 3.5;
        f.sprintUntil -= dt;
        if (f.sprintUntil <= 0) {
          f.sprint = !f.sprint;
          f.sprintUntil = f.sprint ? rand(0.2, 0.45) : rand(0.1, 0.5);
        }
        if (f.sprint) speed = (4 + 7 * smoothstep(2 * u, 12 * u, bd)) * u;
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
    // Vitesse lissée : monte et descend en douceur, jamais de saut.
    f.spd += (speed - f.spd) * Math.min(1, dt * 5);
    if (f.spd < 0.5) f.spd = 0;
    const dist = f.spd * dt;
    // Ondulation latérale, liée à la distance parcourue.
    f.gait += (dist / u) * 0.5;
    f.x = clamp(f.x + Math.cos(f.heading) * dist, 4, W - 4);
    f.y = clamp(f.y + Math.sin(f.heading) * dist, 4, H - 4);
    f.vx = Math.cos(f.heading) * f.spd;
    f.vy = Math.sin(f.heading) * f.spd;
    // Suivi du chef avec limite de raideur : 22 degrés max entre deux segments.
    n[0] = f.x;
    n[1] = f.y;
    let prev = f.heading + Math.PI;
    for (let i = 1; i < N; i++) {
      let a = Math.atan2(n[i * 2 + 1] - n[i * 2 - 1], n[i * 2] - n[i * 2 - 2]);
      a = prev + clamp(angleDiff(prev, a), -0.38, 0.38);
      n[i * 2] = n[i * 2 - 2] + Math.cos(a) * gap(i) * u;
      n[i * 2 + 1] = n[i * 2 - 1] + Math.sin(a) * gap(i) * u;
      prev = a;
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
  const u = unitOf(f);
  const pat = f.pattern;
  // Colonne rendue : la chaîne plus une ondulation en S qui voyage de la tête vers la queue.
  const n = spine;
  const mv = Math.min(1, f.spd / (6 * u));
  const phase = f.gait * 2;
  for (let i = 0; i < N; i++) {
    const a = Math.max(0, i - 1);
    const b = Math.min(N - 1, i + 1);
    let tx = f.nodes[a * 2] - f.nodes[b * 2];
    let ty = f.nodes[a * 2 + 1] - f.nodes[b * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    tx /= l;
    ty /= l;
    const off = u * mv * (0.35 + 0.07 * i) * Math.sin(phase - i * 0.55);
    n[i * 2] = f.nodes[i * 2] - ty * off;
    n[i * 2 + 1] = f.nodes[i * 2 + 1] + tx * off;
  }
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
  let along = 0;
  const pos0 = new Float32Array(N);
  for (let i = 0; i < N - 1; i++) {
    pos0[i] = along;
    along += gap(i + 1);
    add(n[i * 2], n[i * 2 + 1], n[i * 2 + 2], n[i * 2 + 3], RADII[i] * u, RADII[i + 1] * u, 0, i);
  }
  const nBody = nc;
  const frame = (i: number) => {
    const a = Math.max(0, i - 1);
    const b = Math.min(N - 1, i + 1);
    let tx = n[a * 2] - n[b * 2];
    let ty = n[a * 2 + 1] - n[b * 2 + 1];
    const l = Math.hypot(tx, ty) || 1;
    return [tx / l, ty / l] as const;
  };
  // Quatre pattes aux points 3 et 8, avec coude, en diagonale, en phase avec l'ondulation.
  for (const [pair, i] of [[0, 3], [1, 8]] as const) {
    const [tx, ty] = frame(i);
    for (const side of [-1, 1]) {
      const nx = -ty * side;
      const ny = tx * side;
      const ph = phase + (side > 0 ? 0 : Math.PI) + pair * Math.PI;
      const sw = Math.sin(ph) * mv;
      const lift = Math.max(0, Math.cos(ph)) * mv;
      const hx = n[i * 2] + nx * RADII[i] * u * 0.6;
      const hy = n[i * 2 + 1] + ny * RADII[i] * u * 0.6;
      // Coude vers l'extérieur et un peu vers l'arrière, pied vers l'avant ou posé.
      const kx = hx + nx * 1.7 * u - tx * 0.3 * u + tx * sw * 0.6 * u;
      const ky = hy + ny * 1.7 * u - ty * 0.3 * u + ty * sw * 0.6 * u;
      const out = (1.3 - 0.5 * lift) * u;
      const fx = kx + nx * out * 0.6 + tx * (sw * 1.5 + 0.9) * u;
      const fy = ky + ny * out * 0.6 + ty * (sw * 1.5 + 0.9) * u;
      add(hx, hy, kx, ky, 0.5 * u, 0.42 * u, 1, 0);
      add(kx, ky, fx, fy, 0.4 * u, 0.62 * u, 1, 0);
    }
  }
  // Axolotl : trois branchies plumeuses de chaque côté, longues, qui ondulent.
  if (pat === 0) {
    const [tx, ty] = frame(1);
    for (const side of [-1, 1]) {
      const nx = -ty * side;
      const ny = tx * side;
      for (let g = 0; g < 3; g++) {
        const a = 0.35 + g * 0.5 + Math.sin(time * 4 + g * 1.3 + side) * 0.2;
        const bx0 = n[2] + nx * 1.0 * u;
        const by0 = n[3] + ny * 1.0 * u;
        const dx = nx * Math.cos(a) * 0.9 - tx * Math.sin(a);
        const dy = ny * Math.cos(a) * 0.9 - ty * Math.sin(a);
        const mx = bx0 + dx * 1.8 * u;
        const my = by0 + dy * 1.8 * u;
        add(bx0, by0, mx, my, 0.4 * u, 0.3 * u, 2, 0);
        add(mx, my, mx + dx * 2 * u + nx * 0.4 * u * Math.sin(time * 5 + g), my + dy * 2 * u, 0.3 * u, 0.12 * u, 2, 0);
      }
    }
  }
  // Langue : capsule rose qui part au grillon et revient.
  if (f.tongue >= 0 && f.prey) {
    const p = f.tongue < 0.13 ? f.tongue / 0.13 : Math.max(0, 2 - f.tongue / 0.13);
    add(n[0], n[1], n[0] + (f.preyX - n[0]) * p, n[1] + (f.preyY - n[1]) * p, 0.35 * u, 0.3 * u, 3, 0);
  }

  const mid = 8;
  const R = 15 * u;
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
        const i = caps[b + 7];
        pos = pos0[i] + seg.t * gap(i + 1);
        const cr = (caps[b + 2] - ax) * (py - ay) - (caps[b + 3] - ay) * (px - ax);
        lat = (cr >= 0 ? d : -d) / u;
      }
    }
    if (best < 1) {
      o.au = pos / 15;
      o.av = lat / 2;
      // Dos plus clair, flancs plus sombres.
      const k = 1.12 - 0.42 * best;
      let col = base;
      let dark = false;
      const s = pos / 14.4;
      switch (pat) {
        case 0:
          if (spotted(pos, lat, 2.2, 0.45, f.seed)) col = [255, 228, 234];
          break;
        case 1:
          if (spotted(pos, lat, 3.4, 1.0, f.seed)) col = [246, 198, 52];
          break;
        case 2:
          if (spotted(pos, lat, 2.6, 0.62, f.seed)) {
            col = [92, 54, 28];
            dark = true;
          }
          break;
        case 3:
          if (best < 0.22) col = [255, 206, 100];
          else if (spotted(pos, lat, 2.6, 0.55, f.seed)) col = [214, 52, 36];
          break;
        case 4: {
          if (best > 0.42 && best < 0.72) col = [244, 230, 190];
          if (s > 0.5) {
            const q = smoothstep(0.5, 0.9, s);
            col = [col[0] + (76 - col[0]) * q, col[1] + (162 - col[1]) * q, col[2] + (255 - col[2]) * q];
          }
          break;
        }
        default:
          if (spotted(pos, lat, 2.4, 0.4, f.seed)) col = [210, 244, 210];
      }
      return ink(o, col[0] * k, col[1] * k, col[2] * k, dark ? INK_DARK : INK_SCALE);
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
      return ink(o, base[0] * 0.85, base[1] * 0.85, base[2] * 0.85);
    }
    return false;
  });

  // Yeux nets : cellule claire avec un point sombre, de chaque côté de la tête.
  const [tx, ty] = frame(1);
  const white: RGB = pat === 1 ? [250, 214, 90] : [246, 244, 232];
  for (const side of [-1, 1]) {
    pen.spot(n[2] + tx * 0.25 * u - ty * side * 0.85 * u, n[3] + ty * 0.25 * u + tx * side * 0.85 * u, "\u25cf", [10, 8, 12], white, f.depth);
  }
  pen.shed(n[(N - 1) * 2], n[(N - 1) * 2 + 1], 0.01 * f.depth);
}
