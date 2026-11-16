import type { Animal } from "../flock";
import { butterflies } from "./butterflies";
import { crabs } from "./crabs";
import { cranes } from "./cranes";
import { dragonflies } from "./dragonflies";
import { frogs } from "./frogs";
import { jellyfish } from "./jellyfish";
import { gorilla } from "./gorilla";
import { koi } from "./koi";
import { rhino } from "./rhino";
import { chameleon } from "./chameleon";
import { peacock } from "./peacock";
import { octopus } from "./octopus";
import { snail } from "./snail";
import { axolotl } from "./axolotl";
import { owl } from "./owl";
import { manta } from "./manta";
import { hummingbird } from "./hummingbird";
import { elephant } from "./elephant";
import { flamingo } from "./flamingo";

/** Every animal, in the order the choices show them. */
export const ANIMALS = {
  butterflies,
  koi,
  jellyfish,
  dragonflies,
  frogs,
  cranes,
  crabs,
  gorilla,
  rhino,
  chameleon,
  peacock,
  octopus,
  snail,
  axolotl,
  owl,
  manta,
  hummingbird,
  elephant,
  flamingo,
} satisfies Record<string, Animal<any>>;

export type AnimalKey = keyof typeof ANIMALS;

export const ANIMAL_KEYS = Object.keys(ANIMALS) as AnimalKey[];
