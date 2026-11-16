/**
 * Hibou en vol silencieux, vu de face.
 *
 * Gros disque facial (deux cercles clairs cerclés d'un anneau), énormes yeux
 * jaune soleil avec pupille noire et reflet, petit bec en V, aigrettes, ailes
 * larges aux plumes digitées qui battent lentement entre de longues glissades.
 * Corps duveteux gris-violet à chevrons. Le moteur ne donne pas la position du
 * curseur : la tête se tourne vers le dernier clic proche (reçu par startle),
 * puis revient au centre. Au clic : yeux écarquillés (pupille qui rétrécit,
 * iris qui grossit), la tête pivote, puis piqué vers l'opposé.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_BODY, INK_DARK, INK_SCALE, INK_SPOT, ink, type RGB } from "../ink";
import { clamp, frac, rand, TAU } from "../math";
import { inEllipse, seg, toSegment } from "./shapes";

interface Owl extends Creature {
  phase: number;
  /** 0 bat, 1 plane. */
  glide: number;
  glideUntil: number;
  /** Direction du regard, -1 à 1 (gauche/droite, haut/bas à l'écran). */
  lookX: number;
  lookY: number;
  targetX: number;
  targetY: number;
  lookUntil: number;
  /** Yeux écarquillés, 0 à 1. */
  alarm: number;
  /** Piqué : direction, début de la plongée. */
  fleeDir: number;
  diveAt: number;
  /** Individu : teinte 0 (violet) à 1 (gris-bleu), nuance des yeux. */
  tint: number;
  eyeShift: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  density: 1.2,
  speed: 1,
  sway: 0.03,
  spread: 0,
  farthest: 0.4,
  farBias: 1,
  grip: 3,
  separation: 200,
  trail: 0,
  shimmer: 0.05,
  sparkle: 0.03,
  wingbeat: 1,
  glide: 1,
  headTurn: 1,
  scare: 1,
};

const SUN: RGB = [255, 176, 103];
const CORAL: RGB = [255, 111, 97];
const VIOLET: RGB = [138, 116, 255];
const TEXT: RGB = [236, 238, 247];
const FACE: RGB = [196, 190, 226];
const RING: RGB = [138, 116, 255];
const BODY: RGB = [112, 100, 150];
const CHEVRON: RGB = [74, 66, 112];
const WING: RGB = [96, 86, 140];
const WING_DARK: RGB = [58, 52, 92];
const BODY_G: RGB = [100, 112, 148];
const CHEVRON_G: RGB = [62, 74, 108];
const WING_G: RGB = [86, 100, 138];
const WING_DARK_G: RGB = [48, 58, 88];
const FACE_G: RGB = [186, 198, 222];
const RING_G: RGB = [120, 150, 200];
const EDGE_G: RGB = [130, 150, 205];
const NIGHT: RGB = [4, 5, 10];

const at = { x: 0, y: 0 };

/** Hauteurs de la tête et des yeux sur le corps (u vers le haut de l'écran). */
const HEAD_U = 0.14;

