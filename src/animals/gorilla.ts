/**
 * Gorille à dos argenté, de profil.
 *
 * Il marche sur les phalanges, bras et jambes en diagonale, lentement, puis
 * s'arrête : longues pauses assis (le torse monte et descend), parfois debout
 * immobile. Un clic proche le dresse sur les jambes et il se frappe le torse
 * (deux ou trois séries de battements, les bras montent et descendent), puis
 * il repart. Dessiné en gris-bleu très sombre avec du relief (INK_BODY), un
 * liseré violet sur le dos, cyan sous le ventre, et la selle argentée.
 * Toujours dessiné à l'endroit : il regarde à gauche ou à droite selon le
 * parcours, sans s'incliner avec le cap.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_BODY, INK_DARK, ink, type RGB } from "../ink";
import { angleDiff, rand, TAU } from "../math";
import { inEllipse, seg, toSegment } from "./shapes";

type Mode = "walk" | "rest" | "stand" | "beat";

interface Gorilla extends Creature {
  mode: Mode;
  until: number;
  /** +1 regarde à droite, -1 à gauche. */
  face: 1 | -1;
  gait: number;
  breath: number;
  /** 0 à quatre pattes, 1 debout. */
  rise: number;
  /** 0 en marche, 1 assis. */
  sit: number;
  /** 0 bras au repos, 1 en train de se frapper le torse. */
  pound: number;
  /** Phase des battements et nombre de tours à faire. */
  beatPhase: number;
  beatTurns: number;
  /** Allure lissée, 0 arrêté, 1 en marche. */
  go: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 2.2,
  fog: 0.3,
  density: 1.2,
  sway: 0.02,
  spread: 0.03,
  farthest: 0.4,
  farBias: 1.3,
  grip: 1.5,
  separation: 900,
  trail: 0.4,
  trailFade: 0.6,
  shimmer: 0.05,
  sparkle: 0.02,
  walk: 1,
  rest: 1,
  stand: 1,
  thump: 1,
};

// Palette sombre : gris-bleu, avec reflets violet et cyan faibles.
const BODY: RGB = [40, 44, 62];
const LIMB: RGB = [58, 63, 88];
const FAR: RGB = [24, 27, 42];
const SILVER: RGB = [128, 134, 158];
const SILVER_LOW: RGB = [96, 102, 126];
const FACE: RGB = [12, 13, 22];
const MUZZLE: RGB = [34, 38, 56];
const VIOLET: RGB = [138, 116, 255];
const CYAN: RGB = [92, 200, 255];
const EYE_COLOR: RGB = [220, 240, 255];

/** Hauteur du sol dans le repère du corps (fraction de span). */
const G = -0.3;
const TORSO = 0.5;

const sstep = (t: number) => t * t * (3 - 2 * t);
const ease = (a: number, b: number, k: number) => a + (b - a) * Math.min(1, k);

