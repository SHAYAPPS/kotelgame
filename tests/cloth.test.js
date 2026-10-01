// Loose clothes (src/characters/ClothSim.js): a skirt chain hangs still at rest, lags behind
// and settles after the body moves, makes way for a leg swinging into it, hangs down when the
// pelvis tilts, and goes back to its bind pose when switched off.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { Bone, Group, Quaternion, Skeleton, Vector3 } from 'three';
import { ClothSim } from '../src/characters/ClothSim.js';
import { CHARACTER } from '../src/characters/config.js';

const TUNING = CHARACTER.cloth;

/** Hips at 1 m, a left leg, and one skirt chain at the front (hip line -> knee line -> hem). */
function rig() {
  const body = new Group();
  const make = (name, parent, x, y, z) => {
    const b = new Bone();
    b.name = name;
    b.position.set(x, y, z);
    parent.add(b);
    return b;
  };
  const hips = make('Hips', body, 0, 1, 0);
  const upLeg = make('LeftUpLeg', hips, 0.09, -0.06, 0);
  const leg = make('LeftLeg', upLeg, 0, -0.44, 0);
  const foot = make('LeftFoot', leg, 0, -0.42, 0);
  // The chain hangs in front of the left thigh from just under the waistband (rest: straight
  // down, a little flare).
  const a = make('ClothSkirt0a', hips, 0.09, 0, 0.16);
  const b = make('ClothSkirt0b', a, 0, -0.42, 0.04);
  body.updateMatrixWorld(true);
  const bones = [hips, upLeg, leg, foot, a, b];
  const skeleton = new Skeleton(bones);
  skeleton.calculateInverses();
  const model = { body, skeleton, bones: new Map(bones.map((x) => [x.name, x])) };
  const info = {
    chains: [{ kind: 'skirt', bones: ['ClothSkirt0a', 'ClothSkirt0b'], tip: [0, -0.42, 0.04] }],
    colliders: [
      { a: 'LeftUpLeg', b: 'LeftLeg', r: 0.08 },
      { a: 'LeftLeg', b: 'LeftFoot', r: 0.06 },
    ],
  };
  const sim = new ClothSim(model, info, TUNING);
  const bind = [a.quaternion.clone(), b.quaternion.clone()];
  const step = (dt, mode = 2) => {
    body.updateMatrixWorld(true);
    sim.update(dt, mode);
    body.updateMatrixWorld(true);
  };
  const hemTip = () => new Vector3(0, -0.42, 0.04).applyMatrix4(b.matrixWorld);
  const knee = () => new Vector3().setFromMatrixPosition(b.matrixWorld);
  return { body, hips, upLeg, leg, foot, a, b, sim, bind, step, hemTip, knee };
}

const angle = (q1, q2) => q1.angleTo(q2);

test('at rest the skirt hangs still in its bind pose', () => {
  const r = rig();
  for (let i = 0; i < 120; i++) r.step(1 / 60);
  assert.ok(angle(r.a.quaternion, r.bind[0]) < 1e-3, `upper bone ${angle(r.a.quaternion, r.bind[0])}`);
  assert.ok(angle(r.b.quaternion, r.bind[1]) < 1e-3, `lower bone ${angle(r.b.quaternion, r.bind[1])}`);
});

test('the hem lags behind a sudden move, overshoots a little and settles', () => {
  const r = rig();
  r.step(1 / 60);
  const rest = r.hemTip().sub(r.body.position);
  let lag = 0;
  // A quick sidestep: up to 1.6 m/s in 0.15 s, 0.25 s at that speed, stopping in 0.15 s.
  const speed = (t) => (t < 0.15 ? t / 0.15 : t < 0.4 ? 1 : Math.max(0, 1 - (t - 0.4) / 0.15)) * 1.6;
  for (let i = 0; i < 33; i++) {
    r.body.position.x += speed(i / 60) / 60;
    r.step(1 / 60);
    lag = Math.max(lag, rest.x + r.body.position.x - r.hemTip().x);
  }
  assert.ok(lag > 0.02, `the hem trails behind (${lag.toFixed(3)} m)`);
  let overshoot = 0;
  for (let i = 0; i < 60; i++) {
    r.step(1 / 60);
    overshoot = Math.max(overshoot, r.hemTip().x - (rest.x + r.body.position.x));
  }
  assert.ok(overshoot > 0.005 && overshoot < 0.15, `swings past and back (${overshoot.toFixed(3)} m)`);
  for (let i = 0; i < 240; i++) r.step(1 / 60);
  const off = r.hemTip().sub(r.body.position).distanceTo(rest);
  assert.ok(off < 0.01, `settled (${off.toFixed(4)} m off)`);
});

