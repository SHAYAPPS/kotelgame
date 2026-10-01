import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { Vector3 } from 'three';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { decodeClips } from '../src/characters/animLibrary.js';
import { pickDeath, DEATH_CLIPS } from '../src/characters/deaths.js';
import { directionBlend } from '../src/characters/SoldierAnimator.js';
import { Enemy, modelHitTest } from '../src/ai/Enemy.js';
import { ENEMY } from '../src/ai/config.js';
import { NavGrid } from '../src/ai/NavGrid.js';
import { CoverPoints } from '../src/ai/CoverPoints.js';
import { makeWorld } from './helpers.js';

const DIR = new URL('../public/assets/characters/', import.meta.url);
const manifest = existsSync(new URL('manifest.json', DIR)) ? JSON.parse(readFileSync(new URL('manifest.json', DIR), 'utf8')) : null;

test('the clip library decodes: every clip, unit quaternions, closed locomotion loops, IK targets on rifle clips', { skip: !manifest && 'no character assets' }, async () => {
  await MeshoptDecoder.ready;
  const buf = readFileSync(new URL(manifest.anims.file, DIR));
  const clips = decodeClips(manifest.anims, buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), MeshoptDecoder);
  assert.equal(clips.size, Object.keys(manifest.anims.clips).length);
  for (const [name, clip] of clips) {
    const meta = manifest.anims.clips[name];
    for (const t of clip.tracks) {
      if (!t.name.endsWith('.quaternion')) continue;
      for (let i = 0; i < t.values.length; i += 4) {
        const n = Math.hypot(t.values[i], t.values[i + 1], t.values[i + 2], t.values[i + 3]);
        assert.ok(Math.abs(n - 1) < 1e-3, `${name} ${t.name} not unit`);
      }
    }
    assert.equal(clip.tracks.some((t) => t.name === 'ikHandR.position'), !!meta.ik, `${name} IK tracks`);
    if (meta.speed !== undefined) {
      if (meta.rise !== undefined) {
        // Stairs: a slower climb, the rise taken out too, feet contacts marked.
        assert.ok(meta.speed > 0.25 && Math.abs(meta.rise) > 0.2, `${name} climbs`);
        assert.ok(meta.contacts?.l && meta.contacts?.r, `${name} foot contacts`);
      } else assert.ok(meta.speed > (name.startsWith('old_') ? 0.3 : 0.5), `${name} moves`); // (an old man's shuffle is slow)
      // In place: the hips end where they started (root motion removed), so the cycle loops.
      const hips = clip.tracks.find((t) => t.name === 'Hips.position').values;
      const n = hips.length - 3;
      assert.ok(Math.hypot(hips[n] - hips[0], hips[n + 1] - hips[1], hips[n + 2] - hips[2]) < 0.02, `${name} loops in place`);
    }
  }
  // The 8 directions of each rifle gait are all there.
  for (const gait of ['rifle_walk', 'rifle_run', 'rifle_crouchwalk']) for (const d of ['f', 'fl', 'l', 'bl', 'b', 'br', 'r', 'fr']) assert.ok(clips.has(`${gait}_${d}`), `${gait}_${d}`);
  for (const d of DEATH_CLIPS) assert.ok(manifest.anims.clips[d].rootEnd, `${d} has its fall direction`);
});

test('8-way blend picks the two neighboring directions', () => {
  const w = (dir) => Object.fromEntries(directionBlend(dir).filter(([, v]) => v > 1e-6));
  assert.deepEqual(w(0), { f: 1 });
  const half = w(Math.PI / 8);
  assert.ok(Math.abs(half.f - 0.5) < 1e-9 && Math.abs(half.fl - 0.5) < 1e-9);
  assert.deepEqual(w(Math.PI / 2), { l: 1 });
  assert.deepEqual(w(-Math.PI / 2), { r: 1 });
  assert.deepEqual(w(Math.PI), { b: 1 });
  assert.deepEqual(w(-Math.PI), { b: 1 });
  assert.ok(Math.abs(w(-Math.PI / 8).fr - 0.5) < 1e-9);
});

// Fall directions in model space (x: the body's left, z: its front), like the manifest.
const META = {
  death_front: { rootEnd: [0.26, 1.02] },
  death_back: { rootEnd: [0.25, 1.1] },
  death_left: { rootEnd: [-0.85, -0.1] },
  death_right: { rootEnd: [0.85, -0.1] },
  death_headshot_front: { rootEnd: [-0.29, -0.25] },
  death_headshot_back: { rootEnd: [-0.06, 0.95] },
  death_crouch_headshot: { rootEnd: [-0.13, 0.93] },
};
const still = () => 0.5;

