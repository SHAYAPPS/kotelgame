// Loads Mixamo FBX files in Node with three's FBXLoader. Embedded textures are captured as
// raw image bytes (no DOM image decoding): texture.userData.bytes / .mime.
import { readFile } from 'node:fs/promises';
import * as THREE from 'three';

globalThis.window ??= globalThis;
globalThis.self ??= globalThis;
const blobs = new Map();
const createObjectURL = URL.createObjectURL.bind(URL);
URL.createObjectURL = (blob) => {
  const url = createObjectURL(blob);
  blobs.set(url, blob);
  return url;
};
THREE.TextureLoader.prototype.load = function (url) {
  const t = new THREE.Texture();
  t.userData.url = url;
  return t;
};
const { FBXLoader } = await import('three/addons/loaders/FBXLoader.js');

/** Strips Mixamo's rig prefix: "mixamorigLeftArm" / "mixamorig:LeftArm" -> "LeftArm". */
export function boneName(name) {
  return name.replace(/^mixamorig\d*:?/, '');
}

/** Parse an FBX file. Returns the three.js root; embedded images are resolved to bytes. */
export async function loadFBX(path) {
  const buf = await readFile(path);
  const quiet = console.warn;
  console.warn = () => {};
  let root;
  try {
    root = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), '');
  } finally {
    console.warn = quiet;
  }
  const pending = [];
  root.traverse((o) => {
    if (!o.isMesh) return;
    for (const m of Array.isArray(o.material) ? o.material : [o.material]) {
      for (const key of ['map', 'normalMap', 'specularMap', 'alphaMap', 'bumpMap', 'emissiveMap']) {
        const t = m[key];
        const blob = t && blobs.get(t.userData.url);
        if (blob && !t.userData.bytes) {
          t.userData.mime = blob.type;
          pending.push(blob.arrayBuffer().then((ab) => (t.userData.bytes = new Uint8Array(ab))));
        }
      }
    }
  });
  await Promise.all(pending);
  root.updateMatrixWorld(true);
  return root;
}
