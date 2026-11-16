/**
 * Caméléon : sa peau parcourt en continu le dégradé de la marque, avec un décalage
 * le long du corps (la couleur ondule de la tête à la queue) et un décalage propre
 * à chaque individu. Corps de profil, tête casquée à crête, oeil conique qui balaie,
 * ventre rond, dos arqué, queue en spirale qui respire, pattes à pinces qui avancent
 * une à une en balançant le corps. Au clic : on lâche une mouche, le plus proche la capture
 * d'un coup de langue balistique et sa peau pulse vers une teinte vive.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, INK_SHIMMER, ink, type RGB } from "../ink";
import { frac, rand, TAU } from "../math";
import { inEllipse, seg, toSegment } from "./shapes";

interface Chameleon extends Creature {
  /** Décalage de teinte propre à l'individu, en tours de dégradé (0 → 1). */
  phase: number;
  /** Phase de la marche, très lente. */
  gait: number;
  /** Phase de balayage de l'oeil. */
  eye: number;
  /** Flash blanc : 1 au clic, retombe vers 0. */
  flash: number;
  /** +1 s'il va vers la droite, -1 vers la gauche : garde le dos en haut de l'écran. */
  flip: 1 | -1;
  /** Branche sur laquelle il vit (0 la plus lointaine, N-1 la plus proche). */
  br: number;
  /** Il marche (1) ou il fait une pause (0) : allure lissée. */
  go: number;
  moving: boolean;
  until: number;
  /** Inclinaison du corps suivant la pente de la branche. */
  tilt: number;
  /** Teinte vive (index de STOPS) et sa force : 1 à la capture, retombe lentement. */
  tint: number;
  pulse: number;
  /** Petit flash clair à la capture. */
  pop: number;
  mx: number;
  my: number;
}

// ── mouche lâchée au clic : l'état vit ici, un seul chasseur à la fois ──
interface Fly { x: number; y: number; sx: number; sy: number; tx: number; ty: number; born: number; phase: number; t0: number; hunter: Chameleon; seed: number }
let fly: Fly | null = null;

// ── branches : quelques grandes branches qui traversent l'écran, les caméléons marchent dessus ──
const N_BRANCH = 3;
interface Branch { xs: Float32Array; ys: Float32Array; depth: number }
let branches: Branch[] = [];
let branchKey = "";

/** Branches fixes pour une taille d'écran : trois courbes douces, de la plus lointaine à la plus proche. */
function buildBranches(W: number, H: number, farthest: number, farBias: number): Branch[] {
  const out: Branch[] = [];
  const step = 18;
  const n = Math.ceil((W + 160) / step) + 1;
  for (let b = 0; b < N_BRANCH; b++) {
    const roll = (b + 0.5) / N_BRANCH;
    const depth = farthest + (1 - farthest) * Math.pow(roll, farBias);
    const y0 = H * (0.2 + 0.3 * b) + 20 * b;
    const amp = H * (0.035 + 0.01 * b);
    const f1 = 0.0042 + 0.0011 * b;
    const ph = b * 2.1 + 0.7;
    const slope = (b % 2 ? 1 : -1) * H * 0.05;
    const xs = new Float32Array(n);
    const ys = new Float32Array(n);
    for (let i = 0; i < n; i++) {
      const x = -80 + i * step;
      xs[i] = x;
      ys[i] = y0 + amp * Math.sin(x * f1 + ph) + 0.4 * amp * Math.sin(x * f1 * 2.3 + ph * 1.7) + slope * (x / W - 0.5);
    }
    out.push({ xs, ys, depth });
  }
  return out;
}

function branchY(b: Branch, x: number) {
  const { xs, ys } = b;
  const t = Math.min(xs.length - 1.001, Math.max(0, (x - xs[0]) / (xs[1] - xs[0])));
  const i = Math.floor(t);
  return ys[i] + (ys[i + 1] - ys[i]) * (t - i);
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  fog: 0.2,
  density: 1.5,
  farthest: 0.55,
  farBias: 1.2,
  sway: 0.02,
  spread: 0.03,
  trail: 0.3,
  shimmer: 0.45,
  sparkle: 0.1,
  colorSpeed: 1,
  wave: 1,
  step: 1,
  curl: 1,
  tongue: 1,
};

