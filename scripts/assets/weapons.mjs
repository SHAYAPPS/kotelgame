// Converts the free weapon and vehicle models (CC0 / CC-BY, see weapons.config.mjs) into the
// game's files in public/assets/weapons/:
//   rifle.glb      the assault rifle: receiver + animated parts (magazine, charging handle,
//                  dust cover), PBR textures (color, normal, ORM) as KTX2; markers in extras
//   arms.glb       first-person arms (skinned): gloves and olive sleeves painted over the
//                  model's bare arms (color + normal map generated here)
//   launcher.glb   the rocket launcher and its rocket (own node)
//   truck.glb      the pickup: body + four wheels, materials by role (paint, glass, ...)
//   manifest.json  what each file is (sizes, markers) + sources for CREDITS.md
//   npm run assets:weapons [id ...]      (rifle, arms, launcher, truck; no ids = all)
// The raw downloads are kept in assets-src/models/ (git-ignored) and fetched when missing.
import { mkdir, readFile, writeFile, access, readdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import sharp from 'sharp';
import * as THREE from 'three';
import { NodeIO } from '@gltf-transform/core';
import { loadFBX } from './lib/fbx.mjs';
import { meshArrays, mergeArrays, translateArrays, bounds, creaseNormals, writeModel, packSkin, principalAxes } from './lib/model.mjs';
import { paintTriangles, bleed, fbm3 } from './lib/paint.mjs';
import { encodeKTX2 } from './ktx2.mjs';
import { SOURCES, RIFLE_MODEL, TRUCK_MODEL } from './weapons.config.mjs';
import { writeCredits } from './credits.mjs';

const SRC = new URL('../../assets-src/models/', import.meta.url);
const OUT = new URL('../../public/assets/weapons/', import.meta.url);
const path = (u) => fileURLToPath(u);
const exists = (u) => access(u).then(() => true, () => false);
const r4 = (x) => Math.round(x * 1e4) / 1e4;
const v3 = (a) => a.map(r4);

/** The source's folder in assets-src/models/<id>/, downloaded + extracted when missing. */
async function source(id) {
  const s = SOURCES[id];
  const dir = new URL(`${id}/`, SRC);
  const first = new URL(Object.values(s.files)[0], dir);
  if (await exists(first)) return dir;
  await mkdir(dir, { recursive: true });
  const name = decodeURIComponent(s.url.split('/').pop());
  const archive = new URL(name, dir);
  console.log(`  downloading ${s.url}`);
  const res = await fetch(s.url, { headers: { 'User-Agent': 'kotelgame-assets' } });
  if (!res.ok) throw new Error(`${s.url}: HTTP ${res.status}`);
  await writeFile(archive, Buffer.from(await res.arrayBuffer()));
  if (/\.(zip|7z)$/i.test(name)) {
    execFileSync('bsdtar', ['-xf', path(archive), '-C', path(dir)]);
    // Archives with one top folder (other than the expected paths): flatten when needed.
    if (!(await exists(first))) {
      for (const e of await readdir(dir, { withFileTypes: true })) {
        if (!e.isDirectory()) continue;
        if (await exists(new URL(`${e.name}/${Object.values(s.files)[0]}`, dir))) {
          execFileSync('sh', ['-c', `cp -R "${path(new URL(e.name, dir))}/." "${path(dir)}"`]);
        }
      }
    }
  } else {
    await writeFile(first, await readFile(archive));
  }
  if (!(await exists(first))) throw new Error(`${id}: ${Object.values(s.files)[0]} not in ${name}`);
  return dir;
}

async function rawImage(file, size) {
  const { data, info } = await sharp(file).resize(size, size, { fit: 'fill' }).ensureAlpha().raw().toBuffer({ resolveWithObject: true });
  return { data: new Uint8Array(data.buffer, data.byteOffset, data.length), width: info.width, height: info.height };
}

// ---------------------------------------------------------------------------------------------
// Rifle

async function buildRifle() {
  const dir = await source('rifle');
  const F = SOURCES.rifle.files;
  const root = await loadFBX(path(new URL(F.fbx, dir)));
  const S = new THREE.Matrix4().makeScale(RIFLE_MODEL.scale, RIFLE_MODEL.scale, RIFLE_MODEL.scale);
  const meshes = {};
  root.traverse((o) => {
    if (o.isMesh) meshes[o.name] = meshArrays(o, S.clone().multiply(o.matrixWorld));
  });
  const partOf = {};
  for (const [part, names] of Object.entries(RIFLE_MODEL.parts)) for (const n of names) partOf[n] = part;

  // Measurements (meters): rail top, bore, front sight, muzzle, magazine, grip.
  const base = bounds(meshes.Base);
  const railTop = base.max[1];
  const barrel = meshes.Barrel;
  const muzzleZ = bounds(barrel).min[2];
  const tip = bounds(barrel, (x, y, z) => z < muzzleZ + 0.03);
  const boreY = tip.center[1];
  const fsb = bounds(barrel, (x, y, z) => y > railTop + 0.01); // front sight post + ears
  const mag = bounds(meshes.Magazine);
  const grip = bounds(meshes.Base, (x, y, z) => y < -0.07 && z > 0.05); // pistol grip below the trigger guard
  const trigger = bounds(meshes.Trigger);
  const port = bounds(meshes.Ejector_2);

  // Dust cover: modeled open (hanging from its hinge under the port). Hinge = its top edge.
  const cover = meshes.Ejector_Lid;
  const cb = bounds(cover);
  const hingeVerts = bounds(cover, (x, y) => y > cb.max[1] - 0.003);
  const hinge = [hingeVerts.center[0], cb.max[1] - 0.0015, 0];
  // Open direction (hinge -> lower edge) and the closed one (straight up along the port).
  const low = bounds(cover, (x, y) => y < cb.min[1] + 0.003);
  const openAngle = Math.atan2(low.center[1] - hinge[1], low.center[0] - hinge[0]);
  const closedAngle = Math.atan2(port.max[1] - hinge[1], hinge[0] + 0.0035 - hinge[0]);
  translateArrays(cover, hinge[0], hinge[1], hinge[2]);

  // Rear sight: fold the aperture flat, forward (about its base, on X).
  const sight = meshes.Sight_2;
  const sb = bounds(sight);
  const pivot = [0, sb.min[1] + 0.003, sb.center[2]];
  for (let i = 0; i < sight.position.length; i += 3) {
    const y = sight.position[i + 1] - pivot[1];
    const z = sight.position[i + 2] - pivot[2];
    // -90 degrees about X: up (+Y) -> forward (-Z)
    sight.position[i + 1] = pivot[1] + z;
    sight.position[i + 2] = pivot[2] - y;
    const ny = sight.normal[i + 1];
    const nz = sight.normal[i + 2];
    sight.normal[i + 1] = nz;
    sight.normal[i + 2] = -ny;
  }

  // Magazine pivot: the top of its feed lips, in the magwell.
  const magTop = [0, mag.max[1], mag.center[2]];
  translateArrays(meshes.Magazine, ...magTop);
  const ch = meshes.Charging_Handle;

  const receiver = mergeArrays(Object.entries(meshes).filter(([n]) => !partOf[n] || partOf[n] === 'rear_sight').map(([, m]) => m));

  // Textures: color, normal, ORM (occlusion 1, roughness, metalness).
  const T = RIFLE_MODEL.textureSize;
  const color = await rawImage(path(new URL(F.color, dir)), T);
  const normal = await rawImage(path(new URL(F.normal, dir)), T);
  const rough = await rawImage(path(new URL(F.rough, dir)), T);
  const metal = await rawImage(path(new URL(F.metal, dir)), T);
  const orm = new Uint8Array(T * T * 4);
  for (let i = 0; i < T * T; i++) {
    orm[i * 4] = 255;
    orm[i * 4 + 1] = rough.data[i * 4];
    // Black anodized aluminum / parkerized steel read as coated, not bare metal.
    orm[i * 4 + 2] = Math.round(metal.data[i * 4] * RIFLE_MODEL.metalness);
    orm[i * 4 + 3] = 255;
  }
  const [colorKTX, normalKTX, ormKTX] = await Promise.all([
    encodeKTX2(color.data, T, T, 'color'),
    encodeKTX2(normal.data, T, T, 'normal', { rdo: 2 }),
    encodeKTX2(orm, T, T, 'data'),
  ]);

  const markers = {
    railTop: r4(railTop),
    bore: v3([0, boreY, muzzleZ]),
    frontSight: v3([0, fsb.max[1], fsb.center[2]]),
    magTop: v3(magTop),
    port: v3([port.max[0], port.center[1], port.center[2]]),
    portSize: v3(port.size),
    grip: { top: v3([0, -0.035, grip.max[2] - 0.035]), bottom: v3([0, grip.min[1], grip.max[2]]) },
    trigger: v3(trigger.center),
    handguard: { front: r4(bounds(barrel, (x, y, z) => y < railTop + 0.002 && y > railTop - 0.006).min[2]), rear: r4(base.min[2]), bottom: r4(bounds(barrel, (x, y, z) => z > -0.3 && z < -0.12).min[1]) },
    dustCover: { hinge: v3(hinge), open: r4(openAngle), closed: r4(closedAngle) },
    chargingHandle: v3(bounds(ch).center),
    rearSight: v3(bounds(sight).max),
    stockEnd: r4(bounds(meshes.Stock).max[2]),
  };
  const glb = await writeModel({
    name: 'rifle',
    extras: { markers },
    materials: { rifle: { color: colorKTX, normal: normalKTX, orm: ormKTX, metallic: 1, roughness: 1 } },
    nodes: [
      { name: 'receiver', meshes: [{ arrays: receiver, material: 'rifle' }] },
      // Animated parts: a pivot node (what the game moves) holding the mesh node (whose own
      // transform carries the position quantization).
      { name: 'magazine', t: magTop, children: [{ name: 'magazine_mesh', meshes: [{ arrays: meshes.Magazine, material: 'rifle' }] }] },
      { name: 'charging_handle', children: [{ name: 'charging_handle_mesh', meshes: [{ arrays: ch, material: 'rifle' }] }] },
      { name: 'dust_cover', t: hinge, children: [{ name: 'dust_cover_mesh', meshes: [{ arrays: cover, material: 'rifle' }] }] },
    ],
  });
  await writeFile(new URL('rifle.glb', OUT), glb);
  const tris = (receiver.index.length + meshes.Magazine.index.length + ch.index.length + cover.index.length) / 3;
  console.log(`  rifle.glb ${(glb.length / 1024).toFixed(0)} KB, ${tris} triangles`);
  console.log('  markers', JSON.stringify(markers));
  return { file: 'rifle.glb', triangles: tris, markers };
}

// ---------------------------------------------------------------------------------------------
// Arms: the model's bare arms become gloved hands and olive sleeves.

const ARMS = {
  // Base colors, sRGB 0..255 (shading is done in linear light).
  glove: [38, 38, 36], // dark synthetic leather
  palm: [56, 52, 46], // suede palm (a touch lighter than the back)
  sleeve: [86, 88, 62], // IDF olive
  cuff: 0.06, // glove reaches this far up the forearm from the wrist (m)
  inflate: 0.007, // sleeve fabric stands off the skin (m)
  gloveInflate: 0.0012,
  size: 1024,
};

async function buildArms() {
  const dir = await source('arms');
  const F = SOURCES.arms.files;
  const root = await loadFBX(path(new URL(F.fbx, dir)));
  let mesh;
  root.traverse((o) => {
    if (o.isSkinnedMesh) mesh = o;
  });
  const sk = mesh.skeleton;
  root.updateMatrixWorld(true);
  // Bones: world rest transforms without the rig's 0.1 scale.
  const p = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const s = new THREE.Vector3();
  const boneList = [];
  const index = new Map();
  const add = (b) => {
    if (!b.isBone || index.has(b)) return;
    if (b.parent?.isBone) add(b.parent);
    b.matrixWorld.decompose(p, q, s);
    index.set(b, boneList.length);
    boneList.push({ bone: b, name: b.name, parent: b.parent?.isBone ? index.get(b.parent) : -1, wp: p.clone(), wq: q.clone() });
  };
  root.traverse(add);
  const bones = boneList.map((b) => {
    if (b.parent < 0) return { name: b.name, parent: -1, t: b.wp.toArray(), r: b.wq.toArray() };
    const P = boneList[b.parent];
    const inv = P.wq.clone().invert();
    return { name: b.name, parent: b.parent, t: b.wp.clone().sub(P.wp).applyQuaternion(inv).toArray(), r: inv.multiply(b.wq).toArray() };
  });
  const ibm = new Float32Array(bones.length * 16);
  const m4 = new THREE.Matrix4();
  boneList.forEach((b, i) => {
    m4.compose(b.wp, b.wq, new THREE.Vector3(1, 1, 1)).invert();
    ibm.set(m4.elements, i * 16);
  });

  // Geometry in rest pose world space (meters), welded.
  const g = mesh.geometry;
  const n = g.attributes.position.count;
  const nm = new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  const map = new Map();
  const position = [];
  const normal = [];
  const uv = [];
  const joints = [];
  const weights = [];
  const tri = [];
  const v = new THREE.Vector3();
  const vn = new THREE.Vector3();
  const remap = sk.bones.map((b) => index.get(b));
  for (let i = 0; i < n; i++) {
    v.fromBufferAttribute(g.attributes.position, i);
    mesh.applyBoneTransform(i, v);
    v.applyMatrix4(mesh.matrixWorld);
    vn.fromBufferAttribute(g.attributes.normal, i).applyMatrix3(nm).normalize();
    const t = [g.attributes.uv.getX(i), 1 - g.attributes.uv.getY(i)];
    const key = [v.x, v.y, v.z, vn.x, vn.y, vn.z, ...t].map((x) => Math.round(x * 1e5)).join(',');
    let k = map.get(key);
    if (k === undefined) {
      k = position.length / 3;
      map.set(key, k);
      position.push(v.x, v.y, v.z);
      normal.push(vn.x, vn.y, vn.z);
      uv.push(...t);
      for (let c = 0; c < 4; c++) {
        joints.push(remap[g.attributes.skinIndex.getComponent(i, c)] ?? 0);
        weights.push(g.attributes.skinWeight.getComponent(i, c));
      }
    }
    tri.push(k);
  }
  if (mesh.matrixWorld.determinant() < 0) for (let i = 0; i < tri.length; i += 3) [tri[i + 1], tri[i + 2]] = [tri[i + 2], tri[i + 1]];
  const count = position.length / 3;

  // Glove vs sleeve per vertex: distance along the forearm from the wrist (hand side > 0).
  const wpOf = (name) => boneList.find((b) => b.name === name).wp;
  const sides = ['R', 'L'].map((S) => {
    const elbow = wpOf(`forearm${S}`);
    const wrist = wpOf(`forearm${S}_end`);
    return { elbow, wrist, dir: wrist.clone().sub(elbow).normalize(), S };
  });
  const handBone = new Set(boneList.map((b, i) => (/^(hand|palm|f_|thumb)/.test(b.name) ? i : -1)).filter((i) => i >= 0));
  const glove = new Float32Array(count);
  const palmSide = new Float32Array(count);
  const along = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    v.fromArray(position, i * 3);
    const side = sides[v.x >= 0 ? 0 : 1];
    const d = v.clone().sub(side.wrist).dot(side.dir);
    along[i] = d;
    let handW = 0;
    for (let c = 0; c < 4; c++) if (handBone.has(joints[i * 4 + c])) handW += weights[i * 4 + c];
    const gl = Math.max(handW > 0.5 ? 1 : 0, Math.min(1, Math.max(0, (d + ARMS.cuff) / 0.004 + 0.5)));
    glove[i] = gl;
  }
  // Palm side: the normal against the back of the hand (the rest pose has palms facing down-in).
  for (const side of sides) {
    const hand = wpOf(`hand${side.S}`);
    const idx = wpOf(`f_index01${side.S}`);
    const pinky = wpOf(`f_pinky01${side.S}`);
    const fwd = idx.clone().add(pinky).multiplyScalar(0.5).sub(hand).normalize();
    const across = idx.clone().sub(pinky).normalize();
    let back = fwd.clone().cross(across).normalize();
    // The back of the hand faces away from the thumb tip's side... decide by the thumb.
    const thumb = wpOf(`thumb03${side.S}`).clone().sub(hand);
    if (back.dot(thumb) > 0) back.negate();
    for (let i = 0; i < count; i++) {
      if ((position[i * 3] >= 0) !== (side.S === 'R') || glove[i] < 0.5) continue;
      vn.fromArray(normal, i * 3);
      palmSide[i] = Math.min(1, Math.max(0, -vn.dot(back) * 1.6));
    }
  }
  // Sleeve fabric off the skin; the glove a hair.
  for (let i = 0; i < count; i++) {
    const k = ARMS.gloveInflate * glove[i] + ARMS.inflate * (1 - glove[i]);
    for (let c = 0; c < 3; c++) position[i * 3 + c] += normal[i * 3 + c] * k;
  }

  // Paint: color + normal from the surface (skin texture detail kept on the gloves).
  const W = ARMS.size;
  const skin = await rawImage(path(new URL(F.skin, dir)), W);
  const skinLum = new Float32Array(W * W);
  for (let i = 0; i < W * W; i++) skinLum[i] = (0.3 * skin.data[i * 4] + 0.59 * skin.data[i * 4 + 1] + 0.11 * skin.data[i * 4 + 2]) / 255;
  // Detail = skin luminance minus its blur (wrinkles, knuckles, nails), sampled at the original uv.
  const blur = await sharp(Buffer.from(Uint8Array.from(skinLum, (x) => Math.round(x * 255))), { raw: { width: W, height: W, channels: 1 } })
    .blur(6)
    .extractChannel(0)
    .raw()
    .toBuffer();
  const detailAt = (u, vv) => {
    const x = Math.min(W - 1, Math.max(0, Math.floor(u * W)));
    const y = Math.min(W - 1, Math.max(0, Math.floor(vv * W)));
    return skinLum[y * W + x] - blur[y * W + x] / 255;
  };
  const colorBuf = new Uint8Array(W * W * 4);
  const normalBuf = new Uint8Array(W * W * 4);
  const origUV = new Float32Array(uv);
  const height = (x, y, z, gl, al) => {
    // Sleeve: creases around the arm (bunched fabric near the wrist and elbow) + weave.
    const folds = fbm3(x * 28, y * 28, z * 28, 3) * 0.6 + Math.sin(al * 140 + fbm3(x * 9, y * 9, z * 9, 2) * 5) * 0.4;
    const weave = Math.sin(x * 2600) * Math.sin(y * 2600 + z * 2600) * 0.05;
    const sleeveH = (folds * 0.0011 + weave * 0.0002) * (1 - gl);
    // Glove: knuckle pads and seams come from the skin detail; a velcro strap at the cuff.
    const strap = gl * (al < -ARMS.cuff + 0.035 ? 0.0006 : 0);
    return sleeveH + strap + gl * fbm3(x * 180, y * 180, z * 180, 2) * 0.00008;
  };
  const attrs = [
    { array: position, size: 3 },
    { array: normal, size: 3 },
    { array: glove, size: 1 },
    { array: palmSide, size: 1 },
    { array: along, size: 1 },
    { array: origUV, size: 2 },
  ];
  const T = new THREE.Vector3();
  const B = new THREE.Vector3();
  const N = new THREE.Vector3();
  const mask = paintTriangles(W, W, uv, tri, attrs, (x, y, val, t, frame) => {
    const [P, Nn, G, Pm, Al, U] = val;
    const gl = G[0];
    const o = (y * W + x) * 4;
    const n1 = fbm3(P[0] * 40, P[1] * 40, P[2] * 40, 3);
    const lin = (c8) => Math.pow(c8 / 255, 2.2);
    let c;
    if (gl > 0.5) {
      const d = detailAt(U[0], U[1]);
      const base = ARMS.glove.map((g0, k) => lin(g0 + (ARMS.palm[k] - g0) * Pm[0]));
      const strap = Al[0] < -ARMS.cuff + 0.035 && Al[0] > -ARMS.cuff + 0.012 ? 0.7 : 1;
      c = base.map((b) => b * strap * Math.max(0.3, 1 + 3.2 * d + 0.15 * n1));
    } else {
      const crease = fbm3(P[0] * 28, P[1] * 28, P[2] * 28, 3);
      c = ARMS.sleeve.map((b) => lin(b) * (1 + 0.14 * n1 - 0.25 * Math.max(0, -crease)));
    }
    for (let k = 0; k < 3; k++) colorBuf[o + k] = Math.max(0, Math.min(255, Math.round(Math.pow(Math.max(0, c[k]), 1 / 2.2) * 255)));
    colorBuf[o + 3] = 255;
    // Normal: height gradient along the surface, in the texture's tangent frame.
    N.fromArray(Nn).normalize();
    T.fromArray(frame.T);
    B.fromArray(frame.B);
    const lt = T.length() || 1;
    const lb = B.length() || 1;
    T.divideScalar(lt);
    B.divideScalar(lb);
    const e = 0.0006;
    const h0 = height(P[0], P[1], P[2], gl, Al[0]);
    const hT = height(P[0] + T.x * e, P[1] + T.y * e, P[2] + T.z * e, gl, Al[0] + e * 0.2);
    const hB = height(P[0] + B.x * e, P[1] + B.y * e, P[2] + B.z * e, gl, Al[0]);
    const dT = (hT - h0) / e;
    const dB = (hB - h0) / e;
    // Tangent space (glTF): x = +u, y = up in the image = -v, z = out.
    let nx = -dT;
    let ny = dB;
    let nz = 1;
    const l = Math.hypot(nx, ny, nz);
    nx /= l;
    ny /= l;
    nz /= l;
    normalBuf[o] = Math.round((nx * 0.5 + 0.5) * 255);
    normalBuf[o + 1] = Math.round((ny * 0.5 + 0.5) * 255);
    normalBuf[o + 2] = Math.round((nz * 0.5 + 0.5) * 255);
    normalBuf[o + 3] = 255;
  });
  bleed(colorBuf, mask, W, W, 12);
  bleed(normalBuf, mask, W, W, 12);
  const [colorKTX, normalKTX] = await Promise.all([encodeKTX2(colorBuf, W, W, 'color'), encodeKTX2(normalBuf, W, W, 'normal', { rdo: 2 })]);
  await sharp(Buffer.from(colorBuf), { raw: { width: W, height: W, channels: 4 } }).png().toFile(path(new URL('arms_preview.png', SRC)));

  const skinData = packSkin(joints, weights);
  const glb = await writeModel({
    name: 'arms',
    materials: { arms: { color: colorKTX, normal: normalKTX, roughness: 0.82, metallic: 0 } },
    nodes: [
      {
        name: 'arms_mesh',
        meshes: [
          {
            arrays: { position: new Float32Array(position), normal: new Float32Array(normal), uv: new Float32Array(uv), index: new Uint32Array(tri), joints: skinData.joints, weights: skinData.weights },
            material: 'arms',
          },
        ],
      },
    ],
    skin: { bones, ibm, node: 'arms_mesh' },
  });
  await writeFile(new URL('arms.glb', OUT), glb);
  console.log(`  arms.glb ${(glb.length / 1024).toFixed(0)} KB, ${tri.length / 3} triangles, ${bones.length} bones`);
  return { file: 'arms.glb', triangles: tri.length / 3, bones: bones.length };
}

