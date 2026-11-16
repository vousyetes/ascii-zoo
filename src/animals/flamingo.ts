/**
 * Flamants roses : ils marchent dans l'eau a grandes enjambees, s'arretent sur
 * une patte (l'autre repliee, tete sous l'aile ou cou qui ondule), puis
 * s'envolent parfois. Un clic proche les fait decoller d'un coup, cou et
 * pattes tendus, avant de se reposer plus loin.
 *
 * Silhouette : cou long en S, bec coude vers le bas (bout noir), corps ovale
 * en degrade corail vers rose pale, pattes fines a genou inverse, ailes dont
 * les remiges noires apparaissent a l'ouverture.
 */
import { SHARED_TUNING, type Animal, type Creature } from "../flock";
import { INK_DARK, INK_SCALE, ink, type RGB } from "../ink";
import { clamp, hash3, lerp, rand, TAU } from "../math";
import { inEllipse, seg, toSegment } from "./shapes";

type Mode = "walk" | "stand" | "fly";

export interface Flamingo extends Creature {
  mode: Mode;
  until: number;
  /** Phase de la marche. */
  gait: number;
  /** Phase du battement d'ailes. */
  beat: number;
  /** 0 au sol, 1 en vol (fondu). */
  air: number;
  /** 0 aile fermee, 1 grande ouverte. */
  open: number;
  /** 0 tete dressee, 1 tete sous l'aile. */
  tuck: number;
  /** Patte levee en position debout : -1 ou 1. */
  rest: 1 | -1;
  /** Fin du vol force par un clic. */
  scaredUntil: number;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.7,
  density: 0.7,
  speed: 1,
  sway: 0,
  spread: 0.02,
  farthest: 0.4,
  farBias: 1.2,
  grip: 3,
  separation: 220,
  trail: 1.1,
  trailFade: 0.4,
  shimmer: 0.06,
  sparkle: 0.03,
  stride: 1,
  pause: 1,
  flight: 0.5,
  scare: 1,
};

const CORAL: RGB = [255, 111, 97];
const PINK: RGB = [200, 111, 208];
const PALE: RGB = [255, 196, 200];
const BLACK: RGB = [28, 24, 34];
const BILL: RGB = [255, 214, 214];
const LEG: RGB = [255, 140, 130];
const EYE: RGB = [14, 12, 16];
const GLINT: RGB = [236, 238, 247];

const at = { x: 0, y: 0 };
const NECK_N = 9;
const nu = new Array<number>(NECK_N + 1).fill(0);
const nv = new Array<number>(NECK_N + 1).fill(0);
const mix = (a: RGB, b: RGB, t: number): RGB => [lerp(a[0], b[0], t), lerp(a[1], b[1], t), lerp(a[2], b[2], t)];

