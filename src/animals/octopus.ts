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
  density: 1.2,
  detail: 1.6,
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

const ARMS = 10;
const SEGS = 14;
/** Points des bras en coordonnees corps, recalcules a chaque dessin : [bras][segment] = [u, v]. */
const armU = new Float32Array(ARMS * (SEGS + 1));
const armV = new Float32Array(ARMS * (SEGS + 1));
/** Boite englobante de chaque bras : evite de tester ses segments pour la plupart des cellules. */
const box = new Float32Array(ARMS * 4);

export const octopus: Animal<Octopus> = {
  key: "octopus",
  label: "Squid",
  swatch: [200, 111, 208],
  defaults: DEFAULTS,
  controls: [
    ["Swim", [
      { key: "jetRate", label: "Pulse rate", min: 0.3, max: 3, step: 0.05, hint: "How often the mantle contracts." },
      { key: "jetPower", label: "Thrust", min: 0.3, max: 3, step: 0.05, hint: "How strong each jet is." },
      { key: "armLength", label: "Arm length", min: 0.4, max: 1.8, step: 0.05, hint: "Length of the tentacles." },
      { key: "scare", label: "Flee", min: 0, max: 3, step: 0.05, hint: "Flee speed and ink cloud size on click. 0 makes it unresponsive." },
    ]],
  ],
  area: 70000,
  scale: 1.3,
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
      for (let i = 0; i < 8; i++) {
        const u = -0.15 - 0.4 * hash3(o.id, i, Math.floor(flock.time * 12));
        const v = (hash3(o.id, i + 9, Math.floor(flock.time * 12)) - 0.5) * (0.3 + 0.8 * age);
        pen.toWorld(pose, u, v, at);
        pen.shed(at.x, at.y, 0.7 * o.depth);
      }
    }

    // Bras : 8 fins + 2 tentacules longs (indices 3 et 6, a clavette), en eventail etroit.
    // Ils se rassemblent a la contraction et ondulent pendant la glissade.
    const L = 0.55 * k.armLength;
    const spread = 1 - 0.75 * sq;
    for (let n = 0; n < ARMS; n++) {
      const tent = n === 3 || n === 6;
      const side = (n - (ARMS - 1) / 2) / ((ARMS - 1) / 2);
      const len = L * (tent ? 1.5 : 0.8 + 0.2 * hash3(o.id, n, 3)) * (1 - 0.3 * sq);
      for (let i = 0; i <= SEGS; i++) {
        const f = i / SEGS;
        armU[n * (SEGS + 1) + i] = -0.1 - f * len;
        armV[n * (SEGS + 1) + i] =
          side * 0.06 * (1 + 1.6 * f) * spread +
          0.05 * (1 - 0.6 * sq) * Math.sin(o.phase * 0.8 - f * 5 + n * 0.7) * f;
      }
      let u0 = 9, u1 = -9, v0 = 9, v1 = -9;
      for (let i = 0; i <= SEGS; i++) {
        const a = n * (SEGS + 1) + i;
        if (armU[a] < u0) u0 = armU[a];
        if (armU[a] > u1) u1 = armU[a];
        if (armV[a] < v0) v0 = armV[a];
        if (armV[a] > v1) v1 = armV[a];
      }
      box[n * 4] = u0 - 0.05;
      box[n * 4 + 1] = u1 + 0.05;
      box[n * 4 + 2] = v0 - 0.05;
      box[n * 4 + 3] = v1 + 0.05;
    }

    const sqz = 1 - 0.2 * sq; // le manteau s'amincit a la contraction
    const eyeU = -0.05;
    const eyeV = 0.075;

    pen.shape(pose, 0.8, (u, v) => {
      const av = Math.abs(v);
      // Yeux : gros anneau clair, pupille sombre ronde.
      if (inEllipse(u, av, eyeU, eyeV, 0.055, 0.055)) {
        if (inEllipse(u, av, eyeU + 0.008, eyeV, 0.028, 0.028)) return ink(out, ...PUPIL, INK_SPOT, "@");
        return ink(out, ...EYE, INK_SCALE);
      }
      // Degrade : dessus sombre saturé (v<0), dessous plus clair (v>0), meme teinte.
      const shade = (w: number) => mix(mix(skin, PUPIL, 0.28), pale, smoothstep(-1, 1, w));
      // Manteau en torpille : goutte allongee, large pres de la tete, pointue vers l'avant.
      if (u > -0.03 && u < 0.38) {
        const f = (u + 0.03) / 0.41;
        const hw = 0.11 * sqz * Math.pow(Math.sin(Math.min(1, f * 1.15 + 0.12) * Math.PI * 0.5 + 0.0), 0.7) * (1 - Math.pow(f, 2.2) * 0.95);
        // Nageoires triangulaires pres de la pointe.
        const fu = (u - 0.24) / 0.14;
        if (fu > 0 && fu < 1 && av < 0.17 * (1 - fu) * (0.5 + 0.5 * sq * 0 + 0.5) + hw * 0.5 && av > hw * 0.6) {
          return ink(out, ...mix(skin, PUPIL, 0.12), INK_SCALE);
        }
        if (av < hw) {
          if (spotted(u, v, 0.035, 0.011, o.id)) {
            // Chromatophores qui pulsent : taches claires ou sombres.
            const cu = Math.floor(u / 0.035);
            const cv = Math.floor(v / 0.035);
            const beat = 0.5 + 0.5 * Math.sin(t * (1.2 + 2 * hash3(cu, cv, o.id)) + hash3(cv, cu, 5) * TAU);
            const c = hash3(cu, cv, o.id + 3) > 0.5 ? mix(skin, WHITE, 0.5 * beat) : mix(skin, PUPIL, 0.35 + 0.45 * beat);
            return ink(out, ...c, INK_DARK);
          }
          return ink(out, ...shade(v / Math.max(hw, 0.01)), INK_SCALE);
        }
      }
      // Tete : relie manteau et bras, enveloppe les yeux.
      if (inEllipse(u, v, -0.06, 0, 0.08, 0.1)) return ink(out, ...shade(v / 0.1), INK_SCALE);
      // Bras : seulement derriere la tete.
      if (u > -0.08) return false;
      for (let n = 0; n < ARMS; n++) {
        if (u < box[n * 4] || u > box[n * 4 + 1] || v < box[n * 4 + 2] || v > box[n * 4 + 3]) continue;
        const tent = n === 3 || n === 6;
        const base = n * (SEGS + 1);
        for (let i = 0; i < SEGS; i++) {
          const a = base + i;
          const club = tent && i >= SEGS - 4 ? 1.7 : 1;
          const w = (tent ? 0.02 : 0.027) * club * (1 - 0.7 * ((i + 0.5) / SEGS));
          const d = toSegment(u, v, armU[a], armV[a], armU[a + 1], armV[a + 1]);
          if (d > w) continue;
          // Ventouses : points clairs sur l'axe, un segment sur deux (sur la clavette pour les tentacules).
          if (i > 1 && i % 2 === 0 && (!tent || i >= SEGS - 4) && d < w * 0.55) return ink(out, ...pale, INK_SPOT, "o");
          return ink(out, ...mix(skin, PUPIL, 0.1 + 0.25 * (i / SEGS)), INK_SCALE);
        }
      }
      return false;
    }, { light: (0.95 + 0.1 * sq) * pulse });
  },
};
