/**
 * Bioluminescent jellyfish pulsing along the course. Made for dark mode.
 *
 * Swimming is pulse-and-coast: the bell squeezes (narrower and longer), which
 * shoves the jelly forward, then it relaxes and coasts on drag until the next
 * pulse. Each pulse also lights it up: the glow surges as the bell snaps shut
 * and then eases out through the rest of the stroke.
 *
 *   bell       lit from within: brightest at the rim and the crown, with
 *              radial ribs and a dusting of white dots over the top
 *   halo       a faint glow spilling into the water around it
 *   rim        a row of small scalloped lobes all along the margin
 *   oral arms  long frilly ribbons from the middle, twisting as they trail,
 *              with bright ruffled edges around a dim core
 *   tentacles  hair-thin, faint threads, roots toward the middle
 *   snow       glowing specks drifting slowly through the water
 */
import { SHARED_TUNING, type Animal, type Creature, type Flock } from "../flock";
import { INK_LIT, ink, type RGB } from "../ink";
import { angleDiff, clamp, frac, hash3, rand, smoothstep, TAU } from "../math";
import type { Pen, Pose } from "../renderer";

export interface Jelly extends Creature {
  /** Pulse phase, radians. */
  phase: number;
  /** 0 relaxed → 1 fully squeezed. */
  squeeze: number;
  /** Smoothed turn rate, so the arms swing out on the outside of a turn. */
  turn: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  speed: 1.05,
  sway: 0.04,
  spread: 0.08,
  farthest: 0.3,
  farBias: 1.4,
  grip: 1.4,
  trail: 0.8,
  trailFade: 0.6,
  sparkle: 0.1,
  pulseRate: 1,
  pulsePower: 1,
  pulseGlow: 1,
  tentacles: 1,
};

// Magenta: every animal has its own colour, and blue belongs to the butterflies.
const CROWN: RGB = [255, 168, 230];
const BODY: RGB = [232, 56, 182];
const RIM: RGB = [255, 130, 214];
const LOBES: RGB = [255, 130, 214];
const DOTS: RGB = [255, 170, 226];
const FRILL: RGB = [255, 214, 240];
const CORE: RGB = [204, 56, 172];
const TENTACLE: RGB = [232, 100, 204];
const VIOLET: RGB = [138, 116, 255];
const SNOW: RGB = [255, 170, 226];

/** Screen area per speck of marine snow, px². */
const SNOW_AREA = 4500;

const at = { x: 0, y: 0 };
const bt = { x: 0, y: 0 };
const mix = (a: RGB, b: RGB, f: number): RGB => [a[0] + (b[0] - a[0]) * f, a[1] + (b[1] - a[1]) * f, a[2] + (b[2] - a[2]) * f];