export const owl: Animal<Owl> = {
  key: "owl",
  label: "Owl",
  swatch: [255, 176, 103],
  defaults: DEFAULTS,
  controls: [
    ["Flight", [
      { key: "wingbeat", label: "Wingbeat", min: 0.3, max: 2.5, step: 0.05, hint: "How fast the wings flap." },
      { key: "glide", label: "Glide", min: 0, max: 4, step: 0.05, hint: "How often it makes long glides with wings spread." },
    ]],
    ["Gaze", [
      { key: "headTurn", label: "Head turn", min: 0, max: 2, step: 0.05, hint: "How far it looks toward the last click." },
      { key: "scare", label: "Dive", min: 0, max: 3, step: 0.05, hint: "Dive speed and length when you click near the owl." },
    ]],
  ],
  area: 40000,
  scale: 1.0,
  speed: 70,
  trail: { light: [150, 140, 190], dark: [120, 110, 170] },

  create: (c) => ({
    ...c,
    span: c.span * rand(0.8, 1.1),
    tint: Math.random(),
    eyeShift: rand(-1, 1),
    phase: rand(0, TAU),
    glide: 0,
    glideUntil: 0,
    lookX: 0,
    lookY: 0,
    targetX: 0,
    targetY: 0,
    lookUntil: 0,
    alarm: 0,
    fleeDir: 0,
    diveAt: 0,
  }),

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread;
    const fleeing = t < c.startledUntil;
    flock.begin();
    if (fleeing && t < c.diveAt) flock.steer(c, course, cruise * 0.3, k.grip); // il se fige, la tête pivote
    else if (fleeing) flock.steer(c, c.fleeDir, cruise * (1.8 + 1.0 * k.scare), 6);
    else flock.steer(c, course, cruise, k.grip);
    flock.separate(c, k.separation, 0.45);
    flock.move(c, dt, fleeing && t >= c.diveAt ? cruise * 3 : cruise * 1.5);
    if (flock.passed(c)) flock.reenter(c);
    flock.face(c, dt, 2, course);

    // Glissades sur sa propre horloge.
    if (c.glide < 0.5 && t > c.glideUntil && Math.random() < 0.3 * k.glide * dt) c.glideUntil = t + rand(2, 4.5);
    c.glide += ((t < c.glideUntil ? 1 : 0) - c.glide) * Math.min(1, dt * 2);
    c.phase += dt * TAU * 0.8 * k.wingbeat * (1 - 0.9 * c.glide);

    // Le regard revient au centre quand le clic est oublié.
    if (t > c.lookUntil) {
      c.targetX = 0;
      c.targetY = 0;
    }
    const e = Math.min(1, dt * 6);
    c.lookX += (c.targetX - c.lookX) * e;
    c.lookY += (c.targetY - c.lookY) * e;
    c.alarm = Math.max(0, c.alarm - dt * 0.6);
  },

  // Tout clic fait tourner le regard, même hors du rayon de startle ; le piqué reste local.
  tap(x, y, flock) {
    flock.events.push({ x, y, radius: 6, amount: 1.4 });
    for (const c of flock.creatures) {
      const dx = c.x - x;
      const dy = c.y - y;
      const d = Math.hypot(dx, dy) || 1;
      if (d <= 240) owl.startle!(c, dx / d, dy / d, 1 - d / 240, flock);
      else {
        c.targetX = clamp((-dx / d) * 1.2, -1, 1);
        c.targetY = clamp((-dy / d) * 1.2, -1, 1);
        c.lookUntil = flock.time + 4;
      }
    }
  },

  startle(c, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const n = Math.hypot(dx, dy) || 1;
    // Le clic est à l'opposé de (dx, dy).
    c.targetX = clamp((-dx / n) * 1.2, -1, 1);
    c.targetY = clamp((-dy / n) * 1.2, -1, 1);
    c.lookUntil = flock.time + 4;
    c.alarm = 1;
    if (k.scare <= 0) return;
    c.fleeDir = Math.atan2(dy, dx) + rand(-0.25, 0.25);
    c.diveAt = flock.time + 0.4;
    c.startledUntil = c.diveAt + (0.8 + 1.4 * strength) * Math.sqrt(k.scare);
  },

  draw(c, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const S = c.span;
    const out = pen.ink;
    // Vu de face : u vers le haut de l'écran, v latéral.
    const pose = { x: c.x, y: c.y, heading: -Math.PI / 2, span: S, depth: c.depth, id: c.id };
    pen.toWorld(pose, 0, 1, at);
    const sx = Math.sign(at.x - c.x) || 1; // sens écran de +v

    // Teintes propres à l'individu : violet (tint 0) vers gris-bleu (tint 1).
    const m = (a: RGB, b: RGB): RGB => [a[0] + (b[0] - a[0]) * c.tint, a[1] + (b[1] - a[1]) * c.tint, a[2] + (b[2] - a[2]) * c.tint];
    const body = m(BODY, BODY_G);
    const chev = m(CHEVRON, CHEVRON_G);
    const wing = m(WING, WING_G);
    const wingDark = m(WING_DARK, WING_DARK_G);
    const face = m(FACE, FACE_G);
    const ring = m(RING, RING_G);
    const edge = m(VIOLET, EDGE_G);
    const eye: RGB = [SUN[0], SUN[1] + c.eyeShift * 40, SUN[2] + c.eyeShift * 60];

    // Battement : f de -1 (haut) à 1 (bas), les ailes plongent pendant le piqué.
    const diving = flock.time < c.startledUntil && flock.time >= c.diveAt;
    const f = diving ? -0.7 : Math.sin(c.phase) * (1 - c.glide) + 0.15 * c.glide;
    const reach = diving ? 0.6 : 1;
    const wrist = { u: -0.02 + 0.1 * f, v: 0.24 * reach };
    const tip = { u: -0.06 + 0.24 * f, v: 0.5 * reach };
    // Rémiges digitées : 6 plumes en éventail depuis le poignet, chacune avec son propre retard.
    const NF = 6;
    const fu = new Float32Array(NF * 4);
    for (let i = 0; i < NF; i++) {
      const r = i / (NF - 1);
      const lag = -0.05 * f * r; // les plumes de bout traînent derrière
      const len = 1 - 0.28 * Math.abs(r - 0.35);
      fu[i * 4] = wrist.v + 0.02 * r;
      fu[i * 4 + 1] = wrist.u - 0.01;
      fu[i * 4 + 2] = wrist.v + (tip.v - wrist.v) * len + 0.02 * r;
      fu[i * 4 + 3] = wrist.u + (tip.u - wrist.u) * len - 0.09 * (r - 0.3) + lag - 0.02 * (1 - reach);
    }

    // Regard : décalage du disque facial, de la pupille.
    const lv = c.lookX * sx * k.headTurn;
    const lu = -c.lookY * k.headTurn;
    const headU = HEAD_U + lu * 0.015;
    const headV = lv * 0.03;
    const irisR = 0.062 + 0.018 * c.alarm;
    const pupilR = 0.03 * (1 - 0.55 * c.alarm);

    pen.shape(pose, 0.62, (u, v) => {
      const av = Math.abs(v);
      const sg = v < 0 ? -1 : 1;
      // Yeux : centres sur chaque moitié du disque (le côté regardé est plus grand).
      const eyeV = 0.082 * sg + headV * 1.2;
      const eyeU = headU + 0.015;
      const dEye = Math.hypot(u - eyeU, v - eyeV);
      if (dEye < irisR + 0.014) {
        const px = eyeU + lu * 0.022;
        const py = eyeV + lv * 0.026;
        const dp = Math.hypot(u - px, v - py);
        if (Math.hypot(u - (px + 0.016), v - (py - 0.016 * sg)) < 0.011) return ink(out, ...TEXT, INK_SPOT);
        if (dp < pupilR) return ink(out, ...NIGHT, INK_DARK);
        if (dEye < irisR) return ink(out, ...eye, INK_SPOT);
        return ink(out, ...CORAL, INK_DARK);
      }
      // Bec en V, sous les yeux.
      const bu = headU - 0.035 + lu * 0.01;
      if (u < bu + 0.01 && u > bu - 0.06 && Math.abs(v - headV * 1.5) < 0.03 * (1 - (bu - u) / 0.07)) {
        return ink(out, ...CORAL, INK_DARK, "v");
      }
      // Disque facial : deux cercles clairs, chacun avec deux anneaux concentriques.
      const dFace = Math.hypot(u - headU, v - (0.09 * sg + headV));
      if (dFace < 0.125) {
        if (dFace > 0.108) return ink(out, ...ring, INK_DARK);
        if (dFace > 0.094 && dFace < 0.1) return ink(out, ...chev, INK_DARK);
        return ink(out, ...face, INK_BODY);
      }
      // Entre les deux cercles, le front.
      if (inEllipse(u, v, headU + 0.02, headV, 0.1, 0.1)) return ink(out, ...face, INK_BODY);
      // Aigrettes : deux pointes au-dessus de la tête.
      if (toSegment(u, v, headU + 0.09, 0.07 * sg + headV, headU + 0.2, 0.13 * sg + headV) < 0.016 * (1 - 0.5 * seg.t)) {
        return ink(out, ...chev, INK_DARK);
      }
      // Corps rond et duveteux, queue courte, chevrons fins en barres alternées.
      if (inEllipse(u, v, -0.08, 0, 0.15, 0.115) || (u < -0.2 && u > -0.34 && av < 0.05 + 0.18 * (u + 0.34) * 0.5 + 0.0)) {
        const band = frac((u + 0.9 * av) * 22);
        if (u < 0.0 && band < 0.4) return ink(out, ...chev, INK_BODY);
        return ink(out, ...body, INK_BODY);
      }
      // Ailes : bras, secondaires, puis rémiges séparées.
      const a = seg;
      const d = toSegment(av, u, 0.09, -0.02, wrist.v, wrist.u);
      const w = 0.095 - 0.025 * a.t;
      if (d < w) {
        // Barres sombres alternées en chevrons sur le bras.
        if (frac((u * 1.0 + av * 0.8) * 20) < 0.35) return ink(out, ...wingDark, INK_BODY);
        return ink(out, ...(d < w * 0.5 ? wing : edge), INK_SCALE);
      }
      for (let i = 0; i < NF; i++) {
        const dd = toSegment(av, u, fu[i * 4], fu[i * 4 + 1], fu[i * 4 + 2], fu[i * 4 + 3]);
        if (dd < 0.017 * (1 - 0.55 * seg.t) + 0.004) {
          if (frac(seg.t * 5 + i * 0.3) < 0.28) return ink(out, ...wingDark, INK_DARK);
          return ink(out, ...(dd < 0.007 ? wing : edge), INK_BODY);
        }
      }
      return false;
    }, { light: 0.85 + 0.15 * Math.abs(f) });
  },
};
