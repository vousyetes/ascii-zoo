/**
 * Le paon, vu de profil.
 *
 * Il marche d'un pas digne, la traine fermee pendant derriere en longues plumes, et
 * picore de temps en temps (la tete descend). Un clic proche lui fait faire la roue :
 * l'eventail s'ouvre en quelques dixiemes de seconde, reste ouvert deux ou trois secondes
 * en fremissant, puis se referme. Eventail ouvert, la couleur des plumes suit le degrade
 * de la marque (soleil, corail, rose, cyan) et chaque plume finit par un ocelle.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, INK_SHIMMER, ink, type RGB } from "../ink";
import { angleDiff, clamp, lerp, rand, TAU } from "../math";
import { toSegment, inEllipse } from "./shapes";

interface Peacock extends Creature {
  /** Phase du pas. */
  gait: number;
  /** 0 traine fermee, 1 eventail ouvert. */
  open: number;
  /** La roue dure jusqu'a cet instant. */
  fanUntil: number;
  /** Prochain picorage, et son debut/duree en cours. */
  nextPeck: number;
  peckFrom: number;
  peckDur: number;
  /** 0 tete haute, 1 tete au sol. */
  peck: number;
  /** Mise a l'echelle de la vitesse en marche (0 arrete). */
  go: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 2.2,
  fog: 0.2,
  density: 1.2,
  sway: 0.02,
  spread: 0.03,
  farthest: 0.5,
  farBias: 1.2,
  separation: 500,
  trail: 0.5,
  trailFade: 1,
  hold: 2.5,
  peckRate: 1,
  stride: 1,
  shiver: 1,
};

const BODY: RGB = [92, 200, 255];
const DEEP: RGB = [46, 120, 214];
const WING: RGB = [138, 116, 255];
const BEAK: RGB = [255, 176, 103];
const LEG: RGB = [170, 150, 140];
const NIGHT: RGB = [10, 12, 30];
const EYE: RGB = [14, 10, 10];

/** Degrade signature le long de l'eventail : soleil, corail, rose, cyan. */
const STOPS: RGB[] = [
  [255, 176, 103],
  [255, 111, 97],
  [200, 111, 208],
  [92, 200, 255],
];
function gradient(t: number, out: RGB): RGB {
  const x = clamp(t, 0, 1) * (STOPS.length - 1);
  const i = Math.min(STOPS.length - 2, Math.floor(x));
  const f = x - i;
  for (let k = 0; k < 3; k++) out[k] = lerp(STOPS[i][k], STOPS[i + 1][k], f);
  return out;
}

const FEATHERS = 23;
const col: RGB = [0, 0, 0];
const at = { x: 0, y: 0 };