export const jellyfish: Animal<Jelly> = {
  key: "jellyfish",
  label: "Jellyfish",
  swatch: [232, 56, 182],
  defaults: DEFAULTS,
  hide: ["shimmer"],
  controls: [
    ["Swimming", [
      { key: "pulseRate", label: "Pulse rate", min: 0.2, max: 3, step: 0.05, hint: "How often the bell pulses." },
      { key: "pulsePower", label: "Pulse power", min: 0.2, max: 3, step: 0.05, hint: "How far each pulse pushes it forward." },
      { key: "pulseGlow", label: "Pulse glow", min: 0, max: 3, step: 0.05, hint: "How much the bell lights up on each pulse. 0 turns it off." },
      { key: "tentacles", label: "Arm length", min: 0, max: 2.5, step: 0.05, hint: "Length of the frilly arms and the thin tentacles." },
    ]],
  ],
  area: 70000,
  scale: 1.5,
  speed: 55,
  trail: { light: [200, 80, 170], dark: [255, 130, 214] },

  create: (c) => ({ ...c, phase: rand(0, TAU), squeeze: 0, turn: 0 }),

  update(j, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    j.phase += dt * TAU * 0.4 * k.pulseRate * (0.9 + 0.2 * j.roll);
    const p = frac(j.phase / TAU);
    // Contraction douce, puis longue detente.
    j.squeeze = p < 0.3 ? smoothstep(0, 0.3, p) : 1 - smoothstep(0.3, 1, p);

    // Lazily turn toward the course; jellies can't steer hard.
    const want = flock.heading + j.bias * k.spread;
    const before = j.heading;
    j.heading += clamp(angleDiff(j.heading, want), -0.6 * k.grip * dt, 0.6 * k.grip * dt);
    j.turn += (angleDiff(before, j.heading) / dt - j.turn) * Math.min(1, dt * 3);

    const cruise = flock.cruise(j);
    const acc = flock.begin();
    // Thrust only while squeezing; drag the rest of the time, so it coasts.
    const thrust = p < 0.3 ? 4.2 * cruise * k.pulsePower : 0;
    acc.x += Math.cos(j.heading) * thrust - j.vx * 1.4;
    acc.y += Math.sin(j.heading) * thrust - j.vy * 1.4;
    // Balancement lateral doux, perpendiculaire au cap.
    const lat = Math.sin(flock.time * 0.7 + j.id * 2.3) * 5 * cruise;
    acc.x -= Math.sin(j.heading) * lat;
    acc.y += Math.cos(j.heading) * lat;
    flock.separate(j, k.separation, 0.5);
    flock.move(j, dt, cruise * 3);
    if (flock.passed(j, j.span * 1.4)) flock.reenter(j);
  },

  startle(j, dx, dy, strength, flock) {
    // Sursaut : contraction forte, propulsion douce a l'oppose du clic, puis flottaison.
    j.phase = Math.floor(j.phase / TAU) * TAU + TAU * 0.3;
    const boost = 150 * strength * j.depth;
    j.vx += dx * boost;
    j.vy += dy * boost;
    j.startledUntil = flock.time + 0.8;
  },

  drawAll(flock, pen) {
    drawSnow(flock, pen);
    for (const j of flock.creatures) drawJelly(j, pen, flock);
  },
};

/** The glow's surge on each pulse: quick to light as the bell snaps shut, then easing out. */
function pulseGlow(j: Jelly) {
  const p = frac(j.phase / TAU);
  return p < 0.16 ? smoothstep(0, 0.16, p) : Math.exp(-(p - 0.16) * 4.5);
}