export const flamingo: Animal<Flamingo> = {
  key: "flamingo",
  label: "flamant",
  swatch: [255, 111, 97],
  defaults: DEFAULTS,
  controls: [
    ["Flamant", [
      { key: "stride", label: "Enjambee", min: 0.3, max: 2.5, step: 0.05, hint: "Vitesse des grands pas dans l'eau." },
      { key: "pause", label: "Pauses sur une patte", min: 0, max: 3, step: 0.05, hint: "Duree des arrets. 0 : il ne s'arrete jamais." },
      { key: "flight", label: "Envols", min: 0, max: 3, step: 0.05, hint: "Frequence des envols spontanes." },
      { key: "scare", label: "Peur du clic", min: 0, max: 3, step: 0.05, hint: "Duree de la fuite en vol quand on clique pres de lui." },
    ]],
  ],
  area: 130000,
  scale: 2.1,
  speed: 55,
  trail: { light: [214, 120, 130], dark: [255, 150, 150] },

  create: (c) => ({
    ...c, mode: "walk", until: 0, gait: rand(0, TAU), beat: rand(0, TAU), air: 0, open: 0, tuck: 0,
    rest: hash3(c.id, 3, 7) < 0.5 ? 1 : -1, scaredUntil: 0,
  }),

  enter(c, flock) {
    c.mode = "walk";
    c.until = flock.time + rand(2, 5);
  },

  update(c, flock, dt) {
    const k = flock.tuning as typeof DEFAULTS;
    const t = flock.time;
    const scared = t < c.scaredUntil;
    if (!scared && t >= c.until) {
      // Choix de la prochaine activite.
      if (c.mode === "walk") {
        const r = Math.random();
        if (k.pause > 0 && r < 0.55) { c.mode = "stand"; c.until = t + rand(2.5, 6) * k.pause; c.rest = Math.random() < 0.5 ? 1 : -1; }
        else if (r < 0.55 + 0.12 * k.flight) { c.mode = "fly"; c.until = t + rand(3, 6); }
        else c.until = t + rand(2, 5);
      } else {
        c.mode = "walk";
        c.until = t + rand(3, 6);
      }
    }
    if (scared) c.mode = "fly";
    else if (c.mode === "fly" && t >= c.until) { c.mode = "walk"; c.until = t + rand(3, 6); }

    const flying = c.mode === "fly";
    const cruise = flock.cruise(c);
    const course = flock.heading + c.bias * k.spread;
    flock.begin();
    flock.steer(c, course, flying ? cruise * (scared ? 2.8 : 2.2) : c.mode === "stand" ? 0 : cruise, k.grip);
    flock.separate(c, k.separation, 0.45);
    flock.move(c, dt, cruise * 3);
    if (flock.passed(c)) flock.reenter(c);
    flock.face(c, dt, 2, course);

    const ease = Math.min(1, dt * (flying ? 3 : 2));
    c.air += ((flying ? 1 : 0) - c.air) * ease;
    // Tete sous l'aile seulement a l'arret, une fois sur deux selon l'individu.
    const wantTuck = c.mode === "stand" && hash3(c.id, 11, 2) < 0.5 ? 1 : 0;
    c.tuck += (wantTuck - c.tuck) * Math.min(1, dt * 1.5);
    c.beat += dt * TAU * (scared ? 2.4 : 1.6) * c.air;
    const beatOpen = 0.55 + 0.45 * Math.cos(c.beat);
    // Au sol, les ailes s'ouvrent un instant sur la fin d'une marche (balancier).
    const wantOpen = flying ? beatOpen : 0;
    c.open += (wantOpen - c.open) * Math.min(1, dt * 8);
    if (c.mode === "walk") c.gait += (dt * flock.cruise(c) * k.stride) / Math.max(5, c.span * 0.14);
  },

  startle(c, _dx, _dy, strength, flock) {
    const k = flock.tuning as typeof DEFAULTS;
    if (k.scare <= 0) return;
    c.scaredUntil = flock.time + (2 + 2.5 * strength) * k.scare;
    c.startledUntil = c.scaredUntil;
    c.mode = "fly";
    c.until = c.scaredUntil;
    c.beat = 0;
  },

  draw(c, pen, flock) {
    const S = c.span;
    const out = pen.ink;
    const pose = { x: c.x, y: c.y, heading: c.heading, span: S, depth: c.depth, id: c.id };
    const air = c.air;
    const standing = c.mode === "stand";
    const wobble = Math.sin(flock.time * 1.3 + c.id) * (standing ? 1 : 0.35);

    // Cou en S : points du garrot (u 0.2) a la tete. Tendu en vol, replie sous l'aile en pause.
    const amp = lerp(0.1, 0.012, air);
    for (let i = 0; i <= NECK_N; i++) {
      const s = i / NECK_N;
      const reach = lerp(0.34, 0.5, air);
      let u = 0.2 + reach * s;
      let v = amp * Math.sin(s * TAU * 0.95 + wobble * 0.9) * (0.4 + s);
      // Tete sous l'aile : le bout du cou revient se poser sur le flanc.
      u = lerp(u, 0.06 - 0.05 * s, c.tuck * s);
      v = lerp(v, 0.075, c.tuck * s);
      nu[i] = u;
      nv[i] = v;
    }
    const hu = nu[NECK_N];
    const hv = nv[NECK_N];
    const neckW = Math.max(0.02, (pen.cw * 0.5) / S);
    const headR = Math.max(0.035, (pen.cw * 0.62) / S);
    // Bec : part de la tete, coude vers le bas (donc vers le cote en vue du dessus).
    const bu1 = hu + 0.055 * (1 - c.tuck);
    const bv1 = hv + 0.012;
    const bu2 = bu1 + 0.04 * (1 - c.tuck);
    const bv2 = bv1 + 0.03 * (1 - c.tuck);

    // Pattes : tres longues, genou inverse (plie vers l'arriere puis le pied repart vers l'avant).
    const upLeg = !air && standing ? c.rest : 0;
    for (const side of [-1, 1] as const) {
      const hipU = -0.06;
      const hipV = 0.035 * side;
      let kneeU: number, kneeV: number, footU: number, footV: number;
      if (air > 0.5) {
        kneeU = -0.34; kneeV = 0.02 * side; footU = -0.68; footV = 0.012 * side;
      } else if (upLeg === side) {
        // Patte repliee : le tibia remonte contre le corps.
        kneeU = -0.2; kneeV = 0.06 * side; footU = -0.06; footV = 0.07 * side;
      } else if (standing) {
        kneeU = -0.16; kneeV = 0.1 * side; footU = -0.06; footV = 0.2 * side;
      } else {
        const ph = c.gait + (side > 0 ? Math.PI : 0);
        const lift = Math.max(0, Math.sin(ph));
        footU = hipU + 0.3 * Math.cos(ph);
        footV = (0.16 + 0.05 * lift) * side;
        kneeU = lerp(hipU, footU, 0.45) - 0.14;
        kneeV = (0.1 + 0.1 * lift) * side;
        if (lift < 0.05 && Math.cos(ph) > 0.85) {
          // Rides dans l'eau a chaque pose de pied.
          pen.toWorld(pose, footU, footV, at);
          pen.shed(at.x, at.y, 0.3 * c.depth);
        }
      }
      pen.lineBody(pose, hipU, hipV, kneeU, kneeV, LEG);
      pen.lineBody(pose, kneeU, kneeV, footU, footV, LEG);
    }
    if (standing) {
      // Une seule ride, sous la patte d'appui.
      pen.toWorld(pose, -0.06, 0.2 * -c.rest, at);
      if (Math.random() < 0.04) pen.shed(at.x, at.y, 0.4 * c.depth);
    }

    // Ouverture des ailes : battement en vol, repli sur le dos au sol.
    const w = c.open;
    const wingReach = 0.08 + 0.42 * w;
    pen.shape(pose, 0.72, (u, v) => {
      const av = Math.abs(v);
      // Tete et bec (bout noir).
      if (Math.hypot(u - hu, v - hv) < headR) return ink(out, ...CORAL, INK_DARK);
      if (toSegment(u, v, hu, hv, bu1, bv1) < headR * 0.6) return ink(out, ...BILL);
      if (toSegment(u, v, bu1, bv1, bu2, bv2) < headR * 0.6) return ink(out, ...BLACK, INK_DARK);
      // Cou : plus pale a la base, plus corail vers la tete.
      for (let i = 0; i < NECK_N; i++) {
        if (toSegment(u, v, nu[i], nv[i], nu[i + 1], nv[i + 1]) < neckW) {
          const col = mix(PALE, CORAL, (i + seg.t) / NECK_N);
          return ink(out, col[0], col[1], col[2], INK_SCALE);
        }
      }
      // Ailes ouvertes : bord d'attaque rose, remiges noires au bord de fuite.
      if (w > 0.08 && av > 0.05 && av < wingReach) {
        const s = (av - 0.05) / (wingReach - 0.05);
        const le = 0.13 - 0.05 * s;
        const te = -0.1 - 0.09 * s;
        if (u < le && u > te) {
          const q = (u - te) / (le - te);
          if (s > 0.35 && q < 0.5) {
            // Rémiges : doigts separes par de fines fentes vers le bout.
            if (s > 0.8 && (q * 7) % 1 < 0.2) return false;
            return ink(out, ...BLACK, INK_DARK);
          }
          const col = mix(PINK, CORAL, q);
          return ink(out, col[0], col[1], col[2], INK_SCALE);
        }
      }
      // Queue courte.
      if (inEllipse(u, av, -0.2, 0, 0.07, 0.035)) return ink(out, ...PINK);
      // Corps ovale : corail a l'avant, rose pale a l'arriere.
      if (inEllipse(u, av, 0, 0, 0.21, 0.085)) {
        const q = clamp((u + 0.21) / 0.42, 0, 1);
        const col = mix(PALE, CORAL, q);
        // Quelques rémiges noires dessinees sur le flanc quand l'aile est repliee.
        if (w < 0.3 && av > 0.055 && u < -0.02) return ink(out, ...BLACK, INK_DARK);
        return ink(out, col[0], col[1], col[2], INK_SCALE);
      }
      return false;
    }, { light: 0.85 + 0.15 * (1 - w) });

    // Oeil : une cellule fixe, seulement si la tete est assez grosse.
    if (headR * S >= pen.cw * 0.55 && c.tuck < 0.5) {
      pen.toWorld(pose, hu, hv, at);
      pen.spot(at.x, at.y, "●", GLINT, EYE, c.depth);
    }
  },
};
