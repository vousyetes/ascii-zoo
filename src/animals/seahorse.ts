/**
 * Hippocampes : petites bêtes fines qui dérivent en se balançant, debout.
 *
 * Le corps est une ligne (spine) en S dont on mesure la distance pour dessiner :
 * tête, ventre bombé à anneaux, dos à crêtes, queue préhensile en spirale qui se
 * serre et se desserre. Nageoire dorsale translucide qui ondule très vite,
 * pectorale qui bat. Parfois la queue s'accroche à un brin d'algue imaginaire.
 * Un clic proche : fuite ondulante, queue déroulée, puis la dérive reprend.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_GLASS, INK_SCALE, INK_LIT, INK_SHIMMER, ink, type RGB } from "../ink";
import { angleDiff, clamp, hash3, lerp, rand, TAU } from "../math";
import type { Pen, Pose } from "../renderer";

interface Seahorse extends Creature {
  /** Phase du balancement et de la nage. */
  phase: number;
  /** Phase rapide de la nageoire dorsale. */
  fin: number;
  /** Teinte de l'individu (index dans PALETTE). */
  hue: number;
  /** Deuxième teinte du dégradé (voisine), ou la même si couleur unie. */
  hue2: number;
  /** Variantes : taille, courbure du S, museau, pointes de couronne, motif du ventre (0 anneaux, 1 points, 2 rayures). */
  size: number;
  bend: number;
  snout: number;
  crown: number;
  belly: number;
  /** Sens du museau : 1 vers la droite, -1 vers la gauche. */
  face: number;
  /** Fuite : 1 juste après un clic, redescend vers 0. */
  flee: number;
  /** Queue accrochée : 0 libre, 1 agrippée au brin. */
  hook: number;
  /** Instant où il s'accroche / se décroche. */
  hookAt: number;
  hookUntil: number;
  /** Enroulement lissé de la queue, 0 déroulée, 1 serrée. */
  curl: number;
  /** Lieu du brin d'algue (centre de la spirale, px). */
  ax: number;
  ay: number;
  /** Bulles du clic : instant du clic et point d'où elles partent (le dessin de l'hippocampe ne change pas). */
  bubbleAt?: number;
  bx?: number;
  by?: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  density: 0.9,
  detail: 1.6,
  speed: 1,
  sway: 0,
  spread: 0.5,
  farthest: 0.4,
  farBias: 1.2,
  trail: 0.5,
  trailFade: 0.6,
  bob: 1,
  finBeat: 1,
  curl: 1,
  hookRate: 1,
};

/** Palette soleil, corail, rose, violet, cyan. */
const PALETTE: RGB[] = [
  [255, 176, 103],
  [255, 111, 97],
  [200, 111, 208],
  [138, 116, 255],
  [92, 200, 255],
];
const EYE: RGB = [10, 8, 16];
const GLINT: RGB = [255, 252, 246];
const WEED: RGB = [92, 200, 255];

const NB = 8; // noeuds du corps
const NT = 14; // noeuds de la queue
const N = NB + NT;
/** Demi-largeur du corps aux noeuds du corps (fractions de la hauteur). */
const BODY_W = [0.045, 0.036, 0.044, 0.074, 0.088, 0.076, 0.052, 0.038];
/** Corps en S, tête en haut : [avant, bas], l'avant étant du côté du museau. */
const BODY: [number, number][] = [
  [0.01, -0.4], [-0.035, -0.33], [-0.03, -0.25], [0.01, -0.16],
  [0.035, -0.07], [0.025, 0.02], [-0.01, 0.1], [-0.04, 0.16],
];

const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

