// Fabrique les vignettes de la barre : le vrai animal du moteur, figé au centre, recadré sur sa forme.
// node scripts/icons.mjs  (serveur sur 5199, CHROME=...)
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/Users/vousyetes/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const keys = ["jellyfish", "koi", "butterflies", "rhino", "gorilla", "chameleon", "peacock", "octopus", "snail", "axolotl", "owl", "manta", "hummingbird", "elephant", "flamingo", "hippo", "seahorse"];
const RATIO = 60 / 44;
mkdirSync("public/icons", { recursive: true });
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 900, height: 700 }, deviceScaleFactor: 3 });
for (const k of keys) {
  await p.goto(`http://localhost:5199/?animal=${k}&count=1&icon=1`);
  await p.waitForFunction(() => window.__iconReady === true, null, { timeout: 15000 });
  // Boite englobante des cellules allumées (on ignore la grille et les traces très pâles).
  const box = await p.evaluate(() => {
    const c = document.querySelector("canvas");
    const g = c.getContext("2d");
    const { width: w, height: h } = c;
    const d = g.getImageData(0, 0, w, h).data;
    const dpr = w / c.getBoundingClientRect().width;
    let x0 = w, y0 = h, x1 = 0, y1 = 0;
    const step = 3;
    for (let y = 0; y < h; y += step) for (let x = 0; x < w; x += step) {
      const i = (y * w + x) * 4;
      if (Math.max(d[i], d[i + 1], d[i + 2]) > 120) {
        if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y;
      }
    }
    return { x: x0 / dpr, y: y0 / dpr, w: (x1 - x0) / dpr, h: (y1 - y0) / dpr };
  });
  if (!(box.w > 0 && box.h > 0)) { box.x = 330; box.y = 250; box.w = 240; box.h = 200; } // repli : centre de la scène
  const pad = 14;
  let w = box.w + pad * 2, h = box.h + pad * 2;
  if (w / h < RATIO) w = h * RATIO; else h = w / RATIO;
  const cx = box.x + box.w / 2, cy = box.y + box.h / 2;
  const x = Math.max(0, Math.min(900 - w, cx - w / 2)), y = Math.max(0, Math.min(700 - h, cy - h / 2));
  await p.screenshot({ path: `public/icons/${k}.png`, clip: { x, y, width: Math.min(w, 900), height: Math.min(h, 700) } });
  console.log(k, Math.round(w), Math.round(h));
}
await b.close();
