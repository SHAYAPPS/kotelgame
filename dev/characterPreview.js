// Dev tool: every character in a row, playing a chosen clip (npm run dev, then open
// http://localhost:5173/dev/characters.html). URL params: ids=a,b  clip=name  role=squad|enemy|civilian
// cam=front|side|back|close|top|far  t=seconds (freeze at a time)  ik=0  lod=0|1|2
// outfit=worshipper|worshipperWoman|tourist|guide (civilians)  deaths=1 (a different death each)
import {
  ACESFilmicToneMapping,
  BoxGeometry,
  MeshBasicMaterial,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PCFShadowMap,
  PerspectiveCamera,
  PlaneGeometry,
  PMREMGenerator,
  Scene,
  SRGBColorSpace,
  Vector3,
  WebGLRenderer,
} from 'three';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { CharacterLibrary } from '../src/characters/CharacterLibrary.js';
import { dressCharacter } from '../src/characters/outfits.js';

const params = new URLSearchParams(location.search);
function seeded(seed) {
  let x = seed * 9301 + 49297;
  return () => ((x = (x * 9301 + 49297) % 233280) / 233280);
}
const renderer = new WebGLRenderer({ antialias: true });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
renderer.outputColorSpace = SRGBColorSpace;
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = PCFShadowMap;
document.body.append(renderer.domElement);

const scene = new Scene();
scene.background = new Color(0xa9bccd);
scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentIntensity = 0.6;
scene.add(new HemisphereLight(0xdfe8ff, 0x6b5a45, 0.8));
const sun = new DirectionalLight(0xfff1dd, 2.2);
sun.position.set(-4, 8, 6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -14, right: 14, top: 6, bottom: -2, near: 0.5, far: 30 });
scene.add(sun);
const ground = new Mesh(new PlaneGeometry(60, 20), new MeshStandardMaterial({ color: 0xb9ad96, roughness: 0.95 }));
ground.rotation.x = -Math.PI / 2;
ground.receiveShadow = true;
scene.add(ground);

const camera = new PerspectiveCamera(35, innerWidth / innerHeight, 0.05, 200);
const controls = new OrbitControls(camera, renderer.domElement);

const lib = new CharacterLibrary({ ktx2Loader: new KTX2Loader().detectSupport(renderer), base: '/assets/characters/' });
await lib.load();
const ui = document.getElementById('ui');
if (!lib.ready) {
  ui.textContent = 'failed to load characters (see console)';
  throw new Error('no characters');
}

const role = params.get('role');
const ids = params.get('ids')?.split(',') ?? [...lib.types.keys()].filter((id) => !role || lib.types.get(id).info.role === role);
const spacing = 1.15;
const models = ids.map((id, i) => {
  const m = lib.create(id, {});
  // outfit=none: the model as converted (no tints, hats or gear).
  if (params.get('outfit') !== 'none') dressCharacter(m, { variant: i, kind: params.get('outfit') ?? (m.info.role === 'civilian' ? 'tourist' : null), rand: seeded(i + 1) });
  m.root.position.x = (i - (ids.length - 1) / 2) * spacing;
  scene.add(m.root);
  return m;
});
const DEATHS = ['death_front', 'death_back', 'death_left', 'death_right', 'death_headshot_front', 'death_headshot_back', 'death_crouch_headshot'];
const defaultClip = (m, i) => (params.get('deaths') ? DEATHS[i % DEATHS.length] : m.info.role === 'civilian' ? 'idle_standing' : 'rifle_idle_aiming');
let clipName = params.get('clip');

function setClip(name) {
  clipName = name;
  for (const [i, m] of models.entries()) {
    const n = name ?? defaultClip(m, i);
    const meta = m.type.meta[n];
    m.fadeOut(0);
    m.fade(n, 1, 0, { restart: true });
    m.ikWeight = meta?.ik && params.get('ik') !== '0' ? 1 : 0;
    m._blend(0);
  }
}
setClip(clipName);
const lod = params.get('lod');
if (lod !== null) for (const m of models) m.setLod(+lod);

