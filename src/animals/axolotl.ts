/**
 * Axolotl rose, vu de dessus, qui nage doucement le long du parcours.
 *
 * Corps allongé et rond, grosse tête large au sourire, deux petits yeux,
 * trois paires de branchies plumeuses en corail vif (une tige et des
 * filaments qui frémissent), quatre petites pattes à doigts et une longue
 * queue aplatie bordée d'une nageoire continue, qui ondule en S. Il alterne
 * nage lente et pauses où il flotte presque immobile, branchies en mouvement.
 * Un clic proche le fait filer à toute vitesse, queue qui fouette, branchies
 * couchées en arrière, puis il se calme.
 *
 * Repère du corps : u vers l'avant (museau en u = 0.34), v en travers.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_GLASS, INK_SCALE, ink, type RGB } from "../ink";
import { angleDiff, clamp, lerp, rand, smoothstep, TAU } from "../math";

interface Axolotl extends Creature {
  /** Phase de l'ondulation du corps. */
  phase: number;
  /** Phase du frémissement des branchies. */
  flutter: number;
  /** Phase du palmage des pattes. */
  paddle: number;
  /** En pause (il flotte) ou en nage. */
  floating: boolean;
  /** Fin de la pause ou de la nage en cours. */
  until: number;
  /** 0 calme, 1 en fuite : branchies couchées, ondulation rapide. */
  dash: number;
  /** Amplitude de l'ondulation, lissée. */
  amp: number;
  fleeDir: number;
  fleeFrom: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  fog: 0.3,
  density: 1.3,
  speed: 1,
  spread: 0.1,
  sway: 0.05,
  farthest: 0.55,
  farBias: 1.1,
  grip: 1.6,
  separation: 600,
  trail: 1.6,
  trailFade: 0.5,
  shimmer: 0.2,
  sparkle: 0.04,
  tailBeat: 1,
  gills: 1,
  rest: 1,
  scare: 1,
};

const SKIN: RGB = [255, 168, 196];
const BELLY: RGB = [255, 200, 216];
const FRECKLE: RGB = [214, 108, 160];
const FIN: RGB = [255, 150, 190];
const LIMB: RGB = [255, 146, 180];
const GILL: RGB = [255, 111, 97];
const GILL_TIP: RGB = [255, 176, 103];
const MOUTH: RGB = [170, 60, 100];
const EYE: RGB = [14, 10, 14];
const GLINT: RGB = [255, 252, 246];

/** Demi-largeur du corps en u (fraction de la longueur), de la tête à la queue. */
function halfWidth(u: number) {
  if (u > 0.22) return 0.115 * Math.sqrt(Math.max(0, 1 - ((u - 0.22) / 0.12) ** 2));
  if (u > 0.04) return lerp(0.088, 0.115, smoothstep(0.04, 0.22, u));
  if (u > -0.12) return lerp(0.07, 0.088, smoothstep(-0.12, 0.04, u));
  const t = clamp((-0.12 - u) / 0.38, 0, 1);
  return 0.012 + 0.058 * Math.pow(1 - t, 0.8);
}

/** Largeur de la nageoire dorsale de part et d'autre, continue du dos jusqu'au bout de la queue. */
function finWidth(u: number) {
  return 0.034 * smoothstep(0.12, -0.08, u) * (1 - 0.35 * clamp((-0.12 - u) / 0.38, 0, 1));
}

