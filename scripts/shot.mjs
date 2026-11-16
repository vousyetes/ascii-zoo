// Capture un animal en 9:16 : node scripts/shot.mjs <animal> <sortie.png> [secondes] [clic]
// Demande un serveur sur http://localhost:5199 (npm run dev -- --port 5199).
import { createRequire } from "node:module";
const require = createRequire("/Users/vousyetes/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const [animal, out, secs = "4", click] = process.argv.slice(2);
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
const p = await b.newPage({ viewport: { width: 540, height: 960 } });
await p.goto(`http://localhost:5199/?animal=${animal}`);
await p.waitForTimeout(Number(secs) * 1000);
if (click) { await p.mouse.click(270, 420); await p.waitForTimeout(700); }
await p.screenshot({ path: out });
await b.close();
