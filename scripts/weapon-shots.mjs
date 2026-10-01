// Screenshots of the first-person weapon in the game (the plaza's light, post FX):
// idle at the hip, aiming down the red dot, mid-reload, sprinting, firing (dust cover open,
// casings in the air), the launcher at the hip and aimed.
//   npm run dev   (in another terminal)
//   npm run weapon-shots -- [outDir] [name filter]
// The weapon on its own (any pose, outside cameras): http://localhost:5173/dev/viewmodel.html
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'screenshots/weapons';
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
mkdirSync(out, { recursive: true });

// `at`: where the player stands, `look`: a point to look at. `set` runs in the page each
// frame before the shot (weapon state), `frames`: game frames (60 a second) to run first.
const SHOTS = [
  { name: 'rifle-hip', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 60 },
  { name: 'rifle-ads', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 60, aim: true },
  { name: 'rifle-ads-shade', at: [-6, 0, -12], look: [-1, 1.7, -16], frames: 60, aim: true },
  { name: 'rifle-hip-shade', at: [-6, 0, -12], look: [-1, 1.7, -16], frames: 60 },
  { name: 'rifle-firing', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 40, fire: 7 },
  { name: 'rifle-reload-out', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 30, reload: 0.4 },
  { name: 'rifle-reload-in', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 30, reload: 1.12 },
  { name: 'rifle-sprint', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 40, sprint: true },
  { name: 'rifle-casings', at: [-30, 0, 2], look: [-29.2, 0.0, 1.3], frames: 120, fire: 12, fireLook: [-2, 1.6, -4] },
  { name: 'launcher-hip', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 80, launcher: true },
  { name: 'launcher-ads', at: [-30, 0, 2], look: [-2, 1.6, -4], frames: 80, launcher: true, aim: true },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
await page.addInitScript(() => localStorage.setItem('kotelgame.settings', JSON.stringify({ quality: 'medium' })));
await page.goto(process.env.GAME_URL ?? 'http://localhost:5173/', { waitUntil: 'domcontentloaded' });
await page.waitForFunction(() => window.__game?.characters?.ready && window.__game.viewmodel.models, null, { timeout: 240000, polling: 1000 });

for (const s of SHOTS) {
  if (only && !only.test(s.name)) continue;
  await page.evaluate((s) => {
    const g = window.__game;
    g.setActive(true);
    g.input.locked = true;
    g.fixedFrame = 1 / 60;
    if (!window.__frames) {
      window.__frames = 1;
      const tick = () => {
        window.__frames++;
        requestAnimationFrame(tick);
      };
      requestAnimationFrame(tick);
    }
    const st = g.story;
    // Combat time (the weapon ready), no one shooting at us.
    st.jumpTo(st.mission.indexOf('defense_orders'));
    g.health.damage = () => {};
    g.rifle.mode = 'ready';
    for (const el of document.querySelectorAll('.hud, .story-hud, .debug, .hitmarker')) el.style.display = 'none';
    const p = g.player;
    p.spawnPoint.set(s.at[0], s.at[1] + 0.05, s.at[2]);
    p.respawn();
    const look = s.fireLook ?? s.look;
    const eyeY = p.position.y + 1.62;
    const dx = look[0] - s.at[0];
    const dz = look[2] - s.at[2];
    g.view.yaw = Math.atan2(-dx, -dz);
    g.view.pitch = Math.atan2(look[1] - eyeY, Math.hypot(dx, dz));
    g.view.snap();
    if (s.launcher) {
      g.launcher.give(3);
      g._setWeapon('launcher');
    } else g._setWeapon('rifle');
    g.casings.clear();
    g.viewmodel.reset();
    const held = g.input.held ?? g.input.keys;
    window.__hold = (code, on) => {
      if (g.input.held) on ? g.input.held.add(code) : g.input.held.delete(code);
    };
    window.__hold('Mouse2', !!s.aim);
    window.__hold('Mouse0', false);
    void held;
    window.__shotSpec = s;
  }, s);
  // Fire a burst (casings) or start a reload, in game time.
  await page.setViewportSize({ width: 320, height: 180 });
  if (s.fire) {
    await page.evaluate(() => window.__hold('Mouse0', true));
    const f0 = await page.evaluate(() => window.__frames);
    await page.waitForFunction((n) => window.__frames >= n, f0 + Math.round((s.fire / 11) * 60), { timeout: 600000, polling: 100 });
    await page.evaluate(() => window.__hold('Mouse0', false));
    if (s.fireLook) {
      // Look down at the casings on the ground.
      await page.evaluate((s) => {
        const g = window.__game;
        const p = g.player;
        const dx = s.look[0] - s.at[0];
        const dz = s.look[2] - s.at[2];
        g.view.yaw = Math.atan2(-dx, -dz);
        g.view.pitch = Math.atan2(s.look[1] - (p.position.y + 1.62), Math.hypot(dx, dz));
      }, s);
    }
  }
  if (s.reload != null) {
    await page.evaluate(() => {
      const g = window.__game;
      g.rifle.state.ammo = 12;
      g.rifle.state._startReload();
    });
  }
  if (s.sprint) {
    await page.evaluate(() => {
      const g = window.__game;
      g.input.held.add('KeyW');
      g.input.held.add('ShiftLeft');
    });
  }
  const start = await page.evaluate(() => window.__frames);
  const frames = s.reload != null ? Math.round(s.reload * 60) : s.frames;
  await page.waitForFunction((n) => window.__frames >= n, start + frames, { timeout: 600000, polling: 50 });
  // Freeze time for the full-size frame (SwiftShader takes a second or more per frame).
  await page.evaluate(() => (window.__game.fixedFrame = 0));
  await page.setViewportSize({ width: 1280, height: 720 });
  const drawn = await page.evaluate(() => window.__frames);
  await page.waitForFunction((n) => window.__frames >= n, drawn + 3, { timeout: 120000, polling: 100 });
  await page.screenshot({ path: `${out}/${s.name}.png` });
  await page.evaluate(() => {
    const g = window.__game;
    g.fixedFrame = 1 / 60;
    for (const c of ['KeyW', 'ShiftLeft', 'Mouse0', 'Mouse2']) g.input.held?.delete(c);
  });
  console.log('shot', s.name);
}
await browser.close();
