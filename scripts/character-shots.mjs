// Screenshots of the characters in the dev preview (dev/characters.html): each role from a
// few angles and in a few clips, for checking the models without playing.
//   npm run dev   (in another terminal)
//   npm run character-shots -- [outDir] [name filter, e.g. squad]
// Needs Playwright (npm i -D playwright) with Chromium (headless renders with SwiftShader).
import { mkdirSync } from 'node:fs';
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'screenshots/characters';
const only = process.argv[3] ? new RegExp(process.argv[3]) : null;
mkdirSync(out, { recursive: true });

export const SHOTS = [
  { name: 'squad-front', q: 'role=squad&cam=front' },
  { name: 'squad-side', q: 'role=squad&cam=side' },
  { name: 'squad-back', q: 'role=squad&cam=back' },
  { name: 'squad-walk', q: 'role=squad&cam=side&clip=rifle_walk_f&t=0.3' },
  { name: 'enemies-front', q: 'role=enemy&cam=front' },
  { name: 'enemies-side', q: 'role=enemy&cam=side' },
  { name: 'enemies-run', q: 'role=enemy&cam=side&clip=rifle_run_f&t=0.2' },
  { name: 'friend-vs-foe', q: 'ids=squad_swat,enemy_david,squad_steve,enemy_alex,squad_swatguy,enemy_ninja&cam=front' },
  { name: 'friend-vs-foe-far', q: 'ids=squad_swat,enemy_david,squad_steve,enemy_alex,squad_swatguy,enemy_ninja&cam=far' },
  { name: 'civilians-front', q: 'role=civilian&cam=front' },
  { name: 'civilians-walk', q: 'role=civilian&cam=side&clip=walk_male&t=0.4' },
  { name: 'worshippers-pray', q: 'role=civilian&cam=front&clip=praying_swaying&t=1.2&outfit=worshipper' },
  { name: 'deaths', q: 'ids=enemy_david,enemy_alex,enemy_ninja,enemy_david&cam=side&deaths=1&t=3.3' },
  { name: 'close-squad', q: 'ids=squad_swat&cam=close' },
  { name: 'close-enemy', q: 'ids=enemy_david&cam=close' },
];

