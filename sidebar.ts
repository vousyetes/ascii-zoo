/**
 * Barre latérale des animaux : une liste numérotée façon sommaire vousyetes v3, avec une petite
 * icône ASCII par animal. Sur mobile elle se range derrière un bouton et glisse par-dessus l'écran.
 */

export interface SideItem {
  value: string;
  label: string;
  /** Couleur de l'animal (CSS), reprise pour l'icône et le filet actif. */
  swatch: string;
  /** Icône ASCII : deux lignes de cinq caractères. */
  icon: [string, string];
}

/** Une petite icône ASCII par animal. Cinq colonnes, deux lignes, jamais plus. */
export const ICONS: Record<string, [string, string]> = {
  jellyfish: [" .-. ", "/|||\\"],
  koi: ["><(o>", " ~~~ "],
  butterflies: ["}\\o/{", " /_\\ "],
  rhino: ["  _/^", " |_|_"],
  gorilla: [" (oo)", "/|##|"],
  chameleon: ["_(o>~", "\\/\\/@"],
  peacock: [" \\|/ ", "<(>)_"],
  octopus: [" .-. ", "(o_o)"],
  snail: ["  _@ ", "_(_)>"],
  axolotl: ["\\o_o/", " ~~~="],
  owl: ["{o,o}", "/)__)"],
  manta: ["\\_^_/", "  v  "],
  hummingbird: ["  ,-->", "~{o}  "],
  elephant: ["(_)_/", "||  |"],
  flamingo: [" ,_> ", " S|  "],
  hippo: ["_(oo)", "|___|"],
  seahorse: [" ,o> ", " (S) "],
};

export function mountSidebar(host: HTMLElement, items: SideItem[], current: string, onPick: (value: string) => void) {
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
      `<pre class="ico" aria-hidden="true">${it.icon[0]}\n${it.icon[1]}</pre>` +
      `<span class="n">${String(i + 1).padStart(2, "0")}</span>` +
      `<span class="name">${it.label}</span>`;
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
