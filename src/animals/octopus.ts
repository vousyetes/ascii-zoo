/**
 * Poulpe en propulsion par a-coups, comme un nuancier de la marque.
 *
 * Le manteau (ovoide) mene, les yeux sont a sa base, les huit bras traînent derriere.
 * Cycle : contraction (le manteau se resserre, les bras se rassemblent, poussee),
 * puis glissade (les bras se detendent et ondulent, trainee sur la vitesse acquise).
 * Chaque individu a sa couleur dans la palette, sa peau est tachetee de
 * chromatophores qui pulsent. Au clic proche : nuage d'encre violette dans le trail,
 * fuite a toute vitesse a l'oppose, et flash vers une couleur voisine.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, INK_SPOT, ink, type RGB } from "../ink";
import { angleDiff, clamp, frac, hash3, rand, smoothstep, TAU } from "../math";
import type { Pose } from "../renderer";
import { inEllipse, seg, spotted, toSegment } from "./shapes";

export interface Octopus extends Creature {
  /** Phase du cycle de propulsion, radians. */
  phase: number;
  /** 0 detendu -> 1 manteau contracte. */
  squeeze: number;
  /** Position (flottante) dans la palette, 0 soleil -> 4 cyan. */
  hue: number;
  hueTarget: number;
  /** Flash de couleur apres un clic, 1 -> 0. */
  flash: number;
  fleeDir: number;
  /** Fin du nuage d'encre (temps du flock) et son debut. */
  inkFrom: number;
  inkUntil: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  speed: 1,
  sway: 0.04,
  spread: 0.1,
  farthest: 0.35,
  farBias: 1.2,
  grip: 1.6,
  trail: 0.7,
  trailFade: 0.7,
  shimmer: 0.1,
  sparkle: 0.04,
  jetRate: 1,
  jetPower: 1,
  armLength: 1,
  scare: 1,
};

// Palette de la marque : soleil, corail, rose, violet, cyan.
const PALETTE: RGB[] = [
  [255, 176, 103],
  [255, 111, 97],
  [200, 111, 208],
  [138, 116, 255],
  [92, 200, 255],
];
const EYE: RGB = [255, 238, 214];
const PUPIL: RGB = [10, 8, 18];
const WHITE: RGB = [255, 255, 255];

const at = { x: 0, y: 0 };
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

function colorAt(h: number): RGB {
  const i = clamp(Math.floor(h), 0, PALETTE.length - 2);
  return mix(PALETTE[i], PALETTE[i + 1], clamp(h - i, 0, 1));
}

const ARMS = 8;
const SEGS = 9;
/** Points des bras en coordonnees corps, recalcules a chaque dessin : [bras][segment] = [u, v]. */
const armU = new Float32Array(ARMS * (SEGS + 1));
const armV = new Float32Array(ARMS * (SEGS + 1));