test('deaths fall away from the shot', () => {
  // Facing -Z (yaw 0): shot from in front travels +Z; the body falls back (+Z world).
  const back = pickDeath({ facing: 0, dir: { x: 0, z: 1 }, zone: 'head', meta: META, rand: still });
  assert.equal(back, 'death_headshot_front');
  // Shot from behind (bullet travels -Z, same way he faces): falls forward.
  const fwd = pickDeath({ facing: 0, dir: { x: 0, z: -1 }, zone: 'body', meta: META, rand: still });
  assert.ok(['death_front', 'death_back'].includes(fwd), fwd);
  assert.equal(pickDeath({ facing: 0, dir: { x: 0, z: -1 }, zone: 'head', meta: META, rand: still }), 'death_headshot_back');
  // Shot from his right (the bullet travels toward his left, -X at yaw 0): falls to his left.
  assert.equal(pickDeath({ facing: 0, dir: { x: -1, z: 0 }, zone: 'body', meta: META, rand: still }), 'death_right');
  assert.equal(pickDeath({ facing: 0, dir: { x: 1, z: 0 }, zone: 'body', meta: META, rand: still }), 'death_left');
  // Crouched: the crouching death.
  assert.equal(pickDeath({ facing: 0, dir: { x: 0, z: -1 }, zone: 'body', crouched: true, meta: META, rand: still }), 'death_crouch_headshot');
  // Rotated body: facing +X (yaw -PI/2), shot from his right (bullet travels -Z... his left is -Z? no: +Z).
  const yaw = -Math.PI / 2; // forward (-sin, -cos) = (1, 0); left (-cos, sin) = (0, -1)
  assert.equal(pickDeath({ facing: yaw, dir: { x: 0, z: -1 }, zone: 'body', meta: META, rand: still }), 'death_right');
});

test('deaths avoid falling into a wall', () => {
  // Shot from behind would fall forward, but a wall is right in front (world -Z at yaw 0).
  const free = (d) => (d.z < -0.5 ? 0.2 : 5);
  const pick = pickDeath({ facing: 0, dir: { x: 0, z: -1 }, zone: 'body', meta: META, rand: still, free });
  assert.ok(!['death_front', 'death_back', 'death_headshot_back', 'death_crouch_headshot'].includes(pick), pick);
});

const shape = (yaw = 0) => ({ valid: true, yaw, head: new Vector3(0.1, 1.6, 0), a: new Vector3(0, 0.35, 0), b: new Vector3(0, 1.45, 0) });

test('model hit zones: head sphere and a body capsule that stops below the neck', () => {
  const at = new Vector3(10, 0, 5);
  const dir = new Vector3(0, 0, -1);
  const head = modelHitTest(shape(), at, 0.13, 0.3, new Vector3(10.1, 1.6, 10), dir, 50);
  assert.equal(head.zone, 'head');
  assert.ok(Math.abs(head.distance - (5 - 0.13)) < 1e-3);
  assert.equal(modelHitTest(shape(), at, 0.13, 0.3, new Vector3(10, 1.0, 10), dir, 50).zone, 'body');
  // Beside the head (0.2 m off the sphere center) misses both.
  assert.equal(modelHitTest(shape(), at, 0.13, 0.3, new Vector3(10.35, 1.62, 10), dir, 50), null);
  // The zones turn with the model: yaw PI puts the head offset on the other side.
  assert.equal(modelHitTest(shape(Math.PI), at, 0.13, 0.3, new Vector3(9.9, 1.6, 10), dir, 50).zone, 'head');
  assert.equal(modelHitTest(shape(Math.PI), at, 0.13, 0.3, new Vector3(10.2, 1.6, 10), dir, 50), null);
});

test('an enemy uses its model hit zones when the view provides them', () => {
  const world = makeWorld();
  const nav = new NavGrid(world, { minX: -10, maxX: 10, minZ: -10, maxZ: 10 }).build();
  const e = new Enemy({ world, nav, cover: new CoverPoints(world, nav).generate() }, new Vector3(0, 0, 0), 0);
  const dir = new Vector3(0, 0, -1);
  // Analytic zones: the head is at the body's center line.
  assert.equal(e.raycast(new Vector3(0, ENEMY.headHeight, 5), dir, 20).zone, 'head');
  // A model leaning to the side: the head moves 0.3 m left, the center line misses the head.
  e.hitShape = { valid: true, yaw: 0, head: new Vector3(0.3, 1.55, 0), a: new Vector3(0, 0.35, 0), b: new Vector3(0.1, 1.4, 0) };
  assert.equal(e.raycast(new Vector3(0.3, 1.55, 5), dir, 20).zone, 'head');
  const center = e.raycast(new Vector3(0, 1.62, 5), dir, 20);
  assert.ok(!center || center.zone !== 'head');
  // The other agents aim at the model's head too.
  e.asTarget.update();
  assert.ok(Math.abs(e.asTarget.head.x - 0.3) < 1e-6);
});
