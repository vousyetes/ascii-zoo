/**
 * Caméléon : sa peau parcourt en continu le dégradé de la marque, avec un décalage
 * le long du corps (la couleur ondule de la tête à la queue) et un décalage propre
 * à chaque individu. Corps de profil, tête casquée à crête, oeil conique qui balaie,
 * ventre rond, dos arqué, queue en spirale qui respire, pattes à pinces qui avancent
 * une à une en balançant le corps. Au clic : flash blanc éclatant, puis il file une seconde.
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
}

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
  for (let j = 0; j < 3; j++) col[j] = (a[j] + (b[j] - a[j]) * s) * (1 - fl) + WHITE * fl;
  return col;
}

const TAIL_N = 24;
const tx = new Float32Array(TAIL_N + 1);
const ty = new Float32Array(TAIL_N + 1);
const DARK: RGB = [20, 14, 30];
const GLINT: RGB = [255, 252, 246];

export const chameleon: Animal<Chameleon> = {
  key: "chameleon",
  label: "caméléon",
  swatch: [255, 111, 97],
  defaults: DEFAULTS,
  controls: [
    ["Caméléon", [
      { key: "colorSpeed", label: "Changement de couleur", min: 0, max: 4, step: 0.05, hint: "Vitesse à laquelle la peau parcourt le dégradé. 0 fige les couleurs." },
      { key: "wave", label: "Ondulation", min: 0, max: 2.5, step: 0.05, hint: "À quel point la couleur change de la tête à la queue. 0 donne une peau d'une seule teinte." },
      { key: "step", label: "Pas", min: 0.2, max: 3, step: 0.05, hint: "Vitesse des pattes et du balancement du corps." },
      { key: "curl", label: "Spirale", min: 0, max: 2, step: 0.05, hint: "Amplitude avec laquelle la queue s'enroule et se déroule." },
    ]],
  ],
  area: 62000,
  scale: 1.1,
  speed: 42,
  trail: { light: [200, 111, 208], dark: [138, 116, 255] },

  create: (c) => ({ ...c, phase: rand(0, 1), gait: rand(0, TAU), eye: rand(0, TAU), flash: 0, flip: Math.random() < 0.5 ? 1 : -1, br: 0, go: 1, moving: true, until: 0, tilt: 0 }),

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
    const boost = t < c.startledUntil ? 2.6 : 1;
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
    const bark: RGB = [196, 138, 104];
    const barkFill: RGB = [96, 62, 52];
    const bark2: RGB = [150, 100, 80];
    const bark2Fill: RGB = [62, 40, 40];
    const iconMode = typeof document !== "undefined" && document.body.classList.contains("icon-mode");
    for (let bi = 0; bi < (iconMode ? 0 : branches.length); bi++) {
      const b = branches[bi];
      const rows = bi === 0 ? 1 : 2; // les lointaines sont plus fines
      for (let x = -cw; x < W + cw; x += cw) {
        const y = branchY(b, x);
        const wob = ((Math.floor(x / cw) * 7 + bi * 13) % 5) * 0.4;
        for (let r = 0; r < rows + 1; r++) {
          const yy = y + (r - rows / 2) * ch * 0.95;
          const top = r === 0;
          pen.spot(x, yy, top ? "=" : r === rows ? "~" : "#", top ? bark : bark2, top ? barkFill : bark2Fill, b.depth);
        }
        // Rameau + feuilles tous les ~9 cellules.
        const cell = Math.floor(x / cw);
        if ((cell + bi * 4) % 9 === 0) {
          const dir = ((cell + bi) % 2 ? 1 : -1);
          const len = 3 + ((cell * 5 + bi) % 3);
          for (let j = 1; j <= len; j++) {
            pen.spot(x + dir * j * cw * 0.7, y - ch * (0.9 + j * 0.8) - wob, j === len ? "*" : "/", j === len ? ([126, 226, 168] as RGB) : bark2, j === len ? ([20, 70, 56] as RGB) : bark2Fill, b.depth);
          }
        }
      }
    }
    for (const c of flock.creatures) chameleon.draw!(c, pen, flock);
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
    const ex = 0.275 + 0.012 * Math.sin(c.eye);
    const ey = -0.055 + 0.008 * Math.cos(c.eye * 0.8);
    pen.toWorld(pose, ex, ey * f, at);
    pen.spot(at.x, at.y, "·", GLINT, DARK, c.depth);
  },
};