export const octopus: Animal<Octopus> = {
  key: "octopus",
  label: "poulpe",
  swatch: [200, 111, 208],
  defaults: DEFAULTS,
  controls: [
    ["Nage", [
      { key: "jetRate", label: "Cadence", min: 0.3, max: 3, step: 0.05, hint: "Frequence des contractions du manteau." },
      { key: "jetPower", label: "Poussee", min: 0.3, max: 3, step: 0.05, hint: "Force de chaque a-coup." },
      { key: "armLength", label: "Longueur des bras", min: 0.4, max: 1.8, step: 0.05, hint: "Longueur des huit tentacules." },
      { key: "scare", label: "Fuite", min: 0, max: 3, step: 0.05, hint: "Vitesse de la fuite et taille du nuage d'encre au clic. 0 le rend insensible." },
    ]],
  ],
  area: 105000,
  scale: 1.7,
  speed: 50,
  trail: { light: [120, 80, 200], dark: [138, 116, 255] },

  create(c) {
    const hue = Math.floor(rand(0, PALETTE.length));
    return { ...c, phase: rand(0, TAU), squeeze: 0, hue, hueTarget: hue, flash: 0, fleeDir: 0, inkFrom: 0, inkUntil: 0 };
  },

  update(o, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const fleeing = flock.time < o.startledUntil;
    o.phase += dt * TAU * 0.55 * k.jetRate * (fleeing ? 3.2 : 0.9 + 0.2 * o.roll);
    const p = frac(o.phase / TAU);
    o.squeeze = p < 0.22 ? smoothstep(0, 0.22, p) : 1 - smoothstep(0.22, 1, p);

    const want = fleeing ? o.fleeDir : flock.heading + o.bias * k.spread;
    const rate = (fleeing ? 6 : 0.7 * k.grip) * dt;
    o.heading += clamp(angleDiff(o.heading, want), -rate, rate);

    o.hue += (o.hueTarget - o.hue) * Math.min(1, dt * 3);
    o.flash = Math.max(0, o.flash - dt * 1.2);
    // Apres le flash, la couleur revient doucement a la sienne si elle a ete changee.
    if (!fleeing && Math.abs(o.hueTarget - Math.round(o.hueTarget)) < 1e-6) o.hueTarget = Math.round(o.hueTarget);

    const cruise = flock.cruise(o);
    const acc = flock.begin();
    const thrust = p < 0.22 ? (fleeing ? 14 : 6) * cruise * k.jetPower : 0;
    acc.x += Math.cos(o.heading) * thrust - o.vx * 1.3;
    acc.y += Math.sin(o.heading) * thrust - o.vy * 1.3;
    flock.separate(o, k.separation, 0.5);
    flock.move(o, dt, cruise * (fleeing ? 6 : 3));
    if (flock.passed(o, o.span * 1.4)) flock.reenter(o);
  },

  startle(o, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.scare <= 0) return;
    o.fleeDir = Math.atan2(dy, dx) + rand(-0.25, 0.25);
    o.startledUntil = flock.time + (0.9 + 1.2 * strength) * Math.sqrt(k.scare);
    const boost = 320 * (0.5 + strength) * k.scare * o.depth;
    o.vx += Math.cos(o.fleeDir) * boost;
    o.vy += Math.sin(o.fleeDir) * boost;
    o.phase = Math.floor(o.phase / TAU) * TAU + TAU; // contraction immediate
    // Flash vers une couleur voisine.
    o.hueTarget = clamp(Math.round(o.hueTarget) + (o.hueTarget >= PALETTE.length - 1 ? -1 : o.hueTarget <= 0 ? 1 : Math.random() < 0.5 ? -1 : 1), 0, PALETTE.length - 1);
    o.flash = 1;
    o.inkFrom = flock.time;
    o.inkUntil = flock.time + 0.5 + 0.5 * strength * k.scare;
  },

  draw(o, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const S = o.span;
    const out = pen.ink;
    const sq = o.squeeze;
    const t = pen.t;
    const pose: Pose = { x: o.x, y: o.y, heading: o.heading, span: S, depth: o.depth, id: o.id };
    const skin = colorAt(o.hue);
    const pale = mix(skin, WHITE, 0.35);
    const pulse = 1 + 0.35 * o.flash;

    // Nuage d'encre : taches sombres violettes laissees dans le trail, qui s'etalent avec le temps.
    if (flock.time < o.inkUntil) {
      const age = (flock.time - o.inkFrom) / Math.max(0.01, o.inkUntil - o.inkFrom);
      for (let i = 0; i < 4; i++) {
        const u = -0.15 - 0.4 * hash3(o.id, i, Math.floor(flock.time * 12));
        const v = (hash3(o.id, i + 9, Math.floor(flock.time * 12)) - 0.5) * (0.3 + 0.8 * age);
        pen.toWorld(pose, u, v, at);
        pen.shed(at.x, at.y, 0.35 * o.depth);
      }
    }

    // Bras : se rassemblent a la contraction, ondulent pendant la glissade.
    const L = 0.5 * k.armLength;
    const spread = 1 - 0.65 * sq;
    for (let n = 0; n < ARMS; n++) {
      const side = (n - (ARMS - 1) / 2) / ((ARMS - 1) / 2);
      for (let i = 0; i <= SEGS; i++) {
        const f = i / SEGS;
        const len = L * (0.8 + 0.3 * hash3(o.id, n, 3)) * (1 - 0.3 * sq);
        armU[n * (SEGS + 1) + i] = -0.06 - f * len;
        armV[n * (SEGS + 1) + i] =
          side * 0.11 * (1 + 0.9 * f) * spread +
          0.07 * (1 - 0.6 * sq) * Math.sin(o.phase * 0.8 - f * 5 + n * 1.1) * f;
      }
    }

    const mA = 0.2 * (1 + 0.12 * sq);
    const mB = 0.17 * (1 - 0.15 * sq);
    const mU = 0.14;
    const eyeV = 0.1;

    pen.shape(pose, 0.8, (u, v) => {
      // Yeux : globe clair avec pupille horizontale (fente le long de v).
      const av = Math.abs(v);
      if (inEllipse(u, av, 0.02, eyeV, 0.06, 0.06)) {
        if (inEllipse(u, av, 0.02, eyeV, 0.016, 0.04)) return ink(out, ...PUPIL, INK_SPOT, "-=");
        return ink(out, ...EYE, INK_SCALE);
      }
      // Manteau.
      if (inEllipse(u, v, mU, 0, mA, mB)) {
        if (spotted(u, v, 0.05, 0.017, o.id)) {
          // Chromatophores : chaque tache pulse a son rythme, certaines claires, d'autres sombres.
          const cu = Math.floor(u / 0.05);
          const cv = Math.floor(v / 0.05);
          const beat = 0.5 + 0.5 * Math.sin(t * (1.2 + 2 * hash3(cu, cv, o.id)) + hash3(cv, cu, 5) * TAU);
          const c = hash3(cu, cv, o.id + 3) > 0.5 ? mix(skin, WHITE, 0.45 * beat) : mix(skin, PUPIL, 0.35 + 0.45 * beat);
          return ink(out, ...c, INK_DARK);
        }
        // Reflet plus clair sur le dessus du manteau.
        return inEllipse(u, v, mU + 0.06, 0, 0.1, 0.09) ? ink(out, ...pale, INK_SCALE) : ink(out, ...skin, INK_SCALE);
      }
      // Tete : relie manteau et bras.
      if (inEllipse(u, v, -0.03, 0, 0.1, 0.15)) return ink(out, ...skin, INK_SCALE);
      // Bras : seulement derriere la tete.
      if (u > -0.02) return false;
      for (let n = 0; n < ARMS; n++) {
        const base = n * (SEGS + 1);
        for (let i = 0; i < SEGS; i++) {
          const a = base + i;
          const w = 0.036 * (1 - 0.8 * ((i + 0.5) / SEGS));
          const d = toSegment(u, v, armU[a], armV[a], armU[a + 1], armV[a + 1]);
          if (d > w) continue;
          // Deux rangees de ventouses : petits cercles INK_SPOT de part et d'autre de l'axe.
          if (i > 1) {
            const along = (seg.t - 0.5) * (0.5 + 0.5 * hash3(i, n, 1));
            const lat = d / w;
            if (lat > 0.35 && lat < 0.95 && Math.abs(along) < 0.28) return ink(out, ...pale, INK_SPOT, "o");
          }
          return ink(out, ...mix(skin, PUPIL, 0.15 + 0.2 * (i / SEGS)), INK_SCALE);
        }
      }
      return false;
    }, { light: (0.95 + 0.1 * sq) * pulse });
  },
};
