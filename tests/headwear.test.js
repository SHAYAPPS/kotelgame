// Head wear fitted to a model's real head surface (headFit.js, attachments.js): on synthetic
// heads (an ellipsoid skull, hair as an outer shell, a cap's brim) instead of the GLBs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { fitCap, fitRing, topHeight } from '../src/characters/headFit.js';
import { headband, headbandFit, kippah, kippahFit, KIPPAH, vest, vestFit } from '../src/characters/attachments.js';

// The skull: an ellipsoid around (0, CY, CZ) in the Head bone's frame (meters).
const CY = 0.1;
const CZ = 0.02;
const R = { x: 0.075, y: 0.1, z: 0.095 };
const HEAD = { ring: { y: CY, cz: CZ, rx: R.x, rz: R.z }, topY: CY + R.y, eyeY: CY - 0.03 };

/** Points over an ellipsoid (scaled by s), ~3 mm apart; `keep(x, y, z)` filters. */
function ellipsoid(s = 1, keep = () => true) {
  const out = [];
  for (let i = 0; i <= 120; i++) {
    const th = (i / 120) * Math.PI;
    const ring = Math.max(1, Math.round(240 * Math.sin(th)));
    for (let j = 0; j < ring; j++) {
      const ph = (j / ring) * Math.PI * 2;
      const x = R.x * s * Math.sin(th) * Math.sin(ph);
      const y = CY + R.y * s * Math.cos(th);
      const z = CZ + R.z * s * Math.sin(th) * Math.cos(ph);
      if (keep(x, y, z)) out.push(x, y, z);
    }
  }
  return out;
}

/** How far a point is out on the skull ellipsoid (1 = on it). */
const rho = (x, y, z) => Math.hypot(x / R.x, (y - CY) / R.y, (z - CZ) / R.z);

test('a ring fit finds the head surface all around, fills gaps, and settles lower at the back', () => {
  const pts = new Float32Array(ellipsoid());
  const r = fitRing(pts, { y: CY, cz: CZ, n: 40, half: 0.006, q: 0.9 });
  assert.equal(r.length, 40);
  assert.ok(Math.abs(r[0] - R.z) < 0.003, `front ${r[0]}`);
  assert.ok(Math.abs(r[10] - R.x) < 0.003, `side ${r[10]}`);
  assert.ok(Math.abs(r[20] - R.z) < 0.003, `back ${r[20]}`);
  // A gap in the surface (an ear hole in the mesh): filled from the neighbors.
  const holed = new Float32Array(ellipsoid(1, (x, y, z) => Math.abs(Math.atan2(x, z - CZ) - Math.PI / 2) > 0.3));
  const h = fitRing(holed, { y: CY, cz: CZ, n: 40, half: 0.006, q: 0.9 });
  for (const v of h) assert.ok(v > 0.07 && v < 0.1, `filled ${v}`);
  // Tilted 4 cm lower at the back: the radius there is the ellipsoid's at that height.
  const t = fitRing(pts, { y: CY + 0.05, cz: CZ, tilt: 0.04, n: 40, half: 0.006, q: 0.9 });
  const at = (dy) => R.z * Math.sqrt(1 - (dy / R.y) ** 2);
  assert.ok(Math.abs(t[0] - at(0.05)) < 0.004, `front ${t[0]} vs ${at(0.05)}`);
  assert.ok(Math.abs(t[20] - at(0.01)) < 0.004, `back ${t[20]} vs ${at(0.01)}`);
});

test('fits take the outer surface: hair over the scalp, not the scalp', () => {
  // Scalp plus hair 1.5 cm out over the top half.
  const pts = new Float32Array([...ellipsoid(), ...ellipsoid(1.15, (x, y) => y > CY)]);
  const r = fitRing(pts, { y: CY + 0.04, cz: CZ, n: 40, half: 0.006, q: 0.9 });
  const scalp = R.z * Math.sqrt(1 - (0.04 / R.y) ** 2);
  assert.ok(r[0] > scalp + 0.008, `on the hair (${r[0]} vs scalp ${scalp})`);
  const top = topHeight(pts, { cz: CZ, r: 0.04, q: 0.97 });
  assert.ok(Math.abs(top - (CY + R.y * 1.15)) < 0.004, `top of the hair ${top}`);
  const cap = fitCap(pts, { center: [0, CY, CZ], axis: [0, 1, 0], maxAngle: 0.6, q: 0.95, qRim: 0.9 });
  assert.equal(cap.radii.length, 7 * 28);
  assert.ok(Math.abs(cap.radii[0] - R.y * 1.15) < 0.004, `crown ${cap.radii[0]}`);
});

