import { BoxGeometry, Group, Mesh, PlaneGeometry, Vector3 } from 'three';
import { CollisionWorld } from '../src/world/CollisionWorld.js';
import { PlayerController } from '../src/player/PlayerController.js';

export const DT = 1 / 120;

/** Axis-aligned box resting on y = bottom. */
export function box(group, { x = 0, z = 0, bottom = 0, w = 1, h = 1, d = 1, rotX = 0, rotY = 0, rotZ = 0 }) {
  const mesh = new Mesh(new BoxGeometry(w, h, d));
  mesh.position.set(x, bottom + h / 2, z);
  mesh.rotation.set(rotX, rotY, rotZ);
  group.add(mesh);
  return mesh;
}

/** A world with a large ground plane plus whatever `build(group)` adds. */
export function makeWorld(build = () => {}) {
  const group = new Group();
  group.add(new Mesh(new PlaneGeometry(200, 200).rotateX(-Math.PI / 2)));
  build(group);
  return new CollisionWorld().build(group);
}

export function makePlayer(world, x = 0, y = 0, z = 0, yaw = 0) {
  const p = new PlayerController(world);
  p.setSpawn(new Vector3(x, y, z), yaw);
  return p;
}

const IDLE = { forward: 0, right: 0, jump: false, sprint: false, crouch: false };

/**
 * Runs the controller for `seconds`. `input` is either an object (held for the
 * whole time) or a function (stepIndex) => input. Edge inputs (jump/crouch) in an
 * object are only sent on the first step. Returns per-step samples.
 */
export function simulate(player, input, seconds, onStep) {
  const steps = Math.round(seconds / DT);
  const samples = [];
  for (let i = 0; i < steps; i++) {
    let inp;
    if (typeof input === 'function') inp = { ...IDLE, ...input(i) };
    else inp = { ...IDLE, ...input, jump: i === 0 && !!input.jump, crouch: i === 0 && !!input.crouch };
    player.update(DT, inp);
    const s = {
      x: player.position.x,
      y: player.position.y,
      z: player.position.z,
      grounded: player.grounded,
      crouched: player.crouched,
      speed: player.horizontalSpeed,
    };
    samples.push(s);
    if (onStep) onStep(s, i);
  }
  return samples;
}
