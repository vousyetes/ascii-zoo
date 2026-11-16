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
  /** Sens de l'affichage : 1 vers la droite, -1 vers la gauche. */
  dir: 1 | -1;
}

const DEFAULTS = {
  ...SHARED_TUNING,
  detail: 1.6,
  density: 1.1,
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
const LEG: RGB = [255, 170, 160];
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
  area: 50000,
  scale: 1.0,
  speed: 55,
  trail: { light: [214, 120, 130], dark: [255, 150, 150] },

  create: (c) => ({
    ...c, mode: "walk", until: 0, gait: rand(0, TAU), beat: rand(0, TAU), air: 0, open: 0, tuck: 0,
    rest: hash3(c.id, 3, 7) < 0.5 ? 1 : -1, scaredUntil: 0, dir: 1,
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
    // Silhouette de profil, toujours debout a l'ecran : seul le sens (gauche/droite) suit le cap.
    const cs = Math.cos(c.heading);
    if (Math.abs(cs) > 0.25) c.dir = cs >= 0 ? 1 : -1;
    const dir = c.dir;
    const pose = { x: c.x, y: c.y, heading: 0, span: S, depth: c.depth, id: c.id };
    const air = c.air;
    const standing = c.mode === "stand";
    const wobble = Math.sin(flock.time * 1.3 + c.id) * (standing ? 1 : 0.35);
    // u vers l'avant, v vers le bas (repere local), miroir applique a l'affichage.
    const L = (u0: number, v0: number, u1: number, v1: number) => { pen.lineBody(pose, u0 * dir, v0, u1 * dir, v1, LEG); pen.lineBody(pose, (u0 + 0.014) * dir, v0, (u1 + 0.014) * dir, v1, LEG); }

    // Cou en S : du garrot a la tete. Tendu vers l'avant en vol, tete sur le dos en pause (tuck).
    const neckW = Math.max(0.022, (pen.cw * 0.95) / S);
    const headR = Math.max(0.055, (pen.cw * 0.9) / S);
    for (let i = 0; i <= NECK_N; i++) {
      const s = i / NECK_N;
      // Sol : S (avant, arriere, avant) en montant.
      let u = 0.17 + 0.09 * Math.sin(s * Math.PI * 1.9 + 0.5 + wobble * 0.15) + 0.02 * s;
      let v = -0.02 - 0.52 * s;
      // Vol : droit vers l'avant, legere descente.
      u = lerp(u, 0.17 + 0.5 * s, air);
      v = lerp(v, -0.02 - 0.03 * s, air);
      // Tete sur le dos : le cou se replie en boucle sur le flanc.
      u = lerp(u, 0.12 - 0.2 * s + 0.06 * Math.sin(s * Math.PI), c.tuck);
      v = lerp(v, -0.1 - 0.06 * Math.sin(s * Math.PI), c.tuck);
      nu[i] = u;
      nv[i] = v;
    }
    const hu = nu[NECK_N];
    const hv = nv[NECK_N];
    // Bec coude : part vers l'avant, puis plonge vers le bas (bout noir).
    const bu1 = hu + 0.1 * (1 - c.tuck * 0.3);
    const bv1 = hv + 0.008;
    const bu2 = bu1 + 0.03;
    const bv2 = bv1 + 0.08 * (1 - 0.7 * air);

    // Pattes fines, genou inverse (plie vers l'arriere, pied reparti vers l'avant).
    const upLeg = !air && standing ? c.rest : 0;
    const gnd = 0.58;
    for (const side of [-1, 1] as const) {
      const hipU = -0.03 + 0.02 * side;
      const hipV = 0.07;
      let kneeU: number, kneeV: number, footU: number, footV: number;
      if (air > 0.5) {
        kneeU = -0.28 - 0.04 * side; kneeV = 0.06; footU = -0.66 - 0.04 * side; footV = 0.08 + 0.02 * side;
      } else if (upLeg === side) {
        // Patte repliee : cuisse vers l'arriere, tibia remonte vers l'avant sous le ventre.
        kneeU = hipU - 0.13; kneeV = 0.3; footU = hipU + 0.1; footV = 0.24;
      } else if (standing) {
        kneeU = hipU - 0.04; kneeV = 0.32; footU = hipU + 0.01; footV = gnd;
      } else {
        const ph = c.gait + (side > 0 ? Math.PI : 0);
        const lift = Math.max(0, Math.sin(ph));
        footU = hipU + 0.16 * Math.cos(ph);
        footV = gnd - 0.1 * lift;
        kneeU = lerp(hipU, footU, 0.4) - 0.07;
        kneeV = 0.31 - 0.04 * lift;
        if (lift < 0.05 && Math.cos(ph) > 0.85) {
          pen.toWorld(pose, footU * dir, footV, at);
          pen.shed(at.x, at.y, 0.3 * c.depth);
        }
      }
      L(hipU, hipV, kneeU, kneeV);
      L(kneeU, kneeV, footU, footV);
      // Petit pied vers l'avant (sauf en vol).
      if (air < 0.5 && upLeg !== side) L(footU, footV, footU + 0.05, footV);
    }
    if (standing) {
      pen.toWorld(pose, -0.03 * dir, gnd, at);
      if (Math.random() < 0.04) pen.shed(at.x, at.y, 0.4 * c.depth);
    }

    // Aile : repliee sur le flanc au sol, grand battement en vol (rose puis remiges noires).
    const w = c.open;
    const flap = Math.cos(c.beat);
    const wtU = -0.3 - 0.25 * w; // bout de l'aile (vers l'arriere)
    const wtV = -0.04 - 0.5 * w * flap; // haut / bas
    pen.shape(pose, 1.25, (x, v) => {
      const u = x * dir;
      // Tete et bec.
      if (Math.hypot(u - hu, v - hv) < headR) return ink(out, ...CORAL, INK_DARK);
      if (toSegment(u, v, hu, hv, bu1, bv1) < headR * 0.55) return ink(out, ...BILL);
      if (toSegment(u, v, bu1, bv1, bu2, bv2) < headR * 0.6) return ink(out, ...(seg.t > 0.35 || v > bv1 + 0.02 ? BLACK : BILL), seg.t > 0.35 ? INK_DARK : INK_SCALE);
      // Cou : pale a la base, corail vers la tete.
      for (let i = 0; i < NECK_N; i++) {
        if (toSegment(u, v, nu[i], nv[i], nu[i + 1], nv[i + 1]) < neckW) {
          const col = mix(PALE, CORAL, (i + seg.t) / NECK_N);
          return ink(out, col[0], col[1], col[2], INK_SCALE);
        }
      }
      // Aile ouverte : bande effilee de l'epaule au bout, remiges noires sur la moitie externe.
      if (w > 0.1) {
        const d = toSegment(u, v, 0.06, -0.03, wtU, wtV);
        if (d < 0.075 * (1 - seg.t * 0.6)) {
          if (seg.t > 0.5) return ink(out, ...BLACK, INK_DARK);
          return ink(out, ...mix(CORAL, PINK, seg.t * 2), INK_SCALE);
        }
      }
      // Queue courte et pointue.
      if (toSegment(u, v, -0.18, 0, -0.34, 0.01) < 0.03 * (1 - 0.5 * seg.t)) return ink(out, ...PINK);
      // Corps ovale : corail devant, rose pale derriere, ventre plus clair.
      if (inEllipse(u, v, 0, 0, 0.22, 0.105)) {
        const q = clamp((u + 0.22) / 0.44, 0, 1);
        // Aile repliee : remiges noires sur l'arriere du flanc.
        if (w < 0.3 && v > -0.02 && v < 0.05 && u < -0.1) return ink(out, ...BLACK, INK_DARK);
        if (w < 0.3 && u < 0.02 && v < 0.03) return ink(out, ...mix(PINK, CORAL, q + 0.2), INK_SCALE);
        const col = mix(PALE, CORAL, q);
        return ink(out, col[0], col[1], col[2], INK_SCALE);
      }
      return false;
    }, { light: 0.85 + 0.15 * (1 - w) });

    // Oeil : une cellule, sur la tete.
    if (c.tuck < 0.5) {
      pen.toWorld(pose, (hu + 0.012) * dir, hv - 0.008, at);
      pen.spot(at.x, at.y, "●", GLINT, EYE, c.depth);
    }
  },
};
