import { mountTweakPanel, type Control, type ControlKit } from "./panel";
import { ANIMALS, AnimalEngine, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";
import { MOVES, mountSidebar } from "./sidebar";

const BASE: string = (import.meta as any).env?.BASE_URL ?? "/";

/**
 * Prefix for everything this app keeps in localStorage. It shares a domain with the older
 * butterflies app (Pocket Studio, /butterflies-app), which uses bare "tweaks" and "animal".
 */
const STORE = "ascii-animals:";

/** The animals shown in the dock, in order. */
const KEPT: AnimalKey[] = ["jellyfish", "koi", "butterflies", "rhino", "gorilla", "chameleon", "peacock", "octopus", "snail", "axolotl", "salamander", "owl", "manta", "hummingbird", "elephant", "flamingo", "hippo", "seahorse", "ants", "firefly", "frogs"];

const EN: Partial<Record<AnimalKey, string>> = { jellyfish: "jellyfish", koi: "koi", butterflies: "butterfly", rhino: "rhino", gorilla: "gorilla", chameleon: "chameleon", peacock: "peacock", octopus: "squid", snail: "snail", axolotl: "axolotl", salamander: "salamander", owl: "owl", manta: "manta ray", hummingbird: "hummingbird", elephant: "elephant", flamingo: "flamingo", hippo: "hippo", seahorse: "seahorse", ants: "ants", firefly: "firefly", frogs: "frog" };

const params = new URLSearchParams(location.search);

// ?animal=koi picks the animal (otherwise the last one picked); ?count=60 pins how many. No count: sized to the screen.
const count = Number(params.get("count")) || undefined;
const isAnimal = (key: string | null): key is AnimalKey => key !== null && key in ANIMALS;
let saved: string | null = null;
try {
  saved = localStorage.getItem(STORE + "animal");
} catch {
  // Storage unavailable: start with butterflies.
}
let animal: AnimalKey = isAnimal(params.get("animal")) ? (params.get("animal") as AnimalKey) : isAnimal(saved) && KEPT.includes(saved) ? saved : "jellyfish";

// Dark mode only: every animal is tuned to glow on black.
const engine = new AnimalEngine(document.querySelector("canvas")!, { animal, count, theme: "dark" });

// Mode icône : un seul animal, figé au centre, pour en tirer la vignette de la barre (scripts/icons.mjs).
if (params.has("icon")) {
  document.body.classList.add("icon-mode");
  setTimeout(() => {
    const e = engine as any;
    cancelAnimationFrame(e.raf);
    const f = e.flock;
    const c = f.creatures[0];
    const r = document.querySelector("canvas")!.getBoundingClientRect();
    c.x = r.width / 2;
    c.y = r.height / 2;
    c.roll = 1;
    c.depth = 1;
    c.span = f.base * f.tuning.size * 1.7;
    e.renderer.render(f, 0.016);
    (window as any).__iconReady = true;
  }, 2600);
}

// ── tweak panel: shared Movement and Look knobs around the animal's own ──

/** Each animal's tweaks are saved under their own key. */
const storageKey = (key: AnimalKey) => `${STORE}tweaks:${key}`;

function controlsFor(key: AnimalKey) {
  const a = ANIMALS[key];
  const hidden = new Set<string>(a.hide ?? []);
  return (kit: ControlKit<Tuning>): [string, Control[]][] => {
    const build = (spec: KnobSpec): Control => {
      if ("toggle" in spec) return kit.toggle(spec.key, spec.label, spec.hint);
      const knob = kit.knob(spec.key, spec.label, spec.min, spec.max, spec.step, spec.hint);
      const when = spec.disabledWhen;
      return when ? { ...knob, disabled: () => Boolean(engine.tuning[when]) } : knob;
    };
    const keep = (specs: KnobSpec[]) => specs.filter((s) => !hidden.has(s.key)).map(build);
    return [
      ["Movement", keep(SHARED_CONTROLS.movement)],
      ...a.controls.map(([title, specs]): [string, Control[]] => [title, specs.map(build)]),
      ["Look", keep(SHARED_CONTROLS.look)],
    ];
  };
}

let tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), { storageKey: storageKey(animal) });

// Open in two tabs? When the other one saves tweaks for this animal, reload, so this tab never
// writes its stale settings back over the newer ones.
window.addEventListener("storage", (e) => {
  if (e.key === storageKey(animal)) location.reload();
});

// ── animal choices: every animal in the top bar, each with a dot of its own colour ──

mountSidebar(
  document.querySelector<HTMLElement>(".side")!,
  KEPT.map((key) => ({ value: key, label: EN[key] ?? ANIMALS[key].label, swatch: `rgb(${ANIMALS[key].swatch.join(",")})`, icon: `${BASE}icons/${key}.png`, sub: MOVES[key] ?? "" })),
  animal,
  (value) => {
    animal = value as AnimalKey;
    engine.setAnimal(animal);
    tweaks.destroy();
    tweaks = mountTweakPanel(engine, ANIMALS[animal].defaults, controlsFor(animal), { storageKey: storageKey(animal) });
    try {
      localStorage.setItem(STORE + "animal", animal);
    } catch {
      // Not remembered across visits, that's all.
    }
  },
);