export const axolotl: Animal<Axolotl> = {
  key: "axolotl",
  label: "axolotl",
  swatch: [255, 140, 170],
  defaults: DEFAULTS,
  controls: [
    ["Swim", [
      { key: "tailBeat", label: "Wave", min: 0.2, max: 3, step: 0.05, hint: "Vitesse et ampleur de l'ondulation du corps et de la queue." },
      { key: "rest", label: "Rests", min: 0, max: 4, step: 0.05, hint: "Durée des pauses où il flotte. 0 : il ne s'arrête jamais." },
    ]],
    ["Gills and fear", [
      { key: "gills", label: "Gills", min: 0, max: 3, step: 0.05, hint: "Ampleur du frémissement des branchies." },
      { key: "scare", label: "Flee", min: 0, max: 3, step: 0.05, hint: "Vitesse et durée de la fuite quand on clique près de lui." },
    ]],
  ],
  area: 40000,
  scale: 0.9,
  speed: 40,
  trail: { light: [230, 130, 170], dark: [255, 140, 170] },

  create: (c) => ({
    ...c,
    phase: rand(0, TAU),
    flutter: rand(0, TAU),
    paddle: rand(0, TAU),
    floating: false,
    until: 0,
    dash: 0,
    amp: 0.03,
    fleeDir: 0,
    fleeFrom: 0,
  }),

  enter(c, flock) {
    c.floating = false;
    c.until = flock.time + rand(2, 6);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const fleeing = t < c.startledUntil;
    if (t >= c.until) {
      c.floating = !c.floating && k.rest > 0;
      c.until = t + (c.floating ? rand(1.5, 3.5) * k.rest : rand(3, 7));
    }
    // Fuite : pleine vitesse au début, puis retour au calme.
    const calm = fleeing ? (t - c.fleeFrom) / (c.startledUntil - c.fleeFrom) : 1;
    c.dash = fleeing ? 1 - calm * calm : Math.max(0, c.dash - dt * 1.5);

    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread + 0.25 * Math.sin(t * 0.4 + c.id * 1.9);
    const want = fleeing ? c.fleeDir : course;
    const target = fleeing ? cruise * (1 + 3.5 * c.dash * k.scare) : cruise * (c.floating ? 0.06 : 1);
    flock.begin();
    flock.steer(c, c.heading, target, fleeing ? 6 : 1.4);
    flock.separate(c);
    const speed = flock.move(c, dt, Math.max(cruise * 1.2, target));
    if (flock.passed(c, c.span * 1.2)) flock.reenter(c);

    const turn = (fleeing ? 6 : 0.9 * k.grip) * dt * (c.floating ? 0.3 : 1);
    c.heading += clamp(angleDiff(c.heading, want), -turn, turn);

    const motion = clamp(speed / (cruise || 1), 0, 4);
    c.phase += dt * (1.2 + 2.2 * Math.min(motion, 1.5) + 6 * c.dash) * k.tailBeat;
    c.amp = lerp(c.amp, (0.02 + 0.03 * Math.min(motion, 1.5) + 0.03 * c.dash) * Math.min(1.5, k.tailBeat), dt * 3);
    c.flutter += dt * (3.5 + 4 * c.dash);
    c.paddle += dt * (1.5 + 2.5 * Math.min(motion, 1.5));
  },

  startle(c, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.scare <= 0) return;
    c.fleeDir = Math.atan2(dy, dx) + rand(-0.3, 0.3);
    c.fleeFrom = flock.time;
    c.startledUntil = flock.time + (1 + 1.5 * strength) * Math.sqrt(k.scare);
    c.floating = false;
    c.until = c.startledUntil + rand(1, 3);
    c.dash = 1;
  },

  draw(c, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const S = c.span;
    const out = pen.ink;
    const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
    const at = { x: 0, y: 0 };
    const amp = c.amp;
    /** Décalage latéral de la colonne en u : la vague grandit vers la queue. */
    const off = (u: number) => {
      const g = 0.2 + 0.8 * Math.pow(clamp((0.3 - u) / 0.8, 0, 1), 1.3);
      return amp * g * Math.sin(c.phase + u * 9);
    };

    // Pattes : deux paires, un bras de palmage et trois doigts au bout.
    for (const side of [-1, 1]) {
      [0.12, -0.08].forEach((lu, i) => {
        const swing = Math.sin(c.paddle + (i + (side > 0 ? 0.5 : 0)) * Math.PI);
        const ru = lu;
        const rv = off(lu) + side * 0.07;
        const fu = lu - 0.05 + 0.04 * swing;
        const fv = off(lu) + side * 0.17;
        pen.lineBody(pose, ru, rv, fu, fv, LIMB);
        for (let d = -1; d <= 1; d++) {
          pen.lineBody(pose, fu, fv, fu - 0.035 + d * 0.04 - 0.02 * swing, fv + side * 0.035, LIMB);
        }
      });
    }

    // Branchies : trois paires, derrière la tête. Plus il fuit, plus elles se couchent en arrière.
    const back = c.dash * 0.9;
    const fl = k.gills;
    for (const side of [-1, 1]) {
      for (let i = 0; i < 3; i++) {
        const ru = 0.19 - i * 0.045;
        const rv = off(ru) + side * (halfWidth(ru) - 0.008);
        const a = 1.0 + i * 0.28 + back + 0.14 * fl * Math.sin(c.flutter + i * 1.3 + side);
        const len = 0.22 - i * 0.02;
        // La tige se courbe en deux segments.
        const mu = ru + Math.cos(a) * len * 0.5;
        const mv = rv + Math.sin(a) * len * 0.5 * side;
        const b = a + 0.25 * fl * Math.sin(c.flutter * 1.2 + i * 2 + side * 1.7);
        const tu = mu + Math.cos(b) * len * 0.5;
        const tv = mv + Math.sin(b) * len * 0.5 * side;
        pen.lineBody(pose, ru, rv, mu, mv, GILL);
        pen.lineBody(pose, ru, rv + side * 0.012, mu, mv + side * 0.012, GILL);
        pen.lineBody(pose, mu, mv, tu, tv, GILL, "*");
        // Filaments plumeux : trois de chaque côté de la tige, qui frémissent à contretemps.
        for (const [fu, fv, base] of [[mu, mv, a], [tu, tv, b]] as const) {
          for (let d = -1; d <= 1; d++) {
            const fa = base + d * 0.7 + 0.2 * fl * Math.sin(c.flutter * 1.7 + d * 2 + i);
            pen.lineBody(pose, fu, fv, fu + Math.cos(fa) * len * 0.3, fv + Math.sin(fa) * len * 0.3 * side, d === 0 ? GILL_TIP : GILL);
          }
        }
      }
    }

    pen.shape(pose, 0.6, (u, v) => {
      if (u < -0.52 || u > 0.35) return false;
      const vv = v - off(u);
      const av = Math.abs(vv);
      const w = halfWidth(u);
      const fw = finWidth(u);
      if (av > w + fw) return false;
      // Nageoire dorsale : fine et transparente de chaque côté de la queue.
      if (av > w) return ink(out, ...FIN, INK_GLASS, u < -0.3 ? "~=" : "~");
      // Sourire : un arc au bout du museau.
      if (u > 0.25 && av < 0.065) {
        const mu = 0.315 - 0.03 * (1 - (vv / 0.065) ** 2);
        if (Math.abs(u - mu) < 0.009) return ink(out, ...MOUTH, INK_DARK);
      }
      // Taches de rousseur, plus denses sur le dos.
      const fr = Math.sin(u * 47 + c.id) * Math.cos(vv * 83 + c.id * 2.1);
      if (fr > 0.93 && u < 0.24 && u > -0.4) return ink(out, ...FRECKLE, INK_DARK);
      // Le ventre est plus clair le long de la ligne médiane.
      return av < w * 0.35 ? ink(out, ...BELLY, INK_SCALE) : ink(out, ...SKIN, INK_SCALE);
    });

    // Yeux : une cellule noire à reflet blanc de chaque côté de la tête, si la taille le permet.
    const across = 0.07 * S;
    if (2 * across >= pen.cw) {
      for (const side of [-1, 1]) {
        pen.toWorld(pose, 0.27, off(0.27) + side * 0.07, at);
        pen.spot(at.x, at.y, "●", GLINT, EYE, c.depth);
      }
    }

    // Une trace douce dans l'eau, derrière la queue.
    pen.toWorld(pose, -0.45, off(-0.45), at);
    pen.shed(at.x, at.y, 0.05 * c.depth);
  },
};
