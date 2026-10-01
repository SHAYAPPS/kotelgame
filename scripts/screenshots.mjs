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

// The machine's GPU (WebGPU; the game falls back to WebGL 2 without it, WEBGL=1 forces it);
// SOFTWARE=1: SwiftShader (machines without a usable GPU: slow).
const gpuArgs = process.env.SOFTWARE ? ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] : ['--enable-gpu', '--use-angle=metal', '--ignore-gpu-blocklist'];
const browser = await chromium.launch({ args: ['--enable-unsafe-webgpu', ...gpuArgs] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log(`[pageerror] ${e.stack ?? e.message}`));
page.on('console', (m) => { if (m.type() === 'error' || m.type() === 'warning') console.log(`[${m.type()}] ${m.text()}`); });
// EFFECTS='{"ssr":false}': effect switches over the preset (core/Graphics.js); ONLY=1,3: those spots.
const effects = process.env.EFFECTS ? JSON.parse(process.env.EFFECTS) : {};
await page.addInitScript(([q, e]) => localStorage.setItem('kotelgame.settings', JSON.stringify({ quality: q, effects: e })), [quality, effects]);
const query = [process.env.WEBGL ? 'webgl' : null, process.env.NODETRACE ? 'nodetrace' : null].filter(Boolean).join('&');
await page.goto(`${process.env.GAME_URL ?? 'http://localhost:5173/'}${query ? `?${query}` : ''}`);
// The world is built (Game.init: the loading screen still shows; setActive(true) plays at once).
await page.waitForFunction(() => window.__game?.input, null, { timeout: 120000, polling: 500 });
await page.evaluate((step) => {
  const g = window.__game;
  g.setActive(true);
  g.input.locked = true;
  const s = g.story;
  // The plaza filling up for the midnight Selichot (STEP=<mission step id> picks another moment).
  s.jumpTo(Math.max(0, s.mission.indexOf(step)));
  for (const el of document.querySelectorAll('.hud, .story-hud, .debug')) el.style.display = 'none';
  g.viewmodel.scene.visible = false;
}, process.env.STEP ?? 'radio_call');
// Wait for the textures and the HDRI.
await page.waitForFunction(async () => {
  const g = window.__game;
  const sets = await Promise.all([...g.textures.sets.values()]);
  return sets.length > 0 && sets.every(Boolean) && !!g.scene.environment;
}, null, { timeout: 120000, polling: 1000 });
const only = process.env.ONLY ? process.env.ONLY.split(',').map(Number) : null;
for (const s of SPOTS.filter((_, i) => !only || only.includes(i + 1))) {
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
  // The crowd fades in around a new spot: settle it (headless frames are slow, game time crawls).
  await page.evaluate(() => {
    const g = window.__game;
    for (let i = 0; i < 24; i++) g.story.crowd?.update(0.5, g.player.position, g.camera);
  });
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${s.name}.png`, timeout: 240000 });
  const ex = await page.evaluate(() => ({ exposure: +window.__game.post.u.exposure.value.toFixed(3), avg: +(window.__game.post.avgLuminance ?? 0).toFixed(4), scale: window.__game.post.resolutionScale }));
  console.log('shot', s.name, JSON.stringify(ex));
}
console.log('draw calls', await page.evaluate(() => window.__game.renderer.info.render.drawCalls), 'backend', await page.evaluate(() => (window.__game.renderer.backend.isWebGPUBackend ? 'WebGPU' : 'WebGL 2')));
await browser.close();
