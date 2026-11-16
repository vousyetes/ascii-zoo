/**
 * Dock des animaux, minimaliste et replié : un bouton « animaux » dans l'en-tête (comme « tweaks »). Il s'ouvre
 * vers la droite en une rangée d'icônes sans cadre. Souris ou doigt grossissent les icônes en loupe, avec un
 * léger ressort, et le nom de l'animal visé s'affiche. Au doigt, on glisse le long de la rangée : un tic
 * haptique à chaque icône traversée, et on lâche sur l'animal voulu (navigator.vibrate : Android seulement).
 * Sur mobile la rangée s'ouvre en colonne sous le bouton.
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

/** How each one moves, for the mono line next to its name. */
export const MOVES: Record<string, string> = {
  jellyfish: "floats",
  koi: "swims",
  butterflies: "flutters",
  rhino: "charges",
  gorilla: "walks",
  chameleon: "climbs",
  peacock: "struts",
  octopus: "jets",
  snail: "crawls",
  axolotl: "swims",
  owl: "glides",
  manta: "glides",
  hummingbird: "hovers",
  elephant: "walks",
  flamingo: "wades",
  hippo: "wades",
  seahorse: "drifts",
  frogs: "hops",
  ants: "carry sugar",
  firefly: "blinks",
  salamander: "crawls",
};

export function mountSidebar(
  host: HTMLElement,
  items: SideItem[],
  current: string,
  onPick: (value: string) => void,
) {
  const list = host.querySelector<HTMLElement>(".side-list")!;
  const opener = host.querySelector<HTMLButtonElement>(".side-open")!;
  const vertical = () => matchMedia("(max-width: 700px)").matches;
  const tip = document.querySelector<HTMLElement>(".side-tip");
  const reduce = matchMedia("(prefers-reduced-motion: reduce)").matches;

  const buttons = items.map((it, i) => {
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "radio");
    b.setAttribute("aria-label", it.label);
    b.dataset.value = it.value;
    b.dataset.i = String(i);
    b.style.setProperty("--d", `${i * 16}ms`);
    b.style.setProperty("--swatch", it.swatch);
    b.innerHTML = `<img class="ico" src="${it.icon}" alt="" draggable="false" decoding="async">`;
    list.append(b);
    return b;
  });

  // Taille adaptée à l'écran : tout tient sans défiler (rangée en haut, colonne sur mobile).
  const fit = () => {
    const pitch = vertical()
      ? Math.max(20, Math.min(34, (window.innerHeight - 150) / items.length))
      : Math.max(22, Math.min(34, (window.innerWidth - 300) / (items.length * 1.5)));
    host.style.setProperty("--pitch", `${pitch}px`);
  };
  fit();
  window.addEventListener("resize", fit);

  // Ouvrir / fermer : le bouton, Échap, un clic ailleurs, ou le choix d'un animal.
  const setOpen = (open: boolean) => {
    host.classList.toggle("open", open);
    opener.setAttribute("aria-expanded", String(open));
    if (!open) {
      near = -1;
      state.forEach((st) => (st.target = 0));
      if (!raf) raf = requestAnimationFrame(tick);
      showTip();
    }
  };
  opener.addEventListener("click", () => {
    const open = !host.classList.contains("open");
    setOpen(open);
    haptic(8);
  });
  window.addEventListener("keydown", (e) => {
    if (e.key === "Escape") setOpen(false);
  });
  window.addEventListener("pointerdown", (e) => {
    if (host.classList.contains("open") && !host.contains(e.target as Node)) setOpen(false);
  });

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
    const spread = 95;
    buttons.forEach((b, i) => {
      if (y === null) {
        state[i].target = 0;
        return;
      }
      const r = b.getBoundingClientRect();
      const c = vertical() ? r.top + r.height / 2 : r.left + r.width / 2;
      const d = Math.abs(y - c);
      const half = vertical() ? r.height / 2 : r.width / 2;
      state[i].target = reduce ? (d < half ? 1 : 0) : Math.exp(-((d / spread) ** 2));
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
    // Le dock respire : chaque icône est poussée par la loupe de celles qui la précèdent, les autres s'écartent.
    const gap = vertical() ? 26 : 30;
    let acc = 0;
    buttons.forEach((b, i) => {
      const k = Math.max(0, state[i].k);
      b.style.setProperty("--px", `${(acc + k * 0.5 * gap).toFixed(1)}px`);
      acc += k * gap;
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
    tip.classList.toggle("below", !vertical());
    if (vertical()) {
      tip.style.top = `${r.top + r.height / 2}px`;
      tip.style.left = `${host.getBoundingClientRect().right + 10}px`;
    } else {
      tip.style.top = `${r.bottom + 14}px`;
      tip.style.left = `${r.left + r.width / 2}px`;
    }
    tip.classList.add("on");
  }

  const along = (e: PointerEvent) => (vertical() ? e.clientY : e.clientX);
  list.addEventListener("pointermove", (e) => aim(along(e)));
  list.addEventListener("pointerleave", () => {
    if (!touching) aim(null);
  });
  list.addEventListener("pointerdown", (e) => {
    if (e.pointerType === "touch") {
      touching = true;
      list.setPointerCapture(e.pointerId);
      haptic(8);
      aim(along(e));
    }
  });
  const release = (e: PointerEvent) => {
    if (!touching) return;
    touching = false;
    // On lâche sur l'animal visé : c'est celui qu'on choisit.
    if (near >= 0) {
      select(items[near].value, true);
      haptic(14);
      setTimeout(() => setOpen(false), 180);
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
    setTimeout(() => setOpen(false), 180);
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

  select(current, false);
}
