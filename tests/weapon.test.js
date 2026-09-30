import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RIFLE } from '../src/weapons/config.js';
import { WeaponState } from '../src/weapons/WeaponState.js';
import { Recoil } from '../src/weapons/Recoil.js';

const DT = 1 / 120;
const IDLE = { trigger: false, aim: false, reload: false };

function run(w, input, seconds) {
  let shots = 0;
  const steps = Math.round(seconds / DT);
  for (let i = 0; i < steps; i++) {
    const inp = typeof input === 'function' ? { ...IDLE, ...input(i) } : { ...IDLE, ...input, reload: i === 0 && !!input.reload };
    shots += w.update(DT, inp);
  }
  return shots;
}

test('full auto fires at the configured rate', () => {
  const w = new WeaponState();
  const shots = run(w, { trigger: true }, 1);
  assert.ok(Math.abs(shots - RIFLE.fireRate) <= 1, `shots=${shots}`);
});

test('first shot fires immediately on trigger press', () => {
  const w = new WeaponState();
  assert.equal(w.update(DT, { ...IDLE, trigger: true }), 1);
});

test('tapping cannot fire faster than the fire rate', () => {
  const w = new WeaponState();
  const shots = run(w, (i) => ({ trigger: i % 2 === 0 }), 1);
  assert.ok(shots <= RIFLE.fireRate + 1, `shots=${shots}`);
});

test('a magazine holds 30 rounds, then dry-fires and auto-reloads', () => {
  const w = new WeaponState();
  const shots = run(w, { trigger: true }, 5);
  assert.equal(shots, RIFLE.magazineSize);
  assert.equal(w.ammo, 0);
  run(w, {}, 0.05);
  w.update(DT, { ...IDLE, trigger: true });
  assert.equal(w.dryFire, true);
  assert.equal(w.reloading, true, 'pulling the trigger on empty starts a reload');
});

test('reload takes reloadTime, blocks firing, and moves ammo from reserve', () => {
  const w = new WeaponState();
  run(w, { trigger: true }, 1); // fire some rounds
  const fired = RIFLE.magazineSize - w.ammo;
  run(w, { reload: true }, RIFLE.reloadTime * 0.5);
  assert.equal(w.reloading, true);
  assert.equal(run(w, { trigger: true }, 0.2), 0, 'no firing mid-reload');
  run(w, {}, RIFLE.reloadTime * 0.5);
  assert.equal(w.reloading, false);
  assert.equal(w.ammo, RIFLE.magazineSize);
  assert.equal(w.reserve, RIFLE.reserveAmmo - fired);
});

test('reload is ignored with a full magazine or no reserve', () => {
  const full = new WeaponState();
  run(full, { reload: true }, 0.1);
  assert.equal(full.reloading, false);

  const dry = new WeaponState();
  dry.reserve = 0;
  run(dry, { trigger: true }, 0.5);
  run(dry, { reload: true }, 0.1);
  assert.equal(dry.reloading, false);
});

test('the last partial magazine only takes what is left in reserve', () => {
  const w = new WeaponState();
  w.reserve = 10;
  run(w, { trigger: true }, 5);
  run(w, { reload: true }, RIFLE.reloadTime + 0.1);
  assert.equal(w.ammo, 10);
  assert.equal(w.reserve, 0);
});

test('blocked (e.g. sprinting) prevents firing', () => {
  const w = new WeaponState();
  assert.equal(run(w, { trigger: true, blocked: true }, 0.5), 0);
});

test('aim eases in over adsTime and out again', () => {
  const w = new WeaponState();
  run(w, { aim: true }, RIFLE.adsTime / 2);
  assert.ok(w.aim > 0.4 && w.aim < 0.6);
  run(w, { aim: true }, RIFLE.adsTime);
  assert.equal(w.aim, 1);
  run(w, {}, RIFLE.adsTime);
  assert.equal(w.aim, 0);
});

test('recoil kicks the view up and settles back', () => {
  const r = new Recoil(RIFLE, () => 0.5);
  r.kick();
  let peak = 0;
  for (let i = 0; i < 120; i++) {
    r.update(DT);
    peak = Math.max(peak, r.pitch);
  }
  assert.ok(peak > RIFLE.recoilPitch * 0.8 && peak < RIFLE.recoilPitch * 1.2, `peak=${peak}`);
  assert.ok(Math.abs(r.pitch) < 1e-4, `settled pitch=${r.pitch}`);
});

test('sustained fire climbs but is capped', () => {
  const r = new Recoil();
  for (let i = 0; i < 240; i++) {
    if (i % 11 === 0) r.kick();
    r.update(DT);
  }
  assert.ok(r.pitch > RIFLE.recoilPitch, 'climbs under sustained fire');
  assert.ok(r.pitch <= RIFLE.maxRecoilPitch);
});
