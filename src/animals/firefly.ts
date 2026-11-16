/**
 * Lucioles : de minuscules points qui clignotent et finissent par se synchroniser (modele de
 * Kuramoto). Chacune est une cellule et un halo qui grandit avec l'eclair. Un clic lache du
 * nectar : une tache chaude qui pulse, que les lucioles proches orbitent et vident lentement.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import type { RGB } from "../ink";
import { clamp, rand, TAU } from "../math";
import type { Pen } from "../renderer";

interface Firefly extends Creature {
  /** Phase du clignotement et frequence propre (rad/s). */
  phase: number;
  omega: number;
  /** Graines de la derive sinusoidale. */
  s1: number;
  s2: number;
  /** Teinte : 0 jaune, 1 vert, 2 soleil. */
  hue: number;
  /** Petit rayon d'orbite propre. */
  orbit: number;
}

interface Nectar {
  x: number;
  y: number;
  /** Reserve restante 0 -> 1 et age en secondes. */
  left: number;
  age: number;
}

const DEFAULTS = { ...SHARED_TUNING, sway: 0, spread: 0, density: 1, trail: 0, sparkle: 0 };

const YELLOW: RGB = [255, 214, 102];
const GREEN: RGB = [126, 226, 168];
const SUN: RGB = [255, 176, 103];
const NECTAR: RGB = [255, 150, 80];
const LIFE = 25;
const COUPLING = 1.5;

// Etat partage au niveau du module : nectars et parametre d'ordre de Kuramoto.
let nectars: Nectar[] = [];
let psi = 0;
let order = 0;

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export const firefly: Animal<Firefly> = {
  key: "firefly",
  label: "luciole",
  swatch: [255, 214, 102],
  defaults: DEFAULTS,
  hide: ["shimmer"],
  controls: [],
  area: 9000,
  max: 140,
  scale: 0.4,
  speed: 20,
  trail: { light: [200, 150, 40], dark: [255, 214, 102] },

  create: (c) => ({
    ...c,
    phase: rand(0, TAU),
    omega: rand(1.7, 2.3) * TAU * 0.5,
    s1: rand(0, TAU),
    s2: rand(0, TAU),
    hue: Math.random() < 0.2 ? 1 : Math.random() < 0.2 ? 2 : 0,
    orbit: rand(14, 30),
  }),

  enter(f, flock) {
    f.x = rand(0, flock.width);
    f.y = rand(0, flock.height);
  },

  // Phase moyenne et parametre d'ordre r, une fois par pas.
  prepare(flock, dt) {
    let cx = 0;
    let cy = 0;
    for (const f of flock.creatures) {
      cx += Math.cos(f.phase);
      cy += Math.sin(f.phase);
    }
    const cnt = Math.max(1, flock.creatures.length);
    psi = Math.atan2(cy, cx);
    order = Math.hypot(cx, cy) / cnt;
    for (const n of nectars) n.age += dt;
    nectars = nectars.filter((n) => n.left > 0 && n.age < LIFE);
  },

  update(f, flock, dt) {
    const t = flock.time;
    f.phase += (f.omega + COUPLING * order * Math.sin(psi - f.phase)) * dt;

    // Derive lisse par bruit sinusoidal.
    const a = Math.sin(t * 0.37 + f.s1) * 2 + Math.sin(t * 0.91 + f.s2) + Math.sin(t * 0.17 + f.id);
    const sp = 14 + 10 * Math.sin(t * 0.5 + f.s2);
    let tx = Math.cos(a) * sp;
    let ty = Math.sin(a) * sp;

    // Murs doux.
    const m = 40;
    tx += (clamp((m - f.x) / m, 0, 1) - clamp((f.x - (flock.width - m)) / m, 0, 1)) * 40;
    ty += (clamp((m - f.y) / m, 0, 1) - clamp((f.y - (flock.height - m)) / m, 0, 1)) * 40;

    // Nectar proche : on tourne autour et on le vide.
    let best: Nectar | null = null;
    let bd = 130;
    for (const n of nectars) {
      const d = Math.hypot(n.x - f.x, n.y - f.y);
      if (d < bd) {
        bd = d;
        best = n;
      }
    }
    if (best) {
      const dx = best.x - f.x;
      const dy = best.y - f.y;
      const d = Math.max(1, Math.hypot(dx, dy));
      const pull = (d - f.orbit) * 1.6;
      tx = (dx / d) * pull + (-dy / d) * 40;
      ty = (dy / d) * pull + (dx / d) * 40;
      if (d < f.orbit * 2.2) best.left -= dt * 0.012;
    }

    f.vx += (tx - f.vx) * Math.min(1, dt * 2);
    f.vy += (ty - f.vy) * Math.min(1, dt * 2);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  },

  tap(x, y) {
    nectars.push({ x, y, left: 1, age: 0 });
    if (nectars.length > 6) nectars.shift();
  },

  drawAll(flock: Flock<Firefly>, pen: Pen) {
    drawNectars(pen);
    for (const f of flock.creatures) drawFirefly(f, pen);
  },
};

function drawFirefly(f: Firefly, pen: Pen) {
  const e = Math.pow(Math.max(0, Math.cos(f.phase)), 10);
  const col = f.hue === 1 ? GREEN : f.hue === 2 ? SUN : YELLOW;
  const base = 0.25 + 0.25 * f.depth;
  // Ver luisant eteint : un point tres discret.
  if (e < 0.05) {
    pen.dot(f.x, f.y, "·", scale(col, base), f.depth);
    return;
  }
  pen.spot(f.x, f.y, "●", [255, 250, 225], scale(col, 0.35 + 0.5 * e), f.depth);
  // Halo qui grandit avec l'eclair.
  const r = pen.cw * (0.9 + 2.6 * e);
  const n = e > 0.5 ? 8 : 4;
  for (let i = 0; i < n; i++) {
    const a = (i / n) * TAU + f.s1;
    const ring = i % 2 === 0 ? r : r * 0.6;
    pen.dot(f.x + Math.cos(a) * ring, f.y + Math.sin(a) * ring * 0.7, e > 0.5 ? "+" : "·", scale(col, 0.3 + 0.7 * e), f.depth);
  }
}

function drawNectars(pen: Pen) {
  for (const n of nectars) {
    const fade = clamp((LIFE - n.age) / 4, 0, 1) * (0.4 + 0.6 * n.left);
    const pulse = 0.65 + 0.35 * Math.sin(n.age * 4);
    const r = pen.cw * (1.1 + 1.6 * n.left) * (0.85 + 0.25 * pulse);
    for (let i = 0; i < 14; i++) {
      const a = (i / 14) * TAU + n.age * 0.4;
      const d = i % 2 ? r : r * 0.55;
      const k = fade * (i % 2 ? 0.45 : 0.8) * pulse;
      pen.dot(n.x + Math.cos(a) * d, n.y + Math.sin(a) * d * 0.7, i % 2 ? "·" : "o", scale(NECTAR, k + 0.15), 1);
    }
    pen.spot(n.x, n.y, "●", [255, 220, 170], scale(NECTAR, 0.5 * fade * pulse + 0.25), 1);
  }
}
