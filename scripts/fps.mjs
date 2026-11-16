// Mesure les images par seconde : node scripts/fps.mjs [animal ...]  (serveur sur 5199, CHROME=...)
import { createRequire } from "node:module";
const require = createRequire("/Users/vousyetes/.npm/_npx/9833c18b2d85bc59/node_modules/");
const { chromium } = require("playwright");
const list = process.argv.slice(2);
const animals = list.length ? list : ["rhino", "elephant", "seahorse", "snail", "owl"];
const b = await chromium.launch({ executablePath: process.env.CHROME || undefined });
for (const a of animals) {
  const p = await b.newPage({ viewport: { width: 1440, height: 810 } });
  await p.goto(`http://localhost:5199/?animal=${a}`);
  await p.waitForTimeout(1500);
  const fps = await p.evaluate(
    () =>
      new Promise((res) => {
        let n = 0;
        const t0 = performance.now();
        const loop = () => {
          n++;
          if (performance.now() - t0 < 3000) requestAnimationFrame(loop);
          else res(Math.round((n * 1000) / (performance.now() - t0)));
        };
        requestAnimationFrame(loop);
      }),
  );
  console.log(a.padEnd(12), fps, "fps");
  await p.close();
}
await b.close();
