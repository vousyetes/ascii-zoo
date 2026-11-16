/**
 * Hippopotame, massif et bas, gris ardoise avec des reflets rosés sous la peau.
 *
 * Dessiné de profil dans le repère de l'écran, retourné selon le côté. Énorme tête carrée avec
 * mâchoire inférieure articulée (la gueule s'ouvre sur des incisives ivoire), naseaux, oeil et
 * oreille ovale sur le dessus du crâne, plis au cou et au flanc, corps tonneau, quatre pattes
 * courtes à quatre doigts, petite queue. Marche lente, pauses où il bâille ; un clic proche le
 * fait bâiller en menaçant puis charger un instant.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, INK_SPOT, ink, type RGB } from "../ink";
import { rand, TAU } from "../math";
import { inEllipse, toSegment, seg } from "./shapes";

interface Hippo extends Creature {
  dir: 1 | -1;
  walking: boolean;
  until: number;
  gait: number;
  /** Ouverture de la gueule : 0 fermée, 1 grande ouverte. */
  gape: number;
  /** Fin du bâillement en cours (0 : pas de bâillement). */
  yawnUntil: number;
  fleeDir: number;
  fleeSpeed: number;
  fleeFrom: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 3.0,
  density: 1.3,
  sway: 0.02,
  spread: 0.03,
  farthest: 0.35,
  farBias: 1.3,
  grip: 1.5,
  separation: 500,
  trail: 1.1,
  walk: 1,
  rest: 1,
  yawn: 1,
  rage: 1,
};

const BODY: RGB = [140, 146, 162];
const FLANK: RGB = [88, 94, 110];
const BELLY: RGB = [62, 66, 80];
const PINK: RGB = [158, 120, 132];
const IVORY: RGB = [240, 238, 228];
const MOUTH: RGB = [34, 16, 22];
const EYE: RGB = [236, 238, 247];
const EYE_BG: RGB = [14, 10, 20];

/** Racines des pattes : deux avant, deux arrière, phases diagonales. */
const LEGS = [
  { hu: 0.14, ph: 0, far: false },
  { hu: 0.08, ph: Math.PI, far: true },
  { hu: -0.2, ph: Math.PI, far: false },
  { hu: -0.26, ph: 0, far: true },
];

