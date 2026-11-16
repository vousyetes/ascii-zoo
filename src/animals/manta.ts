/**
 * Raies manta, vues du dessus, qui planent lentement le long du parcours.
 *
 * Chaque aile est un losange aux bouts pointus et recourbés vers l'arrière. Le battement est une
 * onde lente qui part des épaules et gagne les bouts : la même onde sert à plier l'aile (elle se
 * raccourcit en travers) et à décider si l'on voit le dos sombre ou le ventre blanc (quand l'aile
 * se relève, ou quand la raie roule). Entre deux séries de battements, de longues glissades ailes
 * à plat. Un clic proche déclenche un looping : un virage serré en cercle avec un tonneau, qui
 * montre le ventre blanc un instant, puis la raie reprend le parcours.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_GLASS, INK_LIT, INK_SCALE, INK_SHIMMER, INK_SPOT, ink, type RGB } from "../ink";
import { clamp, rand, smoothstep, TAU } from "../math";
import { inEllipse, toSegment } from "./shapes";

interface Manta extends Creature {
  /** Phase de l'onde de battement. */
  phase: number;
  /** 0 bat des ailes -> 1 plane ailes à plat. */
  glide: number;
  glideUntil: number;
  nextGlide: number;
  /** Looping en cours : début, durée, sens (+1 / -1), 0 = pas de looping. */
  loopFrom: number;
  loopFor: number;
  loopDir: number;
  /** Angle de roulis (0 dos visible, PI ventre visible). */
  roll: number;
  /** Écart de cap dû au looping, ajouté au parcours. */
  turn: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  density: 1.0,
  speed: 1,
  sway: 0.03,
  spread: 0.04,
  size: 1.2,
  farthest: 0.7,
  farBias: 1,
  grip: 1.6,
  separation: 900,
  fog: 0.15,
  shimmer: 0.2,
  sparkle: 0.04,
  trail: 1.3,
  trailFade: 0.5,
  flapRate: 1,
  glide: 1,
  wave: 1,
  loop: 1,
};

/** Palette de la marque et dérivés. */
const BACK: RGB = [138, 116, 255];
const BACK_LIT: RGB = [92, 200, 255];
const EDGE: RGB = [110, 100, 230];
const WHITE: RGB = [236, 238, 247];
const BELLY_EDGE: RGB = [150, 190, 235];
const GILL: RGB = [92, 80, 150];
const EYE: RGB = [10, 10, 24];