// In the game: mission steps with the camera placed by hand. `at` puts the camera; `look` is
// a point to look at; `run` (optional) sets the scene up first (runs in the page).
export const GAME_SHOTS = [
  { name: 'game-1-prayer', step: 'patrol_wall', at: [-4.6, 0, -1.5], look: [-1.5, 1.3, -9], wait: 2500 },
  { name: 'game-2-prayer-side', step: 'patrol_wall', at: [-8.5, 0, 16], look: [-1.5, 1.2, 8], wait: 1500 },
  { name: 'game-3-squad-patrol', step: 'patrol_wall', follow: 'cmd', offset: [-3.5, 0, -3], wait: 1500 },
  { name: 'game-4-sirens-panic', step: 'sirens', at: [-46, 0, 10], look: [-30, 1.2, -6], wait: 6000 },
  { name: 'game-5-shelter', step: 'defense_orders', at: [-2.5, 0, -30.5], look: [-8, 1.0, -38], wait: 2500 },
  { name: 'game-6-combat-line', step: 'wave1', at: [-25.3, 0, -1.2], look: [-60, 1.4, 0], wait: 9000, god: true },
  { name: 'game-7-enemies-close', step: 'defense_orders', at: [-40, 0, 4], look: [-49, 1.3, 2], wait: 2500, god: true,
    run: 'const g = window.__game; const V = g.player.position.constructor; for (const [x, z] of [[-49, -1], [-49.5, 2.5], [-50.5, 5.5]]) g.enemies.spawnAttacker(new V(x, 0, z), -Math.PI / 2, g.player.position.clone());' },
  // Talking: the commander mid-briefing up close (he looks at the player), the tour guide
  // talking to her group (they turn to her). `front`: the camera in front of an NPC; `until`:
  // wait for this (page expression) before the shot.
  { name: 'game-9-cmd-talking', step: 'briefing', front: { npc: 'cmd', dist: 0.72, look: 1.6 }, wait: 300, until: "mouth('cmd') > 0.36" },
  { name: 'game-10-guide-talking', step: 'patrol_terraces_guide', front: { npc: 'guide', dist: 1.6, side: -0.8, look: 1.5 }, wait: 300, until: "mouth('guide') > 0.5" },
  // Stairs (the second terrace, x -78 .. -82.2): a soldier and a civilian walking up, then
  // down, seen from beside the flight at step level (feet on the steps).
  { name: 'game-11-stairs-up', step: 'patrol_wall', at: [-80.4, 2.3, 10.2], look: [-80.4, 2.4, 4.6], wait: 300, untilTimeout: 300000,
    run: "const st = window.__game.story; const a = st.npcs.spawn({ kind: 'soldier', at: [-73.5, 1.2, 4], yaw: Math.PI / 2 }); a.setRoute({ points: [[-73.5, 4], [-88, 4]], speed: 1.35 }); const b = st.npcs.spawn({ kind: 'civilian', at: [-75.6, 1.2, 5.3], yaw: Math.PI / 2 }); b.setRoute({ points: [[-75.6, 5.3], [-88, 5.3]], speed: 1.3 }); window.__walker = a;",
    until: 'window.__walker.position.x < -80.1' },
  { name: 'game-12-stairs-down', step: 'patrol_wall', at: [-80.4, 2.3, 10.2], look: [-80.4, 2.4, 4.6], wait: 300, untilTimeout: 300000,
    run: "const st = window.__game.story; const a = st.npcs.spawn({ kind: 'soldier', at: [-86.5, 3, 4], yaw: -Math.PI / 2 }); a.setRoute({ points: [[-86.5, 4], [-72, 4]], speed: 1.35 }); const b = st.npcs.spawn({ kind: 'worshipperWoman', at: [-84.5, 3, 5.3], yaw: -Math.PI / 2 }); b.setRoute({ points: [[-84.5, 5.3], [-72, 5.3]], speed: 1.2 }); window.__walker = a;",
    until: 'window.__walker.position.x > -80.7' },
  { name: 'game-8-bodies', step: 'defense_orders', at: [-41, 0, 4], look: [-49, 0.2, 3], wait: 3000, god: true,
    // Kill four enemies from different sides, then play their falls through (SwiftShader runs
    // too slowly for game time to get there on its own).
    run: 'const g = window.__game; const V = g.player.position.constructor; const es = [[-49, -1], [-49.5, 2.5], [-50.5, 5.5], [-48, 6.5]].map(([x, z]) => g.enemies.spawn(new V(x, 0, z), -Math.PI / 2)); es.forEach((e, i) => { for (let k = 0; k < 4 && e.alive; k++) g.enemies.hit({ enemy: e, zone: i % 2 ? "head" : "body" }, new V(Math.cos(i * 1.7), 0, Math.sin(i * 1.7)), g._playerInfo); const v = g.enemies.list.find((x) => x.enemy === e).view; for (let k = 0; k < 80; k++) v.update(0.1); });' },
];

