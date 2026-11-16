/**
 * Dock des animaux, minimaliste : une colonne d'icônes sans cadre, à gauche. Les icônes sont discrètes ;
 * la souris ou le doigt les grossit en loupe (la plus proche grossit le plus, ses voisines un peu), avec
 * un léger ressort. Le nom de l'animal sort à côté de l'icône visée. Sur écran tactile, on glisse le doigt
 * le long du dock : un tic haptique à chaque icône traversée, et on lâche sur l'animal voulu (le tic
 * haptique passe par navigator.vibrate : Android seulement, iOS ne le permet pas).
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
  salamander: "marche",
  owl: "plane",
  manta: "plane",
  hummingbird: "sur place",
  elephant: "marche",
  flamingo: "échasse",
  hippo: "marche",
  seahorse: "dérive",
  frogs: "saute",
  ants: "porte",
  firefly: "clignote",
};

export function mountSidebar(
  host: HTMLElement,
  items: SideItem[],
  current: string,
  onPick: (value: string) => void,
  onCalm?: (calm: boolean) => void,
) {
  const list = host.querySelector<HTMLElement>(".side-list")!;
  const tip = document.querySelector<HTMLElement>(".side-tip");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const buttons = items.map((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", it.label);
    b.dataset.value = it.value;
    b.dataset.i = String(i);
    b.style.setProperty("--swatch", it.swatch);
    b.innerHTML = `<img class="ico" src="${it.icon}" alt="" draggable="false" decoding="async">`;
    list.append(b);
    return b;
  });

  // Pas vertical adapté à la hauteur de l'écran : tout tient, sans défiler.
  const fit = () => {
    const room = window.innerHeight - 96;
    const pitch = Math.max(20, Math.min(34, room / items.length));
    host.style.setProperty("--pitch", `${pitch}px`);
  };
  fit();
  window.addEventListener("resize", fit);

  // ── loupe : chaque icône vise une échelle (selon sa distance au pointeur), un ressort la suit ──
  const state = buttons.map(() => ({ k: 0, v: 0, target: 0 }));
  let raf = 0;
  let near = -1;
  let pointerY: number | null = null;
  let touching = false;

  const haptic = (ms: number) => {
    try {
      navigator.vibrate?.(ms);
    } catch {
      // Pas de vibration sur cet appareil.
    }
  };

  function aim(y: number | null) {
    pointerY = y;
    let best = -1;
    let bestD = 1e9;
    const spread = 70;
    buttons.forEach((b, i) => {
      if (y === null) {
        state[i].target = 0;
        return;
      }
      const r = b.getBoundingClientRect();
      const d = Math.abs(y - (r.top + r.height / 2));
      state[i].target = reduce ? (d < r.height / 2 ? 1 : 0) : Math.exp(-((d / spread) ** 2));
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    });
    if (y === null) best = -1;
    if (best !== near) {
      near = best;
      if (touching && best >= 0) haptic(6);
      showTip();
    }
    if (!raf) raf = requestAnimationFrame(tick);
  }

  function tick() {
    raf = 0;
    let moving = false;
    buttons.forEach((b, i) => {
      const st = state[i];
      // Ressort amorti : raideur 220, amortissement 22 (léger dépassement, pas de rebond long).
      const dt = 1 / 60;
      st.v += ((st.target - st.k) * 220 - st.v * 22) * dt;
      st.k += st.v * dt;
      if (Math.abs(st.v) > 0.001 || Math.abs(st.target - st.k) > 0.001) moving = true;
      b.style.setProperty("--k", st.k.toFixed(3));
    });
    if (moving) raf = requestAnimationFrame(tick);
    else if (pointerY === null) showTip();
  }

  function showTip() {
    if (!tip) return;
    if (near < 0) {
      tip.classList.remove("on");
      return;
    }
    const it = items[near];
    const r = buttons[near].getBoundingClientRect();
    tip.innerHTML = `<span class="n">${String(near + 1).padStart(2, "0")}</span><span class="t">${it.label}</span><span class="s">${it.sub}</span>`;
    tip.style.setProperty("--swatch", it.swatch);
    tip.style.top = `${r.top + r.height / 2}px`;
    tip.style.left = `${host.getBoundingClientRect().right + 10}px`;
    tip.classList.add("on");
  }

  list.addEventListener("pointermove", (e) => aim(e.clientY));
  list.addEventListener("pointerleave", () => {
    if (!touching) aim(null);
  });
  list.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touching = true;
      list.setPointerCapture(e.pointerId);
      haptic(8);
      aim(e.clientY);
    }
  });
  const release = (e: PointerEvent) => {
    if (!touching) return;
    touching = false;
    // On lâche sur l'animal visé : c'est celui qu'on choisit.
    if (near >= 0) {
      select(items[near].value, true);
      haptic(14);
    }
    aim(null);
    e.preventDefault();
  };
  list.addEventListener("pointerup", release);
  list.addEventListener("pointercancel", () => {
    touching = false;
    aim(null);
  });
  // Souris : un clic sur une icône.
  list.addEventListener("click", (e) => {
    const b = (e.target as HTMLElement).closest("button");
    if (!b || touching) return;
    select(b.dataset.value!, true);
  });

  function select(value: string, pick: boolean) {
    for (const b of buttons) {
      const on = b.dataset.value === value;
      b.setAttribute("aria-checked", String(on));
      b.tabIndex = on ? 0 : -1;
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
    near = Number(next.dataset.i);
    state.forEach((st, i) => (st.target = i === near ? 1 : 0));
    if (!raf) raf = requestAnimationFrame(tick);
    showTip();
  });
  list.addEventListener("focusout", () => {
    near = -1;
    state.forEach((st) => (st.target = 0));
    if (!raf) raf = requestAnimationFrame(tick);
    showTip();
  });

  // Bouton du bas : croisé (ils vont dans tous les sens) ou calme (tous le même).
  const sw = host.querySelector<HTMLButtonElement>(".side-calm");
  sw?.addEventListener("click", () => {
    const calm = sw.getAttribute("aria-pressed") !== "true";
    sw.setAttribute("aria-pressed", String(calm));
    sw.querySelector(".g")!.textContent = calm ? ">>" : "<>";
    sw.title = calm ? "Calme : tous dans le même sens. Cliquer pour les faire se croiser." : "Croisé : ils vont dans tous les sens. Cliquer pour tout calmer.";
    haptic(10);
    onCalm?.(calm);
  });

  select(current, false);
}
