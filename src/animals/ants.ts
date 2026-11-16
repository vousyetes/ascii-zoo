/**
 * Fourmis : tête, thorax sombre, abdomen (parfois double), 2 antennes et 6 pattes
 * qui alternent "/" et "\". Elles errent, et chaque clic lâche un bloc de sucre blanc
 * qu'elles démontent case par case pour le rapporter à la fourmilière (en bas à gauche).
 * Leurs pas laissent des traces, plus fortes quand elles portent du sucre.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import { clamp, angleDiff, rand, TAU } from "../math";
import type { RGB } from "../ink";

type Etat = "erre" | "sucre" | "porte" | "dedans";

interface Pt {
  x: number;
  y: number;
  nid?: boolean;
}

interface Ant extends Creature {
  etat: Etat;
  /** Direction de marche (le corps pivote avec). */
  cap: number;
  gait: number;
  vitesse: number;
  /** Corps long (5 cases) ou court (4). */
  grand: boolean;
  /** Fait partie des ~60 % qui vont au sucre. */
  fan: boolean;
  cible: Pt | null;
  /** Point d'errance. */
  pt: Pt | null;
  /** Fin du séjour dans le nid. */
  fin: number;
  /** Distance depuis la dernière goutte de phéromone. */
  gouttes: number;
}

interface Goutte {
  x: number;
  y: number;
  t: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  fog: 0,
  density: 1,
  farthest: 1,
  farBias: 1,
  trail: 1,
  trailFade: 0.5,
  shimmer: 0,
  sparkle: 0,
  crossflow: 0,
  sway: 0,
  spread: 0,
};

const ABDOMEN: RGB = [210, 110, 90];
const REFLET: RGB = [255, 205, 188];
const THORAX: RGB = [150, 70, 50];
const TETE: RGB = [172, 82, 60];
const SOMBRE: RGB = [34, 14, 10];
const PATTE: RGB = [196, 104, 80];
const SUCRE: RGB = [236, 238, 247];
const CRISTAL: RGB = [196, 234, 248];
const MONTICULE: RGB = [120, 80, 60];
const GRAIN: RGB = [214, 184, 150];
const TROU: RGB = [10, 6, 5];
const PHERO: RGB = [255, 176, 103];
const VIE_PHERO = 30;

interface Case extends Pt {
  cristal: boolean;
}

/** État partagé au niveau du module. */
let sucres: Case[] = [];
let gouttes: Goutte[] = [];
/** Grains rapportés au nid. */
let tas = 0;
/** Taille d'une case, relevée au dernier dessin (le clic n'a pas accès au pen). */
const taille = { cw: 7, ch: 10 };

/** Le trou du nid, en bas à gauche. */
const nid = (f: Flock<Ant>) => ({ x: Math.max(90, f.width * 0.1), y: f.height - Math.max(80, f.height * 0.12), nid: true });

const hash = (i: number, j: number) => ((i * 73856093) ^ (j * 19349663)) >>> 0;

/** Choisit un nouveau point d'errance : le nid, près du nid, ou n'importe où. */
function nouveauPoint(c: Ant, f: Flock<Ant>): Pt {
  const n = nid(f);
  const r = Math.random();
  if (r < 0.25) return n;
  if (r < 0.6) {
    const a = rand(0, TAU);
    const d = rand(60, 240);
    return { x: clamp(n.x + Math.cos(a) * d, 30, f.width - 30), y: clamp(n.y + Math.sin(a) * d, 30, f.height - 30) };
  }
  return { x: rand(30, f.width - 30), y: rand(30, f.height - 30) };
}

