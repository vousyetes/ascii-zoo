// Captures pour le README : node scripts/screens.mjs
// Demande un serveur sur http://localhost:5199 et CHROME=<chemin du chrome headless>.
import { createRequire } from "node:module";
import { mkdirSync } from "node:fs";
const require = createRequire("/Users/vousyetes/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");

const OUT = "docs";
mkdirSync(OUT, { recursive: true });
const verticals = ["seahorse", "rhino", "elephant", "flamingo", "axolotl", "owl"];

const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const a of verticals) {
  const p = await b.newPage({ viewport: { width: 540, height: 960 }, deviceScaleFactor: 2 });
  await p.goto(`http://localhost:5199/?animal=${a}`);
  await p.waitForTimeout(5000);
  await p.screenshot({ path: `${OUT}/${a}.png` });
  await p.close();
}
const d = await b.newPage({ viewport: { width: 1440, height: 810 }, deviceScaleFactor: 2 });
await d.goto("http://localhost:5199/?animal=seahorse");
await d.waitForTimeout(5000);
await d.screenshot({ path: `${OUT}/desktop.png` });
await b.close();
