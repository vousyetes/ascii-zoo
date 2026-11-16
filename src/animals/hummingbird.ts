/**
 * Colibri : vol stationnaire devant des fleurs imaginaires, puis éclair d'un point à l'autre.
 *
 * Petits, fins et peu nombreux. Long bec droit et fin, petite tête,
 * corps irisé vert-cyan, gorge qui passe du corail au rose selon l'angle, queue en éventail.
 * Les ailes battent trop vite pour être vues : deux éventails translucides qui vibrent.
 * Un clic proche le fait filer à l'opposé, puis il revient se mettre en stationnaire.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_GLASS, INK_GLOW, INK_LIT, INK_SCALE, INK_SHIMMER, ink, type RGB } from "../ink";
import { rand, TAU } from "../math";
import { inEllipse } from "./shapes";

interface Hummingbird extends Creature {
  /** Phase du battement d'ailes. */
  phase: number;
  mode: "hover" | "dart";
  /** Fin du stationnaire ou de l'éclair en cours. */
  until: number;
  /** Direction du prochain éclair (et du bec en stationnaire). */
  aim: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  fog: 0.2,
  detail: 1.6,
  density: 0.6,
  sway: 0,
  spread: 0.5,
  farthest: 0.6,
  farBias: 1,
  grip: 4,
  separation: 600,
  trail: 0.9,
  trailFade: 2.2,
  sparkle: 0.15,
  hover: 1,
  dart: 1,
  flutter: 1,
  scare: 1,
};

const GREEN: RGB = [126, 226, 168];
const CYAN: RGB = [92, 200, 255];
const CORAL: RGB = [255, 111, 97];
const ROSE: RGB = [200, 111, 208];
const WING: RGB = [92, 200, 255];
const BEAK: RGB = [40, 36, 52];
const TAIL: RGB = [30, 110, 96];
const EYE: RGB = [8, 8, 12];
const GLINT: RGB = [255, 255, 255];

