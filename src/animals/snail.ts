/**
 * Escargot, clin d'oeil au nombre d'or.
 *
 * Sa coquille est une vraie spirale logarithmique r = a * exp(b * theta), avec b choisi pour que
 * le rayon soit multiplie par le nombre d'or a chaque quart de tour. Chaque point (u, v) de la
 * coquille est converti en coordonnees polaires pour retrouver sur quel tour il se trouve, et les
 * tours alternent entre soleil et corail. Corps mou rose clair avec degrade, deux grands
 * tentacules oculaires terminés par un point lumineux, deux petits, pied qui ondule en vagues.
 * Extremement lent, il laisse une traînee de bave cyan pale qui persiste. Un clic proche le fait
 * rentrer dans sa coquille quelques secondes, puis il ressort.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, ink, type RGB } from "../ink";
import { rand, TAU } from "../math";

interface Snail extends Creature {
  /** Phase de l'ondulation du pied. */
  gait: number;
  /** 0 sorti, 1 entierement rentre dans la coquille. */
  hide: number;
  /** Phase des tentacules. */
  sway: number;
  /** Points recents du chemin (px) qui nourrissent la bave. */
  path: [number, number][];
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.7,
  density: 0.7,
  sway: 0.02,
  spread: 0.03,
  farthest: 0.5,
  farBias: 0.8,
  grip: 1.5,
  separation: 500,
  trail: 1,
  trailFade: 1.2,
  wave: 1,
  hideFor: 1,
  slime: 1,
};

const SUN: RGB = [255, 176, 103];
const CORAL: RGB = [255, 111, 97];
const SEAM: RGB = [150, 62, 60];
const SKIN_HEAD: RGB = [226, 184, 203];
const SKIN_TAIL: RGB = [214, 170, 190];
const GLOW: RGB = [236, 238, 247];
const EYE_FILL: RGB = [255, 111, 97];

/** Spirale d'or : le rayon est multiplie par phi tous les quarts de tour. */
const PHI = (1 + Math.sqrt(5)) / 2;
const B = Math.log(PHI) / (Math.PI / 2);
const SHELL_R = 0.25;
const SHELL_U = -0.06;
/** Rayon de depart a theta = 0 : apres 4 tours la spirale atteint SHELL_R. */
const A = SHELL_R / Math.exp(B * 4 * TAU * 0.25);

const mix = (a: RGB, b: RGB, t: number): RGB => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];