/** Le dégradé de la marque, bouclé : soleil, corail, rose, violet, cyan, vert ok. */
const STOPS: RGB[] = [
  [255, 176, 103],
  [255, 111, 97],
  [200, 111, 208],
  [138, 116, 255],
  [92, 200, 255],
  [126, 226, 168],
];

const col: RGB = [0, 0, 0];
const WHITE = 255;

/** Couleur de la peau au point w du corps (0 tête, > 0 vers la queue), flash compris. */
function skin(c: Chameleon, time: number, k: typeof DEFAULTS, w: number): RGB {
  // Segments lisses : la teinte reste quasi constante sur une zone puis glisse vite vers la suivante.
  // Tout le corps prend la meme couleur, avec un tout petit decalage tete-queue : il CHANGE de couleur
  // dans le temps (il tient une teinte puis glisse vers la suivante), il ne reste pas multicolore.
  const q = (c.phase + time * 0.09 * k.colorSpeed + w * k.wave * 0.06) * STOPS.length;
  const qi = Math.floor(q);
  const qf = Math.min(1, Math.max(0, (q - qi - 0.6) / 0.4));
  const x = frac((qi + qf) / STOPS.length) * STOPS.length;
  const i = Math.floor(x);
  const f = x - i;
  const s = f;
  const a = STOPS[i % STOPS.length];
  const b = STOPS[(i + 1) % STOPS.length];
  const fl = c.flash * c.flash;
  const pu = Math.min(1, c.pulse * 1.6);
  const pm = pu * pu * (3 - 2 * pu); // lissé : la teinte vive tient puis lâche
  const T = STOPS[c.tint];
  const wh = Math.max(fl, c.pop * 0.5);
  for (let j = 0; j < 3; j++) col[j] = ((a[j] + (b[j] - a[j]) * s) * (1 - pm) + T[j] * pm) * (1 - wh) + WHITE * wh;
  return col;
}

/** Fait avancer la mouche et la séquence du chasseur ; les autres tournent la tête sans tirer. */
function hunt(c: Chameleon, flock: { time: number }, dt: number, k: typeof DEFAULTS) {
  const f = fly!;
  const t = flock.time;
  const dir = f.tx > c.x ? 1 : -1;
  if (c !== f.hunter) {
    if (Math.abs(f.tx - c.x) < 520) { c.flip = dir; c.moving = false; c.until = t + 0.6; }
    return;
  }
  c.until = t + 5;
  if (f.phase === 0) {
    // la mouche vole vers la branche en zigzaguant, le caméléon s'en approche
    const p = Math.min(1, (t - f.t0) / 0.6);
    f.x = f.sx + (f.tx - f.sx) * p + 14 * (1 - p) * Math.sin(p * 18 + f.seed);
    f.y = f.sy + (f.ty - f.sy) * p + 10 * (1 - p) * Math.sin(p * 23 + f.seed * 2);
    c.flip = dir;
    const near = Math.abs(f.tx - c.x) < c.span * 0.75;
    c.moving = !near;
    if (near && p >= 1) { f.phase = 1; f.t0 = t; }
  } else {
    c.moving = false;
    f.x = f.tx + 1.2 * Math.sin(t * 40 + f.seed);
    f.y = f.ty + 1.2 * Math.cos(t * 33);
    const el = t - f.t0;
    if (f.phase === 1 && el > 0.4) { f.phase = 2; f.t0 = t; }
    else if (f.phase === 2 && el > 0.1 / k.tongue) { f.phase = 3; f.t0 = t; }
    else if (f.phase === 3 && el > 0.2 / k.tongue) {
      // capture : la mouche disparaît, la peau pulse vers une nouvelle teinte vive
      c.tint = (c.tint + 1 + Math.floor(Math.random() * (STOPS.length - 1))) % STOPS.length;
      c.pulse = 1;
      c.pop = 1;
      c.until = t + 1;
      fly = null;
    }
  }
}

const TAIL_N = 24;
const tx = new Float32Array(TAIL_N + 1);
const ty = new Float32Array(TAIL_N + 1);
const DARK: RGB = [20, 14, 30];
const TONGUE: RGB = [255, 112, 150];
const FLY: RGB = [110, 170, 90];
const GLINT: RGB = [255, 252, 246];

