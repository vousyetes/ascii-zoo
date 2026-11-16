/**
 * Rhinocéros, clin d'oeil à la gravure de Dürer (1515).
 *
 * Silhouette de profil, massive et basse : le corps est dessiné dans le repère de l'écran
 * (jamais pivoté), seulement retourné selon le côté vers lequel il avance. Plaques d'armure en
 * panneaux alternés séparés par des joints sombres et des rivets, grande corne sur le nez,
 * petite corne sur le garrot, oreille pointue, petit oeil, quatre pattes épaisses en marche
 * diagonale. Il avance lentement, fait des pauses ; un clic proche le fait charger tête
 * baissée dans la direction opposée, en soulevant de la poussière, puis il retombe au pas.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, INK_SPOT, ink, type RGB } from "../ink";
import { rand, TAU } from "../math";
import { inEllipse, toSegment, seg } from "./shapes";

interface Rhino extends Creature {
  /** Côté regardé à l'écran : +1 vers la droite, -1 vers la gauche. */
  dir: 1 | -1;
  walking: boolean;
  /** Fin de la marche ou de la pause en cours. */
  until: number;
  /** Phase du cycle de marche. */
  gait: number;
  /** 0 tête haute, 1 tête baissée en charge. */
  charge: number;
  fleeDir: number;
  fleeSpeed: number;
  fleeFrom: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 2.2,
  density: 1.2,
  sway: 0.02,
  spread: 0.03,
  farthest: 0.35,
  farBias: 1.3,
  grip: 1.5,
  separation: 500,
  trail: 1.1,
  walk: 1,
  rest: 1,
  stride: 1,
  rage: 1,
};

// Teinte dominante violette, corne et rivets en soleil, un souffle de cyan sur les plaques d'épaule.
const PLATE_A: RGB = [122, 104, 226];
const PLATE_B: RGB = [98, 86, 190];
const SHOULDER: RGB = [92, 150, 214];
const BELLY: RGB = [74, 66, 150];
const LEG_NEAR: RGB = [108, 94, 204];
const LEG_FAR: RGB = [70, 62, 144];
const HORN: RGB = [255, 176, 103];
const RIVET: RGB = [255, 200, 150];
const EYE: RGB = [236, 238, 247];
const EYE_BG: RGB = [14, 10, 20];

/** Racines des pattes (fu) : deux avant, deux arrière, et leur phase de marche diagonale. */
const LEGS: { hu: number; ph: number; far: boolean }[] = [
  { hu: 0.19, ph: 0, far: false },
  { hu: 0.13, ph: Math.PI, far: true },
  { hu: -0.15, ph: Math.PI, far: false },
  { hu: -0.21, ph: 0, far: true },
];
/** Joints verticaux entre les plaques. */
const JOINTS = [-0.2, -0.08, 0.04, 0.16];