function drawJelly(j: Jelly, pen: Pen, flock: Flock<Jelly>) {
  const k = flock.tuning as typeof DEFAULTS;
  const S = j.span;
  const sq = j.squeeze;
  const t = pen.t;
  const pose: Pose = { x: j.x, y: j.y, heading: j.heading, span: S, depth: j.depth, id: j.id };
  const len = k.tentacles;
  const base = pen.fogFor(j.depth);
  // Cloche petite et fine : se resserre et s'allonge a la pulsation.
  const a = 0.27 * (1 + 0.16 * sq);
  const b = 0.27 * (1 - 0.22 * sq);
  const u0 = -0.02;
  const sway = clamp(-j.turn * 0.5, -0.5, 0.5);
  const flash = pulseGlow(j) * k.pulseGlow;
  const drift = Math.sin(t * 0.5 + j.id * 1.7);

  // Tentacules tres fins et nombreux, qui traînent en vagues.
  const nt = 18;
  for (let n = 0; n < nt; n++) {
    const v0 = (n / (nt - 1) - 0.5) * 2 * b * 0.85;
    let pu = u0 - 0.02;
    let pv = v0;
    const segs = 16;
    const length = 1.3 * len * (0.65 + 0.5 * hash3(j.id, n, 4));
    const ph = n * 0.7 + hash3(j.id, n, 5) * 2;
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const u = u0 - 0.02 - f * length * (1 - 0.1 * sq);
      const v = v0 * (1 - 0.2 * f) + (0.05 * Math.sin(t * 0.9 - f * 4 + ph) + 0.03 * drift) * f + sway * f * f * 0.4;
      pen.toWorld(pose, pu, pv, at);
      pen.toWorld(pose, u, v, bt);
      pen.line(at.x, at.y, bt.x, bt.y, TENTACLE, j.depth, undefined, Math.min(0.95, base + 0.22 + 0.4 * f));
      pu = u;
      pv = v;
    }
  }

  // Bras oraux : rubans fins qui ondulent.
  for (let n = 0; n < 3; n++) {
    const v0 = (n / 2 - 0.5) * 0.08;
    const segs = 22;
    const length = 0.85 * len * (0.8 + 0.3 * hash3(j.id, n, 7));
    for (let i = 1; i <= segs; i++) {
      const f = i / segs;
      const u = u0 - f * length;
      const v = v0 + 0.06 * Math.sin(t * 0.8 - f * 4.5 + n * 1.7) * f + sway * f * 0.25;
      const w = 0.018 * (1 - 0.6 * f) * Math.cos(f * 7 + n * 1.3 + t * 0.5);
      const fog = Math.min(0.95, base + 0.15 + 0.3 * f);
      for (const side of [-1, 1]) {
        pen.toWorld(pose, u, v + w * side, at);
        pen.dot(at.x, at.y, "{}~"[(i + n + (side > 0 ? 1 : 0)) % 3], FRILL, j.depth, fog);
      }
    }
    pen.toWorld(pose, u0 - length, v0, at);
    pen.shed(at.x, at.y, 0.01 * j.depth);
  }

  // Cloche translucide : seulement le bord ondulant, quelques nervures et des points.
  const out = pen.ink;
  pen.shape(pose, 0.3, (u, v) => {
    const du = (u - u0) / a;
    const dv = v / b;
    const r2 = du * du + dv * dv;
    const wob = 0.035 * Math.sin(dv * 7 + t * 1.6) * (1 + sq);
    const margin = u0 - 0.03 * dv * dv + wob;
    if (r2 > 1 || u < margin) {
      if (Math.abs(dv) > 1 || u > margin || u < margin - 0.03) return false;
      const lobe = 0.03 * Math.sin(frac((dv + 1) * 4.5) * Math.PI);
      return u > margin - lobe && ink(out, ...LOBES, INK_LIT, "o");
    }
    const r = Math.sqrt(r2);
    if (r > 0.9) return ink(out, ...RIM, INK_LIT, ":;");
    if (r > 0.4 && frac((Math.atan2(dv, du) / Math.PI) * 4) < 0.07) return ink(out, ...VIOLET, INK_LIT, "|");
    if (du > 0.2 && hash3(Math.round(du * 8), Math.round(dv * 9), j.id) > 0.8) return ink(out, ...DOTS, INK_LIT, ".'");
    // Voile tres leger (sans bloc plein) : un point sur quatre.
    return hash3(Math.round(u * 90), Math.round(v * 90), j.id) > 0.6 && ink(out, ...mix(BODY, VIOLET, 0.3 + 0.3 * Math.abs(dv)), INK_LIT, ".");
  }, { light: (0.7 + 0.1 * sq) * (1 + 0.4 * flash), fog: clamp(base - 0.05 - 0.15 * flash, 0, 0.95) });
}

/** Marine snow: glowing specks that drift slowly up through the water and twinkle. */
function drawSnow(flock: Flock<Jelly>, pen: Pen) {
  const { width: W, height: H } = flock;
  const n = Math.round((W * H) / SNOW_AREA);
  const t = pen.t;
  for (let i = 0; i < n; i++) {
    const rise = 3 + 9 * hash3(i, 3, 1);
    const x = hash3(i, 1, 1) * W + Math.sin(t * 0.25 + i) * 6;
    const y = (((hash3(i, 2, 1) * H - t * rise) % H) + H) % H;
    const twinkle = 0.5 + 0.5 * Math.sin(t * (0.8 + 1.6 * hash3(i, 4, 1)) + i);
    const big = hash3(i, 5, 1) > 0.92;
    pen.dot(x, y, big ? "*" : ".", SNOW, 1, Math.min(0.95, 0.35 + 0.5 * (1 - twinkle) + (big ? 0 : 0.15)));
  }
}
