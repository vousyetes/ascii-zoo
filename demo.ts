import { mountTweakPanel, type Control, type ControlKit } from "./panel";
import { ANIMALS, AnimalEngine, SHARED_CONTROLS, type AnimalKey, type KnobSpec, type Tuning } from "./src";
import { mountChoices } from "./ui";

/**
 * Prefix for everything this app keeps in localStorage. It shares a domain with the older
 * butterflies app (Pocket Studio, /butterflies-app), which uses bare "tweaks" and "animal".
 */
const STORE = "ascii-animals:";

/** Vous y êtes garde trois animaux : lisibles en 9:16, et leurs couleurs sont celles de la charte. */
const KEPT: AnimalKey[] = ["jellyfish", "koi", "butterflies", "rhino", "gorilla", "chameleon", "peacock", "octopus", "snail", "axolotl", "owl", "manta", "hummingbird", "elephant", "flamingo", "hippo", "seahorse"];

const FR: Partial<Record<AnimalKey, string>> = { jellyfish: "méduse", koi: "koï", butterflies: "papillon", rhino: "rhino", gorilla: "gorille", chameleon: "caméléon", peacock: "paon", octopus: "poulpe", snail: "escargot", axolotl: "axolotl", owl: "hibou", manta: "raie manta", hummingbird: "colibri", elephant: "éléphant", flamingo: "flamant", hippo: "hippopotame", seahorse: "hippocampe" };

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

mountChoices(
  document.querySelector<HTMLElement>(".choices")!,
  KEPT.map((key) => ({ value: key, label: FR[key] ?? ANIMALS[key].label, swatch: `rgb(${ANIMALS[key].swatch.join(",")})` })),
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

