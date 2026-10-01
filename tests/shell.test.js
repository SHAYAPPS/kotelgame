// The game shell's logic without a browser: settings (saved, checked, taken over from the old
// keys), key rebinding, the saved checkpoint, the menu camera, the credits roll from
// CREDITS.md and the difficulty levels.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_SETTINGS, LIMITS, SETTINGS_KEY, loadSettings, saveSettings } from '../src/core/Settings.js';
import { ACTIONS, Bindings, keyLabel } from '../src/core/Bindings.js';
import { MenuCamera } from '../src/core/MenuCamera.js';
import { SAVE_KEY, chapterOf, clearSave, readSave, writeSave } from '../src/story/SaveGame.js';
import { buildRoll, parseCredits, plain } from '../src/ui/menu/creditsRoll.js';
import { DIFFICULTY, LEVELS, attackerConfig, setDifficulty, truckConfig } from '../src/story/difficulty.js';
import { MISSION1 } from '../src/story/mission1.js';

/** localStorage's interface over a Map. */
function memory(entries = {}) {
  const m = new Map(Object.entries(entries));
  return {
    getItem: (k) => (m.has(k) ? m.get(k) : null),
    setItem: (k, v) => m.set(k, String(v)),
    removeItem: (k) => m.delete(k),
    map: m,
  };
}

test('settings: defaults, saved and loaded, bad values checked, the old keys taken over', () => {
  assert.deepEqual(loadSettings(null), DEFAULT_SETTINGS);
  const store = memory();
  const s = loadSettings(store);
  s.sensitivity = 1.7;
  s.invertY = true;
  s.fov = 82;
  s.volumes.music = 0.2;
  s.difficulty = 'hard';
  s.bindings = { jump: 'KeyF' };
  saveSettings(s, store);
  assert.deepEqual(loadSettings(store), s, 'round trip');
  // A hand-edited or broken save: clamped, unknown names back to the defaults.
  store.setItem(SETTINGS_KEY, JSON.stringify({ sensitivity: 99, fov: -5, quality: 'insane', difficulty: 'nightmare', volumes: { sfx: 3 }, subtitles: 'no', effects: { ssr: 'yes', motionBlur: 'max', bloom: false } }));
  const bad = loadSettings(store);
  assert.equal(bad.sensitivity, LIMITS.sensitivity[1]);
  assert.equal(bad.fov, LIMITS.fov[0]);
  assert.equal(bad.quality, DEFAULT_SETTINGS.quality);
  assert.equal(bad.difficulty, 'normal');
  assert.equal(bad.volumes.sfx, 1);
  assert.equal(bad.volumes.voice, DEFAULT_SETTINGS.volumes.voice);
  assert.equal(bad.subtitles, true);
  assert.deepEqual(bad.effects, { bloom: false }, 'effect switches: only valid ones kept');
  store.setItem(SETTINGS_KEY, '{not json');
  assert.deepEqual(loadSettings(store), DEFAULT_SETTINGS);
  // Before the settings object: separate keys.
  const old = memory({ 'kotelgame.sensitivity': '1.4', 'kotelgame.graphics': 'low', 'kotelgame.volume': JSON.stringify({ master: 0.5 }) });
  const migrated = loadSettings(old);
  assert.equal(migrated.sensitivity, 1.4);
  assert.equal(migrated.quality, 'low');
  assert.equal(migrated.volumes.master, 0.5);
  assert.equal(migrated.volumes.music, DEFAULT_SETTINGS.volumes.music);
});

test('key bindings: rebinding swaps, alternates step aside, reserved keys refused, saved and restored', () => {
  const b = new Bindings();
  for (const a of ACTIONS) assert.equal(b.key(a.id), a.key);
  assert.deepEqual(b.codes('forward'), ['KeyW', 'ArrowUp']);
  // Jump on E: interact (which had E) gets Space.
  assert.equal(b.set('jump', 'KeyE'), 'interact');
  assert.equal(b.key('jump'), 'KeyE');
  assert.equal(b.key('interact'), 'Space');
  // An action's key taking another's alternate: the alternate drops out.
  b.set('crouch', 'ArrowUp');
  assert.deepEqual(b.codes('forward'), ['KeyW']);
  assert.deepEqual(b.codes('crouch'), ['ArrowUp']);
  // Mouse buttons bind; Esc and the dev keys don't.
  b.set('grenade', 'Mouse3');
  assert.equal(b.key('grenade'), 'Mouse3');
  assert.equal(b.set('reload', 'Escape'), null);
  assert.equal(b.key('reload'), 'KeyR');
  // Only the changes are saved; a new Bindings from them is the same.
  const saved = b.changed();
  assert.deepEqual(Object.keys(saved).sort(), ['crouch', 'grenade', 'interact', 'jump']);
  const again = new Bindings(saved);
  for (const a of ACTIONS) assert.deepEqual(again.codes(a.id), b.codes(a.id), a.id);
  // Never two actions on one key, even from a broken save.
  const broken = new Bindings({ forward: 'KeyS', back: 'KeyS', fire: 'Escape' });
  const keys = ACTIONS.map((a) => broken.key(a.id));
  assert.equal(new Set(keys).size, keys.length);
  assert.equal(broken.key('fire'), 'Mouse0');
  b.reset();
  assert.deepEqual(b.changed(), {});
  assert.equal(keyLabel('KeyW'), 'W');
  assert.equal(keyLabel('Digit2'), '2');
  assert.equal(keyLabel('Mouse0'), 'לחיצה שמאלית');
  assert.equal(keyLabel('Space'), 'רווח');
});

