/**
 * Éléphant de profil, en marche lente et sereine le long du parcours.
 *
 * Il marche en alternant promenade et pauses : à l'arrêt la trompe se lève et
 * sent l'air. Un clic proche le fait barrir : trompe dressée, bouche ouverte,
 * oreilles écartées, puis il repart plus vite un instant.
 * Le corps est dessiné toujours bien à l'endroit, tourné vers la droite ou la
 * gauche selon le sens du parcours, pour que la silhouette reste lisible.
 * Gris-violet clair avec rides sombres, reflets cyan sur le dos et violet
 * sous le ventre pour se détacher du fond noir.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_BODY, INK_DARK, INK_SCALE, ink, type Ink, type RGB } from "../ink";
import { clamp, rand, TAU } from "../math";
import { inEllipse, toSegment } from "./shapes";

interface Elephant extends Creature {
  /** Tourné vers la droite de l'écran (sinon la gauche). */
  right: boolean;
  /** Phase de la marche. */
  gait: number;
  /** Phase du battement d'oreille. */
  earPh: number;
  pausing: boolean;
  /** Fin de la promenade ou de la pause en cours. */
  until: number;
  /** 0 trompe pendante, 1 levée qui sent. */
  sniff: number;
  /** 0 calme, 1 barrissement. */
  roar: number;
  bellowUntil: number;
  hurryUntil: number;
  /** Temps écoulé depuis le clic (jet d'eau), -1 hors jet. */
  jet: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  density: 1.0,
  sway: 0.03,
  spread: 0.04,
  farthest: 0.55,
  farBias: 1.2,
  grip: 2,
  separation: 600,
  trail: 0.5,
  rest: 1,
  stride: 1,
  earSpeed: 1,
  scare: 1,
};

const BODY: RGB = [166, 170, 200];
const FAR: RGB = [118, 120, 152];
const EAR: RGB = [150, 136, 186];
const WRINKLE: RGB = [88, 90, 124];
const CYAN: RGB = [92, 200, 255];
const VIOLET: RGB = [138, 116, 255];
const IVORY: RGB = [236, 238, 247];
const MOUTH: RGB = [70, 40, 80];
const EYE: RGB = [10, 8, 18];
const GLINT: RGB = [236, 238, 247];

const GROUND = -0.42;

// Jet d'eau : début, fin, nombre de gouttes et durée de vie d'une goutte (secondes).
const JET_START = 0.35;
const JET_END = 2.1;
const DROPS = 34;
const DROP_LIFE = 0.9;
const WET: RGB = [14, 40, 64];
const SUN: RGB = [255, 176, 103];
const GLYPHS = ["●", "•", "o"];
const NEAR_X = [0.2, -0.2];
const FAR_X = [0.27, -0.13];

/** Mélange de deux couleurs écrit directement dans l'encre (sans allocation). */
function tint(out: Ink, a: RGB, b: RGB, t: number, kind = INK_BODY) {
  return ink(out, a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t, kind);
}

