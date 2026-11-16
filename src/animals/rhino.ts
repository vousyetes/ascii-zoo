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
  detail: 3.0,
  density: 1.0,
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

// Gris d'ardoise, deux cornes blanc ivoire, rivets clairs.
const PLATE_A: RGB = [150, 156, 170];
const PLATE_B: RGB = [96, 102, 118];
const SHOULDER: RGB = [178, 186, 200];
const BELLY: RGB = [70, 74, 88];
const LEG_NEAR: RGB = [128, 134, 150];
const LEG_FAR: RGB = [78, 82, 96];
const HORN: RGB = [226, 223, 213];
const RIVET: RGB = [250, 248, 242];
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
  swatch: [178, 186, 200],
  defaults: DEFAULTS,
  controls: [
    ["Rhino", [
      { key: "walk", label: "Marche", min: 0.2, max: 4, step: 0.05, hint: "Durée de chaque marche." },
      { key: "rest", label: "Pause", min: 0, max: 4, step: 0.05, hint: "Durée des pauses. 0 : il ne s'arrête jamais." },
      { key: "stride", label: "Pas", min: 0.3, max: 2.5, step: 0.05, hint: "Vitesse du balancement des pattes." },
      { key: "rage", label: "Charge", min: 0, max: 3, step: 0.05, hint: "Force de la charge quand on clique près de lui." },
    ]],
  ],
  area: 100000,
  scale: 1.8,
  speed: 40,
  trail: { light: [140, 146, 160], dark: [150, 156, 172] },

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

    pen.shape(pose, 0.7, (u, v) => {
      const fu = u * d;
      // Pattes d'abord : gravure d'ecailles, sabots a trois orteils, plus sombres pour la paire eloignee.
      for (let i = 0; i < 4; i++) {
        const l = LEGS[i];
        const f = foot[i];
        const dist = toSegment(fu, v, l.hu + sway * 0.3, 0.05, f.fu, f.v);
        const w = 0.05 - 0.01 * seg.t;
        if (dist < w) {
          if (v > f.v - 0.03) {
            const toe = Math.floor((fu - f.fu + 0.05) / 0.017) % 2 === 0;
            return toe ? ink(out, ...LEG_FAR, INK_DARK, "#") : ink(out, ...HORN, INK_SPOT);
          }
          // Bague plissee au genou, puis ecailles en quinconce.
          if (Math.abs(v - 0.16) < 0.006) return ink(out, ...PLATE_B, INK_DARK);
          const stud = (Math.floor(fu / 0.016) + Math.floor(v / 0.016)) % 2 === 0;
          return ink(out, ...(l.far ? LEG_FAR : stud ? LEG_NEAR : PLATE_B), stud ? INK_SCALE : INK_DARK);
        }
      }
      // Queue fine a l'arriere, avec un petit pinceau.
      if (toSegment(fu, v, -0.27, -0.06 + bob, -0.31, 0.06) < 0.008) return ink(out, ...LEG_FAR, INK_DARK);
      if (inEllipse(fu, v, -0.312, 0.075, 0.012, 0.025)) return ink(out, ...PLATE_B, INK_DARK);

      // Grande corne : courbee vers l'arriere, baguee comme une corne vraie.
      const hornTipX = 0.51 + 0.03 * ch;
      if (toSegment(fu, v, 0.42, 0.0 + headDown, 0.5, -0.09 + headDown * 1.4) < 0.032 * (1 - seg.t * 0.4)) {
        return Math.floor(seg.t * 4) % 2 ? ink(out, ...HORN, INK_SCALE) : ink(out, ...RIVET, INK_SCALE);
      }
      if (toSegment(fu, v, 0.5, -0.09 + headDown * 1.4, hornTipX, -0.19 + headDown * 1.8) < 0.02 * (1 - seg.t * 0.9) + 0.003) {
        return ink(out, ...RIVET, INK_SCALE);
      }
      // Deuxieme corne, plus courte, derriere la grande sur le nez.
      if (toSegment(fu, v, 0.36, -0.06 + headDown, 0.4, -0.15 + headDown * 1.3) < 0.026 * (1 - seg.t * 0.8) + 0.003) return Math.floor(seg.t * 3) % 2 ? ink(out, ...HORN, INK_SCALE) : ink(out, ...RIVET, INK_SCALE);
      // Oreille pointue, avec son creux.
      if (toSegment(fu, v, 0.27, -0.06 + headDown, 0.255, -0.16 + headDown) < 0.02 * (1 - seg.t * 0.9) + 0.003) {
        return seg.t < 0.5 ? ink(out, ...PLATE_A, INK_SCALE) : ink(out, ...PLATE_B, INK_DARK);
      }

      // Tete : crane, museau tombant, babine, arcade, narine.
      const hv = v - headDown;
      const skull = inEllipse(fu, hv, 0.33, 0.0, 0.1, 0.075);
      const snout = inEllipse(fu, hv, 0.43, 0.03, 0.065, 0.05);
      if (skull || snout) {
        if (Math.abs(fu - 0.26) < 0.007) return ink(out, ...PLATE_B, INK_DARK);
        // Bouche : trait sombre qui descend en babine.
        if (fu > 0.34 && Math.abs(hv - (0.052 - 0.04 * Math.max(0, 0.46 - fu))) < 0.005) return ink(out, ...EYE_BG, INK_DARK);
        // Arcade au-dessus de l'oeil, plis de la joue.
        if (Math.abs(hv + 0.03) < 0.005 && fu > 0.31 && fu < 0.4) return ink(out, ...PLATE_B, INK_DARK);
        if (Math.abs(fu - 0.33) < 0.005 && hv > 0.0) return ink(out, ...PLATE_B, INK_DARK);
        if (Math.hypot(fu - 0.47, hv - 0.035) < 0.012) return ink(out, ...EYE_BG, INK_DARK);
        // Paupiere : un anneau sombre autour de l'oeil, et des rides sur le front.
        const eyeR = Math.hypot(fu - 0.37, hv + 0.015);
        if (eyeR > 0.022 && eyeR < 0.03) return ink(out, ...EYE_BG, INK_DARK);
        if (hv < -0.035 && Math.floor((fu + 0.5) / 0.014) % 2 === 0) return ink(out, ...PLATE_B, INK_DARK);
        return ink(out, ...(hv < -0.02 ? PLATE_A : PLATE_B), INK_SCALE);
      }

      // Corps : superellipse massive et basse, dessinee comme une gravure.
      const bu = fu / 0.28;
      const bv = (v - bob + 0.02) / 0.14;
      const q = Math.pow(Math.abs(bu), 3) + Math.pow(Math.abs(bv), 2.4);
      // Plaque d'epaule bombee, qui depasse la ligne du dos.
      const es = Math.hypot((fu - 0.1) / 0.075, (v - bob + 0.045) / 0.135);
      // Plaque de cuisse arriere.
      const et = Math.hypot((fu + 0.17) / 0.075, (v - bob - 0.0) / 0.105);
      if (es <= 1 || et <= 1 || q <= 1) {
        const plate = es <= 1 ? es : et <= 1 ? et : 9;
        if (plate < 1) {
          // Cadre sombre, rivets regulierement espaces, puis hachures de gravure.
          if (plate > 0.82) {
            const ang = Math.atan2(v - bob + (es <= 1 ? 0.045 : 0), fu - (es <= 1 ? 0.1 : -0.17));
            return Math.floor((ang + Math.PI) / (TAU / 14)) % 2 ? ink(out, ...RIVET, INK_SPOT) : ink(out, ...PLATE_B, INK_DARK);
          }
          if (plate > 0.5 && plate < 0.56) return ink(out, ...PLATE_B, INK_DARK); // second filet de la plaque
          const hatch = Math.floor((v + fu * 0.4 + 0.5) / 0.014) % 2 === 0;
          return ink(out, ...(es <= 1 ? SHOULDER : PLATE_A), hatch ? INK_SCALE : INK_DARK);
        }
        // Collier plisse entre la tete et l'epaule : cotes horizontales.
        if (fu > 0.19 && fu < 0.27) {
          return Math.floor((v + 0.4) / 0.018) % 2 === 0 ? ink(out, ...PLATE_B, INK_DARK) : ink(out, ...PLATE_A, INK_SCALE);
        }
        if (q > 0.84) return ink(out, ...PLATE_B, INK_DARK); // contour de gravure
        // Joints verticaux entre les plaques, avec leurs rivets.
        for (const j of JOINTS) {
          if (Math.abs(fu - j) < 0.006) {
            const rivet = Math.abs(((v + 0.3) % 0.05) - 0.025) < 0.011;
            return rivet ? ink(out, ...RIVET, INK_SPOT) : ink(out, ...PLATE_B, INK_DARK);
          }
        }
        if (Math.abs(v - (0.0 + bob)) < 0.005) return ink(out, ...PLATE_B, INK_DARK);
        if (v > 0.07 + bob) return ink(out, ...BELLY, INK_DARK);
        const panel = Math.floor((fu + 0.3) / 0.12);
        const tone = (Math.floor((v + 0.5) / 0.02) % 2 === 0) !== (panel % 2 === 1);
        // Plis de peau fins qui ondulent sur le flanc, puis un degrade du dos vers le ventre.
        const fold = ((((v + 0.5 + 0.012 * Math.sin(fu * 45)) % 0.036) + 0.036) % 0.036) - 0.018;
        if (Math.abs(fold) < 0.0028) return ink(out, ...PLATE_B, INK_DARK);
        const sh = 1.12 - 0.9 * (v + 0.15);
        const base = tone ? PLATE_A : PLATE_B;
        return ink(out, base[0] * sh, base[1] * sh, base[2] * sh, INK_SCALE);
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