export const seahorse: Animal<Seahorse> = {
  key: "seahorse",
  label: "Seahorse",
  swatch: [200, 111, 208],
  defaults: DEFAULTS,
  controls: [
    ["Drift", [
      { key: "bob", label: "Bobbing", min: 0, max: 3, step: 0.05, hint: "Size of the bobbing and the ups and downs." },
      { key: "hookRate", label: "Hooking", min: 0, max: 3, step: 0.05, hint: "How often the tail grabs a strand of seaweed. 0: never." },
    ]],
    ["Body", [
      { key: "finBeat", label: "Fin", min: 0.2, max: 3, step: 0.05, hint: "Speed of the dorsal fin." },
      { key: "curl", label: "Tail", min: 0, max: 1.5, step: 0.05, hint: "How much the tail curls." },
    ]],
  ],
  area: 30000,
  scale: 0.9,
  max: 60,
  speed: 28,
  trail: { light: [160, 90, 200], dark: [200, 111, 208] },

  create: (c) => ({
    ...c,
    phase: rand(0, TAU),
    fin: rand(0, TAU),
    hue: Math.floor(hash3(c.id, 5, 9) * PALETTE.length),
    // Voisines dans la palette : soleil>corail, corail>rose, rose>violet, violet>cyan ; 1 sur 5 en couleur unie.
    hue2: hash3(c.id, 8, 1) < 0.2 ? Math.floor(hash3(c.id, 5, 9) * PALETTE.length) : (Math.floor(hash3(c.id, 5, 9) * PALETTE.length) + (hash3(c.id, 3, 3) > 0.5 ? 1 : PALETTE.length - 1)) % PALETTE.length,
    size: 0.75 + 0.5 * hash3(c.id, 1, 1),
    bend: 0.7 + 0.8 * hash3(c.id, 2, 2),
    snout: 0.11 + 0.1 * hash3(c.id, 4, 4),
    crown: 3 + Math.floor(hash3(c.id, 6, 6) * 4),
    belly: Math.floor(hash3(c.id, 7, 7) * 3),
    face: hash3(c.id, 2, 4) > 0.5 ? 1 : -1,
    flee: 0,
    hook: 0,
    hookAt: rand(3, 12),
    hookUntil: 0,
    curl: 0.5,
    ax: 0,
    ay: 0,
  }),

  update(f, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    f.phase += dt * (1 + 2 * f.flee);
    f.fin += dt * (22 + 30 * f.flee) * k.finBeat;
    f.flee = Math.max(0, f.flee - dt * 0.55);

    // Accroche : de temps en temps, il s'arrête, la queue serre un brin.
    if (f.hook === 0 && f.flee === 0 && k.hookRate > 0 && t > f.hookAt && f.hookUntil <= f.hookAt) {
      f.hookUntil = t + rand(3, 6);
      f.ax = f.x - f.face * f.span * 0.02;
      f.ay = f.y + f.span * 0.2;
    }
    const wantHook = f.flee > 0.05 ? 0 : t < f.hookUntil ? 1 : 0;
    if (!wantHook && f.hookUntil > f.hookAt && t >= f.hookUntil) f.hookAt = t + rand(8, 16) / Math.max(0.2, k.hookRate);
    f.hook += (wantHook - f.hook) * Math.min(1, dt * 2.5);

    // Dérive : lent vers le cap du courant, montées et descentes en douceur.
    const want = flock.heading + f.bias * k.spread;
    const speed = flock.cruise(f);
    const tx = Math.cos(want) * speed * 0.6;
    const ty = Math.sin(want) * speed * 0.6 + Math.sin(f.phase * 0.7 + f.id) * speed * 0.7 * k.bob;
    const free = 1 - f.hook;
    const r = Math.min(1, dt * (f.flee > 0.2 ? 0.8 : 1.6));
    f.vx += (tx * free - f.vx) * r;
    f.vy += (ty * free - f.vy) * r;
    f.x += f.vx * dt;
    f.y += f.vy * dt;
    f.heading += angleDiff(f.heading, want) * Math.min(1, dt);

    // Le museau regarde où il va.
    if (Math.abs(f.vx) > 6 && Math.sign(f.vx) !== f.face && f.hook < 0.1) f.face = Math.sign(f.vx);

    const wantCurl = f.hook > 0.3 ? 1 : f.flee > 0.1 ? 0.05 : 0.8 + 0.2 * Math.sin(t * 0.9 + f.id * 2);
    f.curl += (wantCurl - f.curl) * Math.min(1, dt * 3);
    if (flock.passed(f, f.span * 1.2)) flock.reenter(f);
  },

  startle(f, dx, dy, strength, flock) {
    // Fuite : un jet en s'éloignant, queue déroulée, nage rapide.
    f.flee = 1;
    f.hookUntil = 0;
    f.hookAt = flock.time + rand(6, 14);
    const boost = 330 * Math.max(0.4, strength) * f.depth;
    f.vx += dx * boost;
    f.vy += dy * boost;
    f.face = dx >= 0 ? 1 : -1;
    f.startledUntil = flock.time + 1.2;
    f.bubbleAt = flock.time;
    f.bx = f.x;
    f.by = f.y;
  },

  drawAll(flock, pen) {
    for (const f of flock.creatures) drawSeahorse(f, pen, flock.tuning as typeof DEFAULTS);
    // Tourbillon de bulles après un clic : ~18 bulles par hippocampe, qui montent en spirale et s'éteignent (positions calculées, rien à stocker).
    for (const f of flock.creatures) {
      if (f.bubbleAt === undefined) continue;
      const age = flock.time - f.bubbleAt;
      if (age < 0 || age > 2.8) continue;
      const bx = f.bx ?? f.x;
      const by = f.by ?? f.y;
      for (let i = 0; i < 18; i++) {
        const t0 = i * 0.07;
        const a = age - t0;
        if (a < 0) continue;
        const life = 1 - a / (2.8 - t0);
        if (life <= 0) continue;
        const ang = hash3(f.id, i, 1) * TAU + a * (2.2 + hash3(f.id, i, 2));
        const rad = 8 + a * (16 + 10 * hash3(f.id, i, 3)) * (0.6 + f.depth);
        const x = bx + Math.cos(ang) * rad;
        const y = by - a * (38 + 30 * hash3(f.id, i, 4)) + Math.sin(ang) * rad * 0.3;
        const g = life > 0.6 ? "O" : life > 0.3 ? "o" : "\u00b0";
        pen.dot(x, y, g, life > 0.5 ? [225, 250, 255] : [150, 215, 255], 1);
      }
    }
  },
};