export const peacock: Animal<Peacock> = {
  key: "peacock",
  label: "paon",
  swatch: [92, 200, 255],
  defaults: DEFAULTS,
  controls: [
    ["Paon", [
      { key: "hold", label: "Duree de la roue", min: 1, max: 6, step: 0.1, hint: "Combien de secondes l'eventail reste ouvert apres un clic." },
      { key: "peckRate", label: "Picorage", min: 0, max: 3, step: 0.05, hint: "A quelle frequence il baisse la tete. 0 : jamais." },
      { key: "stride", label: "Pas", min: 0.2, max: 2, step: 0.05, hint: "Vitesse du battement des pattes." },
      { key: "shiver", label: "Fremissement", min: 0, max: 2, step: 0.05, hint: "Force du tremblement des plumes quand la roue est ouverte." },
    ]],
  ],
  area: 45000,
  scale: 0.9,
  speed: 40,
  trail: { light: [150, 150, 190], dark: [92, 120, 190] },

  create: (c) => ({ ...c, gait: rand(0, TAU), open: 0, fanUntil: 0, nextPeck: 0, peckFrom: 0, peckDur: 1, peck: 0, go: 1 }),

  enter(c, flock) {
    c.heading = flock.course;
    c.nextPeck = flock.time + rand(1, 6);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const fanning = t < c.fanUntil;
    // Roue : s'ouvre vite (quelques dixiemes), se ferme plus doucement.
    c.open = clamp(c.open + (fanning ? dt * 4 : -dt * 1.2), 0, 1);

    // Picorage : une courbe de cloche sur la duree, jamais pendant la roue.
    let pecking = false;
    if (!fanning && k.peckRate > 0) {
      if (t >= c.nextPeck && t > c.peckFrom + c.peckDur) {
        c.peckFrom = t;
        c.peckDur = rand(0.9, 1.5);
        c.nextPeck = t + rand(3, 8) / k.peckRate;
      }
      pecking = t < c.peckFrom + c.peckDur;
    }
    const ph = clamp((t - c.peckFrom) / c.peckDur, 0, 1);
    const want = pecking ? Math.sin(Math.PI * ph) ** 0.6 : 0;
    c.peck += (want - c.peck) * Math.min(1, dt * 10);

    // Il s'arrete pour picorer et reste a peu pres sur place pendant la roue.
    const target = pecking ? 0 : fanning ? 0.15 : 1;
    c.go += (target - c.go) * Math.min(1, dt * 4);

    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread;
    flock.begin();
    flock.steer(c, course, cruise * c.go, k.grip * 2);
    flock.separate(c);
    const speed = flock.move(c, dt, cruise * 1.5);
    if (flock.passed(c)) flock.reenter(c);
    c.heading += clamp(angleDiff(c.heading, course), -2 * dt, 2 * dt);
    c.gait += (dt * speed * k.stride) / Math.max(4, c.span * 0.1);
  },

  startle(c, _dx, _dy, _strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    c.fanUntil = flock.time + k.hold * rand(0.9, 1.2);
  },

  draw(c, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const S = c.span;
    const out = pen.ink;
    // Toujours vu de profil, pattes vers le bas de l'ecran : on retourne v si le paon va vers la gauche.
    const f = Math.cos(c.heading) < 0 ? -1 : 1;
    const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
    const o = c.open;
    const bob = Math.sin(c.gait * 2) * 0.008 * c.go;
    const t = pen.t;

    // Pattes (sous le corps), en alternance.
    for (const side of [0, 1]) {
      const sw = Math.sin(c.gait + side * Math.PI) * 0.05 * c.go;
      pen.lineBody(pose, -0.03 + sw * 0.3, 0.1 * f, -0.03 + sw, 0.3 * f, LEG);
    }

    // Traine : meme plumes fermees (pendantes derriere) ou ouvertes (eventail).
    const base = -0.2;
    const baseV = -0.02;
    const shiver = o > 0.9 ? k.shiver : 0;
    for (let i = 0; i < FEATHERS; i++) {
      const s = i / (FEATHERS - 1);
      // Ouverte : de l'arriere-bas vers l'avant-haut en passant par le haut. Fermee : tout vers l'arriere.
      const openA = lerp(-0.05, Math.PI - 0.25, s);
      const closedA = -0.1 - 0.35 * s;
      const wob = shiver * 0.03 * Math.sin(t * 17 + i * 1.7);
      const a = lerp(closedA, openA, o) + wob;
      const len = lerp(0.62 + 0.18 * Math.sin(s * Math.PI), 0.78, o) * (1 + shiver * 0.02 * Math.sin(t * 13 + i));
      const r0 = 0.06;
      const ux = -Math.cos(a);
      const vy = -Math.sin(a);
      gradient(s, col);
      for (let q = 0; q < 3; q++) col[q] = lerp(col[q], 255, 0.25 * o);
      const tipU = base + ux * len;
      const tipV = baseV + vy * len;
      // Plume epaisse : trois traits cote a cote, eclaircis quand la roue est ouverte pour plus de presence.
      for (let j = -1; j <= 1; j++) {
        const aj = a + j * (o > 0.3 ? 0.05 : 0.025);
        const l = len * (j === 0 ? 1 : 0.92);
        pen.lineBody(pose, base - Math.cos(aj) * r0, (baseV - Math.sin(aj) * r0) * f, base - Math.cos(aj) * l, (baseV - Math.sin(aj) * l) * f, col);
      }
      if (o > 0.25) {
        // Ocelle : anneau de la couleur de la plume, centre sombre.
        pen.toWorld(pose, tipU, tipV * f, at);
        pen.spot(at.x, at.y, "◎", col, NIGHT, c.depth);
      }
    }

    // Corps, cou, tete.
    const headU = 0.3 + 0.1 * c.peck;
    const headV = -0.2 + 0.4 * c.peck + bob;
    pen.shape(pose, 0.6, (u, v0) => {
      const v = v0 * f;
      // Aigrette : trois petites plumes sur la tete.
      for (let j = -1; j <= 1; j++) {
        if (toSegment(u, v, headU, headV - 0.03, headU - 0.03 + j * 0.035, headV - 0.12) < 0.012) return ink(out, ...BEAK, INK_SCALE);
      }
      // Bec.
      if (toSegment(u, v, headU + 0.03, headV, headU + 0.08, headV + 0.02) < 0.014) return ink(out, ...BEAK, INK_DARK);
      // Tete.
      if (inEllipse(u, v, headU, headV, 0.045, 0.04)) return ink(out, ...BODY, INK_SHIMMER);
      // Cou fin, de la poitrine a la tete.
      if (toSegment(u, v, 0.14, -0.04 + bob, headU - 0.01, headV + 0.02) < 0.03) return ink(out, ...BODY, INK_SHIMMER);
      // Corps : ovale, ventre plus profond, aile violette.
      if (inEllipse(u, v, -0.04, bob, 0.22, 0.12)) {
        if (inEllipse(u, v, -0.08, bob - 0.02, 0.12, 0.05)) return ink(out, ...WING, INK_SHIMMER);
        return v > bob + 0.05 ? ink(out, ...DEEP, INK_DARK) : ink(out, ...BODY, INK_SHIMMER);
      }
      return false;
    });

    // Oeil : une cellule sombre avec un reflet.
    pen.toWorld(pose, headU + 0.012, (headV - 0.008) * f, at);
    pen.spot(at.x, at.y, "●", [255, 252, 246], EYE, c.depth);
  },
};
