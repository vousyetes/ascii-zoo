/**
 * Caméléon : sa peau parcourt en continu le dégradé de la marque, avec un décalage
 * le long du corps (la couleur ondule de la tête à la queue) et un décalage propre
 * à chaque individu. Corps de profil, tête casquée à crête, oeil conique qui balaie,
 * ventre rond, dos arqué, queue en spirale qui respire, pattes à pinces qui avancent
 * une à une en balançant le corps. Au clic : flash blanc éclatant, puis il file une seconde.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SHIMMER, ink, type RGB } from "../ink";
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

  create: (c) => ({ ...c, phase: rand(0, 1), gait: rand(0, TAU), eye: rand(0, TAU), flash: 0, flip: 1 }),

  enter(c, flock) {
    c.heading = flock.heading;
    c.flip = Math.cos(c.heading) < 0 ? -1 : 1;
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const boost = flock.time < c.startledUntil ? 2.6 : 1;
    const course = flock.heading + c.bias * k.spread;
    flock.begin();
    flock.steer(c, course, flock.cruise(c) * boost, k.grip);
    flock.separate(c);
    flock.move(c, dt, flock.cruise(c) * 3);
    if (flock.passed(c)) flock.reenter(c);
    c.heading = course;
    c.gait += dt * 0.9 * k.step * boost;
    c.eye += dt * 1.3;
    c.flash = Math.max(0, c.flash - dt * 0.8);
  },

  startle(c, _dx, _dy, _strength, flock) {
    c.flash = 1;
    c.startledUntil = flock.time + 1;
  },

  draw(c, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const out = pen.ink;
    const S = c.span;
    const time = flock.time;
    const f = c.flip;
    // Balancement avant/arrière : le corps tangue avec la marche.
    const pose = { x: c.x, y: c.y, heading: c.heading + 0.05 * f * Math.sin(c.gait * 0.5), span: S, depth: c.depth, id: c.id };
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

    // Queue : trait fin continu qui s'affine, tracé en segments d'une cellule.
    for (let i = 0; i < TAIL_N; i++) {
      const [r, g, b] = skin(c, time, k, 0.3 + (i / TAIL_N) * 0.3);
      const m = 1.25 - 0.5 * (i / TAIL_N);
      const tc: RGB = [Math.min(255, r * m), Math.min(255, g * m), Math.min(255, b * m)];
      pen.lineBody(pose, tx[i], ty[i] * f, tx[i + 1], ty[i + 1] * f, tc);
    }

    // Langue : jaillit toutes les 6 à 10 s selon l'individu, ligne fine et renflement.
    const per = 6 + 4 * frac(c.phase * 7.3);
    const tp = ((time + c.phase * 20) % per) / per;
    if (tp < 0.07) {
      const e = Math.sin((tp / 0.07) * Math.PI);
      const tipU = 0.4 + 0.2 * e;
      pen.lineBody(pose, 0.39, 0.0 * f, tipU, -0.005 * f, [255, 130, 150]);
      pen.lineBody(pose, tipU, -0.005 * f, tipU + 0.012, -0.005 * f, [255, 90, 120], "o");
    }

    // Pattes : une seule levée à la fois. Celles de l'autre flanc, plus sombres, passent derrière.
    const LEGS = [
      [0.12, 0, 1],
      [-0.09, 1, 1],
      [0.09, 2, 0.75],
      [-0.12, 3, 0.75],
    ];
    for (const [hu, i, dim] of LEGS) {
      const m = frac(c.gait / TAU + i * 0.25);
      const swing = m < 0.25;
      const lift = swing ? Math.sin((m / 0.25) * Math.PI) : 0;
      const reach = swing ? -0.06 + 0.12 * (m / 0.25) : 0.06 - 0.12 * ((m - 0.25) / 0.75);
      const hipY = 0.06;
      const kneeU = hu + reach * 0.3 + (hu > 0 ? 0.05 : -0.05);
      const kneeY = 0.17 - 0.05 * lift;
      const footU = hu + reach;
      const footY = 0.32 - 0.07 * lift;
      const [r, g, b] = skin(c, time, k, -hu);
      const lc: RGB = [r * dim, g * dim, b * dim];
      // Chaque segment est doublé (léger décalage) pour épaissir la patte.
      for (const d of [0]) {
        pen.lineBody(pose, hu + d, hipY * f, kneeU + d, kneeY * f, lc);
        pen.lineBody(pose, kneeU + d, kneeY * f, footU + d, footY * f, lc);
      }
      // Pince : deux doigts opposés, un vers l'avant, un vers l'arrière.
      pen.lineBody(pose, footU, footY * f, footU + 0.06, (footY + 0.025) * f, lc, "<");
      pen.lineBody(pose, footU, footY * f, footU - 0.05, (footY + 0.025) * f, lc, ">");
    }

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