// ---------------------------------------------------------------------------------------------
// Launcher: tube along -Z, grips down, origin on the rear sight.

async function buildLauncher() {
  const dir = await source('launcher');
  const F = SOURCES.launcher.files;
  const root = await loadFBX(path(new URL(F.fbx, dir)));
  const meshes = {};
  root.traverse((o) => {
    if (o.isMesh) meshes[o.name] = meshArrays(o);
  });
  const tube = meshes.RPG7;
  const rocket = meshes.RPG7_Rocket;
  // Frame from the tube's principal axes; scale so the tube is 0.95 m long.
  const { center, axes } = principalAxes(tube.position);
  let ax = new THREE.Vector3(...axes[0]);
  const rc = bounds(rocket).center;
  if (new THREE.Vector3(...rc).sub(new THREE.Vector3(...center)).dot(ax) < 0) ax.negate(); // rocket in front
  // Grips hang below: the second axis points toward the side with the farthest vertices.
  let down = new THREE.Vector3(...axes[1]);
  let far = 0;
  for (let i = 0; i < tube.position.length; i += 3) {
    const d = (tube.position[i] - center[0]) * down.x + (tube.position[i + 1] - center[1]) * down.y + (tube.position[i + 2] - center[2]) * down.z;
    if (Math.abs(d) > Math.abs(far)) far = d;
  }
  if (far < 0) down.negate();
  const side = new THREE.Vector3().crossVectors(down, ax).normalize(); // right-handed: x = down x forward
  down = new THREE.Vector3().crossVectors(ax, side).normalize();
  // Rows: x = side, y = -down (up), z = -ax (forward is -Z).
  const basis = new THREE.Matrix4().makeBasis(side, down.clone().negate(), ax.clone().negate()).transpose();
  const apply = (m, scale) => {
    const v = new THREE.Vector3();
    const nrm = new THREE.Vector3();
    for (let i = 0; i < m.position.length; i += 3) {
      v.set(m.position[i] - center[0], m.position[i + 1] - center[1], m.position[i + 2] - center[2]).applyMatrix4(basis).multiplyScalar(scale);
      m.position[i] = v.x;
      m.position[i + 1] = v.y;
      m.position[i + 2] = v.z;
      nrm.set(m.normal[i], m.normal[i + 1], m.normal[i + 2]).applyMatrix4(basis).normalize();
      m.normal[i] = nrm.x;
      m.normal[i + 1] = nrm.y;
      m.normal[i + 2] = nrm.z;
    }
  };
  apply(tube, 1);
  apply(rocket, 1);
  const tb = bounds(tube);
  const scale = 0.95 / tb.size[2];
  for (const m of [tube, rocket]) for (let i = 0; i < m.position.length; i++) m.position[i] *= scale;
  // Origin: the rear sight's top (the highest point near the grips); the tube axis below it.
  const t2 = bounds(tube);
  const grips = bounds(tube, (x, y) => y < t2.min[1] + 0.06);
  const sightTop = bounds(tube, (x, y) => y > t2.max[1] - 0.012);
  const top = t2.max[1];
  // Rear sight = the top bump closest to the grips.
  let best = null;
  for (let i = 0; i < tube.position.length; i += 3) {
    if (tube.position[i + 1] < top - 0.02) continue;
    const dz = Math.abs(tube.position[i + 2] - grips.center[2]);
    if (!best || dz < best.dz) best = { dz, z: tube.position[i + 2], y: tube.position[i + 1] };
  }
  const origin = [0, sightTop.max[1], best ? best.z : grips.center[2]];
  translateArrays(tube, ...origin);
  translateArrays(rocket, ...origin);
  const fin = bounds(tube);
  const rb = bounds(rocket);
  // Tube axis height: the middle of the tube's cross-section at the front.
  const front = bounds(tube, (x, y, z) => z < fin.min[2] + 0.04);
  const markers = {
    tubeY: r4(front.center[1]),
    tubeRadius: r4(front.size[0] / 2),
    front: r4(fin.min[2]),
    rear: r4(fin.max[2]),
    rocket: v3([rb.center[0], rb.center[1], rb.max[2]]),
    rocketLength: r4(rb.size[2]),
    grips: grips.size[2] > 0 ? { min: r4(grips.min[2]), max: r4(grips.max[2]), bottom: r4(grips.min[1]) } : null,
  };
  // The rocket: its own node with the pivot at its rear end (it slides into the tube).
  const rocketPivot = markers.rocket;
  translateArrays(rocket, ...rocketPivot);
  const T = 1024;
  const color = await rawImage(path(new URL(F.color, dir)), T);
  const colorKTX = await encodeKTX2(color.data, T, T, 'color');
  const glb = await writeModel({
    name: 'launcher',
    extras: { markers },
    materials: { launcher: { color: colorKTX, roughness: 0.7, metallic: 0 } },
    nodes: [
      { name: 'tube', meshes: [{ arrays: creaseNormals(tube, 0.75), material: 'launcher' }] },
      { name: 'rocket', t: rocketPivot, children: [{ name: 'rocket_mesh', meshes: [{ arrays: creaseNormals(rocket, 0.75), material: 'launcher' }] }] },
    ],
  });
  await writeFile(new URL('launcher.glb', OUT), glb);
  console.log(`  launcher.glb ${(glb.length / 1024).toFixed(0)} KB`, JSON.stringify(markers));
  return { file: 'launcher.glb', triangles: (tube.index.length + rocket.index.length) / 3, markers };
}

