// Fabrique les vignettes de la barre : le vrai animal du moteur, figé au centre, recadré sur sa forme.
// node scripts/icons.mjs  (serveur sur 5199, CHROME=...)
import { createRequire } from "node:module";
import { mkdirSync, writeFileSync } from "node:fs";
const require = createRequire("/Users/vousyetes/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const all = ["jellyfish", "koi", "butterflies", "rhino", "gorilla", "chameleon", "peacock", "octopus", "snail", "axolotl", "owl", "manta", "hummingbird", "elephant", "flamingo", "hippo", "seahorse", "salamander", "firefly", "ants", "frogs"];
const keys = process.argv.length > 2 ? process.argv.slice(2) : all;
const RATIO = 60 / 44;
mkdirSync("public/icons", { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 3 });
for (const k of keys) {
  // Quatre essais par animal (pose différente à chaque chargement) : on garde le plus rempli.
  let best = null;
  for (let t = 0; t < 4; t++) {
    await p.goto(`http://localhost:5199/?animal=${k}&count=1&icon=1`);
    await p.waitForFunction(() => window.__iconReady === true, null, { timeout: 15000 });
    const box = await p.evaluate(() => {
      const c = document.querySelector("canvas");
      const g = c.getContext("2d");
      const { width: w, height: h } = c;
      const d = g.getImageData(0, 0, w, h).data;
      const dpr = w / c.getBoundingClientRect().width;
      let x0 = w, y0 = h, x1 = 0, y1 = 0, lit = 0;
      const step = 3;
      for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
        const i = (y * w + x) * 4;
        if (Math.max(d[i], d[i + 1], d[i + 2]) > 120) {
          lit++;
          if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
        }
      }
      return { x: x0 / dpr, y: y0 / dpr, w: (x1 - x0) / dpr, h: (y1 - y0) / dpr, lit };
    });
    if (!(box.w > 0 && box.h > 0)) continue;
    const density = box.lit / Math.max(1, (box.w * box.h) / 9);
    const score = box.lit * (0.5 + density);
    if (best && score <= best.score) continue;
    const pad = 8;
    let w = box.w + pad * 2, h = box.h + pad * 2;
    if (w / h < RATIO) w = h * RATIO; else h = w / RATIO;
    const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
    const x = Math.max(0, Math.min(900 - w, cx - w / 2)), y = Math.max(0, Math.min(700 - h, cy - h / 2));
    const buf = await p.screenshot({ clip: { x, y, width: Math.min(w, 900), height: Math.min(h, 700) } });
    best = { score, buf };
  }
  if (!best) { console.log(k, "rien"); continue; }
  writeFileSync(`public/icons/${k}.png`, best.buf);
  console.log(k, Math.round(best.score));
}
await b.close();