test('a headband hugs the head along both edges and clears a cap brim', () => {
  const pts = new Float32Array(ellipsoid());
  const fit = headbandFit(HEAD, pts);
  assert.ok(Math.abs(fit.y - (CY + 0.006)) < 1e-6, 'on the forehead');
  const pos = headband(HEAD, 0x1f7a2e, fit).geometry.getAttribute('position');
  for (let i = 0; i < pos.count; i++) {
    const p = rho(pos.getX(i), pos.getY(i), pos.getZ(i));
    assert.ok(p > 0.985 && p < 1.08, `vertex ${i} on the head (${p.toFixed(3)})`);
  }
  // A cap: a brim sticking out 7 cm in front at the forehead ring.
  const brim = [];
  for (let x = -0.08; x <= 0.08; x += 0.004) {
    for (let z = CZ + 0.06; z <= CZ + 0.17; z += 0.004) brim.push(x, CY + 0.002, z);
  }
  const capped = headbandFit(HEAD, new Float32Array([...ellipsoid(), ...brim]));
  assert.ok(capped.y - 0.016 > CY + 0.002, `above the brim (${capped.y})`);
  assert.ok(capped.bottom[0] < R.z + 0.01, 'not along the brim');
});

test('a kippah sits on the hair at the back of the crown', () => {
  // Hair 1.08 times the skull: the kippah lies on it (rho 1.08 = on the hair).
  const pts = new Float32Array([...ellipsoid(), ...ellipsoid(1.08, (x, y) => y > CY - 0.02)]);
  const fit = kippahFit(HEAD, pts, KIPPAH.velvet.arc);
  const pos = kippah(HEAD, { style: 'velvet', fit }).geometry.getAttribute('position');
  let back = 0;
  for (let i = 0; i < pos.count; i++) {
    const p = rho(pos.getX(i), pos.getY(i), pos.getZ(i));
    assert.ok(p > 1.07 && p < 1.15, `vertex ${i} on the hair, a few mm over it at most (${p.toFixed(3)})`);
    back += pos.getZ(i) - CZ;
  }
  assert.ok(back / pos.count < 0, 'toward the back');
});

test('a plate carrier lies on the chest and back, never inside them', () => {
  // A torso: an elliptic cylinder (Spine2 frame, +Z the chest), 40 cm tall, 34 x 22 cm across,
  // closed on top (the shoulders).
  const pts = [];
  for (let y = -0.18; y <= 0.22; y += 0.006) {
    for (let a = 0; a < Math.PI * 2; a += 0.03) pts.push(0.17 * Math.sin(a), y, 0.02 + 0.11 * Math.cos(a));
  }
  for (let r = 0; r < 1; r += 0.04) {
    for (let a = 0; a < Math.PI * 2; a += 0.03) pts.push(0.17 * r * Math.sin(a), 0.22, 0.02 + 0.11 * r * Math.cos(a));
  }
  const fit = vestFit(new Float32Array(pts));
  assert.ok(Math.abs(fit.cz - 0.02) < 0.005, `middle depth ${fit.cz}`);
  const pos = vest(fit).geometry.getAttribute('position');
  let front = 0;
  let back = 0;
  for (let i = 0; i < pos.count; i++) {
    const x = pos.getX(i);
    const z = pos.getZ(i) - 0.02;
    const r = Math.hypot(x / 0.17, z / 0.11); // 1 = on the torso's side
    assert.ok(r > 0.99 || pos.getY(i) > 0.222, `vertex ${i} outside the torso (${r.toFixed(3)}, y ${pos.getY(i).toFixed(3)})`);
    if (Math.abs(x) < 0.05 && pos.getY(i) < 0.1) {
      if (z > 0) front = Math.max(front, z);
      else back = Math.max(back, -z);
    }
  }
  // Plates (and pouches in front) close to the body: within a few cm.
  assert.ok(back > 0.11 && back < 0.14, `back plate ${back.toFixed(3)}`);
  assert.ok(front > 0.11 && front < 0.18, `front plate + pouches ${front.toFixed(3)}`);
});
