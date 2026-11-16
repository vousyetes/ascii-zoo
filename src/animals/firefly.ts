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

const DEFAULTS = { ...SHARED_TUNING, sway: 0, spread: 0, density: 1, trail: 0.7, trailFade: 1.4, sparkle: 0 };

const YELLOW: RGB = [255, 214, 102];
const GREEN: RGB = [126, 226, 168];
const SUN: RGB = [255, 176, 103];
const NECTAR: RGB = [255, 150, 80];
const LIFE = 25;


// Etat partage au niveau du module : nectars et parametre d'ordre de Kuramoto.
let nectars: Nectar[] = [];
let psi = 0;
let order = 0;
let coupling = 1.5;

const scale = (c: RGB, k: number): RGB => [c[0] * k, c[1] * k, c[2] * k];

export const firefly: Animal<Firefly> = {
  key: "firefly",
  label: "luciole",
  swatch: [255, 214, 102],
  defaults: DEFAULTS,
  hide: ["shimmer"],
  controls: [],
  area: 9000,
  max: 130,
  scale: 0.4,
  speed: 20,
  trail: { light: [200, 150, 40], dark: [255, 200, 90] },

  create: (c, flock) => ({
    ...c,
    // Phase en vague spatiale (plus un peu de desordre) : la synchro se voit des le debut.
    phase: rand(0, 1) * 1.2,
    omega: rand(5.4, 7.0),
    s1: rand(0, TAU),
    s2: rand(0, TAU),
    hue: Math.random() < 0.2 ? 1 : Math.random() < 0.25 ? 2 : 0,
    orbit: rand(22, 55),
  }),

  enter(f, flock) {
    f.x = rand(0, flock.width);
    f.y = rand(0, flock.height);
    f.phase = (f.x / flock.width) * 4 + (f.y / flock.height) * 2 + rand(0, 0.8);
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
    // Le couplage respire : synchro de plus en plus forte, puis le desordre reprend.
    coupling = 1.2 + 2.6 * (0.5 + 0.5 * Math.sin(flock.time * 0.13 - 1.2));
    for (const n of nectars) n.age += dt;
    nectars = nectars.filter((n) => n.left > 0 && n.age < LIFE);
  },

  update(f, flock, dt) {
    const t = flock.time;
    f.phase += (f.omega * (1 + 0.04 * Math.sin(t * 0.7 + f.s1)) + coupling * order * Math.sin(psi - f.phase)) * dt;

    // Vol vivant : cap qui serpente, petites boucles, parfois un arret.
    const a = Math.sin(t * 0.37 + f.s1) * 2 + Math.sin(t * 0.91 + f.s2) * 1.2 + Math.sin(t * 0.17 + f.id) * 2;
    const pause = clamp(1.6 - 2.2 * Math.max(0, Math.sin(t * 0.23 + f.s2 * 3)), 0.08, 1);
    const sp = (16 + 14 * Math.sin(t * 0.5 + f.s2)) * pause;
    let tx = Math.cos(a) * sp;
    let ty = Math.sin(a) * sp * 0.8 + Math.sin(t * 1.3 + f.s1) * 9;

    // Murs doux.
    const m = 50;
    tx += (clamp((m - f.x) / m, 0, 1) - clamp((f.x - (flock.width - m)) / m, 0, 1)) * 45;
    ty += (clamp((m - f.y) / m, 0, 1) - clamp((f.y - (flock.height - m)) / m, 0, 1)) * 45;

    // Nectar proche : on tourne autour en cercles et on le vide.
    let best: Nectar | null = null;
    let bd = 170;
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
      const pull = (d - f.orbit) * 2;
      const dir = f.id % 2 ? 1 : -1;
      tx = (dx / d) * pull + (-dy / d) * 55 * dir;
      ty = (dy / d) * pull + (dx / d) * 55 * dir;
      if (d < f.orbit * 1.8) best.left -= dt * 0.01;
    }

    f.vx += (tx - f.vx) * Math.min(1, dt * 2);
    f.vy += (ty - f.vy) * Math.min(1, dt * 2);
    f.x += f.vx * dt;
    f.y += f.vy * dt;
  },

  tap(x, y) {
    nectars.push({ x, y, left: 1, age: 0 });
    if (nectars.length > 5) nectars.shift();
  },

  drawAll(flock: Flock<Firefly>, pen: Pen) {
    for (const n of nectars) drawNectar(n, pen);
    for (const f of flock.creatures) drawFirefly(f, pen);
  },
};

const GLYPH = ["\u00b7", ".", ":", "\u2022"];

/** Disque flou de cellules : plus dense et plus clair au centre, qui s'efface vers le bord. */
function halo(pen: Pen, x: number, y: number, R: number, col: RGB, power: number, depth: number) {
  const ry = Math.ceil(R * 0.8);
  const rx = Math.ceil(R);
  for (let j = -ry; j <= ry; j++) {
    for (let i = -rx; i <= rx; i++) {
      const d = Math.hypot(i, (j * pen.ch) / pen.cw) / R;
      if (d >= 1) continue;
      const k = (1 - d) * (1 - d) * power;
      if (k < 0.1) continue;
      pen.dot(x + i * pen.cw, y + j * pen.ch, GLYPH[Math.min(3, Math.floor((1 - d) * 4))], scale(col, Math.min(1, 0.3 + k)), depth);
    }
  }
}

function drawFirefly(f: Firefly, pen: Pen) {
  const flash = Math.pow(Math.max(0, Math.cos(f.phase)), 10);
  // Un fond de lueur toujours visible (elle ne s'éteint jamais tout à fait), l'éclair par-dessus.
  const e = 0.28 + 0.72 * flash;
  const col = f.hue === 1 ? GREEN : f.hue === 2 ? SUN : YELLOW;
  const bright = 0.55 + 0.45 * f.depth;
  // Traine douce, plus vive pendant l'eclair.
  pen.shed(f.x, f.y, (0.04 + 0.14 * flash) * f.depth);
  halo(pen, f.x, f.y, (1.8 + 3.6 * e) * (0.6 + 0.5 * f.depth), col, 8 * e * bright, f.depth);
  pen.dot(f.x, f.y, "\u25cf", flash > 0.25 ? [255, 244, 200] : scale(col, 0.9), f.depth);
}

function drawNectar(n: Nectar, pen: Pen) {
  const fade = clamp((LIFE - n.age) / 4, 0, 1) * (0.45 + 0.55 * n.left);
  const pulse = 0.7 + 0.3 * Math.sin(n.age * 3.2);
  halo(pen, n.x, n.y, 6.5 * (0.9 + 0.1 * pulse), NECTAR, 1.8 * fade, 1);
  halo(pen, n.x, n.y, (2.6 + 1.2 * n.left) * (0.9 + 0.15 * pulse), [255, 190, 120], 5 * fade * pulse, 1);
  pen.dot(n.x, n.y, "\u25cf", scale([255, 235, 200], fade), 1);
  pen.shed(n.x, n.y, 0.05 * fade);
}
