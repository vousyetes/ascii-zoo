/**
 * Fourmis : petites bêtes de 3 cases (abdomen, thorax plus sombre, tête) et 2 pattes
 * qui alternent "/" et "\". Elles errent, et chaque clic lâche un bloc de sucre blanc
 * qu'elles démontent case par case pour le rapporter à la fourmilière (en bas à gauche).
 * Leurs pas laissent des traces, plus fortes quand elles portent du sucre.
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import { clamp, angleDiff, rand, TAU } from "../math";
import type { RGB } from "../ink";

type Etat = "erre" | "sucre" | "porte" | "nid" | "depose";

interface Ant extends Creature {
  etat: Etat;
  /** Direction de marche (indépendante de c.heading, que le moteur ne touche pas ici). */
  cap: number;
  gait: number;
  vitesse: number;
  /** Prochain changement de cap aléatoire. */
  until: number;
  cible: Case | null;
  /** Fin du dépôt. */
  fin: number;
}

interface Case {
  x: number;
  y: number;
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
const THORAX: RGB = [150, 70, 62];
const TETE: RGB = [190, 92, 78];
const PATTE: RGB = [226, 130, 108];
const SUCRE: RGB = [236, 238, 247];
const NID: RGB = [150, 100, 80];
const NID_SOMBRE: RGB = [52, 30, 26];

/** État partagé au niveau du module : cases de sucre restantes. */
let sucres: Case[] = [];
/** Taille d'une case, relevée au dernier dessin (le clic n'a pas accès au pen). */
const taille = { cw: 7, ch: 10 };

/** Le nid, en bas à gauche. */
const nid = (f: Flock<Ant>) => ({ x: Math.max(60, f.width * 0.08), y: f.height - Math.max(60, f.height * 0.1) });

export const ants: Animal<Ant> = {
  key: "ants",
  label: "fourmi",
  swatch: [196, 140, 100],
  defaults: DEFAULTS,
  controls: [],
  area: 18000,
  max: 90,
  scale: 0.5,
  speed: 40,
  trail: { light: [150, 110, 90], dark: [170, 120, 96] },

  create: (c) => ({
    ...c,
    etat: "erre",
    cap: rand(0, TAU),
    gait: rand(0, TAU),
    vitesse: rand(0.8, 1.25),
    until: 0,
    cible: null,
    fin: 0,
  }),

  // Un clic : un bloc de ~22 cases (5x5 sans trois coins) à l'endroit cliqué.
  tap(x, y, flock) {
    const { cw, ch } = taille;
    for (let j = -2; j <= 2; j++) {
      for (let i = -2; i <= 2; i++) {
        if (Math.abs(i) === 2 && Math.abs(j) === 2 && (i + j) % 4 !== 0) continue;
        sucres.push({ x: x + i * cw, y: y + j * ch });
      }
    }
  },

  update(c, flock, dt) {
    const t = flock.time;
    const n = nid(flock);
    const vit = flock.cruise(c) * c.vitesse;
    let but: { x: number; y: number } | null = null;

    if (c.etat === "depose") {
      if (t > c.fin) {
        c.etat = "erre";
        c.cap = Math.atan2(c.y - n.y, c.x - n.x) + rand(-0.8, 0.8);
      }
    } else if (c.etat === "porte") {
      but = n;
      if (Math.hypot(c.x - n.x, c.y - n.y) < 26) {
        c.etat = "depose";
        c.fin = t + rand(0.3, 0.7);
      }
    } else {
      // Cherche le sucre le plus proche (s'il en reste), sinon erre.
      if (sucres.length && (c.etat === "erre" || !c.cible || !sucres.includes(c.cible))) {
        let best = Infinity;
        c.cible = null;
        for (const s of sucres) {
          const d = (s.x - c.x) ** 2 + (s.y - c.y) ** 2;
          if (d < best) { best = d; c.cible = s; }
        }
        c.etat = c.cible ? "sucre" : "erre";
      } else if (!sucres.length) {
        c.etat = "erre";
        c.cible = null;
      }
      if (c.etat === "sucre" && c.cible) {
        but = c.cible;
        if (Math.hypot(c.x - but.x, c.y - but.y) < 8) {
          sucres.splice(sucres.indexOf(c.cible), 1);
          c.cible = null;
          c.etat = "porte";
        }
      }
    }

    if (but) {
      c.cap += clamp(angleDiff(c.cap, Math.atan2(but.y - c.y, but.x - c.x)), -6 * dt, 6 * dt);
    } else {
      // Errance : petit changement de cap aléatoire, murs doux.
      if (t > c.until) {
        c.until = t + rand(0.2, 0.8);
        c.cap += rand(-1.1, 1.1);
      }
      const m = 50;
      const wx = c.x < m ? 1 : c.x > flock.width - m ? -1 : 0;
      const wy = c.y < m ? 1 : c.y > flock.height - m ? -1 : 0;
      if (wx || wy) c.cap += clamp(angleDiff(c.cap, Math.atan2(wy, wx)), -4 * dt, 4 * dt);
    }

    const v = c.etat === "depose" ? 0 : vit * (c.etat === "porte" ? 0.9 : 1);
    c.x = clamp(c.x + Math.cos(c.cap) * v * dt, 4, flock.width - 4);
    c.y = clamp(c.y + Math.sin(c.cap) * v * dt, 4, flock.height - 4);
    c.heading = c.cap;
    c.gait += dt * v * 0.28;
  },

  drawAll(flock, pen) {
    const n = nid(flock);
    const { cw, ch } = pen;
    taille.cw = cw;
    taille.ch = ch;
    // Fourmilière : anneau de cases brunes autour d'un "@" sombre.
    for (let j = -2; j <= 2; j++) {
      for (let i = -3; i <= 3; i++) {
        const d = Math.hypot(i / 3, j / 2);
        if (d > 1.05) continue;
        if (i === 0 && j === 0) pen.spot(n.x, n.y, "@", NID_SOMBRE, NID, 1);
        else if (d > 0.6) pen.spot(n.x + i * cw, n.y + j * ch, "o", NID_SOMBRE, NID, 1);
      }
    }
    for (const s of sucres) pen.spot(s.x, s.y, "▪", SUCRE, SUCRE, 1);
    for (const c of flock.creatures) ants.draw!(c, pen, flock);
  },

  draw(c, pen) {
    const { cw } = pen;
    const dx = Math.cos(c.cap);
    const dy = Math.sin(c.cap);
    const pas = cw * 0.95;
    const porte = c.etat === "porte";
    // tête, thorax, abdomen alignés derrière la tête
    const hx = c.x + dx * pas;
    const hy = c.y + dy * pas;
    pen.spot(c.x - dx * pas, c.y - dy * pas, "o", ABDOMEN, ABDOMEN, 1);
    pen.spot(c.x, c.y, "●", [20, 8, 8], THORAX, 1);
    pen.spot(hx, hy, "•", [20, 8, 8], TETE, 1);
    // pattes : deux points de chaque côté du thorax, qui alternent "/" et "\"
    const px = -dy * cw * 0.9;
    const py = dx * cw * 0.9;
    const a = Math.sin(c.gait) > 0;
    pen.dot(c.x + px, c.y + py, a ? "/" : "\\", PATTE, 1);
    pen.dot(c.x - px, c.y - py, a ? "\\" : "/", PATTE, 1);
    // case de sucre portée devant la tête
    if (porte) pen.spot(hx + dx * pas, hy + dy * pas, "▪", SUCRE, SUCRE, 1);
    // traces
    if (c.etat !== "depose") pen.shed(c.x, c.y, porte ? 0.14 : 0.05);
  },
};