export const manta: Animal<Manta> = {
  key: "manta",
  label: "raie manta",
  swatch: [92, 200, 255],
  defaults: DEFAULTS,
  controls: [
    ["Nage", [
      { key: "flapRate", label: "Rythme des ailes", min: 0.2, max: 3, step: 0.05, hint: "La vitesse de l'onde qui parcourt les ailes." },
      { key: "wave", label: "Ampleur du battement", min: 0, max: 2, step: 0.05, hint: "De combien les ailes se relèvent, donc combien de ventre blanc apparaît." },
      { key: "glide", label: "Glissades", min: 0, max: 3, step: 0.05, hint: "La fréquence des longues glissades sans battre." },
      { key: "loop", label: "Looping", min: 0, max: 2, step: 0.05, hint: "La durée du looping quand on clique près d'une raie. 0 les rend indifférentes." },
    ]],
  ],
  area: 80000,
  scale: 1.3,
  speed: 36,
  trail: { light: [70, 118, 226], dark: [92, 200, 255] },

  create: (c) => ({ ...c, phase: rand(0, TAU), glide: 0, glideUntil: 0, nextGlide: rand(1, 6), loopFrom: 0, loopFor: 0, loopDir: 1, roll: 0, turn: 0 }),

  enter(m, flock) {
    m.loopFor = 0;
    m.roll = 0;
    m.turn = 0;
    m.nextGlide = flock.time + rand(1, 6);
  },

  update(m, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const cruise = flock.cruise(m);

    // Looping : progression 0 -> 1, cap qui fait un tour complet, roulis jusqu'au ventre et retour.
    let p = 0;
    if (m.loopFor > 0) {
      p = (t - m.loopFrom) / m.loopFor;
      if (p >= 1) {
        m.loopFor = 0;
        p = 0;
      }
    }
    const e = smoothstep(0, 1, p);
    m.turn = m.loopDir * TAU * e;
    // 0 -> PI -> 0 pendant le looping : le ventre apparaît au sommet puis le dos revient.
    m.roll = m.loopFor > 0 ? Math.PI * Math.sin(Math.PI * p) : 0;
    const looping = m.loopFor > 0;

    const acc = flock.begin();
    flock.steer(m, flock.heading + m.bias * k.spread + m.turn, cruise * (looping ? 1.7 : 1), looping ? 4 : k.grip);
    flock.separate(m);
    const speed = flock.move(m, dt, cruise * 2.2);
    void acc;
    if (flock.passed(m)) flock.reenter(m);
    if (speed > 6) flock.face(m, dt, looping ? 5 : 1.8);

    // Glissades : de longues pauses sans battre, entre deux séries de battements.
    if (!looping && m.glide < 0.5 && t > m.nextGlide && k.glide > 0) {
      m.glideUntil = t + rand(4, 9) * k.glide;
      m.nextGlide = m.glideUntil + rand(3, 8) / k.glide;
    }
    const gliding = t < m.glideUntil && !looping;
    m.glide += ((gliding ? 1 : 0) - m.glide) * Math.min(1, dt * 1.2);
    m.phase += dt * TAU * 0.45 * k.flapRate * (looping ? 1.6 : 1) * (1 - 0.92 * m.glide);
  },

  startle(m, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.loop <= 0 || strength < 0.12 || m.loopFor > 0) return;
    m.loopFrom = flock.time;
    m.loopFor = (2.6 + 1.2 * strength) * k.loop;
    // Tourne du côté d'où vient le clic, pour s'en détourner.
    m.loopDir = dx * m.vy - dy * m.vx >= 0 ? 1 : -1;
    m.glideUntil = 0;
    m.nextGlide = flock.time + m.loopFor + rand(2, 5);
    m.startledUntil = flock.time + m.loopFor;
  },

  draw(m, pen, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    const S = m.span;
    const out = pen.ink;
    const amp = (0.25 + 0.75 * (1 - m.glide)) * k.wave;
    const flat = Math.max(0.22, Math.abs(Math.cos(m.roll)));
    const cosRoll = Math.cos(m.roll);
    const pose = { x: m.x, y: m.y, heading: m.heading, span: S, depth: m.depth, id: m.id };
    const tailW = Math.max(0.012, (pen.cw * 0.4) / S);
    const tailSway = 0.03 * Math.sin(m.phase * 0.5 - 1);
    const at = { x: 0, y: 0 };

    pen.shape(pose, 0.62, (u, v) => {
      const av = Math.abs(v);

      // Queue fine, qui ondule un peu en retard sur les ailes.
      if (u < -0.12 && u > -0.55) {
        const d = toSegment(u, v, -0.12, 0, -0.55, tailSway);
        const tt = (-0.12 - u) / 0.43;
        if (d < tailW * (1 - 0.6 * tt)) return ink(out, ...(cosRoll >= 0 ? BACK : BELLY_EDGE), INK_LIT);
      }

      // Onde : de l'épaule vers le bout, de plus en plus ample. tilt > 0 = l'aile se relève.
      const tn = av / 0.5;
      const tilt = Math.sin(m.phase - tn * 3.2) * Math.min(1, tn * 1.6);
      const fold = 1 - 0.16 * amp * Math.abs(tilt);
      const vw = av / (flat * fold);
      const tw = vw / 0.5;

      // Lobes céphaliques : deux cornes devant la bouche, qui s'ouvrent un peu en s'écartant.
      const lobeV = 0.045 / flat;
      if (u > 0.1 && u < 0.24) {
        const lv = toSegment(u, av, 0.1, lobeV, 0.235, lobeV * 1.5);
        if (lv < 0.014) return ink(out, ...(cosRoll >= 0 ? BACK_LIT : BELLY_EDGE), INK_LIT);
      }

      // Corps central : tête large et arrondie.
      const inHead = inEllipse(u, vw, 0.02, 0, 0.17, 0.075);
      // Ailes : losange aux bouts pointus, bord d'attaque avançant puis reculant vers le bout.
      let inWing = false;
      if (tw < 1) {
        const front = 0.16 - 0.3 * Math.pow(tw, 1.6);
        const back = -0.3 + 0.16 * Math.pow(tw, 1.3);
        inWing = u < front && u > back;
      }
      if (!inHead && !inWing) return false;

      // Face visible : le dos si l'aile regarde le haut, le ventre sinon. Une aile qui se relève
      // (tilt > 0) penche vers nous et laisse voir son ventre sur le bord extérieur.
      const facing = cosRoll - 0.9 * amp * Math.max(0, tilt) * tn * 1.3;
      if (facing < 0) {
        // Ventre blanc, avec des fentes branchiales près du centre et un bord bleuté.
        if (u > 0.115 && u < 0.14 && av < 0.05) return ink(out, ...GILL, INK_DARK);
        if (av > 0.03 && av < 0.1 && u < 0.03 && u > -0.07 && Math.abs(((u + 0.07) * 40) % 2 - 1) < 0.35) return ink(out, ...GILL, INK_DARK, "=");
        return tn > 0.8 || (inWing && tw > 0.9) ? ink(out, ...BELLY_EDGE, INK_GLASS) : ink(out, ...WHITE, INK_SCALE);
      }

      // Dos : sombre, plus clair vers le centre, bords plus profonds.
      if (inEllipse(u, av, 0.17, 0.016, 0.012, 0.009)) return ink(out, ...EYE, INK_SPOT);
      // Épaulettes blanches symétriques : un croissant épais sur chaque épaule, plus une petite marque.
      if (inEllipse(u, av, 0.06, 0.14, 0.055, 0.03) && !inEllipse(u, av, 0.095, 0.14, 0.04, 0.03)) return ink(out, ...WHITE, INK_LIT);
      if (inEllipse(u, av, -0.05, 0.1, 0.015, 0.012)) return ink(out, ...WHITE, INK_SPOT);
      const mid = 1 - clamp(tw, 0, 1);
      // Cyan au centre, violet vers les bouts, en lumière.
      const g = clamp(tw * 0.8 + (u < -0.05 ? 0.2 : 0), 0, 1);
      const mx = (i: number) => BACK_LIT[i] + (BACK[i] - BACK_LIT[i]) * g;
      return ink(out, mx(0), mx(1), mx(2), mid > 0.45 ? INK_LIT : INK_SHIMMER);
    }, { light: 1.1 + 0.2 * Math.max(0, cosRoll), tilt: 1.5 });

    // Sillage : de légers remous au bout des ailes quand elles descendent, et à la queue.
    const down = Math.max(0, -Math.sin(m.phase)) * (1 - m.glide) * amp;
    for (const side of [-1, 1]) {
      pen.toWorld(pose, -0.1, 0.5 * flat * side, at);
      pen.shed(at.x, at.y, (0.02 + 0.08 * down) * m.depth);
    }
    pen.toWorld(pose, -0.5, tailSway, at);
    pen.shed(at.x, at.y, 0.03 * m.depth);
  },
};
