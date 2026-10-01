// Dev tool: look at a model file (npm run dev, then http://localhost:5173/dev/models.html).
// URL params: url=/path/to/model.(glb|gltf|fbx|obj)  map= normal= rough= metal= (textures for
// FBX/OBJ files without embedded ones)  cam=front|side|back|top|iso (default iso)  bg=hex
// env=0 (no environment light)  scale=n  rot=x,y,z (radians)  only=<regex> (meshes whose name
// or a parent's name matches; the rest hidden)  dist=n (camera distance factor)
import {
  ACESFilmicToneMapping,
  Box3,
  Color,
  DirectionalLight,
  HemisphereLight,
  Mesh,
  MeshStandardMaterial,
  PerspectiveCamera,
  SRGBColorSpace,
  Scene,
  TextureLoader,
  Vector3,
} from 'three';
import { PMREMGenerator, WebGPURenderer } from 'three/webgpu';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { KTX2Loader } from 'three/addons/loaders/KTX2Loader.js';

const params = new URLSearchParams(location.search);
const ui = document.getElementById('ui');
const renderer = new WebGPURenderer({ antialias: true });
await renderer.init(); // (WebGPU, else WebGL 2: the game's renderer)
renderer.setPixelRatio(Math.min(2, devicePixelRatio));
renderer.setSize(innerWidth, innerHeight);
renderer.toneMapping = ACESFilmicToneMapping;
document.body.append(renderer.domElement);
const scene = new Scene();
scene.background = new Color(`#${params.get('bg') ?? '8a949e'}`);
if (params.get('env') !== '0') scene.environment = new PMREMGenerator(renderer).fromScene(new RoomEnvironment(), 0.04).texture;
scene.add(new HemisphereLight(0xdde9f5, 0x6d6455, 1.2));
const sun = new DirectionalLight(0xfff0db, 2.5);
sun.position.set(2, 3, 1.5);
scene.add(sun);
const camera = new PerspectiveCamera(35, innerWidth / innerHeight, 0.001, 500);
const controls = new OrbitControls(camera, renderer.domElement);

const url = params.get('url');
const ext = url?.split('?')[0].split('.').pop().toLowerCase();
const tex = new TextureLoader();
const loadTex = (key, srgb) => {
  const u = params.get(key);
  if (!u) return null;
  const t = tex.load(u);
  if (srgb) t.colorSpace = SRGBColorSpace;
  return t;
};

async function load() {
  if (!url) throw new Error('add ?url=/path/to/model');
  if (ext === 'glb' || ext === 'gltf') {
    const loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder).setKTX2Loader(new KTX2Loader().detectSupport(renderer));
    return (await loader.loadAsync(url)).scene;
  }
  if (ext === 'fbx') return new FBXLoader().loadAsync(url);
  if (ext === 'obj') return new OBJLoader().loadAsync(url);
  throw new Error(`unknown format ${ext}`);
}

load()
  .then((root) => {
    const map = loadTex('map', true);
    const normalMap = loadTex('normal', false);
    const roughnessMap = loadTex('rough', false);
    const metalnessMap = loadTex('metal', false);
    let tris = 0;
    let meshes = 0;
    const only = params.get('only') && new RegExp(params.get('only'));
    const matches = (o) => o && (only.test(o.name) || matches(o.parent));
    root.traverse((o) => {
      if (!(o instanceof Mesh)) return;
      if (only && !matches(o)) {
        o.visible = false;
        return;
      }
      meshes++;
      tris += (o.geometry.index ? o.geometry.index.count : o.geometry.attributes.position.count) / 3;
      if (map || normalMap || roughnessMap) {
        o.material = new MeshStandardMaterial({ map, normalMap, roughnessMap, metalnessMap, metalness: metalnessMap ? 1 : 0.2, roughness: 1 });
      }
    });
    const s = +(params.get('scale') ?? 1);
    root.scale.setScalar(s);
    const rot = (params.get('rot') ?? '0,0,0').split(',').map(Number);
    root.rotation.set(rot[0], rot[1], rot[2]);
    scene.add(root);
    root.updateMatrixWorld(true);
    const box = new Box3();
    root.traverse((o) => {
      if (o instanceof Mesh && o.visible && (!only || matches(o))) box.expandByObject(o);
    });
    const size = box.getSize(new Vector3());
    const center = box.getCenter(new Vector3());
    const r = Math.max(size.x, size.y, size.z);
    const dirs = { front: [0, 0.15, 1], side: [1, 0.15, 0], back: [0, 0.15, -1], top: [0.01, 1, 0.01], iso: [0.9, 0.45, 0.8] };
    const d = new Vector3(...(dirs[params.get('cam') ?? 'iso'] ?? dirs.iso)).normalize();
    camera.position.copy(center).addScaledVector(d, r * 1.9 * +(params.get('dist') ?? 1));
    controls.target.copy(center);
    controls.update();
    ui.textContent = `${url}\n${meshes} meshes, ${Math.round(tris)} triangles\nsize ${size.x.toFixed(3)} x ${size.y.toFixed(3)} x ${size.z.toFixed(3)}`;
    window.__model = { root, scene, camera, controls, ready: true };
  })
  .catch((e) => {
    ui.textContent = `error: ${e.message}`;
    window.__model = { error: e.message, ready: true };
  });

renderer.setAnimationLoop(() => renderer.render(scene, camera));
addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
});