export const snail: Animal<Snail> = {
  key: "snail",
  label: "escargot",
  swatch: [255, 176, 103],
  defaults: DEFAULTS,
  controls: [
    ["Escargot", [
      { key: "wave", label: "Ondulation", min: 0, max: 2, step: 0.05, hint: "Amplitude des vagues le long du pied." },
      { key: "hideFor", label: "Temps rentre", min: 0.3, max: 3, step: 0.05, hint: "Duree pendant laquelle il reste dans sa coquille apres un clic." },
      { key: "slime", label: "Bave", min: 0, max: 3, step: 0.05, hint: "Quantite de bave brillante laissee derriere lui." },
    ]],
  ],
  area: 230000,
  scale: 2,
  speed: 14,
  trail: { light: [92, 170, 215], dark: [150, 220, 255] },

  create: (c) => ({ ...c, gait: rand(0, TAU), hide: 0, sway: rand(0, TAU), path: [] }),

  enter(c, flock) {
    c.heading = flock.course;
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const hidden = flock.time < c.startledUntil;
    c.hide += Math.max(-dt * 0.5, Math.min(dt * 3, (hidden ? 1 : 0) - c.hide));
    const cruise = flock.cruise(c) * (1 - c.hide);
    flock.begin();
    flock.steer(c, flock.heading + c.bias * k.spread, cruise, k.grip);
    flock.separate(c);
    const speed = flock.move(c, dt, cruise * 2);
    if (flock.passed(c)) flock.reenter(c);
    c.gait += dt * (1.2 + speed * 0.25) * (1 - c.hide);
    c.sway += dt * 1.3;
  },

  startle(c, _dx, _dy, _strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    c.startledUntil = flock.time + rand(2, 3) * k.hideFor;
    c.vx = 0;
    c.vy = 0;
  },

  draw(c, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const S = c.span;
    const out = pen.ink;
    const hide = c.hide;
    const ext = 1 - hide;
    const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
    const at = { x: 0, y: 0 };

    const front = 0.46 - 0.3 * hide;
    const tail = -0.5 + 0.3 * hide;
    const amp = 0.014 * (1 - hide);

    // Bave : un point tous les 6 px le long du chemin, rejoue chaque image avec une force qui
    // decroit avec l'age. Ca donne un filet etroit et continu au lieu d'un disque qui s'etale.
    if (ext > 0.5 && k.slime > 0) {
      pen.toWorld(pose, tail + 0.05, 0, at);
      const p = c.path;
      const last = p.length ? p[p.length - 1] : null;
      if (!last || Math.hypot(at.x - last[0], at.y - last[1]) > 400) p.length = 0;
      if (!last || Math.hypot(at.x - last[0], at.y - last[1]) >= 6) p.push([at.x, at.y]);
      if (p.length > 70) p.shift();
      for (let i = 0; i < p.length; i++) pen.shed(p[i][0], p[i][1], 0.03 * k.slime * (0.3 + 0.7 * (i / p.length)));
    }

    // Tentacules : deux grands oculaires, deux petits, qui rentrent avec le corps.
    if (ext > 0.12) {
      const bigs: [number, number][] = [[0.34, 1], [0.34, -1]];
      for (const [len, side] of bigs) {
        const w = Math.sin(c.sway + side * 1.7) * 0.04;
        const u1 = front + len * ext * 0.9;
        const v1 = (0.05 + 0.1 * ext) * side + w;
        pen.lineBody(pose, front - 0.04, 0.035 * side, front + 0.05, v1 * 0.55, SKIN_HEAD);
        pen.lineBody(pose, front + 0.05, v1 * 0.55, u1, v1, SKIN_HEAD);
        pen.lineBody(pose, front + 0.05, v1 * 0.55 + 0.018, u1, v1 + 0.018, SKIN_HEAD);
        pen.toWorld(pose, u1, v1, at);
        pen.spot(at.x, at.y, "●", GLOW, EYE_FILL, c.depth);
      }
      for (const side of [-1, 1]) {
        const w = Math.sin(c.sway * 1.3 + side) * 0.02;
        pen.lineBody(pose, front, 0.05 * side, front + 0.1 * ext, (0.08 + 0.02 * ext) * side + w, SKIN_HEAD);
      }
    }

    pen.shape(pose, 0.62, (u, v) => {
      // Coquille : disque porteur de la spirale d'or.
      const du = u - SHELL_U;
      const r = Math.hypot(du, v);
      if (r < SHELL_R) {
        const theta = Math.atan2(v, du);
        // Numero de tour continu : ln(r/A)/B est l'angle deroule de la spirale a ce rayon.
        const turns = (Math.log(Math.max(r, 1e-4) / A) / B - theta) / TAU;
        const f = turns - Math.floor(turns);
        if (r < 0.02) return ink(out, ...SEAM, INK_DARK);
        if (f < 0.07) return ink(out, ...SEAM, INK_DARK);
        return f < 0.55 ? ink(out, ...SUN, INK_SCALE) : ink(out, ...CORAL, INK_SCALE);
      }
      // Corps : pied ondulant, tete arrondie, degrade de la queue vers la tete.
      if (u < tail || u > front) return false;
      const ut = (u - tail) / (front - tail);
      const half = 0.15 * Math.min(1, 0.12 + ut * 2.2) * (ut > 0.88 ? 1 - (ut - 0.88) * 4 : 1) * (0.5 + 0.5 * ext);
      const off = amp * k.wave * Math.sin(u * 26 - c.gait * 3);
      const vv = v - off;
      const bulge = 1 + 0.18 * Math.sin(u * 26 - c.gait * 3 + 1.2) * ext;
      if (Math.abs(vv) > half * bulge) return false;
      const col = mix(SKIN_TAIL, SKIN_HEAD, ut);
      // Bord du pied plus sombre, reflet clair sur le dos.
      if (Math.abs(vv) > half * 0.82) return ink(out, ...mix(col, SEAM, 0.3), INK_SCALE);
      return ink(out, ...col, INK_SCALE);
    });
  },
};
