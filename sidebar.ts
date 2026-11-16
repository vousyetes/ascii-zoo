/**
 * Dock des animaux : une colonne de vignettes (le vrai animal du moteur, en miniature), centrée à
 * gauche. Rien d'autre à l'écran : au survol, une étiquette sort à côté de la vignette avec le
 * nom et la façon de se déplacer. Un petit bouton en bas règle le sens (calme ou croisé).
 * Sur mobile le dock se range derrière un bouton et glisse par-dessus l'écran, avec les noms.
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
  const tip = document.querySelector<HTMLElement>(".side-tip");

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
    // Étiquette au survol : une seule bulle, hors de la liste pour ne pas être coupée.
    const show = () => {
      if (!tip || matchMedia("(max-width: 700px)").matches) return;
      const r = b.getBoundingClientRect();
      tip.innerHTML = `<span class="n">${String(i + 1).padStart(2, "0")}</span><span class="t">${it.label}</span><span class="s">${it.sub}</span>`;
      tip.style.setProperty("--swatch", it.swatch);
      tip.style.top = `${r.top + r.height / 2}px`;
      tip.style.left = `${r.right + 12}px`;
      tip.classList.add("on");
    };
    const hide = () => tip?.classList.remove("on");
    b.addEventListener("pointerenter", show);
    b.addEventListener("pointerleave", hide);
    b.addEventListener("focus", show);
    b.addEventListener("blur", hide);
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
    sw.querySelector(".g")!.textContent = calm ? ">>" : "<>";
    sw.title = calm ? "Calme : tous dans le même sens. Cliquer pour les faire se croiser." : "Croisé : ils vont dans tous les sens. Cliquer pour tout calmer.";
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