export const elephant: Animal<Elephant> = {
  key: "elephant",
  label: "éléphant",
  swatch: [169, 174, 196],
  defaults: DEFAULTS,
  controls: [
    ["Éléphant", [
      { key: "rest", label: "Pauses", min: 0, max: 4, step: 0.05, hint: "Durée des pauses où la trompe se lève et sent. 0 : il ne s'arrête jamais." },
      { key: "stride", label: "Pas", min: 0.3, max: 2.5, step: 0.05, hint: "Rythme du balancement des pattes." },
      { key: "earSpeed", label: "Oreilles", min: 0, max: 3, step: 0.05, hint: "Vitesse du battement des oreilles." },
      { key: "scare", label: "Barrissement", min: 0, max: 3, step: 0.05, hint: "Durée du barrissement et de la course qui suit un clic proche. 0 : il ignore le clic." },
    ]],
  ],
  area: 55000,
  scale: 1.0,
  speed: 38,
  trail: { light: [150, 150, 170], dark: [120, 124, 160] },

  create: (c) => ({
    ...c, right: true, gait: rand(0, TAU), earPh: rand(0, TAU), pausing: false, until: 0,
    sniff: 0, roar: 0, bellowUntil: 0, hurryUntil: 0, jet: -1,
  }),

  enter(c, flock) {
    c.pausing = false;
    c.until = flock.time + rand(3, 8);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    if (t >= c.until) {
      c.pausing = !c.pausing && k.rest > 0;
      c.until = t + (c.pausing ? rand(1.5, 3.5) * k.rest : rand(4, 9));
    }
    if (c.jet >= 0) c.jet = c.jet > JET_END ? -1 : c.jet + dt;
    const bellowing = t < c.bellowUntil;
    const hurry = t < c.hurryUntil;
    const cruise = flock.cruise(c);
    const want = c.pausing || bellowing ? 0 : cruise * (hurry ? 1.8 : 1);
    flock.begin();
    flock.steer(c, flock.heading + c.bias * k.spread, want, k.grip);
    flock.separate(c);
    const speed = flock.move(c, dt, cruise * 2);
    if (flock.passed(c)) flock.reenter(c);

    const cx = Math.cos(c.heading);
    if (cx > 0.2) c.right = true;
    else if (cx < -0.2) c.right = false;
    c.gait += (dt * speed * k.stride) / Math.max(4, c.span * 0.1);
    c.earPh += dt * k.earSpeed * (1.4 + 3 * c.roar);
    const sniffGoal = c.pausing && !bellowing ? 1 : 0;
    c.sniff += (sniffGoal - c.sniff) * Math.min(1, dt * 2.5);
    c.roar += ((bellowing ? 1 : 0) - c.roar) * Math.min(1, dt * (bellowing ? 6 : 3));
  },

  startle(c, _dx, _dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.scare <= 0) return;
    const t = flock.time;
    c.bellowUntil = t + Math.max(JET_END, (1.2 + 0.8 * strength) * Math.sqrt(k.scare));
    c.jet = 0;
    c.hurryUntil = c.bellowUntil + (1 + 2 * strength) * k.scare;
    c.pausing = false;
    c.until = c.hurryUntil + rand(1, 3);
  },

  draw(c, pen) {
    const S = c.span;
    const out = pen.ink;
    // Pose horizontale : u vers l'avant, v vers le haut (gauche) ou le bas (droite) de l'écran.
    const pose = { x: c.x, y: c.y, heading: c.right ? 0 : Math.PI, span: S, depth: c.depth, id: c.id };
    const sg = c.right ? -1 : 1; // v = sg * hauteur
    const at = { x: 0, y: 0 };
    const roar = c.roar;
    const lift = Math.max(c.sniff, roar);
    const headUp = 0.03 * roar + 0.015 * c.sniff;
    const flap = Math.sin(c.earPh);

    // Trompe : chaîne de segments en (avant, hauteur).
    const baseF = 0.46;
    const baseH = 0.0 + headUp;
    const N = 5;
    const tf: number[] = [baseF];
    const th: number[] = [baseH];
    let ang = -1.25 + (1.25 + 1.05) * lift + 0.2 * roar + 0.12 * Math.sin(c.earPh * 0.45 + c.id);
    const curl = (0.25 + 0.15 * Math.sin(c.earPh * 0.3)) * (1 - lift) + (lift * (0.1 - 0.3 * roar) - 0.05) * lift;
    for (let i = 0; i < N; i++) {
      ang += curl;
      tf.push(tf[i] + Math.cos(ang) * 0.085);
      th.push(th[i] + Math.sin(ang) * 0.085);
    }

    // Pattes d'abord (balancement lent, diagonales ensemble), le corps recouvre les hanches.
    const legs = [
      { x: FAR_X[0], ph: c.gait + Math.PI, far: true },
      { x: FAR_X[1], ph: c.gait, far: true },
      { x: NEAR_X[0], ph: c.gait, far: false },
      { x: NEAR_X[1], ph: c.gait + Math.PI, far: false },
    ];
    const feet: number[] = [];
    for (const l of legs) {
      const swing = 0.04 * Math.sin(l.ph);
      const up = Math.max(0, Math.cos(l.ph)) * 0.02;
      feet.push(l.x + swing, GROUND + up);
      if (!l.far && up < 0.002) {
        pen.toWorld(pose, l.x + swing, sg * GROUND, at);
        pen.shed(at.x, at.y, 0.1 * c.depth);
      }
    }

    pen.shape(pose, 0.95, (u, v) => {
      const f = u;
      const h = v * sg;

      // Oreille en éventail (devant le corps, sur l'épaule) : plus ample et plus ouverte au barrissement.
      const earF = 0.2 - 0.04 * roar - 0.02 * flap;
      const eu = (f - earF) / (0.1 + 0.035 * roar);
      const ev = (h - 0.08) / 0.15;
      const er = eu * eu + ev * ev;
      if (er <= 1) {
        if (er > 0.72 || (Math.abs(eu * 3 + ev) % 1 < 0.08)) return ink(out, ...WRINKLE, INK_DARK);
        return tint(out, EAR, VIOLET, 0.25 * (1 - er));
      }

      // Tusks courbes, claires.
      const tuskH = baseH - 0.07;
      const tusk: number[] = [0.46, tuskH, 0.54, tuskH - 0.08, 0.6, tuskH - 0.03, 0.61, tuskH + 0.07];
      for (let i = 0; i < 6; i += 2) {
        if (toSegment(f, h, tusk[i], tusk[i + 1], tusk[i + 2], tusk[i + 3]) < 0.021 - 0.003 * (i / 2)) return ink(out, ...IVORY, INK_SCALE);
      }

      // Trompe.
      for (let i = 0; i < N; i++) {
        if (toSegment(f, h, tf[i], th[i], tf[i + 1], th[i + 1]) < 0.05 - 0.007 * i) {
          if (i > 0 && Math.abs((f * 40 + h * 40) % 2) < 0.35) return ink(out, ...WRINKLE, INK_DARK);
          return tint(out, BODY, CYAN, 0.1 * i / N);
        }
      }

      // Bouche ouverte au barrissement.
      if (roar > 0.3 && inEllipse(f, h, 0.45, baseH - 0.1, 0.045, 0.04 * roar)) return ink(out, ...MOUTH, INK_DARK);

      // Queue fine.
      const tw = 0.02 * Math.sin(c.earPh * 0.7);
      if (toSegment(f, h, -0.33, 0.06, -0.37 + tw, -0.15) < 0.012) return ink(out, ...WRINKLE, INK_DARK);
      if (inEllipse(f, h, -0.37 + tw, -0.17, 0.02, 0.03)) return ink(out, ...WRINKLE, INK_DARK);

      // Tête et front (plus haute au barrissement).
      if (inEllipse(f, h, 0.36, 0.07 + headUp, 0.15, 0.17)) {
        // Rides sur le front.
        if (h > 0.13 + headUp && f > 0.27 && Math.abs((h * 55) % 2) < 0.4) return ink(out, ...WRINKLE, INK_DARK);
        return tint(out, BODY, CYAN, clamp((h - 0.1) / 0.2, 0, 0.3));
      }

      // Corps massif.
      if (inEllipse(f, h, -0.02, 0.0, 0.35, 0.21) || inEllipse(f, h, 0.05, 0.08, 0.28, 0.2)) {
        if (Math.abs(((f + h * 0.3) * 45) % 2) < 0.22 && h < 0.12) return ink(out, ...WRINKLE, INK_DARK);
        const top = clamp((h - 0.05) / 0.17, 0, 1) * 0.35;
        const belly = clamp((-h - 0.05) / 0.15, 0, 1) * 0.3;
        if (belly > top) return tint(out, BODY, VIOLET, belly);
        return tint(out, BODY, CYAN, top);
      }

      // Pattes : piliers un peu plus sombres au fond.
      for (let i = 0; i < 4; i++) {
        const far = legs[i].far;
        const d = toSegment(f, h, legs[i].x, -0.12, feet[i * 2], feet[i * 2 + 1]);
        if (d < (far ? 0.043 : 0.05)) {
          if (feet[i * 2 + 1] - h < -0.0 && h < GROUND + 0.05 && Math.abs(f - feet[i * 2]) < 0.04) return ink(out, ...WRINKLE, INK_DARK, "_");
          return tint(out, far ? FAR : BODY, VIOLET, far ? 0.1 : 0.15);
        }
      }
      return false;
    });

    // Jet d'eau : balistique pure depuis le bout de la trompe, rien n'est stocké.
    if (c.jet > JET_START) {
      const dir = c.right ? 1 : -1;
      pen.toWorld(pose, tf[N], sg * th[N], at);
      const x0 = at.x, y0 = at.y;
      const gy = c.y + 0.42 * S; // sol
      const vx = dir * S * 1.15, vy = -S * 1.0, g = S * 2.4;
      const dt = (JET_END - JET_START - DROP_LIFE) / DROPS;
      const fog = c.depth;
      for (let i = 0; i < DROPS; i++) {
        const age = c.jet - JET_START - i * dt;
        if (age < 0 || age > DROP_LIFE) continue;
        const h = Math.sin(i * 12.9898) * 43758.5453, r = h - Math.floor(h) - 0.5;
        const x = x0 + (vx * (1 + 0.12 * r)) * age + r * S * 0.05 * age;
        const y = y0 + vy * (1 + 0.1 * r) * age + 0.5 * g * age * age;
        const col = i % 7 === 3 ? SUN : i % 2 ? IVORY : CYAN;
        if (y < gy) {
          // Gouttes pleines (une cellule) plutôt que points légers : lisibles de loin.
          if (i % 3 === 0) pen.line(x, y, x - vx * 0.05, y - (vy + g * age) * 0.05, col, fog);
          pen.spot(x, y, GLYPHS[(i + (age > 0.5 ? 1 : 0)) % 3], col, WET, fog);
        } else if (age < DROP_LIFE) {
          // Gerbe à l'arrivée : éclaboussures qui s'écartent du point d'impact.
          pen.dot(x + r * S * 0.1, gy - S * 0.02 * (1 + r), "·", col, fog);
          if (i % 4 === 0) pen.shed(x, gy, 0.05 * c.depth);
        }
      }
    }

    // Petit oeil doux, une cellule.
    pen.toWorld(pose, 0.4, sg * (0.1 + headUp), at);
    pen.spot(at.x, at.y, "●", GLINT, EYE, c.depth);
  },
};
