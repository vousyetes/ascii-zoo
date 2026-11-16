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
  detail: 1.6,
  density: 1.1,
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

const BODY: RGB = [150, 152, 172];
const FLANK: RGB = [88, 94, 110];
const BELLY: RGB = [62, 66, 80];
const PINK: RGB = [196, 170, 182];
const IVORY: RGB = [240, 238, 228];
const MOUTH: RGB = [34, 16, 22];
const EYE: RGB = [236, 238, 247];
const EYE_BG: RGB = [14, 10, 20];

/** Racines des pattes : deux avant, deux arrière, phases diagonales. */
const LEGS = [
  { hu: 0.16, ph: 0, far: false },
  { hu: 0.09, ph: Math.PI, far: true },
  { hu: -0.26, ph: Math.PI, far: false },
  { hu: -0.33, ph: 0, far: true },
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
  scale: 1.2,
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
      return { fu: l.hu + 0.03 * Math.sin(l.ph + c.gait), v: 0.34 - 0.03 * lift, lift };
    });
    const SCAR: RGB = [196, 202, 216];
    const WET: RGB = [206, 208, 226];
    const TONGUE: RGB = [120, 62, 82];
    const MV = 0.085; // ligne de la bouche
    const EU = 0.4; // position de l'oeil
    const EV = -0.13;

    pen.shape(pose, 0.7, (u, v) => {
      const fu = u * d;
      const dr = g * 0.17 * Math.min(1, Math.max(0, (fu - 0.24) / 0.42)); // abaissement de la mandibule
      const jt = MV + dr; // dessus de la mandibule

      // Pattes en piliers trapus, quatre doigts.
      for (let i = 0; i < 4; i++) {
        const l = LEGS[i];
        const f = foot[i];
        if (toSegment(fu, v, l.hu + sway * 0.3, 0.16, f.fu, f.v) < 0.062 - 0.006 * seg.t) {
          if (v > f.v - 0.03) return Math.floor((fu - f.fu + 0.06) / 0.03) % 2 === 0 ? ink(out, ...IVORY, INK_SPOT) : ink(out, ...BELLY, INK_DARK);
          return ink(out, ...(l.far ? BELLY : FLANK), INK_SCALE);
        }
      }
      // Petite queue.
      if (toSegment(fu, v, -0.44, -0.08 + bob, -0.5, 0.0) < 0.012) return ink(out, ...FLANK, INK_DARK);

      // Reliefs du crâne : petites oreilles rondes, bosses des yeux et des naseaux (dépassent du contour).
      if (inEllipse(fu, v, 0.27, -0.135, 0.028, 0.032)) return inEllipse(fu, v, 0.27, -0.132, 0.012, 0.016) ? ink(out, ...PINK, INK_SPOT) : ink(out, ...FLANK, INK_DARK);
      if (inEllipse(fu, v, EU, EV, 0.035, 0.034)) return Math.hypot(fu - EU, v - EV) < 0.012 ? ink(out, ...EYE_BG, INK_DARK) : ink(out, ...BODY, INK_SCALE);
      if (inEllipse(fu, v, 0.68, -0.09, 0.034, 0.032)) return inEllipse(fu, v, 0.68, -0.088, 0.013, 0.013) ? ink(out, ...EYE_BG, INK_DARK) : ink(out, ...FLANK, INK_DARK);

      // Mâchoire inférieure : lèvre marquée, rose sous le menton.
      const jq = Math.pow(Math.abs((fu - 0.47) / 0.27), 3) + Math.pow(Math.abs((v - jt - 0.04) / 0.06), 2.4);
      if (fu > 0.24 && v >= jt && jq < 1) {
        if (v < jt + 0.012) return ink(out, ...FLANK, INK_DARK); // lèvre
        if (g > 0.3 && v < jt + 0.035 && fu > 0.56 && Math.floor((fu - 0.3) / 0.035) % 2 === 0) return ink(out, ...IVORY, INK_SPOT);
        return ink(out, ...(v > jt + 0.05 ? PINK : BODY), INK_SCALE);
      }
      // Tête géante : crâne large, museau carré et plat.
      const hq = Math.pow(Math.abs((fu - 0.46) / 0.28), 3.4) + Math.pow(Math.abs((v + 0.015) / 0.115), 2.6);
      if (fu > 0.2 && v < MV + 0.004 && hq < 1) {
        if (v > MV - 0.002 && fu > 0.28) return g > 0.05 ? false : ink(out, ...MOUTH, INK_DARK); // ligne de gueule
        if (g > 0.3 && v > MV - 0.03 && fu > 0.56 && Math.floor((fu - 0.3) / 0.035) % 2 === 0) return ink(out, ...IVORY, INK_SPOT);
        if (v > MV - 0.014 && fu > 0.3) return ink(out, ...FLANK, INK_DARK); // lèvre supérieure
        if (inEllipse(fu, v, 0.33, 0.03, 0.06, 0.04)) return ink(out, ...PINK, INK_SCALE); // joue
        if (Math.abs(v + 0.05) < 0.004 && fu > 0.3 && fu < 0.55) return ink(out, ...FLANK, INK_DARK); // pli
        if (inEllipse(fu, v, 0.52, -0.09, 0.03, 0.008)) return ink(out, ...WET, INK_SPOT);
        return ink(out, ...(v < 0 ? BODY : FLANK), INK_SCALE);
      }
      // Gueule ouverte : fond sombre et langue entre les deux mâchoires.
      if (g > 0.05 && fu > 0.28 && v >= MV && v < jt && hq < 1.9) {
        if (v > jt - 0.03 && fu > 0.4) return ink(out, ...TONGUE, INK_SCALE);
        return ink(out, ...MOUTH, INK_DARK);
      }

      // Corps en tonneau énorme : dos bombé, flancs ronds, ventre pendant.
      const q = Math.pow(Math.abs((fu + 0.12) / 0.4), 2.3) + Math.pow(Math.abs((v - bob - 0.07) / 0.27), 2.3);
      if (q <= 1) {
        if (q > 0.9) return ink(out, ...FLANK, INK_DARK);
        const fold = ((((v + 0.5 + 0.01 * Math.sin(fu * 40)) % 0.07) + 0.07) % 0.07) - 0.035;
        if (Math.abs(fold) < 0.0025 && v > 0.0) return ink(out, ...FLANK, INK_DARK);
        if (fu > 0.04 && fu < 0.2 && Math.abs(Math.sin((fu - 0.04) * 60 + v * 5)) < 0.09) return ink(out, ...FLANK, INK_DARK); // plis du cou
        if (toSegment(fu, v, -0.25, -0.05, -0.15, -0.02) < 0.004) return ink(out, ...SCAR, INK_SPOT);
        // Luisant humide sur le dos.
        if (v < -0.08 && (inEllipse(fu, v, -0.1, -0.15, 0.03, 0.012) || inEllipse(fu, v, -0.28, -0.1, 0.02, 0.01) || inEllipse(fu, v, 0.05, -0.16, 0.02, 0.01))) return ink(out, ...WET, INK_SPOT);
        if (v > 0.22 + bob) return ink(out, ...PINK, INK_DARK); // ventre
        const sh = 1.12 - 0.85 * (v + 0.15);
        return ink(out, BODY[0] * sh, BODY[1] * sh, BODY[2] * sh, INK_SCALE);
      }
      return false;
    });

    // Petit oeil net sur la bosse du crâne.
    pen.toWorld(pose, d * EU, EV, at);
    pen.spot(at.x, at.y, "o", EYE, EYE_BG, c.depth);
  },
};