function drawSeahorse(f: Seahorse, pen: Pen, k: typeof DEFAULTS) {
  const H = f.span * f.size;
  const fc = f.face;
  const col0 = PALETTE[f.hue];
  const col1 = PALETTE[f.hue2];
  let col = col0;
  let light = mix(col0, [255, 255, 255], 0.4);
  let ringCol = mix(col0, [20, 10, 40], 0.6);
  const lightF = mix(col1, [255, 255, 255], 0.4);
  const ringF = mix(col1, [20, 10, 40], 0.6);
  const curl = clamp(f.curl * k.curl, 0, 1.5);
  const tilt = (0.1 + 0.08 * f.flee) * Math.sin(f.phase * 0.9) * k.bob + f.flee * 0.25 * fc;
  const pose: Pose = { x: f.x, y: f.y, heading: tilt, span: H, depth: f.depth, id: f.id };
  const out = pen.ink;

  // Ligne du corps puis de la queue, en coordonnées locales (avant = +).
  const nu = new Float32Array(N);
  const nv = new Float32Array(N);
  const nw = new Float32Array(N);
  for (let i = 0; i < NB; i++) {
    nu[i] = BODY[i][0] * f.bend;
    nv[i] = BODY[i][1];
    nw[i] = BODY_W[i];
  }
  const R0 = lerp(0.34, 0.07, Math.min(1, curl));
  const total = lerp(0.8, 3.3, Math.min(1, curl)) * Math.PI;
  const cx = BODY[NB - 1][0] * f.bend + R0;
  const cy = BODY[NB - 1][1];
  const BU = (i: number) => BODY[i][0] * f.bend;
  for (let i = 1; i <= NT; i++) {
    const g = i / NT;
    const phi = g * total;
    const R = R0 * (1 - 0.78 * g);
    const wave = 0.035 * Math.sin(f.phase * 4 - i * 0.7) * g * (0.3 + 1.6 * f.flee);
    nu[NB - 1 + i] = cx - R * Math.cos(phi) + wave;
    nv[NB - 1 + i] = cy + R * Math.sin(phi);
    nw[NB - 1 + i] = 0.034 * (1 - 0.7 * g);
  }
  // Le nombre de noeuds est NB + NT - 1 ici : le dernier est le bout de la queue.
  const M = NB + NT;

  // Brin d'algue : une ligne qui monte, avec le centre de la spirale pour axe.
  if (f.hook > 0.05) {
    const ax = f.ax - f.x;
    const top = pen.cw * 0;
    void top;
    const px = f.x + ax;
    for (let s = -0.1; s < 0.5; s += 0.5 / 14) {
      const y = f.y + (cy + s) * H;
      const sw = Math.sin(f.phase * 1.3 + s * 6) * H * 0.012;
      pen.dot(px + sw, y, s % 0.1 < 0.05 ? ")" : "(", WEED, f.depth, clamp(pen.fogFor(f.depth) + 0.5 - 0.35 * f.hook, 0, 0.95));
    }
  }

  // Corps : cherche le point le plus proche sur la ligne.
  pen.shape(pose, 0.6, (u, v, px, py) => {
    const lu = u * fc;
    let best = Infinity;
    let idx = 0;
    let dl = 0;
    let wHere = 0;
    for (let i = 0; i < M - 1; i++) {
      const sx = nu[i + 1] - nu[i];
      const sy = nv[i + 1] - nv[i];
      const l2 = sx * sx + sy * sy || 1e-6;
      const q = clamp(((lu - nu[i]) * sx + (v - nv[i]) * sy) / l2, 0, 1);
      const qu = nu[i] + sx * q;
      const qv = nv[i] + sy * q;
      const d2 = (lu - qu) ** 2 + (v - qv) ** 2;
      if (d2 < best) {
        best = d2;
        idx = i + q;
        dl = lu - qu;
        wHere = lerp(nw[i], nw[i + 1], q);
      }
    }
    const d = Math.sqrt(best);
    const gr = clamp(idx / 14, 0, 1);
    col = mix(col0, col1, gr);
    light = mix(lightF, mix(col0, [255, 255, 255], 0.4), 1 - gr);
    ringCol = mix(ringF, mix(col0, [20, 10, 40], 0.6), 1 - gr);
    const body = idx < NB - 1;
    // Ligne d'anneaux : bandes le long du ventre et de la queue.
    const ring = (idx * 2.6) % 1;
    out.au = idx * 0.1;
    out.av = dl * 4;

    if (d < wHere) {
      if (idx < 0.9) return ink(out, ...light, INK_LIT); // tête
      if (f.belly === 0 && ring < 0.3) return ink(out, ...ringCol, INK_SCALE, "=-");
      if (f.belly === 1 && body && dl > wHere * 0.1 && hash3(Math.round(idx * 7), Math.round(dl * 90), f.id) > 0.55) return ink(out, ...light, INK_LIT, "o");
      if (f.belly === 2 && ((idx * 5 + dl * 20) % 1) < 0.35) return ink(out, ...ringCol, INK_SCALE, "/");
      if (body && dl > wHere * 0.2) return ink(out, ...light, INK_SHIMMER, "oO");
      return ink(out, ...col, INK_SHIMMER);
    }
    // Crêtes en pointes sur le dos (côté arrière, hors tête et queue lointaine).
    if (dl < 0 && idx > 1.2 && idx < NB + 7) {
      const tooth = 0.022 * (1 - Math.abs(((idx * 2.6) % 1) - 0.5) * 2) * (1 - (idx - 1.2) / (NB + 7));
      if (d < wHere + Math.max(0, tooth)) return ink(out, ...light, INK_LIT, "^");
    }
    // Nageoire dorsale translucide : ondule très vite.
    if (dl < 0 && idx > 3.2 && idx < 6.4) {
      const along = (idx - 3.2) / 3.2;
      const reach = 0.075 * Math.sin(along * Math.PI) * (0.65 + 0.35 * Math.sin(f.fin - idx * 2.4));
      if (d < wHere + reach && Math.sin(idx * 22 - f.fin * 0.5) > -0.2) return ink(out, ...light, INK_GLASS, "|!:");
    }
    // Pectorale : petite, bat vite.
    if (idx > 2.0 && idx < 3.2 && dl < 0.05) {
      const bat = Math.sin(f.fin * 0.9) * 0.012;
      const pu = lu - (nu[2] + 0.01 + bat);
      const pv = v - (nv[2] + 0.04);
      if ((pu / 0.05) ** 2 + (pv / 0.03) ** 2 < 1) return ink(out, ...light, INK_GLASS, "<>");
    }
    return false;
  });

  // Museau tubulaire : une petite ligne avec un bout rond.
  const snout = { x: 0, y: 0 };
  const base = { x: 0, y: 0 };
  pen.toWorld(pose, BU(0) * fc + 0.012 * fc, BODY[0][1] + 0.012, base);
  pen.toWorld(pose, (BODY[0][0] * f.bend + f.snout + 0.04) * fc, BODY[0][1] + 0.045, snout);
  pen.line(base.x, base.y, snout.x, snout.y, lightF, f.depth, "o");

  // Couronne : trois petites pointes sur la tête.
  for (let c = 0; c < f.crown; c++) {
    const a = -0.9 + c * (1.8 / (f.crown - 1));
    const p = pen.toWorld(pose, (BU(0) - 0.02 + Math.sin(a) * 0.045) * fc, BODY[0][1] - 0.035 - Math.cos(a) * 0.03, base);
    pen.dot(p.x, p.y, "^", lightF, f.depth);
  }

  // Oeil : une cellule sombre avec un reflet, sur la tête.
  const eye = pen.toWorld(pose, (BU(0) + 0.03) * fc, BODY[0][1] - 0.006, base);
  pen.spot(eye.x, eye.y, "●", GLINT, EYE, f.depth);

  // Traînée discrète pendant la fuite.
  pen.shed(f.x, f.y, 0.01 * f.depth * (0.4 + 2 * f.flee));
}