test('a thigh swinging forward pushes the skirt out of its way', () => {
  for (const mode of [2, 1]) {
    const r = rig();
    r.step(1 / 60, mode);
    // Knee up and forward (a stride / a step up): 60 degrees about the hip's X axis.
    const q = new Quaternion().setFromAxisAngle(new Vector3(1, 0, 0), -1.05);
    for (let i = 1; i <= 30; i++) {
      r.upLeg.quaternion.identity().slerp(q, i / 30);
      r.step(1 / 60, mode);
    }
    for (let i = 0; i < 30; i++) r.step(1 / 60, mode);
    // The skirt's knee point and its segments stay off the thigh.
    const hipJoint = new Vector3().setFromMatrixPosition(r.upLeg.matrixWorld);
    const kneeJoint = new Vector3().setFromMatrixPosition(r.leg.matrixWorld);
    const head = new Vector3().setFromMatrixPosition(r.a.matrixWorld);
    const mid = r.knee();
    let closest = Infinity;
    for (let s = 0.15; s <= 1; s += 0.05) {
      const p = head.clone().lerp(mid, s);
      const ab = kneeJoint.clone().sub(hipJoint);
      const t = Math.max(0, Math.min(1, p.clone().sub(hipJoint).dot(ab) / ab.lengthSq()));
      closest = Math.min(closest, p.distanceTo(hipJoint.clone().addScaledVector(ab, t)));
    }
    assert.ok(closest > 0.08 + TUNING.skirt.clearance - 0.012, `mode ${mode}: off the thigh (${closest.toFixed(3)} m)`);
    assert.ok(mid.z > 0.25, `mode ${mode}: the skirt's front lifts forward (${mid.z.toFixed(3)})`);
  }
});

test('the skirt hangs down when the pelvis tilts forward', () => {
  const r = rig();
  r.step(1 / 60);
  const restDir = r.knee().sub(new Vector3().setFromMatrixPosition(r.a.matrixWorld)).normalize();
  r.hips.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), 0.5); // ~29 degrees forward
  for (let i = 0; i < 180; i++) r.step(1 / 60);
  const dir = r.knee().sub(new Vector3().setFromMatrixPosition(r.a.matrixWorld)).normalize();
  const rigid = restDir.clone().applyAxisAngle(new Vector3(1, 0, 0), 0.5);
  assert.ok(dir.angleTo(restDir) < rigid.angleTo(restDir) * 0.35, `hangs: ${dir.angleTo(restDir).toFixed(3)} rad from upright vs ${rigid.angleTo(restDir).toFixed(3)} rigid`);
});

test('switched off, the cloth goes back to its bind pose; no NaN on odd time steps', () => {
  const r = rig();
  r.upLeg.quaternion.setFromAxisAngle(new Vector3(1, 0, 0), -1.2);
  for (const dt of [1 / 60, 0, 0.25, 1e-6, 1 / 30]) r.step(dt);
  for (const b of [r.a, r.b]) assert.ok([b.quaternion.x, b.quaternion.y, b.quaternion.z, b.quaternion.w].every(Number.isFinite));
  r.step(1 / 60, 0);
  assert.ok(angle(r.a.quaternion, r.bind[0]) < 1e-6 && angle(r.b.quaternion, r.bind[1]) < 1e-6);
  // A teleport doesn't fling the cloth.
  r.step(1 / 60);
  r.body.position.set(40, 0, -25);
  r.step(1 / 60);
  r.step(1 / 60);
  const rel = r.hemTip().sub(r.body.position);
  assert.ok(rel.length() < 1.2, `cloth came along (${rel.length().toFixed(2)} m)`);
});

test('a body facing any way: the skirt still hangs at rest', () => {
  for (const yaw of [Math.PI / 2, Math.PI, -2.3]) {
    const r = rig();
    r.body.rotation.y = yaw;
    r.body.position.set(12, 1.2, -7);
    for (let i = 0; i < 90; i++) r.step(1 / 60);
    assert.ok(angle(r.a.quaternion, r.bind[0]) < 1e-3, `yaw ${yaw.toFixed(2)}: upper bone ${angle(r.a.quaternion, r.bind[0]).toFixed(4)}`);
    assert.ok(angle(r.b.quaternion, r.bind[1]) < 1e-3, `yaw ${yaw.toFixed(2)}: lower bone ${angle(r.b.quaternion, r.bind[1]).toFixed(4)}`);
  }
});

test('walking at a low frame rate the skirt keeps up (long frames are not simulated in full)', () => {
  const trail = {};
  for (const fps of [60, 15, 8, 3]) {
    const r = rig();
    r.step(1 / fps);
    const rest = r.hemTip().sub(r.body.position);
    let worst = 0;
    for (let i = 0; i < 4 * fps; i++) {
      r.body.position.z -= 1.4 / fps; // walking forward (-Z) at 1.4 m/s
      r.step(1 / fps);
      if (i > fps) worst = Math.max(worst, r.hemTip().sub(r.body.position).distanceTo(rest));
    }
    trail[fps] = worst;
  }
  console.log('# hem trail by fps', JSON.stringify(Object.fromEntries(Object.entries(trail).map(([k, v]) => [k, +v.toFixed(3)]))));
  // Air drag trails it a little at any frame rate; a low frame rate adds little to that.
  for (const fps of [15, 8]) assert.ok(trail[fps] < trail[60] + 0.06, `${fps} fps: the hem trails ${trail[fps].toFixed(3)} m (60 fps: ${trail[60].toFixed(3)})`);
  assert.ok(trail[3] < 0.3, `3 fps (software rendering): still with the body (${trail[3].toFixed(3)} m)`);
  assert.ok(trail[60] < 0.15, `60 fps trail ${trail[60].toFixed(3)} m`);
});