export const chameleon: Animal<Chameleon> = {
  key: "chameleon",
  label: "Chameleon",
  swatch: [255, 111, 97],
  defaults: DEFAULTS,
  controls: [
    ["Chameleon", [
      { key: "colorSpeed", label: "Color change", min: 0, max: 4, step: 0.05, hint: "How fast the skin cycles through the gradient. 0 freezes the colors." },
      { key: "wave", label: "Ripple", min: 0, max: 2.5, step: 0.05, hint: "How much the color shifts from head to tail. 0 gives a single-tone skin." },
      { key: "step", label: "Step", min: 0.2, max: 3, step: 0.05, hint: "How fast the legs and body sway." },
      { key: "curl", label: "Curl", min: 0, max: 2, step: 0.05, hint: "How far the tail curls and uncurls." },
      { key: "tongue", label: "Tongue", min: 0.3, max: 3, step: 0.05, hint: "How fast the tongue snaps at a fly." },
    ]],
  ],
  area: 62000,
  scale: 1.1,
  speed: 42,
  trail: { light: [200, 111, 208], dark: [138, 116, 255] },

  create: (c) => ({ ...c, phase: rand(0, 1), gait: rand(0, TAU), eye: rand(0, TAU), flash: 0, flip: Math.random() < 0.5 ? 1 : -1, br: 0, go: 1, moving: true, until: 0, tilt: 0, tint: 0, pulse: 0, pop: 0, mx: 0, my: 0 }),

  enter(c, flock) {
    // Il apparait quelque part sur sa branche ; la branche dépend de sa profondeur (les lointains en haut).
    c.br = Math.min(N_BRANCH - 1, Math.floor(c.roll * N_BRANCH));
    c.x = rand(0, flock.width);
    c.until = flock.time + rand(1, 5);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const key = `${Math.round(flock.width)}x${Math.round(flock.height)}`;
    if (key !== branchKey) {
      branchKey = key;
      branches = buildBranches(flock.width, flock.height, k.farthest, k.farBias);
    }
    const t = flock.time;
    c.br = Math.min(N_BRANCH - 1, Math.floor(c.roll * N_BRANCH));
    const boost = fly && fly.hunter === c && fly.phase === 0 ? 7 : t < c.startledUntil ? 2.6 : 1; // il fonce vers la mouche
    if (fly && t - fly.born > 12) fly = null; // garde-fou
    if (fly) hunt(c, flock, dt, k);
    // Marche, pause, et parfois il fait demi-tour : sur une branche ils se croisent dans les deux sens.
    if (t >= c.until) {
      c.moving = !c.moving;
      c.until = t + (c.moving ? rand(3, 9) : rand(1.2, 4));
      if (c.moving && Math.random() < 0.3) c.flip = c.flip > 0 ? -1 : 1;
    }
    c.go += ((c.moving ? 1 : 0) - c.go) * Math.min(1, dt * 2.5);
    const sp = flock.cruise(c) * 0.9 * boost * c.go * k.speed;
    c.vx = c.flip * sp;
    c.x += c.vx * dt;
    const W = flock.width, m = c.span;
    if (c.x > W + m) c.x = -m;
    else if (c.x < -m) c.x = W + m;
    // Les pieds posés sur la branche, le corps suit la pente.
    const b = branches[c.br];
    const by = branchY(b, c.x);
    const slope = (branchY(b, c.x + 12) - branchY(b, c.x - 12)) / 24;
    c.y = by - 0.3 * c.span - 0.004 * c.span * Math.sin(c.gait * 2);
    c.tilt = Math.atan(slope) * 0.8;
    c.vy = 0;
    c.heading = c.flip > 0 ? 0 : Math.PI;
    c.gait += dt * 0.9 * k.step * boost * (0.25 + 0.75 * c.go);
    c.eye += dt * 1.3;
    c.flash = Math.max(0, c.flash - dt * 0.8);
    c.pulse = Math.max(0, c.pulse - dt * 0.22);
    c.pop = Math.max(0, c.pop - dt * 2.5);
  },

  /** Clic : une mouche se pose sur la branche la plus proche, le caméléon de cette branche la chasse. */
  tap(x, y, flock) {
    if (fly) return;
    let bi = 0, bx = x, by = 1e9, bd = 1e9;
    branches.forEach((b, i) => {
      for (let j = 0; j < b.xs.length; j++) {
        const d = Math.hypot(b.xs[j] - x, b.ys[j] - y);
        if (d < bd) { bd = d; bi = i; bx = b.xs[j]; by = b.ys[j]; }
      }
    });
    bx = Math.min(flock.width - 20, Math.max(20, bx));
    let h: Chameleon | null = null, hd = 1e9;
    for (const c of flock.creatures as Chameleon[]) {
      const d = Math.hypot(c.x - bx, c.y - by) + (c.br === bi ? 0 : 400);
      if (d < hd) { hd = d; h = c; }
    }
    if (!h) return;
    by = branchY(branches[bi], bx) - 0.3 * h.span;
    fly = { x, y, sx: x, sy: y, tx: bx, ty: by, born: flock.time, phase: 0, t0: flock.time, hunter: h, seed: rand(0, TAU) };
  },

  startle(c, _dx, _dy, _strength, flock) {
    c.flash = 1;
    c.startledUntil = flock.time + 1;
  },

  drawAll(flock, pen) {
    const k = flock.tuning as typeof DEFAULTS;
    const W = flock.width;
    // Branches : bois chaud en cellules pleines (une rangée centrale claire, deux rangées d'ombre), rameaux et feuilles.
    const cw = pen.cw, ch = pen.ch;
    const bark: RGB = [120, 86, 72];
    const barkFill: RGB = [40, 28, 28];
    const bark2: RGB = [70, 50, 48];
    const bark2Fill: RGB = [26, 18, 20];
    const LEAF: RGB[] = [[126, 226, 168], [92, 200, 255]];
    const iconMode = typeof document !== "undefined" && document.body.classList.contains("icon-mode");
    for (let bi = 0; bi < (iconMode ? 0 : branches.length); bi++) {
      const b = branches[bi];
      const rows = bi === branches.length - 1 ? 2 : 1; // trait fin, deux rangées seulement au premier plan
      for (let x = -cw; x < W + cw; x += cw) {
        const y = branchY(b, x);
        const cell = Math.floor(x / cw);
        pen.spot(x, y, "=", bark, barkFill, b.depth);
        if (rows === 2) pen.spot(x, y + ch * 0.95, "~", bark2, bark2Fill, b.depth);
        // Noeuds : une cellule qui dépasse de temps en temps.
        if ((cell * 7 + bi * 13) % 17 === 0) pen.spot(x, y - ch * 0.9, "'", bark, barkFill, b.depth);
        // Rameau fin d'une cellule de large, rare, avec une petite feuille.
        if ((cell + bi * 9) % 31 === 0) {
          const dir = (cell + bi) % 2 ? 1 : -1;
          const len = 2 + ((cell + bi) % 2);
          for (let j = 1; j <= len; j++) pen.spot(x + dir * j * cw * 0.6, y - ch * (0.9 * j), j === len ? "." : "/", bark2, bark2Fill, b.depth);
          pen.spot(x + dir * (len + 1) * cw * 0.6, y - ch * 0.9 * (len + 1), "*", LEAF[(cell + bi) % 2], [20, 40, 36], b.depth);
        }
      }
    }
    for (const c of flock.creatures) chameleon.draw!(c, pen, flock);
    // Mouche : petite case sombre et halo qui zigzague.
    if (fly) {
      const a = flock.time * 9 + fly.seed;
      for (let i = 0; i < 4; i++) pen.spot(fly.x + Math.cos(a + i * 1.57) * cw * 1.1, fly.y + Math.sin(a * 1.3 + i * 1.57) * ch * 0.9, "·", [200, 215, 190], [10, 14, 10], 1);
      pen.spot(fly.x, fly.y, "#", FLY, [14, 24, 14], 1);
    }
    void k;
  },

  draw(c, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const out = pen.ink;
    const S = c.span;
    const time = flock.time;
    const f = c.flip;
    // Balancement avant/arrière : le corps tangue avec la marche.
    const pose = { x: c.x, y: c.y, heading: (f > 0 ? 0 : Math.PI) + f * c.tilt + 0.04 * Math.sin(c.gait * 0.5), span: S, depth: c.depth, id: c.id };
    const at = { x: 0, y: 0 };

    // Queue : spirale qui se resserre et se desserre doucement.
    const tight = 1 + 0.2 * k.curl * Math.sin(time * 0.6 + c.phase * TAU);
    const R = 0.15 * tight;
    for (let i = 0; i <= TAIL_N; i++) {
      const s = i / TAIL_N;
      const a = s * TAU * 2;
      const r = R * (1 - 0.8 * s);
      tx[i] = -0.36 + r * Math.cos(a);
      ty[i] = 0.04 + r * Math.sin(a);
    }

    // Langue : jaillit toutes les 6 à 10 s selon l'individu.
    const per = 6 + 4 * frac(c.phase * 7.3);
    const tp = ((time + c.phase * 20) % per) / per;
    const tongue = tp < 0.07 ? Math.sin((tp / 0.07) * Math.PI) : 0;

    // Pattes : une seule levée à la fois. Articulations calculées une fois, dessinées dans le sampler.
    const LEGS = [
      [0.12, 0, 1],
      [-0.09, 1, 1],
      [0.09, 2, 0.75],
      [-0.12, 3, 0.75],
    ];
    const joint = new Float32Array(LEGS.length * 6);
    LEGS.forEach(([hu, i], n) => {
      const m = frac(c.gait / TAU + i * 0.25);
      const swing = m < 0.25;
      const lift = swing ? Math.sin((m / 0.25) * Math.PI) : 0;
      const reach = swing ? -0.06 + 0.12 * (m / 0.25) : 0.06 - 0.12 * ((m - 0.25) / 0.75);
      joint[n * 6] = hu;
      joint[n * 6 + 1] = 0.07;
      joint[n * 6 + 2] = hu + reach * 0.3 + (hu > 0 ? 0.05 : -0.05);
      joint[n * 6 + 3] = 0.19 - 0.05 * lift;
      joint[n * 6 + 4] = hu + reach;
      joint[n * 6 + 5] = 0.3 - 0.07 * lift;
    });

    // Éclaircit une couleur (même teinte, plus lumineuse) : m > 1 vers le blanc, m < 1 vers le sombre.
    const tone = (r: number, g: number, b: number, m: number) =>
      m <= 1 ? ink(out, r * m, g * m, b * m, INK_SHIMMER) : ink(out, r + (255 - r) * (m - 1), g + (255 - g) * (m - 1), b + (255 - b) * (m - 1), INK_SHIMMER);
    // Pointes de la crête dorsale : base sur le dos, pointe vers le haut.
    const SPINES = [-0.17, -0.12, -0.07, -0.02, 0.03, 0.08, 0.13];

    pen.shape(pose, 0.75, (u, v) => {
      const y = v * f;
      const inBody =
        inEllipse(u, y, 0, 0.0, 0.19, 0.1) || // corps comprimé
        inEllipse(u, y, 0.02, 0.025, 0.15, 0.085) || // ventre
        inEllipse(u, y, -0.04, -0.05, 0.13, 0.07) || // dos arqué
        inEllipse(u, y, 0.25, -0.03, 0.08, 0.055) || // tête
        toSegment(u, y, 0.3, -0.02, 0.4, 0.0) < 0.022 * (1 - seg.t * 0.8) || // museau effilé
        toSegment(u, y, 0.29, -0.08, 0.12, -0.19) < 0.02 * (1 - seg.t * 0.95) || // casque pointu fin
        inEllipse(u, y, 0.27, -0.08, 0.04, 0.025); // arcade
      // Queue : spirale pleine qui s'affine, sur sa boite englobante.
      if (u < -0.2 && u > -0.55 && y > -0.14 && y < 0.24) {
        for (let i = 0; i < TAIL_N; i++) {
          const d = toSegment(u, y, tx[i], ty[i], tx[i + 1], ty[i + 1]);
          if (d < 0.024 * (1 - 0.65 * (i / TAIL_N))) {
            const [r, g, b] = skin(c, time, k, 0.3 + (i / TAIL_N) * 0.3);
            return tone(r, g, b, i % 2 ? 1.05 : 0.8);
          }
        }
      }
      // Pattes : deux segments pleins, pince à deux doigts, celles du fond plus sombres.
      if (y > 0.02 && y < 0.34) {
        for (let n = 0; n < LEGS.length; n++) {
          const j = n * 6;
          const dim = LEGS[n][2];
          const d1 = toSegment(u, y, joint[j], joint[j + 1], joint[j + 2], joint[j + 3]);
          const d2 = d1 < 0.02 ? 0 : toSegment(u, y, joint[j + 2], joint[j + 3], joint[j + 4], joint[j + 5]);
          const d3 = toSegment(u, y, joint[j + 4], joint[j + 5], joint[j + 4] + 0.06, joint[j + 5] + 0.02);
          const d4 = toSegment(u, y, joint[j + 4], joint[j + 5], joint[j + 4] - 0.05, joint[j + 5] + 0.02);
          if (d1 < 0.02 || d2 < 0.017 || d3 < 0.011 || d4 < 0.011) {
            const [r, g, b] = skin(c, time, k, -LEGS[n][0]);
            return tone(r, g, b, 0.62 * dim);
          }
        }
      }
      // Langue : fine, avec un renflement au bout.
      if (tongue > 0.01) {
        const tipU = 0.4 + 0.22 * tongue;
        if (toSegment(u, y, 0.39, 0.005, tipU, 0.0) < 0.007 || Math.hypot(u - tipU, y) < 0.016) return ink(out, 255, 120, 150, INK_SCALE);
      }
      let spine = false;
      if (!inBody && y < -0.05 && y > -0.2 && u > -0.22 && u < 0.15) {
        for (const su of SPINES) {
          const by = -0.05 - 0.08 * Math.sqrt(Math.max(0, 1 - ((su + 0.04) / 0.14) ** 2)) + 0.01;
          if (toSegment(u, y, su, by, su - 0.01, by - 0.04) < 0.008 * (1 - seg.t * 0.8)) spine = true;
        }
      }
      if (inBody || spine) {
        // Bouche : fine ligne sombre du museau vers la joue.
        if (toSegment(u, y, 0.395, 0.0, 0.24, 0.02) < 0.006) return ink(out, ...DARK, INK_DARK);
        const [r, g, b] = skin(c, time, k, -u);
        if (spine) return tone(r, g, b, 0.7);
        const ex = u - 0.275;
        const ey = y + 0.05;
        const d2 = ex * ex + ey * ey;
        if (d2 < 0.011 * 0.011) return ink(out, ...DARK, INK_DARK); // pupille
        if (d2 < 0.026 * 0.026) return tone(r, g, b, 1.75); // anneau clair du cône
        if (d2 < 0.034 * 0.034) return ink(out, ...DARK, INK_DARK); // orbite sombre
        // Dégradé dorsal sombre vers ventre clair, même teinte.
        let m = 0.8 + 0.5 * Math.min(1, Math.max(0, (y + 0.15) / 0.3));
        if (u < 0.2) {
          // Bande claire latérale.
          if (Math.abs(y - 0.06) < 0.008) m = 1.7;
          else {
            // Losanges d'écailles plus sombres le long du flanc.
            const du = Math.abs(frac(u / 0.06) - 0.5);
            const dv = Math.abs(frac((y + 0.035 * Math.floor(u / 0.07)) / 0.08) - 0.5);
            if (du + dv * 0.9 < 0.22 && y > -0.1 && y < 0.1) m *= 0.62;
          }
        }
        return tone(r, g, b, m);
      }
      return false;
    });

    // Oeil conique : un point lumineux qui balaie, indépendant du corps.
    // Si une mouche est là, le point lumineux se décale vers elle.
    const look = fly ? Math.max(-1, Math.min(1, (fly.y - c.y) / 60)) : 0;
    const ex = 0.275 + (fly ? 0.02 : 0.012 * Math.sin(c.eye));
    const ey = -0.055 + (fly ? 0.016 * look : 0.008 * Math.cos(c.eye * 0.8));
    pen.toWorld(pose, ex, ey * f, at);
    pen.spot(at.x, at.y, "·", GLINT, DARK, c.depth);

    // Langue balistique : ligne rose du museau vers la mouche, renflement au bout.
    if (fly && fly.hunter === c && fly.phase >= 2) {
      pen.toWorld(pose, 0.4, 0, at);
      const el = time - fly.t0;
      const ext = fly.phase === 2 ? Math.min(1, el / (0.1 / k.tongue)) : Math.max(0, 1 - el / (0.2 / k.tongue));
      const dx = fly.x - at.x, dy = fly.y - at.y;
      const n = Math.max(2, Math.ceil(Math.hypot(dx, dy) * ext / (pen.cw * 0.5)));
      for (let i = 0; i <= n; i++) {
        const s = (i / n) * ext;
        pen.spot(at.x + dx * s, at.y + dy * s, i === n ? "o" : "-", TONGUE, TONGUE, c.depth);
      }
    }
  },
};
