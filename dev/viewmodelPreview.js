// Dev tool: the first-person weapon on its own (npm run dev, then
// http://localhost:5173/dev/viewmodel.html). URL params:
//   weapon=rifle|launcher  state=hip|ads|sprint|lowered|stow|reload|check|fire
//   t=<seconds into the reload / check>  empty=1 (empty reload)  cam=view|side|top|front
//   aim=<0..1>  hud=0
// window.__vm: { vm, set(params), frame(dt) } for scripted shots (scripts/weapon-shots.mjs).
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  Color,
  DirectionalLight,
  EquirectangularReflectionMapping,
  FloatType,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  Scene,
  Vector3,
} from 'three';
import { PMREMGenerator, WebGPURenderer } from 'three/webgpu';
import { EXRLoader } from 'three/addons/loaders/EXRLoader.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { Viewmodel } from '../src/weapons/Viewmodel.js';
import { models } from '../src/core/Models.js';
import { RIFLE, LAUNCHER } from '../src/weapons/config.js';

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui');
if (params.get('hud') === '0') ui.style.display = 'none';
const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // (WebGPU, else WebGL 2: the game's renderer)
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.autoClear = false;
document.body.append(renderer.domElement);

// A plain world: ground, a stone-ish wall far ahead and a target to aim at.
const world = new Scene();
world.background = new Color(0x9fb4c8);
const camera = new PerspectiveCamera(75, innerWidth / innerHeight, 0.05, 500);
camera.position.set(0, 1.65, 0);
const ground = new Mesh(new PlaneGeometry(200, 200), new MeshStandardMaterial({ color: 0xb8ab92, roughness: 0.9 }));
ground.rotation.x = -Math.PI / 2;
const wall = new Mesh(new BoxGeometry(40, 18, 1), new MeshStandardMaterial({ color: 0xcdbb98, roughness: 0.95 }));
wall.position.set(0, 9, -45);
const target = new Mesh(new BoxGeometry(0.6, 0.9, 0.05), new MeshStandardMaterial({ color: 0x3a3a3a }));
target.position.set(0, 1.65, -25);
world.add(ground, wall, target);

const env = {
  sunDir: new Vector3(0.45, 0.75, 0.48).normalize(),
  sunColor: new Color(1, 0.95, 0.86),
  sunIntensity: 3.0,
  envMap: null,
  o: { envIntensity: 0.55 },
};
const worldSun = new DirectionalLight(0xfff0db, 3);
worldSun.position.copy(env.sunDir).multiplyScalar(50);
world.add(worldSun, new HemisphereLight(0xc4d8ee, 0xe9d3a6, 1.2));

new EXRLoader().setDataType(FloatType).load('/assets/hdri/sky_512.exr', (tex) => {
  const data = tex.image.data;
  for (let i = 0; i < data.length; i++) if (data[i] > 24) data[i] = 24;
  tex.mapping = EquirectangularReflectionMapping;
  tex.needsUpdate = true;
  const pmrem = new PMREMGenerator(renderer);
  env.envMap = pmrem.fromEquirectangular(tex).texture;
  world.environment = env.envMap;
  world.environmentIntensity = 0.55;
});

const vm = new Viewmodel();
vm.setAspect(innerWidth / innerHeight);
models.ktx2Loader = new KTX2Loader().detectSupport(renderer);
const state = {
  weapon: params.get('weapon') ?? 'rifle',
  state: params.get('state') ?? 'hip',
  t: +(params.get('t') ?? 0),
  empty: params.get('empty') === '1',
  cam: params.get('cam') ?? 'view',
  aim: params.get('aim'),
  shade: 1,
};
let loaded = false;
vm.load().then(
  () => {
    loaded = true;
  },
  (e) => {
    ui.textContent = `load failed: ${e.message}`;
    console.error(e);
  },
);

// Inspection cameras (look at the weapon from outside, in view space).
const side = new PerspectiveCamera(40, innerWidth / innerHeight, 0.01, 10);
const cams = {
  side: [new Vector3(0.75, 0.0, -0.2), new Vector3(0.03, -0.12, -0.2)],
  left: [new Vector3(-0.75, 0.0, -0.2), new Vector3(0.03, -0.12, -0.2)],
  top: [new Vector3(0.05, 0.8, -0.2), new Vector3(0.05, -0.1, -0.21)],
  front: [new Vector3(0.05, -0.05, -1.1), new Vector3(0.05, -0.1, -0.2)],
  port: [new Vector3(0.3, -0.12, -0.27), new Vector3(0.105, -0.168, -0.3)],
};

function input(dt) {
  const s = state;
  const L = s.weapon === 'launcher';
  const reloadTime = L ? LAUNCHER.reloadTime : RIFLE.reloadTime;
  const aim = s.aim != null ? +s.aim : s.state === 'ads' || s.state === 'fire' ? 1 : 0;
  return {
    aim,
    reload: s.state === 'reload' ? Math.min(0.999, s.t / reloadTime) : 0,
    reloadEmpty: s.empty,
    loaded: !(L && s.state === 'reload' && s.t < 1.3),
    sprinting: s.state === 'sprint',
    lowered: s.state === 'lowered' || s.state === 'check',
    stow: s.state === 'stow' ? 1 : 0,
    check: s.state === 'check' ? Math.min(0.999, s.t / 1.3) : 0,
    charge: s.state === 'charge' ? Math.min(0.999, s.t / 0.8) : 0,
    lookX: 0,
    lookY: 0,
    bobPhase: 0,
    bobWeight: 0,
    dip: 0,
  };
}

function frame(dt) {
  if (vm.weapon !== state.weapon) vm.setWeapon(state.weapon);
  vm.setLighting(camera, env, state.shade, dt);
  vm.update(dt, input(dt));
  renderer.clear();
  if (state.cam === 'view') {
    renderer.render(world, camera);
    renderer.clearDepth();
    renderer.render(vm.scene, vm.camera);
  } else {
    const [p, t] = cams[state.cam] ?? cams.side;
    side.position.copy(p);
    side.lookAt(t);
    vm.scene.background = new Color(0x8a949e);
    renderer.render(vm.scene, side);
    vm.scene.background = null;
  }
  const A = vm.models?.arms;
  ui.textContent = `${state.weapon} ${state.state} t=${state.t.toFixed(2)}${state.empty ? ' empty' : ''} cam=${state.cam}\n${loaded ? 'models' : 'placeholder'}${A ? `  reach R ${A.sides.R.reach.toFixed(3)} L ${A.sides.L.reach.toFixed(3)}` : ''}`;
}

let last = performance.now();
renderer.setAnimationLoop((now) => {
  if (window.__vm?.manual) return;
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  frame(dt);
});
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  vm.setAspect(camera.aspect);
  side.aspect = camera.aspect;
  side.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});

window.__vm = {
  vm,
  state,
  manual: false,
  get ready() {
    return loaded && !!env.envMap;
  },
  /** Settle the springs: run frames with fixed dt. */
  settle(seconds = 1, dt = 1 / 60) {
    for (let t = 0; t < seconds; t += dt) frame(dt);
  },
  set(p) {
    Object.assign(state, p);
  },
  shoot(n = 1) {
    for (let i = 0; i < n; i++) vm.onShot(state.state === 'ads' || state.state === 'fire' ? 1 : 0);
  },
  frame,
};