// ---------------------------------------------------------------------------------------------
// Truck: the pickup body + 4 wheels, real size, front toward -Z; flat colors become PBR roles.

// Source material -> role (the game gives each role its look: TruckView.js). Some source
// materials cover two things; `split` sorts them by where the triangle is (wheel node or not,
// height above the ground in meters).
const TRUCK_ROLES = {
  M_0136_Charcoal: 'paint',
  M_0135_DarkGray: 'cladding', // the lower two-tone: bumpers, arches, sills
  M_0132_LightGray: 'glass',
  Color_L05: (t) => (t.y > 1.15 ? 'glass' : 'wheelwell'),
  Color_M08: (t) => (t.wheel ? 'rubber' : 'trim'),
  Color_M06: (t) => (t.wheel ? 'rim' : 'trim'),
  M_0137_Black: (t) => (t.wheel ? 'hub' : 'trim'),
  M_0130_Gainsboro: 'lamp',
  Color_M00: 'lamp',
  Color_D05: 'indicator',
  Color_A05: 'taillight',
  M_0010_Snow: 'chrome',
  Color_M02: (t) => (Math.abs(t.x) < 0.12 && t.z < -2.3 ? null : 'chrome'), // null: the maker's badge on the grille
  FrontColor: 'trim', // running boards
  M_0134_DimGray: 'trim', // bed rail caps
};