export const gorilla: Animal<Gorilla> = {
  key: "gorilla",
  label: "gorille",
  swatch: [156, 162, 190],
  defaults: DEFAULTS,
  controls: [
    ["Gorille", [
      { key: "walk", label: "Durée de marche", min: 0.2, max: 3, step: 0.05, hint: "Combien de temps il marche avant de s'arrêter." },
      { key: "rest", label: "Durée des pauses", min: 0, max: 3, step: 0.05, hint: "Longueur des pauses assis ou immobile. 0 : il ne s'arrête jamais." },
      { key: "stand", label: "Se redresse", min: 0, max: 3, step: 0.05, hint: "À quelle fréquence il se dresse sur ses jambes de lui-même." },
      { key: "thump", label: "Battements", min: 0.3, max: 3, step: 0.05, hint: "Nombre et vitesse des coups sur le torse après un clic." },
    ]],
  ],
  area: 50000,
  scale: 1.1,
  speed: 38,
  trail: { light: [60, 66, 90], dark: [70, 76, 104] },

  create: (c) => ({
    ...c,
    mode: "walk",
    until: 0,
    face: Math.random() < 0.5 ? 1 : -1,
    gait: rand(0, TAU),
    breath: rand(0, TAU),
    rise: 0,
    sit: 0,
    pound: 0,
    beatPhase: 0,
    beatTurns: 0,
    go: 1,
  }),

  enter(c, flock) {
    c.mode = "walk";
    c.until = flock.time + rand(2, 6);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;

    // Machine à états : marche, pause assis, debout immobile, battements.
    if (c.mode === "beat") {
      c.beatPhase += dt * 8 * Math.sqrt(k.thump);
      if (c.beatPhase >= c.beatTurns * TAU) {
        c.mode = "walk";
        c.until = t + rand(3, 6) * k.walk;
      }
    } else if (t >= c.until) {
      if (c.mode === "walk") {
        const r = Math.random();
        const wantStand = 0.2 * k.stand;
        if (k.rest <= 0) c.until = t + rand(3, 7) * k.walk;
        else if (r < wantStand / (1 + wantStand)) {
          c.mode = "stand";
          c.until = t + rand(2.5, 5) * k.rest;
        } else {
          c.mode = "rest";
          c.until = t + rand(5, 11) * k.rest;
        }
      } else {
        c.mode = "walk";
        c.until = t + rand(4, 9) * k.walk;
      }
    }

    // Postures lissées.
    const standing = c.mode === "stand" || c.mode === "beat";
    c.rise = ease(c.rise, standing ? 1 : 0, dt * 2.2);
    c.sit = ease(c.sit, c.mode === "rest" ? 1 : 0, dt * 1.4);
    c.pound = ease(c.pound, c.mode === "beat" ? 1 : 0, dt * 7);
    c.go = ease(c.go, c.mode === "walk" && c.rise < 0.1 ? 1 : 0, dt * 1.8);
    c.breath += dt * (c.mode === "rest" ? 1.5 : 2.4);

    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread;
    flock.begin();
    flock.steer(c, course, cruise * c.go, k.grip);
    flock.separate(c);
    const speed = flock.move(c, dt, cruise);
    if (flock.passed(c)) flock.reenter(c);

    // Il garde son cap de marche ; seul le côté regardé compte pour le dessin.
    c.face = Math.cos(course) >= 0 ? 1 : -1;
    c.heading += angleDiff(c.heading, course) * Math.min(1, dt * 2);

    if (c.go > 0.05) c.gait += (dt * speed) / Math.max(4, c.span * 0.1);
    else c.gait += (((Math.round(c.gait / Math.PI - 0.5) + 0.5) * Math.PI) - c.gait) * Math.min(1, dt * 4);
  },

  startle(c, _dx, _dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (c.mode === "beat") return;
    c.mode = "beat";
    c.beatPhase = 0;
    c.beatTurns = Math.max(1, Math.round(k.thump * (2 + strength)));
    c.startledUntil = flock.time + c.beatTurns * 0.8;
    c.until = c.startledUntil + 1;
  },

  draw(c, pen) {
    const S = c.span;
    const out = pen.ink;
    const f = c.face;
    const pose = { x: c.x, y: c.y, heading: f > 0 ? 0 : Math.PI, span: S, depth: c.depth, id: c.id };
    const at = { x: 0, y: 0 };
    const { rise, sit, pound } = c;
    const br = 1 + 0.035 * Math.sin(c.breath);

    // Hanches, épaules (u en avant, h en hauteur, repère de profil).
    const hipH = G + 0.22 - 0.12 * sit + 0.06 * rise;
    const hipU = -0.2 + 0.1 * rise - 0.04 * sit;
    const th = 0.28 + 0.6 * sit + 1.1 * rise;
    const ct = Math.cos(th);
    const st = Math.sin(th);
    const shU = hipU + TORSO * ct;
    const shH = hipH + TORSO * st;
    // Tête basse à quatre pattes, relevée quand il se dresse.
    const headU = shU + 0.24 - 0.03 * rise;
    const headH = shH - 0.17 + 0.17 * rise + 0.05 * sit;

    // Mains : marche, pendantes, ou battant le torse.
    const chestU = hipU + TORSO * 0.55 * ct + st * 0.17;
    const chestH = hipH + TORSO * 0.55 * st - ct * 0.17;
    const armU = shU + 0.01;
    const armH = shH - 0.06;
    const hand = (ph: number, beatOff: number, o: { u: number; h: number }) => {
      const lift = Math.max(0, Math.cos(ph));
      const wu = armU + 0.1 + 0.12 * Math.sin(ph) * (1 - sit);
      const wh = G + 0.04 + 0.08 * lift * c.go + 0.06 * sit;
      const hu = armU + 0.05 + 0.02 * Math.sin(c.breath);
      const hh = Math.max(G + 0.06, armH - 0.55);
      const bu = chestU;
      const bh = chestH + 0.14 * Math.sin(c.beatPhase + beatOff);
      o.u = ease(ease(wu, hu, rise), bu, pound);
      o.h = ease(ease(wh, hh, rise), bh, pound);
    };
    const handNear = { u: 0, h: 0 };
    const handFar = { u: 0, h: 0 };
    hand(c.gait, 0, handNear);
    hand(c.gait + Math.PI, 0.9, handFar);

    // Pieds : marche en diagonale des bras, assis jambes devant, debout posés.
    const foot = (ph: number, o: { u: number; h: number }) => {
      const lift = Math.max(0, Math.cos(ph));
      const wu = hipU + 0.06 + 0.08 * Math.sin(ph);
      const wh = G + 0.03 + 0.06 * lift * c.go;
      o.u = ease(ease(wu, hipU + 0.22, sit), hipU + 0.05, rise);
      o.h = ease(ease(wh, G + 0.03, sit), G + 0.03, rise);
    };
    const footNear = { u: 0, h: 0 };
    const footFar = { u: 0, h: 0 };
    foot(c.gait + Math.PI, footNear);
    foot(c.gait, footFar);

    const hipPt = { u: hipU + 0.02, h: hipH - 0.02 };
    const shPt = { u: armU, h: armH };

    // Un membre à deux segments, avec un coude ou un genou décalé.
    const limb = (u: number, h: number, a: { u: number; h: number }, b: { u: number; h: number }, bu: number, bh: number, r: number) => {
      const mu = (a.u + b.u) / 2 + bu;
      const mh = (a.h + b.h) / 2 + bh;
      const q1 = toSegment(u, h, a.u, a.h, mu, mh) / (r * (1.05 - 0.15 * seg.t));
      const q2 = toSegment(u, h, mu, mh, b.u, b.h) / (r * (0.9 + 0.2 * seg.t));
      return Math.min(q1, q2);
    };
    // Membre proche : clair au centre, contour sombre pour le separer du torse.
    const nearLimb = (q: number) => (q < 0.8 ? ink(out, ...LIMB, INK_BODY) : q < 1 && ink(out, ...FACE, INK_DARK));

    pen.shape(pose, 0.8, (u, v) => {
      const h = -v * f;

      // Bras proche : devant tout.
      if (nearLimb(limb(u, h, shPt, handNear, -0.06, 0.02, 0.065))) return true;
      if (inEllipse(u, h, handNear.u + 0.01, handNear.h - 0.01, 0.08, 0.06)) return ink(out, ...FACE, INK_DARK);

      // Tête : crâne, crête sagittale, front marqué, museau plat.
      const hx = u - headU;
      const hy = h - headH;
      if (inEllipse(hx, hy, 0, 0, 0.09, 0.08)) {
        if (inEllipse(hx, hy, 0.085, -0.03, 0.055, 0.05)) return ink(out, ...MUZZLE, INK_BODY);
        if (hy > 0.03 && hx > 0.0 && hx < 0.09 && hy < 0.055 + 0.03 * (hx / 0.09)) return ink(out, ...FACE, INK_DARK);
        return ink(out, ...FACE, INK_BODY);
      }
      // Crête sagittale en arrière du crâne.
      if (inEllipse(hx, hy, -0.03, 0.085, 0.075, 0.06)) return ink(out, ...BODY, INK_BODY);

      // Jambe proche.
      if (nearLimb(limb(u, h, hipPt, footNear, 0.07, 0.03, 0.075))) return true;
      if (inEllipse(u, h, footNear.u + 0.03, footNear.h, 0.09, 0.04)) return ink(out, ...FACE, INK_DARK);

      // Torse : capsule hanches-épaules, plus large aux épaules, qui respire.
      const d = toSegment(u, h, hipU, hipH, shU, shH);
      const along = seg.t;
      const rad = (0.09 + 0.07 * sstep(along)) * br;
      const sx = u - (shU - 0.02);
      const sy = h - (shH + 0.06);
      const hump = Math.hypot(sx, sy) < 0.17 * br;
      if (d < rad || hump) {
        // Côté du dos (au-dessus de l'axe) ou du ventre.
        const side = (u - hipU) * -st + (h - hipH) * ct;
        const back = side > 0;
        const q = hump ? Math.hypot(sx, sy) / (0.17 * br) : d / rad;
        if (back && along > 0.05 && along < 0.9 && side > 0.0 && q < 0.9) {
          // Dos argenté : plus clair vers le milieu, plus bas en croupe.
          return ink(out, ...(along < 0.4 ? SILVER_LOW : SILVER), INK_BODY);
        }
        if (q > 0.8) return ink(out, ...(back ? VIOLET : CYAN), INK_BODY);
        return ink(out, ...BODY, INK_BODY);
      }

      // Bras éloigné et jambe éloignée, plus sombres, derrière le torse.
      if (limb(u, h, shPt, handFar, -0.06, 0.02, 0.06) < 1) return ink(out, ...FAR, INK_BODY);
      if (inEllipse(u, h, handFar.u + 0.01, handFar.h - 0.01, 0.075, 0.055)) return ink(out, ...FAR, INK_BODY);
      if (limb(u, h, hipPt, footFar, 0.07, 0.03, 0.06) < 1) return ink(out, ...FAR, INK_BODY);
      if (inEllipse(u, h, footFar.u + 0.03, footFar.h, 0.075, 0.032)) return ink(out, ...FAR, INK_BODY);
      return false;
    });

    // Petit oeil, une seule cellule : toujours lisible, toujours là.
    pen.toWorld(pose, headU + 0.055, -(headH + 0.015) * f, at);
    pen.spot(at.x, at.y, "•", EYE_COLOR, FACE, c.depth);
  },
};