const browser = await chromium.launch({ args: ['--use-angle=swiftshader', '--enable-unsafe-swiftshader'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
// Software rendering (SwiftShader) of the whole plaza is slow: generous timeouts.
page.setDefaultTimeout(240000);
page.on('pageerror', (e) => console.log(`[pageerror] ${e.message}`));
for (const s of SHOTS) {
  if (only && !only.test(s.name)) continue;
  await page.goto(`http://localhost:5173/dev/characters.html?${s.q}`);
  await page.waitForFunction(() => window.__preview?.ready, null, { timeout: 120000 });
  // Let textures upload and a few frames render.
  await page.waitForTimeout(2500);
  await page.screenshot({ path: `${out}/${s.name}.png` });
  console.log('shot', s.name);
}

const game = GAME_SHOTS.filter((s) => !only || only.test(s.name));
if (game.length) {
  await page.addInitScript(() => localStorage.setItem('kotelgame.graphics', 'medium'));
  await page.goto('http://localhost:5173/', { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => window.__game?.characters?.ready, null, { timeout: 240000, polling: 1000 });
  for (const s of game) {
    await page.evaluate((s) => {
      const g = window.__game;
      g.setActive(true);
      g.input.locked = true;
      const st = g.story;
      st.jumpTo(st.mission.indexOf(s.step));
      if (s.god) g.health.damage = () => {};
      for (const el of document.querySelectorAll('.hud, .story-hud, .debug, .hitmarker')) el.style.display = 'none';
      g.viewmodel.root.visible = false;
      window.__shot = s;
    }, s);
    if (s.run) await page.evaluate(s.run);
    // Place the camera (the player) after the scene has settled a little.
    await page.waitForTimeout(500);
    await page.evaluate((s) => {
      const g = window.__game;
      const p = g.player;
      let at = s.at;
      let look = s.look;
      if (s.front) {
        // In front of an NPC (its facing), looking at its face.
        const n = g.story.npcs.get(s.front.npc);
        const f = n.facing;
        const d = s.front.dist;
        const side = s.front.side ?? 0;
        at = [n.position.x - Math.sin(f) * d + Math.cos(f) * side, n.position.y, n.position.z - Math.cos(f) * d - Math.sin(f) * side];
        look = [n.position.x, n.position.y + s.front.look, n.position.z];
      }
      if (s.follow) {
        const n = g.story.npcs.get(s.follow).position;
        at = [n.x + s.offset[0], n.y, n.z + s.offset[2]];
        look = [n.x, n.y + 1.2, n.z];
      }
      p.spawnPoint.set(at[0], at[1] + 0.05, at[2]);
      p.respawn();
      const eyeY = p.position.y + 1.62;
      const dx = look[0] - at[0];
      const dz = look[2] - at[2];
      g.view.yaw = Math.atan2(-dx, -dz);
      g.view.pitch = Math.atan2(look[1] - eyeY, Math.hypot(dx, dz));
      g.view.snap();
    }, s);
    await page.waitForTimeout(s.wait ?? 2000);
    if (s.until) {
      await page.evaluate(() => {
        window.mouth = (id) => {
          const st = window.__game.story;
          const v = st.views.get(st.npcs.get(id));
          return v?.model?.face.mouth ?? 0;
        };
      });
      await page.waitForFunction(s.until, null, { timeout: s.untilTimeout ?? 60000, polling: 50 }).catch(() => console.warn(`${s.name}: gave up waiting for ${s.until}`));
      // Hold every mouth (and the eyes open) where it is: SwiftShader draws a frame in about
      // a second, the lips move faster than that.
      if (s.until.includes('mouth(')) await page.evaluate(() => {
        for (const v of window.__game.story.views.values()) {
          if (!v.lip || !v.model) continue;
          const open = v.model.face.mouth;
          v.lip.update = () => open;
          v.model._blinkWait = 1e9;
          v.model._blinkT = -1;
        }
      });
      await page.waitForTimeout(s.until.includes('mouth(') ? 2500 : 0);
    }
    await page.screenshot({ path: `${out}/${s.name}.png` });
    const note = await page.evaluate(() => {
      // How many people are in view and what the nearest few are doing (for the log).
      const st = window.__game.story;
      const near = [...st.views.entries()].filter(([, v]) => v.model?.onScreen).sort((a, b) => a[1].model.distance - b[1].model.distance).slice(0, 3);
      return near.map(([n, v]) => `${v.model.type.id}:${[...v.model.slots.keys()][0] ?? '-'}`).join(', ');
    });
    console.log('shot', s.name, '|', note);
  }
}
await browser.close();