async function buildTruck() {
  const dir = await source('truck');
  const io = new NodeIO();
  const doc = await io.read(path(new URL(SOURCES.truck.files.glb, dir)));
  const parts = []; // { node, material, arrays }
  for (const node of doc.getRoot().listNodes()) {
    const mesh = node.getMesh();
    if (!mesh) continue;
    const m = new THREE.Matrix4().fromArray(node.getWorldMatrix());
    const nm = new THREE.Matrix3().getNormalMatrix(m);
    for (const prim of mesh.listPrimitives()) {
      const P = prim.getAttribute('POSITION');
      const Nn = prim.getAttribute('NORMAL');
      const idx = prim.getIndices();
      const position = new Float32Array(P.getCount() * 3);
      const normal = new Float32Array(P.getCount() * 3);
      const v = new THREE.Vector3();
      for (let i = 0; i < P.getCount(); i++) {
        v.fromArray(P.getElement(i, [])).applyMatrix4(m);
        position.set([v.x, v.y, v.z], i * 3);
        if (Nn) v.fromArray(Nn.getElement(i, [])).applyMatrix3(nm).normalize();
        normal.set([v.x, v.y, v.z], i * 3);
      }
      const index = idx ? new Uint32Array(idx.getArray()) : new Uint32Array(P.getCount()).map((_, i) => i);
      const matName = prim.getMaterial()?.getName() ?? '';
      parts.push({ node: node.getName(), material: matName, arrays: { position, normal, uv: new Float32Array(P.getCount() * 2), index } });
    }
  }
  // Frame: longest horizontal axis = length. The source is Y-up.
  const all = mergeArrays(parts.map((p) => p.arrays));
  const b = bounds(all);
  const alongX = b.size[0] > b.size[2];
  const scale = TRUCK_MODEL.length / Math.max(b.size[0], b.size[2]);
  // Wheels: the nodes whose geometry is a small round thing low down (4 separate meshes).
  const byNode = new Map();
  for (const p of parts) {
    if (!byNode.has(p.node)) byNode.set(p.node, []);
    byNode.get(p.node).push(p);
  }
  const nodeBounds = [...byNode.entries()].map(([name, ps]) => ({ name, b: bounds(mergeArrays(ps.map((p) => p.arrays))) }));
  const wheelNodes = nodeBounds.filter((n) => n.b.size[1] > b.size[1] * 0.25 && n.b.max[1] < b.min[1] + b.size[1] * 0.5).map((n) => n.name);
  // Front: the end with the windshield further from it (the bed is long and flat at the back):
  // the cab (glass) center lies in front of the middle.
  const glass = bounds(mergeArrays(parts.filter((p) => p.material === 'M_0132_LightGray').map((p) => p.arrays)));
  const ax = alongX ? 0 : 2;
  const frontSign = glass.center[ax] < b.center[ax] ? -1 : 1; // -1: front is toward -axis
  const xf = new THREE.Matrix4();
  // Map: source length axis -> -Z toward the front; source up = +Y.
  const yaw = alongX ? (frontSign > 0 ? Math.PI / 2 : -Math.PI / 2) : frontSign > 0 ? Math.PI : 0;
  xf.makeRotationY(yaw).multiply(new THREE.Matrix4().makeScale(scale, scale, scale)).multiply(new THREE.Matrix4().makeTranslation(-b.center[0], -b.min[1], -b.center[2]));
  const nm = new THREE.Matrix3().getNormalMatrix(xf);
  const v = new THREE.Vector3();
  for (const p of parts) {
    const a = p.arrays;
    for (let i = 0; i < a.position.length; i += 3) {
      v.fromArray(a.position, i).applyMatrix4(xf);
      a.position.set([v.x, v.y, v.z], i);
      v.fromArray(a.normal, i).applyMatrix3(nm).normalize();
      a.normal.set([v.x, v.y, v.z], i);
    }
  }
  // Roles per triangle (see TRUCK_ROLES); the badge is dropped.
  const kept = [];
  let dropped = 0;
  for (const p of parts) {
    const rule = TRUCK_ROLES[p.material] ?? 'trim';
    const wheel = wheelNodes.includes(p.node);
    const byRole = new Map();
    const a = p.arrays;
    const t = { x: 0, y: 0, z: 0, wheel };
    for (let k = 0; k < a.index.length; k += 3) {
      t.x = t.y = t.z = 0;
      for (let c = 0; c < 3; c++) {
        t.x += a.position[a.index[k + c] * 3] / 3;
        t.y += a.position[a.index[k + c] * 3 + 1] / 3;
        t.z += a.position[a.index[k + c] * 3 + 2] / 3;
      }
      const role = typeof rule === 'function' ? rule(t) : rule;
      if (!role) {
        dropped++;
        continue;
      }
      if (!byRole.has(role)) byRole.set(role, []);
      byRole.get(role).push(a.index[k], a.index[k + 1], a.index[k + 2]);
    }
    for (const [role, idx] of byRole) kept.push({ ...p, role, arrays: { ...a, index: new Uint32Array(idx) } });
  }
  if (dropped) console.log(`  dropped the badge (${dropped} triangles)`);
  if (process.env.DEBUG_TRUCK) {
    for (const p of kept) {
      const pb = bounds(p.arrays, null);
      console.log(`  ${p.node} ${p.material.padEnd(18)} ${p.role.padEnd(10)} tris ${String(p.arrays.index.length / 3).padStart(4)} center ${pb.center.map((x) => x.toFixed(2)).join(',')}`);
    }
  }
  const roles = [...new Set(kept.map((p) => p.role))];
  const nodes = [];
  const bodyMeshes = [];
  for (const role of roles) {
    const ps = kept.filter((p) => p.role === role && !wheelNodes.includes(p.node));
    if (ps.length) bodyMeshes.push({ arrays: creaseNormals(mergeArrays(ps.map((p) => p.arrays)), 0.7), material: role });
  }
  nodes.push({ name: 'body', meshes: bodyMeshes });
  const wheels = [];
  for (const w of wheelNodes) {
    const ps = kept.filter((p) => p.node === w);
    const wb = bounds(mergeArrays(ps.map((p) => p.arrays)));
    const c = wb.center;
    const meshesW = [];
    for (const role of roles) {
      const rp = ps.filter((p) => p.role === role);
      if (!rp.length) continue;
      const arr = mergeArrays(rp.map((p) => p.arrays));
      translateArrays(arr, ...c);
      meshesW.push({ arrays: creaseNormals(arr, 0.7), material: role });
    }
    const name = `wheel_${c[2] < 0 ? 'f' : 'r'}${c[0] < 0 ? 'l' : 'r'}`;
    wheels.push({ name, center: v3(c), radius: r4(wb.size[1] / 2) });
    nodes.push({ name, t: c, children: [{ name: `${name}_mesh`, meshes: meshesW }] });
  }
  const materials = {};
  for (const role of roles) materials[role] = { roughness: 1, metallic: 0 }; // the game sets the look
  const glb = await writeModel({ name: 'truck', extras: { wheels }, materials, nodes });
  await writeFile(new URL('truck.glb', OUT), glb);
  const fb = bounds(mergeArrays(kept.map((p) => p.arrays)));
  console.log(`  truck.glb ${(glb.length / 1024).toFixed(0)} KB, size ${fb.size.map((x) => x.toFixed(2)).join(' x ')}, wheels ${wheels.map((w) => w.name).join(' ')}`);
  return { file: 'truck.glb', size: v3(fb.size), wheels };
}

// ---------------------------------------------------------------------------------------------

const BUILDERS = { rifle: buildRifle, arms: buildArms, launcher: buildLauncher, truck: buildTruck };

async function main() {
  await mkdir(OUT, { recursive: true });
  const want = process.argv.slice(2);
  const ids = want.length ? want : Object.keys(BUILDERS);
  const manifestUrl = new URL('manifest.json', OUT);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8').catch(() => '{}'));
  manifest.models ??= {};
  for (const id of ids) {
    if (!BUILDERS[id]) throw new Error(`unknown model ${id} (${Object.keys(BUILDERS).join(', ')})`);
    console.log(id);
    const t0 = Date.now();
    const info = await BUILDERS[id]();
    const s = SOURCES[id];
    manifest.models[id] = { ...info, source: { title: s.title, author: s.author, license: s.license, licenseUrl: s.licenseUrl, url: s.page } };
    console.log(`  ${((Date.now() - t0) / 1000).toFixed(1)} s`);
  }
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 2) + '\n');
  await writeCredits();
}

await main();
