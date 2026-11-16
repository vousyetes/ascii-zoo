/**
 * Barre latérale des animaux, reprise du sommaire vousyetes v3 : filet en dégradé, étiquette mono,
 * liste numérotée, filet actif. Adaptée au moteur : chaque entrée a sa cellule de grille avec une
 * petite icône ASCII, et un interrupteur calme / croisé règle le sens de marche des animaux.
 * Sur mobile elle se range derrière un bouton et glisse par-dessus l'écran.
 */

export interface SideItem {
  value: string;
  label: string;
  /** Couleur de l'animal (CSS), reprise pour l'icône et le filet actif. */
  swatch: string;
  /** Vignette : le vrai animal du moteur, en miniature (public/icons/<animal>.png). */
  icon: string;
  /** Mot en mono sous le nom : comment il se déplace. */
  sub: string;
}

/** Comment chacun se déplace, pour la ligne mono sous son nom. */
export const MOVES: Record<string, string> = {
  jellyfish: "flotte",
  koi: "nage",
  butterflies: "vole",
  rhino: "charge",
  gorilla: "marche",
  chameleon: "rampe",
  peacock: "fait la roue",
  octopus: "nage",
  snail: "rampe",
  axolotl: "nage",
  owl: "plane",
  manta: "plane",
  hummingbird: "sur place",
  elephant: "marche",
  flamingo: "échasse",
  hippo: "marche",
  seahorse: "dérive",
};

export function mountSidebar(
  host: HTMLElement,
  items: SideItem[],
  current: string,
  onPick: (value: string) => void,
  onCalm?: (calm: boolean) => void,
) {
  const list = host.querySelector<HTMLElement>(".side-list")!;
  const toggle = document.querySelector<HTMLButtonElement>(".side-toggle");
  const label = host.querySelector<HTMLElement>(".side-count");
  if (label) label.textContent = String(items.length).padStart(2, "0");

  const buttons = items.map((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.dataset.value = it.value;
    b.style.setProperty("--swatch", it.swatch);
    b.innerHTML =
      `<span class="cell" aria-hidden="true"><img class="ico" src="${it.icon}" alt="" width="52" height="38" loading="lazy" decoding="async"></span>` +
      `<span class="n">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="name">${it.label}</span>` +
      `<span class="sub">${it.sub}</span>`;
    b.addEventListener("click", () => {
      select(it.value, true);
      closeDrawer();
    });
    list.append(b);
    return b;
  });

  function select(value: string, pick: boolean) {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
      if (on) b.scrollIntoView({ block: "nearest" });
    }
    if (pick) onPick(value);
  }

  list.addEventListener("keydown", (e) => {
    const at = buttons.indexOf(document.activeElement as HTMLButtonElement);
    if (at < 0 || (e.key !== "ArrowDown" && e.key !== "ArrowUp")) return;
    e.preventDefault();
    const next = buttons[(at + (e.key === "ArrowDown" ? 1 : -1) + buttons.length) % buttons.length];
    next.focus();
    select(next.dataset.value!, true);
  });

  // Interrupteur : croisé (ils vont dans tous les sens) ou calme (tous le même).
  const sw = host.querySelector<HTMLButtonElement>(".side-calm");
  sw?.addEventListener("click", () => {
    const calm = sw.getAttribute("aria-pressed") !== "true";
    sw.setAttribute("aria-pressed", String(calm));
    sw.querySelector(".state")!.textContent = calm ? "calme" : "croisé";
    onCalm?.(calm);
  });

  function closeDrawer() {
    host.classList.remove("open");
    toggle?.setAttribute("aria-expanded", "false");
  }
  toggle?.addEventListener("click", () => {
    const open = host.classList.toggle("open");
    toggle.setAttribute("aria-expanded", String(open));
  });
  // Un clic sur le canvas referme le tiroir sur mobile.
  window.addEventListener("pointerdown", (e) => {
    if (host.classList.contains("open") && !host.contains(e.target as Node) && e.target !== toggle) closeDrawer();
  });

  select(current, false);
}