export const rhino: Animal<Rhino> = {
  key: "rhino",
  label: "rhino",
  swatch: [138, 116, 255],
  defaults: DEFAULTS,
  controls: [
    ["Rhino", [
      { key: "walk", label: "Marche", min: 0.2, max: 4, step: 0.05, hint: "Durée de chaque marche." },
      { key: "rest", label: "Pause", min: 0, max: 4, step: 0.05, hint: "Durée des pauses. 0 : il ne s'arrête jamais." },
      { key: "stride", label: "Pas", min: 0.3, max: 2.5, step: 0.05, hint: "Vitesse du balancement des pattes." },
      { key: "rage", label: "Charge", min: 0, max: 3, step: 0.05, hint: "Force de la charge quand on clique près de lui." },
    ]],
  ],
  area: 45000,
  scale: 0.95,
  speed: 40,
  trail: { light: [150, 130, 190], dark: [168, 148, 214] },

  create: (c) => ({ ...c, dir: Math.random() < 0.5 ? 1 : -1, walking: true, until: 0, gait: rand(0, TAU), charge: 0, fleeDir: 0, fleeSpeed: 0, fleeFrom: 0 }),

  enter(c, flock) {
    c.walking = true;
    c.until = flock.time + rand(1, 4);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    if (t >= c.until) {
      c.walking = !c.walking || k.rest <= 0;
      c.until = t + (c.walking ? rand(3, 8) * k.walk : rand(1, 3.5) * k.rest);
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

    // Il regarde du côté où il va, avec un peu d'hystérésis pour ne pas se retourner sur place.
    if (speed > 3) {
      const cx = c.vx / speed;
      if (cx > 0.25) c.dir = 1;
      else if (cx < -0.25) c.dir = -1;
    }
    c.heading = Math.atan2(c.vy, c.vx);
    // Cycle de marche calé sur la vitesse : lourd et lent, plus vif en charge.
    c.gait += (dt * speed * k.stride) / Math.max(6, c.span * 0.12);
    const target = charging ? 1 - calm * calm * 0.6 : 0;
    c.charge += (target - c.charge) * Math.min(1, dt * (charging ? 8 : 2));
  },

  startle(c, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.rage <= 0) return;
    c.fleeDir = Math.atan2(dy, dx) + rand(-0.15, 0.15);
    c.fleeSpeed = flock.cruise(c) * (3 + 3 * strength) * k.rage;
    c.fleeFrom = flock.time;
    c.startledUntil = flock.time + (1.2 + 1.6 * strength) * Math.sqrt(k.rage);
    c.walking = true;
    c.until = c.startledUntil + rand(1, 3);
    if (Math.cos(c.fleeDir) > 0.1) c.dir = 1;
    else if (Math.cos(c.fleeDir) < -0.1) c.dir = -1;
  },

  draw(c, pen) {
    const S = c.span;
    const out = pen.ink;
    const d = c.dir;
    const ch = c.charge;
    // Repère de l'écran : heading 0 ; fu = avant du rhino (u de l'échantillon retourné selon d).
    const pose = { x: c.x, y: c.y, heading: 0, span: S, depth: c.depth, id: c.id };
    const at = { x: 0, y: 0 };
    const bob = 0.008 * Math.sin(c.gait * 2); // balancement lourd du corps
    const sway = 0.03 * Math.sin(c.gait);
    const headDown = 0.09 * ch;

    // Position des pieds : balancement avant-arrière, relevé quand la patte passe.
    const foot = LEGS.map((l) => {
      const lift = Math.max(0, Math.cos(l.ph + c.gait));
      return { fu: l.hu + 0.06 * Math.sin(l.ph + c.gait), v: 0.27 - 0.04 * lift, lift };
    });

    pen.shape(pose, 0.65, (u, v) => {
      const fu = u * d;
      // Pattes d'abord : segments épais, plus sombres pour la paire éloignée.
      for (let i = 0; i < 4; i++) {
        const l = LEGS[i];
        const f = foot[i];
        const dist = toSegment(fu, v, l.hu + sway * 0.3, 0.05, f.fu, f.v);
        const w = 0.05 - 0.01 * seg.t;
        if (dist < w) {
          if (v > f.v - 0.025) return ink(out, ...LEG_FAR, INK_DARK, "#"); // sabot
          return ink(out, ...(l.far ? LEG_FAR : LEG_NEAR), INK_SCALE);
        }
      }
      // Queue fine à l'arrière.
      if (toSegment(fu, v, -0.27, -0.06 + bob, -0.31, 0.04) < 0.008) return ink(out, ...LEG_FAR, INK_DARK);

      // Grande corne sur le nez, rabaissée en charge.
      if (toSegment(fu, v, 0.43, -0.02 + headDown, 0.53 + 0.04 * ch, -0.17 + headDown * 1.7) < 0.035 * (1 - seg.t * 0.9) + 0.004) {
        return ink(out, ...HORN, INK_SCALE);
      }
      // Petite corne sur le garrot.
      if (toSegment(fu, v, 0.14, -0.12 + bob, 0.17, -0.2 + bob) < 0.02 * (1 - seg.t * 0.85) + 0.003) return ink(out, ...HORN, INK_SCALE);
      // Oreille pointue.
      if (toSegment(fu, v, 0.27, -0.06 + headDown, 0.255, -0.15 + headDown) < 0.02 * (1 - seg.t * 0.9) + 0.002) return ink(out, ...PLATE_B, INK_DARK);

      // Tête : ellipse allongée, qui plonge en charge.
      if (inEllipse(fu, v, 0.36, 0.01 + headDown, 0.12, 0.075)) {
        // Joint du cou et plaque de joue.
        if (Math.abs(fu - 0.26) < 0.007) return ink(out, ...PLATE_B, INK_DARK);
        if (Math.abs(v - (0.03 + headDown)) < 0.006 && fu > 0.3) return ink(out, ...PLATE_B, INK_DARK);
        return ink(out, ...PLATE_A, INK_SCALE);
      }

      // Corps : superellipse massive et basse.
      const bu = fu / 0.28;
      const bv = (v - bob + 0.02) / 0.14;
      if (Math.pow(Math.abs(bu), 3) + Math.pow(Math.abs(bv), 2.4) <= 1) {
        // Joints verticaux entre les plaques, avec leurs rivets.
        for (const j of JOINTS) {
          if (Math.abs(fu - j) < 0.007) {
            const rivet = Math.abs(((v + 0.3) % 0.06) - 0.03) < 0.012;
            return rivet ? ink(out, ...RIVET, INK_SPOT) : ink(out, ...PLATE_B, INK_DARK);
          }
        }
        // Joint horizontal sous la ligne du dos et ventre plus sombre.
        if (Math.abs(v - (0.0 + bob)) < 0.006) return ink(out, ...PLATE_B, INK_DARK);
        if (v > 0.07 + bob) return ink(out, ...BELLY, INK_DARK);
        // Plaque d'épaule en cyan, les autres alternent violet clair et foncé.
        if (fu > 0.04 && fu < 0.16) return ink(out, ...SHOULDER, INK_SCALE);
        const panel = Math.floor((fu + 0.3) / 0.12);
        return ink(out, ...(panel % 2 ? PLATE_A : PLATE_B), INK_SCALE);
      }
      return false;
    });

    // Petit oeil, toujours une cellule nette.
    pen.toWorld(pose, d * 0.37, -0.015 + headDown, at);
    pen.spot(at.x, at.y, "o", EYE, EYE_BG, c.depth);

    // Poussière : à chaque pas qui touche le sol, bien plus en charge.
    const dust = ch > 0.2 ? 0.5 * ch : 0.05;
    foot.forEach((f, i) => {
      if (f.lift < 0.1 || ch > 0.2) {
        pen.toWorld(pose, d * f.fu, f.v, at);
        if (f.lift < 0.1 && Math.cos(LEGS[i].ph + c.gait) < 0.2) pen.shed(at.x, at.y, dust * c.depth);
      }
    });
  },
};