export const hippo: Animal<Hippo> = {
  key: "hippo",
  label: "hippo",
  swatch: [140, 146, 162],
  defaults: DEFAULTS,
  controls: [
    ["Hippo", [
      { key: "walk", label: "Marche", min: 0.2, max: 4, step: 0.05, hint: "Durée de chaque marche." },
      { key: "rest", label: "Pause", min: 0, max: 4, step: 0.05, hint: "Durée des pauses. 0 : il ne s'arrête jamais." },
      { key: "yawn", label: "Bâillements", min: 0, max: 3, step: 0.05, hint: "Fréquence des bâillements pendant les pauses." },
      { key: "rage", label: "Charge", min: 0, max: 3, step: 0.05, hint: "Force de la charge quand on clique près de lui." },
    ]],
  ],
  area: 55000,
  scale: 1.15,
  speed: 34,
  trail: { light: [130, 136, 152], dark: [140, 146, 162] },

  create: (c) => ({ ...c, dir: Math.random() < 0.5 ? 1 : -1, walking: true, until: 0, gait: rand(0, TAU), gape: 0, yawnUntil: 0, fleeDir: 0, fleeSpeed: 0, fleeFrom: 0 }),

  enter(c, flock) {
    c.walking = true;
    c.until = flock.time + rand(1, 4);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    if (t >= c.until) {
      c.walking = !c.walking || k.rest <= 0;
      c.until = t + (c.walking ? rand(3, 8) * k.walk : rand(2, 4) * Math.max(0.3, k.rest));
      // Pause : il bâille, d'autant plus souvent que le réglage est haut.
      if (!c.walking && Math.random() < Math.min(1, 0.7 * k.yawn)) c.yawnUntil = t + Math.min(2.4, c.until - t);
    }
    const cruise = flock.cruise(c);
    const charging = t < c.startledUntil;
    const calm = charging ? (t - c.fleeFrom) / (c.startledUntil - c.fleeFrom) : 1;
    flock.begin();
    if (charging) flock.steer(c, c.fleeDir, c.fleeSpeed * (1 - calm * calm), 5);
    else flock.steer(c, flock.heading + c.bias * k.spread, c.walking ? cruise : 0, k.grip);
    flock.separate(c);
    const speed = flock.move(c, dt, charging ? Math.max(cruise, c.fleeSpeed) : cruise);
    if (flock.passed(c)) flock.reenter(c);

    if (speed > 3) {
      const cx = c.vx / speed;
      if (cx > 0.25) c.dir = 1;
      else if (cx < -0.25) c.dir = -1;
    }
    c.heading = Math.atan2(c.vy, c.vx);
    c.gait += (dt * speed) / Math.max(6, c.span * 0.14);
    // Bâillement : montée lente, plateau, retombée ; menaçant au début de la charge.
    const yawning = t < c.yawnUntil || (charging && calm < 0.7);
    c.gape += ((yawning ? 1 : 0) - c.gape) * Math.min(1, dt * (yawning ? 4 : 3));
  },

  startle(c, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.rage <= 0) return;
    c.fleeDir = Math.atan2(dy, dx) + rand(-0.15, 0.15);
    c.fleeSpeed = flock.cruise(c) * (2.5 + 2.5 * strength) * k.rage;
    c.fleeFrom = flock.time;
    c.startledUntil = flock.time + (1.4 + 1.4 * strength) * Math.sqrt(k.rage);
    c.walking = true;
    c.until = c.startledUntil + rand(1, 3);
    if (Math.cos(c.fleeDir) > 0.1) c.dir = 1;
    else if (Math.cos(c.fleeDir) < -0.1) c.dir = -1;
  },

  draw(c, pen) {
    const S = c.span;
    const out = pen.ink;
    const d = c.dir;
    const g = c.gape;
    const pose = { x: c.x, y: c.y, heading: 0, span: S, depth: c.depth, id: c.id };
    const at = { x: 0, y: 0 };
    const bob = 0.006 * Math.sin(c.gait * 2);
    const sway = 0.02 * Math.sin(c.gait);

    const foot = LEGS.map((l) => {
      const lift = Math.max(0, Math.cos(l.ph + c.gait));
      return { fu: l.hu + 0.04 * Math.sin(l.ph + c.gait), v: 0.34 - 0.035 * lift, lift };
    });
    // Mâchoire inférieure : charnière en fu 0.26, le dessus de la mandibule descend vers l'avant.
    const jawTop = (fu: number) => 0.03 + g * 0.12 * Math.max(0, (fu - 0.26) / 0.34);
    const SCAR: RGB = [196, 202, 216];

    pen.shape(pose, 0.7, (u, v) => {
      const fu = u * d;
      // Pattes courtes et épaisses sous le ventre, quatre doigts nets.
      for (let i = 0; i < 4; i++) {
        const l = LEGS[i];
        const f = foot[i];
        const dist = toSegment(fu, v, l.hu + sway * 0.3, 0.1, f.fu, f.v);
        if (dist < 0.058 - 0.008 * seg.t) {
          if (v > f.v - 0.04) {
            const toe = Math.floor((fu - f.fu + 0.056) / 0.028) % 2 === 0;
            return toe ? ink(out, ...IVORY, INK_SPOT) : ink(out, ...BELLY, INK_DARK);
          }
          if (Math.abs(v - 0.22) < 0.005) return ink(out, ...FLANK, INK_DARK);
          return ink(out, ...(l.far ? BELLY : FLANK), INK_SCALE);
        }
      }
      // Queue courte à l'arrière.
      if (toSegment(fu, v, -0.44, -0.08 + bob, -0.5, 0.04) < 0.011) return ink(out, ...FLANK, INK_DARK);

      // Oreille ovale, bosse de l'oeil et naseaux en relief : dépassent du contour du crâne.
      if (inEllipse(fu, v, 0.28, -0.215, 0.03, 0.045)) {
        return Math.hypot(fu - 0.28, v + 0.21) < 0.016 ? ink(out, ...PINK, INK_SPOT) : ink(out, ...FLANK, INK_DARK);
      }
      if (inEllipse(fu, v, 0.42, -0.21, 0.03, 0.035)) return Math.hypot(fu - 0.42, v + 0.2) < 0.012 ? ink(out, ...EYE_BG, INK_DARK) : ink(out, ...BODY, INK_SCALE);
      if (inEllipse(fu, v, 0.57, -0.19, 0.028, 0.032)) {
        return inEllipse(fu, v, 0.57, -0.19, 0.012, 0.014) ? ink(out, ...EYE_BG, INK_DARK) : ink(out, ...FLANK, INK_DARK);
      }
      // Tête : crâne carré et haut, museau large.
      if (fu > 0.2 && fu < 0.62 && v > -0.19 && v < 0.04 && Math.pow(Math.abs(fu - 0.41) / 0.21, 5) + Math.pow(Math.abs(v + 0.075) / 0.12, 4) < 1) {
        if (g > 0.25 && v > 0.01 && fu > 0.38 && Math.floor((fu - 0.3) / 0.03) % 2 === 0) return ink(out, ...IVORY, INK_SPOT);
        if (inEllipse(fu, v, 0.3, -0.04, 0.06, 0.05)) return ink(out, ...PINK, INK_SCALE); // joue rosée
        if (Math.abs(v + 0.115) < 0.004 && fu > 0.25) return ink(out, ...FLANK, INK_DARK); // pli du front
        if (v > 0.02) return ink(out, ...FLANK, INK_DARK); // lèvre
        if (Math.abs(fu - 0.33) < 0.004 && v > -0.06) return ink(out, ...FLANK, INK_DARK);
        if (inEllipse(fu, v, 0.5, -0.1, 0.02, 0.005)) return ink(out, ...SCAR, INK_SPOT);
        return ink(out, ...(v < -0.1 ? BODY : FLANK), INK_SCALE);
      }
      // Mandibule articulée : intérieur sombre, incisives ivoire.
      if (fu > 0.2 && fu < 0.62) {
        const top = jawTop(fu);
        if (v >= 0.035 && v < top) {
          if (v < 0.07 && fu > 0.38 && Math.floor((fu - 0.3) / 0.03) % 2 === 0) return ink(out, ...IVORY, INK_SPOT);
          return v > top - 0.015 ? ink(out, ...FLANK, INK_SCALE) : ink(out, ...MOUTH, INK_DARK);
        }
        if (v >= top && v < top + 0.08) {
          if (g > 0.2 && v < top + 0.03 && fu > 0.4 && Math.floor((fu - 0.3) / 0.03) % 2 === 1) return ink(out, ...IVORY, INK_SPOT);
          return Math.abs(v - top - 0.05) < 0.004 ? ink(out, ...FLANK, INK_DARK) : ink(out, ...(v > top + 0.05 ? FLANK : BODY), INK_SCALE);
        }
      }

      // Corps tonneau : dos arrondi, ventre bombé qui pend.
      const bu = (fu + 0.12) / 0.34;
      const bv = (v - bob - 0.02) / 0.19;
      const q = Math.pow(Math.abs(bu), 2.5) + Math.pow(Math.abs(bv), 2.2);
      if (q <= 1 || (fu > 0.12 && fu < 0.26 && v > -0.1 && v < 0.1)) {
        if (q > 0.88) return ink(out, ...FLANK, INK_DARK);
        // Plis du cou, plis ondulants et cicatrices claires sur le flanc.
        if (fu > 0.08 && fu < 0.26 && Math.abs(Math.sin((fu - 0.08) * 55 + v * 6)) < 0.13) return ink(out, ...FLANK, INK_DARK);
        if (toSegment(fu, v, -0.2, -0.05, -0.12, -0.02) < 0.005 || toSegment(fu, v, -0.3, 0.04, -0.25, 0.1) < 0.005 || toSegment(fu, v, 0.0, 0.02, 0.06, -0.04) < 0.005) return ink(out, ...SCAR, INK_SPOT);
        const fold = ((((v + 0.5 + 0.01 * Math.sin(fu * 40)) % 0.05) + 0.05) % 0.05) - 0.025;
        if (Math.abs(fold) < 0.003 && v > -0.08) return ink(out, ...FLANK, INK_DARK);
        if (v > 0.13 + bob) return ink(out, ...BELLY, INK_DARK);
        if (inEllipse(fu, v, 0.13, 0.0, 0.035, 0.035)) return ink(out, ...PINK, INK_SCALE);
        const sh = 1.12 - 0.9 * (v + 0.15);
        return ink(out, BODY[0] * sh, BODY[1] * sh, BODY[2] * sh, INK_SCALE);
      }
      return false;
    });

    // Petit oeil net sur le dessus de la tête.
    pen.toWorld(pose, d * 0.42, -0.2, at);
    pen.spot(at.x, at.y, "o", EYE, EYE_BG, c.depth);
  },
};