export const ants: Animal<Ant> = {
  key: "ants",
  label: "Ants",
  swatch: [196, 140, 100],
  defaults: DEFAULTS,
  controls: [],
  area: 11000,
  max: 90,
  scale: 0.5,
  speed: 62,
  trail: { light: [150, 110, 90], dark: [170, 120, 96] },

  create: (c) => ({
    ...c,
    etat: "erre",
    cap: rand(0, TAU),
    gait: rand(0, TAU),
    vitesse: rand(0.75, 1.3),
    grand: Math.random() < 0.5,
    fan: Math.random() < 0.6,
    cible: null,
    pt: null,
    fin: 0,
    gouttes: 0,
  }),

  // Un clic : un bloc de ~22 cases (5x5 sans trois coins), quelques cases de cristal.
  tap(x, y, flock) {
    const { cw, ch } = taille;
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        if (Math.abs(i) === 2 && Math.abs(j) === 2 && (i + j) % 4 !== 0) continue;
        sucres.push({ x: x + i * cw, y: y + j * ch, cristal: hash(i + 9, j + 9) % 5 === 0 });
      }
    }
  },

  update(c, flock, dt) {
    const t = flock.time;
    const n = nid(flock);
    let but: Pt | null = null;

    if (c.etat === "dedans") {
      if (t < c.fin) return;
      // Ressort du trou.
      c.etat = "erre";
      c.x = n.x;
      c.y = n.y;
      c.cap = rand(0, TAU);
      c.pt = nouveauPoint(c, flock);
    }

    if (c.etat === "porte") {
      but = n;
    } else if (c.fan && sucres.length) {
      if (!c.cible || !sucres.includes(c.cible as Case)) {
        let best = Infinity;
        c.cible = null;
        for (const s of sucres) {
          const d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2;
          if (d < best) { best = d; c.cible = s; }
        }
      }
      c.etat = c.cible ? "sucre" : "erre";
      but = c.cible;
      if (c.cible && Math.hypot(c.x - c.cible.x, c.y - c.cible.y) < 9) {
        sucres.splice(sucres.indexOf(c.cible as Case), 1);
        c.cible = null;
        c.etat = "porte";
        but = n;
      }
    } else {
      c.etat = "erre";
      c.cible = null;
    }

    if (c.etat === "erre") {
      if (!c.pt) c.pt = nouveauPoint(c, flock);
      but = c.pt;
      if (Math.hypot(c.x - but.x, c.y - but.y) < 10) {
        if (but.nid) {
          c.etat = "dedans";
          c.fin = t + rand(0.6, 1.6);
          c.pt = null;
          return;
        }
        c.pt = nouveauPoint(c, flock);
      }
    } else if (c.etat === "porte" && Math.hypot(c.x - n.x, c.y - n.y) < 8) {
      tas++;
      c.etat = "dedans";
      c.fin = t + rand(0.8, 1.6);
      return;
    }

    if (but) c.cap += clamp(angleDiff(c.cap, Math.atan2(but.y - c.y, but.x - c.x)), -5 * dt, 5 * dt);
    c.cap += Math.sin(t * 4 + c.id * 7) * 0.9 * dt;
    const v = flock.cruise(c) * c.vitesse * (c.etat === "porte" ? 0.9 : 1);
    const dx = Math.cos(c.cap) * v * dt;
    const dy = Math.sin(c.cap) * v * dt;
    c.x = clamp(c.x + dx, 4, flock.width - 4);
    c.y = clamp(c.y + dy, 4, flock.height - 4);
    c.heading = c.cap;
    c.gait += dt * v * 0.3;
    // Phéromone : une goutte tous les ~9 px sur le chemin du retour.
    if (c.etat === "porte") {
      c.gouttes += Math.hypot(dx, dy);
      if (c.gouttes > 9) {
        c.gouttes = 0;
        if (gouttes.length > 700) gouttes.shift();
        gouttes.push({ x: c.x, y: c.y, t });
      }
    }
  },

  drawAll(flock, pen) {
    const n = nid(flock);
    const { cw, ch } = pen;
    taille.cw = cw;
    taille.ch = ch;
    const t = flock.time;

    // Pistes de phéromones qui s'estompent.
    while (gouttes.length && t - gouttes[0].t > VIE_PHERO) gouttes.shift();
    for (const g of gouttes) {
      const k = 1 - (t - g.t) / VIE_PHERO;
      const m = 0.35 + 0.65 * k;
      pen.dot(g.x, g.y, "•", [PHERO[0] * m, PHERO[1] * m, PHERO[2] * m], 1, 0);
    }

    // Monticule : cellules pleines brunes, grains clairs autour, trou sombre à l'entrée.
    for (let j = -4; j <= 4; j++) {
      for (let i = -6; i <= 6; i++) {
        const d = (i / 5.5) ** 2 + (j / 3.8) ** 2;
        const h = hash(i, j) % 7;
        const px = n.x + i * cw;
        const py = n.y + j * ch;
        if (d <= 1) {
          if (Math.abs(j) <= 1 && Math.abs(i) <= 2 - Math.abs(j)) {
            pen.spot(px, py, i === 0 && j === 0 ? "@" : " ", [90, 52, 38], TROU, 1);
          } else {
            const k = 1 - d * 0.25 + h * 0.015;
            pen.spot(px, py, h === 0 ? "'" : ".", [78, 48, 36], [MONTICULE[0] * k, MONTICULE[1] * k, MONTICULE[2] * k], 1);
          }
        } else if (d < 1.9 && h === 1) {
          pen.spot(px, py, "·", GRAIN, [48, 34, 26], 1);
        }
      }
    }
    // Tas de grains rapportés, à côté du trou.
    for (let k = 0; k < Math.min(tas, 30); k++) {
      pen.spot(n.x + (7.5 + (k % 6)) * cw, n.y + 3 * ch - Math.floor(k / 6) * ch, "▪", SUCRE, SUCRE, 1);
    }

    for (const s of sucres) pen.spot(s.x, s.y, "▪", s.cristal ? CRISTAL : SUCRE, s.cristal ? CRISTAL : SUCRE, 1);
    for (const c of flock.creatures) if (c.etat !== "dedans") ants.draw!(c, pen, flock);
  },

  draw(c, pen) {
    const { cw } = pen;
    const dx = Math.cos(c.cap);
    const dy = Math.sin(c.cap);
    const px = -dy;
    const py = dx;
    const pas = cw * (0.8 + c.vitesse * 0.12);
    const at = (u: number, v = 0) => [c.x + dx * u + px * v, c.y + dy * u + py * v] as const;
    // Pattes d'abord (sous le corps) : 3 de chaque côté, en trépied.
    const ph = Math.sin(c.gait) > 0;
    for (let i = 0; i < 3; i++) {
      for (const side of [-1, 1]) {
        const [x, y] = at(-pas * (0.5 + i * 0.6), side * cw * 0.85);
        const lever = ph === ((i + (side > 0 ? 1 : 0)) % 2 === 0);
        pen.dot(x, y, lever ? "/" : "\\", PATTE, 1, 0);
      }
    }
    // Abdomen (double si grand) avec reflet, thorax sombre, tête.
    if (c.grand) {
      const [x, y] = at(-pas * 3);
      pen.spot(x, y, "o", REFLET, ABDOMEN, 1);
    }
    let [x, y] = at(-pas * 2);
    pen.spot(x, y, "•", REFLET, ABDOMEN, 1);
    [x, y] = at(-pas);
    pen.spot(x, y, "▒", SOMBRE, THORAX, 1);
    [x, y] = at(0);
    pen.spot(x, y, "•", SOMBRE, TETE, 1);
    // Antennes fines.
    for (const side of [-1, 1]) {
      const [ax, ay] = at(pas * 0.95, side * cw * 0.55);
      pen.dot(ax, ay, side > 0 ? "/" : "\\", PATTE, 1, 0);
    }
    if (c.etat === "porte") {
      const [gx, gy] = at(pas * 1.6);
      pen.spot(gx, gy, "▪", SUCRE, SUCRE, 1);
    }
    pen.shed(c.x, c.y, c.etat === "porte" ? 0.1 : 0.03);
  },
};