test('the saved checkpoint: written, read back, cleared, and named by its chapter', () => {
  const store = memory();
  assert.equal(readSave(store), null);
  const step = MISSION1.chapters[2].step;
  writeSave({ mission: 'mission1', step, difficulty: 'hard', stats: { time: 125.5, shots: 40, hits: 22, kills: 6, headshots: 2 } }, store, 1000);
  const s = readSave(store);
  assert.equal(s.step, step);
  assert.equal(s.difficulty, 'hard');
  assert.equal(s.stats.kills, 6);
  assert.equal(s.savedAt, 1000);
  assert.equal(chapterOf(MISSION1, step).label, MISSION1.chapters[2].label);
  // A step inside a chapter belongs to it.
  const i = MISSION1.steps.findIndex((x) => x.id === step);
  assert.equal(chapterOf(MISSION1, MISSION1.steps[i + 1].id).label, MISSION1.chapters[2].label);
  assert.equal(chapterOf(MISSION1, 'no such step'), null);
  clearSave(store);
  assert.equal(readSave(store), null);
  store.setItem(SAVE_KEY, JSON.stringify({ version: 99, mission: 'mission1', step }));
  assert.equal(readSave(store), null, 'another version is ignored');
});

test('the menu camera drifts along each shot, through black between them, round and round', () => {
  const cam = new MenuCamera([
    { from: [0, 2, 0], to: [10, 2, 0], look: [0, 0, -10], time: 10 },
    { from: [0, 5, 0], to: [0, 5, 10], look: [5, 0, 0], lookTo: [5, 0, 10], time: 8 },
  ]);
  cam.reset();
  assert.equal(cam.fade, 1, 'starts from black');
  cam.update(5);
  assert.ok(cam.position[0] > 3 && cam.position[0] < 7, `halfway (${cam.position[0]})`);
  assert.equal(cam.fade, 0, 'clear in the middle');
  cam.update(4.9);
  assert.ok(cam.fade > 0.8, 'fading out at the end');
  cam.update(0.2);
  assert.equal(cam.index, 1, 'next shot');
  assert.ok(cam.position[1] === 5 && cam.position[2] < 0.5);
  cam.update(8);
  assert.equal(cam.index, 0, 'back to the first');
});

test('the credits roll is built from CREDITS.md: every source with its author and license', () => {
  assert.equal(plain('[M4A1 Assault Rifle](https://x.y/z) by nisu'), 'M4A1 Assault Rifle by nisu');
  assert.equal(plain('Made by `scripts/a.mjs`'), 'Made by');
  const md = readFileSync(new URL('../public/assets/CREDITS.md', import.meta.url), 'utf8');
  const roll = buildRoll(parseCredits(md));
  const all = roll.flatMap((s) => s.entries);
  const find = (t) => all.find((e) => e.title === t);
  assert.equal(find('Mitsubishi L200')?.by, 'Muhammad Reyhan');
  assert.match(find('Mitsubishi L200')?.license, /CC-BY 3.0/);
  assert.ok(all.some((e) => /Kevin MacLeod/.test(e.by)), 'the music');
  assert.ok(roll.some((s) => s.notices.some((n) => /Creative Commons/.test(n))), 'the CC-BY notice word for word');
  assert.ok(roll.some((s) => s.entries.some((e) => e.title === 'Mixamo (Adobe)')), 'the characters');
  // Every CC-BY work in the file is on the roll.
  const ccby = [...md.matchAll(/\| \[([^\]]+)\]\([^)]*\) by ([^|]+) \| \[CC-BY/g)].map((m) => m[1]);
  assert.ok(ccby.length >= 4);
  for (const t of ccby) assert.ok(find(t), `CC-BY work "${t}" credited`);
});

test('difficulty levels scale the attackers and the truck around normal', () => {
  const d = { ...DIFFICULTY };
  const normal = attackerConfig('rifleman', d);
  setDifficulty('easy', d);
  const easy = attackerConfig('rifleman', d);
  setDifficulty('hard', d);
  const hard = attackerConfig('rifleman', d);
  assert.ok(easy.maxSpread > normal.maxSpread && hard.maxSpread < normal.maxSpread, 'aim');
  assert.ok(easy.damage < normal.damage && hard.damage > normal.damage, 'damage');
  assert.ok(easy.reactionTime > normal.reactionTime && hard.reactionTime < normal.reactionTime, 'reaction');
  assert.ok(easy.grenades.campChance < hard.grenades.campChance, 'grenades');
  assert.ok(truckConfig(d).gun.damage > DIFFICULTY.truck.gun.damage, 'the truck on hard');
  setDifficulty('nonsense', d);
  assert.equal(d.level, 'hard', 'unknown levels are ignored');
  assert.deepEqual(Object.keys(LEVELS), ['easy', 'normal', 'hard']);
  assert.equal(DIFFICULTY.level, 'normal', 'the shared config untouched');
  assert.equal(attackerConfig('rifleman').damage, normal.damage);
});
