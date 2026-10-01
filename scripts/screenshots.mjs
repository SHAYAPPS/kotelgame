// Screenshots from 5 fixed camera spots around the plaza (for checking the look).
//   npm run dev   (in another terminal)
//   npm run screenshots -- [outDir] [low|medium|high]
// Needs Playwright (npm i -D playwright) with Chromium (headless renders with SwiftShader: slow, but fine for looks).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'screenshots';
const quality = process.argv[3] ?? 'medium';
mkdirSync(out, { recursive: true });
export const SPOTS = [
  { name: '1-plaza-to-wall', pos: [-46, 0, 4], yaw: -Math.PI / 2 - 0.1, pitch: 0.06 },
  { name: '2-wall-closeup', pos: [-3.2, 0, -6], yaw: -Math.PI / 2 + 0.55, pitch: 0.12 },
  { name: '3-upper-terrace', pos: [-96, 3, -12], yaw: -Math.PI / 2 - 0.05, pitch: -0.02 },
  { name: '4-south-checkpoint', pos: [-67.5, 1.2, 76], yaw: 0.25, pitch: 0.02 },
  { name: '5-wilsons-arch', pos: [-24, 0, -22], yaw: -Math.PI / 2 - 0.75, pitch: 0.08 },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`); });
await page.addInitScript((q) => localStorage.setItem('kotelgame.settings', JSON.stringify({ quality: q })), quality);
await page.goto('http://localhost:5173/');
// The world is built (Game.init: the loading screen still shows; setActive(true) plays at once).
await page.waitForFunction(() => window.__game?.input, null, { timeout: 120000, polling: 500 });
await page.evaluate(() => {
  const g = window.__game;
  g.setActive(true);
  g.input.locked = true;
  const s = g.story;
  s.jumpTo(s.mission.indexOf('patrol_wall'));
  for (const el of document.querySelectorAll('.hud, .story-hud, .debug')) el.style.display = 'none';
  g.viewmodel.scene.visible = false;
});
// Wait for the textures and the HDRI.
await page.waitForFunction(async () => {
  const g = window.__game;
  const sets = await Promise.all([...g.textures.sets.values()]);
  return sets.length > 0 && sets.every(Boolean) && !!g.scene.environment;
}, null, { timeout: 120000, polling: 1000 });
for (const s of SPOTS) {
  await page.evaluate((s) => {
    const g = window.__game;
    const [x, y, z] = s.pos;
    g.player.spawnPoint.set(x, y + 0.05, z);
    g.player.spawnYaw = s.yaw;
    g.player.respawn();
    g.view.yaw = s.yaw;
    g.view.pitch = s.pitch;
    g.view.snap();
  }, s);
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  console.log('shot', s.name);
}
console.log('draw calls', await page.evaluate(() => window.__game.renderer.info.render.calls));
await browser.close();