export const hummingbird: Animal<Hummingbird> = {
  key: "hummingbird",
  label: "Hummingbird",
  swatch: [126, 226, 168],
  defaults: DEFAULTS,
  controls: [
    ["Flight", [
      { key: "hover", label: "Hover", min: 0.2, max: 3, step: 0.05, hint: "How long it hovers in front of the flower." },
      { key: "dart", label: "Dart", min: 0.3, max: 2.5, step: 0.05, hint: "Speed of each dart." },
      { key: "flutter", label: "Flutter", min: 0.3, max: 2, step: 0.05, hint: "How fast the wings vibrate." },
      { key: "scare", label: "Fright", min: 0, max: 3, step: 0.05, hint: "Flee speed when you click near them." },
    ]],
  ],
  // Petits et rares : une petite dizaine au plus, fins et lisibles.
  area: 130000,
  scale: 0.95,
  max: 10,
  speed: 60,
  trail: { light: [40, 150, 120], dark: [126, 226, 168] },

  create: (c) => ({ ...c, phase: rand(0, TAU), mode: "hover" as const, until: 0, aim: 0 }),

  enter(h, flock) {
    h.mode = "hover";
    h.until = flock.time + rand(0.2, 1.2);
    h.aim = flock.course;
  },

  update(h, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const cruise = flock.cruise(h);
    const W = flock.width, H = flock.height, m = h.span * 0.8;
    const out = h.x < -m || h.x > W + m || h.y < -m || h.y > H + m;
    if (t >= h.until) {
      if (h.mode === "hover") {
        // Éclair vers une fleur imaginaire n'importe où à l'écran : direction libre.
        const tx = rand(W * 0.08, W * 0.92), ty = rand(H * 0.08, H * 0.92);
        h.mode = "dart";
        h.aim = Math.atan2(ty - h.y, tx - h.x);
        h.until = t + rand(0.18, 0.4);
      } else {
        h.mode = "hover";
        h.until = t + rand(0.8, 2.4) * k.hover;
        // Le bec reste pointé vers la fleur, direction quelconque.
        h.aim = rand(0, TAU);
      }
    }
    // Dérive hors écran : retour en douceur vers le centre.
    if (out && !h.startledUntil) h.aim = Math.atan2(H / 2 - h.y, W / 2 - h.x);

    const acc = flock.begin();
    const fleeing = t < h.startledUntil;
    if (h.mode === "dart" || out) {
      flock.steer(h, h.aim, cruise * 5 * k.dart, 12);
    } else {
      // Sur place : on freine et on oscille légèrement.
      flock.steer(h, h.aim, 0, 5 * k.grip);
      acc.x += Math.cos(t * 5 + h.id) * 45;
      acc.y += Math.sin(t * 6.1 + h.id * 2) * 45;
    }
    flock.separate(h);
    flock.move(h, dt, cruise * 5.5 * k.dart);
    if (h.x < -W || h.x > 2 * W || h.y < -H || h.y > 2 * H) flock.reenter(h);

    // En éclair il regarde où il va ; en stationnaire il tourne le bec vers la fleur.
    flock.face(h, dt, h.mode === "dart" || fleeing ? 16 : 4, h.aim);
    if (h.mode === "hover") h.heading += Math.sin(t * 2.3 + h.id) * 0.25 * dt;
    h.phase += dt * TAU * 11 * k.flutter;
  },

  startle(h, dx, dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.scare <= 0) return;
    // Éclair dans la direction opposée au clic, puis retour en stationnaire.
    h.mode = "dart";
    h.aim = Math.atan2(dy, dx);
    h.until = flock.time + (0.35 + 0.35 * strength) * Math.sqrt(k.scare);
    h.startledUntil = h.until;
    h.vx = Math.cos(h.aim) * flock.cruise(h) * 6 * k.scare;
    h.vy = Math.sin(h.aim) * flock.cruise(h) * 6 * k.scare;
  },

  draw(h, pen) {
    const S = h.span;
    const out = pen.ink;
    const pose = { x: h.x, y: h.y, heading: h.heading, span: S, depth: h.depth, id: h.id };
    // Gorge : corail ou rose selon l'angle, qui roule avec l'orientation et le battement.
    const mix = 0.5 + 0.5 * Math.sin(h.heading * 2 + h.phase * 0.05);
    const throat: RGB = [
      CORAL[0] + (ROSE[0] - CORAL[0]) * mix,
      CORAL[1] + (ROSE[1] - CORAL[1]) * mix,
      CORAL[2] + (ROSE[2] - CORAL[2]) * mix,
    ];
    // Les deux éventails d'ailes vibrent : ouverture et balayage changent à chaque battement.
    const beat = Math.cos(h.phase);
    const lo = 0.7 + 0.35 * beat;
    const hi = lo + 0.55 + 0.1 * Math.cos(h.phase * 1.7);
    const minBody = pen.cw * 0.4;

    pen.shape(pose, 0.62, (u, v) => {
      const av = Math.abs(v);
      // Bec : long, droit et fin.
      if (u > 0.3 && u < 0.62 && av < Math.max(0.016, minBody / S)) return ink(out, ...BEAK, INK_DARK, "-=");
      // Tête : petite, avec l'oeil.
      if (inEllipse(u, av, 0.27, 0, 0.07, 0.062)) {
        if (inEllipse(u, v, 0.29, 0.025, 0.018, 0.018)) return ink(out, ...EYE, INK_DARK);
        return ink(out, ...GREEN, INK_SHIMMER);
      }
      // Gorge, sous le bec, côté face.
      if (inEllipse(u, av, 0.2, 0, 0.075, 0.05)) return ink(out, ...throat, INK_LIT, "#%");
      // Corps irisé vert-cyan, fuselé.
      if (inEllipse(u, av, 0.08, 0, 0.19, 0.085)) {
        return ink(out, ...(av < 0.02 ? CYAN : GREEN), INK_SHIMMER);
      }
      // Queue en éventail : s'élargit vers l'arrière.
      if (u < -0.1 && u > -0.4) {
        const half = 0.012 + 0.07 * ((-0.1 - u) / 0.3);
        if (av < half) return ink(out, ...(av > half * 0.75 ? CYAN : TAIL), INK_SCALE);
      }
      // Ailes : deux arcs fins qui partent de l'épaule et vibrent (haut et bas du battement).
      const du = u - 0.06;
      const dv = av - 0.04;
      const r = Math.hypot(du, dv);
      if (r > 0.05 && r < 0.4 && av > 0.04) {
        const a = Math.atan2(dv, -du);
        const taper = 0.11 * (1 - r / 0.5);
        // Arc courbé : l'angle dérive avec la distance, ce qui donne une plume.
        if (Math.abs(a - (lo + r * 1.2)) < taper || Math.abs(a - (hi + r * 1.2)) < taper * 0.8) {
          return ink(out, ...WING, r > 0.28 ? INK_GLOW : INK_GLASS, "(|)");
        }
      }
      return false;
    });

    // Éclat blanc sur le dos pendant l'éclair.
    if (h.mode === "dart") {
      pen.toWorld(pose, 0.1, 0, tmp);
      pen.spot(tmp.x, tmp.y, "*", GLINT, CYAN, h.depth);
      pen.shed(h.x, h.y, 0.14 * h.depth);
    }
  },
};

const tmp = { x: 0, y: 0 };