// The characters face -Z (the game's yaw 0).
const far = 2.6 + ids.length * 0.95;
const cams = {
  front: [0, 1.2, -far, 0, 0.95, 0],
  back: [0, 1.2, far, 0, 0.95, 0],
  side: [far * 0.8, 1.2, -far * 0.35, 0, 0.95, 0],
  close: [models[0].root.position.x - 0.6, 1.6, -1.5, models[0].root.position.x, 1.35, 0],
  top: [0, far * 1.2, -far * 0.6, 0, 0.5, 0],
  far: [3, 1.7, -32, 0, 1.0, 0],
};
function setCam(name) {
  if (name === 'face' || name === 'faces') return faceCam(name === 'faces' ? -1 : 0);
  const c = cams[name] ?? cams.front;
  camera.position.set(c[0], c[1], c[2]);
  controls.target.set(c[3], c[4], c[5]);
  controls.update();
}

// Close-up of one model's face (i), or of all heads in a row (i = -1).
function faceCam(i = 0) {
  for (const m of models) m.update(0, null, true);
  const heads = (i < 0 ? models : [models[i]]).map((m) => m.bones.get('Head').getWorldPosition(new Vector3()));
  const c = heads.reduce((a, b) => a.add(b), new Vector3()).divideScalar(heads.length);
  const spread = i < 0 ? (models.length - 1) * spacing : 0;
  camera.position.set(c.x, c.y + 0.1, c.z - 0.5 - spread * 0.9);
  controls.target.set(c.x, c.y + 0.08, c.z);
  controls.update();
}
setCam(params.get('cam') ?? 'front');

const freeze = params.get('t');
let last = performance.now();
const ctx = { camera, frustum: null };
function frame() {
  const now = performance.now();
  const dt = Math.min(0.05, (now - last) / 1000);
  last = now;
  for (const m of models) {
    if (freeze !== null) {
      for (const s of m.slots.values()) s.action.time = +freeze;
      m.update(0, null, true);
    } else m.update(dt, ctx, true);
  }
  renderer.render(scene, camera);
  requestAnimationFrame(frame);
}
frame();

// UI: clip picker
const names = [...lib.types.values().next().value.clips.keys()];
ui.innerHTML = `<select id="clip">${['(default)', ...names].map((n) => `<option>${n}</option>`).join('')}</select> <span id="info"></span>`;
const sel = document.getElementById('clip');
if (clipName) sel.value = clipName;
sel.onchange = () => setClip(sel.value === '(default)' ? null : sel.value);
document.getElementById('info').textContent = `${models.length} characters`;
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
// ?lip=<y>: a red line across the first model's face at that height (Head-bone frame), with
// marks 5 mm above and below: to check the converter's lip line (manifest face.lipY).
if (params.get('lip')) {
  const head = models[0].bones.get('Head');
  const y0 = params.get('lip') === 'auto' ? models[0].info.face?.lipY ?? 0 : +params.get('lip');
  const front = (models[0].info.head?.front ?? 0.12) + 0.004;
  for (const [dy, color, w] of [[0, 0xff0000, 0.075], [0.005, 0x00ffff, 0.018], [-0.005, 0x00ffff, 0.018]]) {
    for (const side of dy ? [-1, 1] : [0]) {
      const bar = new Mesh(new BoxGeometry(w, 0.0005, 0.0005), new MeshBasicMaterial({ color, depthTest: false }));
      bar.position.set(side * 0.05, y0 + dy, front);
      bar.renderOrder = 10;
      head.add(bar);
    }
  }
}
// ?ruler=1: height marks on the first model's face (Head-bone frame, every 5 mm; the thick
// ones every 1 cm are labeled by index from y = 0): to measure face landmarks (lipY).
if (params.get('ruler')) {
  const head = models[0].bones.get('Head');
  const front = (models[0].info.head?.front ?? 0.12) + 0.012;
  for (let k = -4; k <= 16; k++) {
    const y = k * 0.005;
    const thick = k % 2 === 0;
    const bar = new Mesh(new BoxGeometry(thick ? 0.07 : 0.04, thick ? 0.0012 : 0.0006, 0.0006), new MeshBasicMaterial({ color: k === 0 ? 0xff0000 : thick ? 0x00ffff : 0xffff00, depthTest: false }));
    bar.position.set(thick ? 0.06 : 0.055, y, front);
    bar.renderOrder = 10;
    head.add(bar);
  }
}

window.__preview = { lib, models, setClip, setCam, faceCam, scene, camera, controls, renderer, ready: true };
