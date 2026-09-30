// Converts the Mixamo downloads (assets-src/mixamo/, see DOWNLOADS.md) into the game's
// compressed character files in public/assets/characters/:
//   <id>.glb        one skinned mesh per character: LOD0-2 share one vertex buffer, one
//                   material with a packed color + normal atlas (KTX2), recolored per role
//   anims.bin       every clip, on the shared Mixamo skeleton (see lib/animbin.mjs)
//   manifest.json   characters (role, size, head/chest boxes, parts) + clip data (loop,
//                   speed for locomotion, IK, events) + the rifle grip
//   npm run assets:characters [id ...]      (ids from characters.config.mjs; no ids = all)
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import * as THREE from 'three';
import { loadFBX } from './lib/fbx.mjs';
import { extractSkeleton, mergeMeshes, inverseBinds, wrapUVs } from './lib/rig.mjs';
import { buildAtlas, rasterize, dilate, isSkin } from './lib/atlas.mjs';
import { removeHidden } from './lib/hidden.mjs';
import { buildLods } from './lib/lod.mjs';
import { writeCharacter } from './lib/glb.mjs';
import { encodeLibrary } from './lib/animbin.mjs';
import { sampleClip, removeDrift, alignFootPhase, closeLoop, crossfadeLoop, handTargets, peakSpeedTime, worldPos } from './lib/anim.mjs';
import { encodeKTX2 } from './ktx2.mjs';
import { CHARACTERS, CLIPS, CLIP_SOURCES, PART } from './characters.config.mjs';
import { writeCredits } from './credits.mjs';

const SRC = new URL('../../assets-src/mixamo/', import.meta.url);
const OUT = new URL('../../public/assets/characters/', import.meta.url);
const path = (u) => fileURLToPath(u);

const exists = (u) => access(u).then(() => true, () => false);

function textureKey(t) {
  const b = t?.userData.bytes;
  if (!b) return null;
  let h = b.length;
  for (let i = 0; i < b.length; i += Math.max(1, Math.floor(b.length / 4096))) h = (h * 31 + b[i]) >>> 0;
  return `${b.length}:${h}`;
}

function lumOf(r, g, b) {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** Recolor rules on the atlas pixels (luminance kept, hue replaced; contrast < 1 flattens camo). */
function recolor(color, W, H, rules, maskMat, maskPart, materials) {
  for (const rule of rules) {
    const mats = rule.material ? materials.map((m, i) => (rule.material.test(m.name) ? i + 1 : 0)).filter(Boolean) : null;
    const target = rule.to;
    const tl = lumOf(...target) || 1;
    const amount = rule.amount ?? 1;
    const contrast = rule.contrast ?? 1;
    const gain = rule.gain ?? 1;
    // Average luminance of the affected pixels (contrast pivots around it).
    const affected = (i) => (mats ? mats.includes(maskMat[i]) : rule.parts.includes(maskPart[i] - 1));
    let sum = 0;
    let n = 0;
    for (let i = 0; i < W * H; i++) {
      if (!affected(i)) continue;
      sum += lumOf(color[i * 4], color[i * 4 + 1], color[i * 4 + 2]);
      n++;
    }
    const mean = n ? sum / n : 128;
    for (let i = 0; i < W * H; i++) {
      if (!affected(i)) continue;
      const o = i * 4;
      const r = color[o], g = color[o + 1], b = color[o + 2];
      if (rule.skipSkin && isSkin(r, g, b)) continue;
      let l = lumOf(r, g, b);
      l = (mean + (l - mean) * contrast) * gain;
      if (rule.clampLum) l = Math.min(l, mean * rule.clampLum); // flattens bright prints / lettering
      const k = l / tl;
      color[o] = Math.min(255, r + (target[0] * k - r) * amount);
      color[o + 1] = Math.min(255, g + (target[1] * k - g) * amount);
      color[o + 2] = Math.min(255, b + (target[2] * k - b) * amount);
    }
  }
}

/**
 * Removes small bright marks (printed lettering, logos) from a material's texels: pixels much
 * brighter than their neighborhood take the neighborhood's average color.
 */
function despeckle(color, W, H, maskMat, materials, { material, radius = 12, factor = 1.35, add = 16 }) {
  const mats = materials.map((m, i) => (material.test(m.name) ? i + 1 : 0)).filter(Boolean);
  const S = W + 1;
  const sums = [0, 1, 2, 3].map(() => new Float64Array(S * (H + 1)));
  for (let y = 0; y < H; y++) {
    const row = [0, 0, 0, 0];
    for (let x = 0; x < W; x++) {
      const o = (y * W + x) * 4;
      const v = [color[o], color[o + 1], color[o + 2], lumOf(color[o], color[o + 1], color[o + 2])];
      for (let k = 0; k < 4; k++) {
        row[k] += v[k];
        sums[k][(y + 1) * S + x + 1] = sums[k][y * S + x + 1] + row[k];
      }
    }
  }
  const box = (k, x0, y0, x1, y1) => (sums[k][y1 * S + x1] - sums[k][y0 * S + x1] - sums[k][y1 * S + x0] + sums[k][y0 * S + x0]) / ((x1 - x0) * (y1 - y0));
  let n = 0;
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = y * W + x;
      if (!mats.includes(maskMat[i])) continue;
      const x0 = Math.max(0, x - radius), x1 = Math.min(W, x + radius + 1), y0 = Math.max(0, y - radius), y1 = Math.min(H, y + radius + 1);
      const mean = box(3, x0, y0, x1, y1);
      const o = i * 4;
      if (lumOf(color[o], color[o + 1], color[o + 2]) <= mean * factor + add) continue;
      color[o] = box(0, x0, y0, x1, y1);
      color[o + 1] = box(1, x0, y0, x1, y1);
      color[o + 2] = box(2, x0, y0, x1, y1);
      n++;
    }
  }
  return n;
}

/** Box (min/max) of the vertices a bone dominates, in that bone's rest local space. */
function boneBox(geo, index, skeleton, names) {
  const ids = names.map((n) => skeleton.bones.findIndex((b) => b.name === n)).filter((i) => i >= 0);
  if (!ids.length) return null;
  const inv = skeleton.bones[ids[0]].world.clone().invert();
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const v = new THREE.Vector3();
  const used = new Uint8Array(geo.count);
  for (const i of index) used[i] = 1;
  let n = 0;
  for (let i = 0; i < geo.count; i++) {
    if (!used[i]) continue;
    let best = 0;
    for (let k = 1; k < 4; k++) if (geo.weights[i * 4 + k] > geo.weights[i * 4 + best]) best = k;
    if (!ids.includes(geo.joints[i * 4 + best]) || geo.weights[i * 4 + best] < 0.5) continue;
    v.fromArray(geo.position, i * 3).applyMatrix4(inv);
    min.min(v);
    max.max(v);
    n++;
  }
  return n ? { min: min.toArray().map((x) => +x.toFixed(4)), max: max.toArray().map((x) => +x.toFixed(4)) } : null;
}

/**
 * Head measurements in the Head bone's rest frame (+Y up, +Z the face, +X the left ear), from
 * the vertices the head dominates (hair cards left out): skull box, chin, crown, eye line and
 * the forehead ring (headbands, hat brims).
 */
function headInfo(geo, index, skeleton) {
  const hb = skeleton.bones.findIndex((b) => b.name === 'Head');
  if (hb < 0) return null;
  const ids = ['Head', 'HeadTop_End'].map((n) => skeleton.bones.findIndex((b) => b.name === n));
  const inv = skeleton.bones[hb].world.clone().invert();
  const used = new Uint8Array(geo.count);
  for (const i of index) used[i] = 1;
  const pts = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < geo.count; i++) {
    if (!used[i] || geo.part[i] === PART.hair) continue;
    let best = 0;
    for (let k = 1; k < 4; k++) if (geo.weights[i * 4 + k] > geo.weights[i * 4 + best]) best = k;
    if (!ids.includes(geo.joints[i * 4 + best]) || geo.weights[i * 4 + best] < 0.5) continue;
    pts.push(v.fromArray(geo.position, i * 3).applyMatrix4(inv).toArray());
  }
  if (!pts.length) return null;
  const min = [0, 1, 2].map((k) => Math.min(...pts.map((p) => p[k])));
  const max = [0, 1, 2].map((k) => Math.max(...pts.map((p) => p[k])));
  const midZ = (min[2] + max[2]) / 2;
  const face = pts.filter((p) => p[2] > midZ && Math.abs(p[0]) < 0.04).map((p) => p[1]).sort((a, b) => a - b);
  const chinY = face.length ? face[Math.floor(face.length * 0.03)] : min[1];
  const topY = max[1];
  const eyeY = chinY + (topY - chinY) * 0.5;
  // Forehead ring: the skull's extent a little above the eyes.
  const ringY = eyeY + (topY - eyeY) * 0.3;
  const ring = pts.filter((p) => Math.abs(p[1] - ringY) < 0.012);
  const rx = ring.length ? Math.max(...ring.map((p) => Math.abs(p[0]))) : (max[0] - min[0]) / 2;
  const zs = ring.map((p) => p[2]);
  const ringZ0 = zs.length ? Math.min(...zs) : min[2];
  const ringZ1 = zs.length ? Math.max(...zs) : max[2];
  const r4 = (x) => +x.toFixed(4);
  return {
    min: min.map(r4),
    max: max.map(r4),
    chinY: r4(chinY),
    topY: r4(topY),
    eyeY: r4(eyeY),
    front: r4(max[2]),
    ring: { y: r4(ringY), cz: r4((ringZ0 + ringZ1) / 2), rx: r4(rx), rz: r4((ringZ1 - ringZ0) / 2) },
    _pts: pts,
  };
}

/**
 * Paints a face covering into the atlas over the head's skin (a knitted balaclava with an
 * eye slit, or a cloth wrap over the lower face), following the face exactly.
 */
function paintFaceCover(color, W, H, geo, index, skeleton, head, cover) {
  const hb = skeleton.bones.findIndex((b) => b.name === 'Head');
  const ids = ['Head', 'HeadTop_End', 'Neck', 'Neck1'].map((n) => skeleton.bones.findIndex((b) => b.name === n));
  const inv = skeleton.bones[hb].world.clone().invert();
  const v = new THREE.Vector3();
  const local = (i) => v.fromArray(geo.position, i * 3).applyMatrix4(inv);
  const mask = new Uint8Array(W * H);
  const onHead = (i) => {
    let best = 0;
    for (let k = 1; k < 4; k++) if (geo.weights[i * 4 + k] > geo.weights[i * 4 + best]) best = k;
    return ids.includes(geo.joints[i * 4 + best]) && geo.part[i] === PART.fixed;
  };
  const band = cover.slit ?? 0.021;
  rasterize(mask, W, H, geo.uvAtlas, index, (a, b, c) => {
    if (!onHead(a) || !onHead(b) || !onHead(c)) return false;
    const p = [a, b, c].map((i) => local(i).clone());
    const y = (p[0].y + p[1].y + p[2].y) / 3;
    const z = (p[0].z + p[1].z + p[2].z) / 3;
    const x = (p[0].x + p[1].x + p[2].x) / 3;
    const eyes = Math.abs(y - head.eyeY - (cover.eyeOffset ?? 0)) < band && z > head.front - 0.07 && Math.abs(x) < (cover.eyeHalfWidth ?? 0.075);
    if (cover.type === 'lower') return y < head.eyeY - band + (cover.eyeOffset ?? 0) && (z > head.front - 0.11 || y < head.chinY + 0.02);
    return !eyes && y > head.chinY - 0.09;
  }, 1);
  dilate(mask, W, H, 2);
  const [r0, g0, b0] = cover.color;
  for (let i = 0; i < W * H; i++) {
    if (!mask[i]) continue;
    const o = i * 4;
    // Keep a little of the shading (folds), lose the skin tone.
    const l = lumOf(color[o], color[o + 1], color[o + 2]) / 255;
    const k = 0.75 + l * 0.5;
    color[o] = Math.min(255, r0 * k);
    color[o + 1] = Math.min(255, g0 * k);
    color[o + 2] = Math.min(255, b0 * k);
  }
}

async function buildCharacter(id, cfg) {
  const t0 = Date.now();
  const root = await loadFBX(path(new URL(`characters/${cfg.src}.fbx`, SRC)));
  const skeleton = extractSkeleton(root, { height: cfg.height });
  const partOf = (mesh, mat) => {
    if (cfg.hairMaterial && cfg.hairMaterial.test(mat.name)) return PART.hair;
    for (const [re, p] of cfg.parts ?? []) if (re.test(mesh.name)) return p;
    return PART.fixed;
  };
  const keep = (mesh, mat) => !(cfg.drop && (cfg.drop.test(mesh.name) || cfg.drop.test(mat.name)));
  const geo = mergeMeshes(root, skeleton, { keep, partOf });
  const wrappedTris = wrapUVs(geo);

  // Distinct textures (materials often share one atlas already).
  const textures = [];
  const matTexture = geo.materials.map((m) => {
    const key = textureKey(m.map) ?? `flat:${m.color.getHexString()}`;
    let i = textures.findIndex((t) => t.key === key);
    if (i < 0) {
      const hair = cfg.hairMaterial ? false : /hair/i.test(m.name);
      const w = m.map?.userData.bytes ? null : 64;
      let size = cfg.sizes?.[m.name] ?? (hair ? cfg.hair ?? cfg.size / 2 : cfg.size);
      if (cfg.smallSize && !cfg.sizes?.[m.name]) size = cfg.smallSize;
      if (w) size = 64;
      i = textures.push({ key, color: m.map?.userData.bytes ?? null, normal: m.normalMap?.userData.bytes ?? null, size, flat: [...m.color.toArray().map((c) => Math.round(Math.pow(c, 1 / 2.2) * 255)), 255] }) - 1;
    } else if (!textures[i].normal && m.normalMap?.userData.bytes) textures[i].normal = m.normalMap.userData.bytes;
    return i;
  });

  // Hidden skin under clothes.
  let index = geo.index;
  let removed = 0;
  if (cfg.body && cfg.cover) {
    const r = removeHidden(geo, (i) => cfg.body.test(geo.meshName[i]), (i) => cfg.cover.test(geo.meshName[i]));
    index = r.index;
    removed = r.removed;
  }

  const atlas = await buildAtlas(textures, geo, matTexture, { normalScale: cfg.normalScale ?? 0.5 });
  geo.uvAtlas = atlas.uv;
  const { W, H } = atlas;

  // Masks (material / part per atlas pixel) for recoloring and alpha.
  const maskMat = new Uint8Array(W * H);
  const maskPart = new Uint8Array(W * H);
  for (let m = 0; m < geo.materials.length; m++) rasterize(maskMat, W, H, atlas.uv, index, (a) => geo.mat[a] === m, m + 1);
  for (let p = 0; p <= 5; p++) rasterize(maskPart, W, H, atlas.uv, index, (a) => geo.part[a] === p, p + 1);
  dilate(maskMat, W, H, 3);
  dilate(maskPart, W, H, 3);
  if (cfg.despeckle) despeckle(atlas.color, W, H, maskMat, geo.materials, cfg.despeckle);
  if (cfg.recolor) recolor(atlas.color, W, H, cfg.recolor, maskMat, maskPart, geo.materials);
  const head = headInfo(geo, index, skeleton);
  if (cfg.faceCover && head) paintFaceCover(atlas.color, W, H, geo, index, skeleton, head, cfg.faceCover);
  if (head) delete head._pts;
  // Mean linear luminance per part (the game's tints recolor relative to it).
  const lin = (c) => ((c /= 255) <= 0.04045 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4));
  const partLum = [0, 0, 0, 0, 0, 0].map((_, p) => {
    let sum = 0;
    let n = 0;
    for (let i = 0; i < W * H; i += 7) {
      if (maskPart[i] - 1 !== p || (p === PART.hair && atlas.color[i * 4 + 3] < 128)) continue;
      sum += 0.2126 * lin(atlas.color[i * 4]) + 0.7152 * lin(atlas.color[i * 4 + 1]) + 0.0722 * lin(atlas.color[i * 4 + 2]);
      n++;
    }
    return n ? +(sum / n).toFixed(4) : 0.3;
  });
  // Alpha only where hair cards are (elsewhere opaque: no holes at UV seams in the mips).
  let hasAlpha = false;
  for (let i = 0; i < W * H; i++) {
    if (maskPart[i] - 1 === PART.hair) {
      if (atlas.color[i * 4 + 3] < 250) hasAlpha = true;
    } else atlas.color[i * 4 + 3] = 255;
  }

  const lodTargets = cfg.lods ?? [10000, 3200, 1100];
  const { geo: final, lods } = buildLods(geo, index, lodTargets);

  // Chest box (vests).
  const chest = boneBox(final, lods[0], skeleton, ['Spine2', 'Spine1']);
  const hipsY = skeleton.bones.find((b) => b.name === 'Hips').world.elements[13];
  const topY = skeleton.bones.find((b) => b.name === 'HeadTop_End').world.elements[13];

  const [colorKTX2, normalKTX2] = await Promise.all([
    encodeKTX2(new Uint8Array(atlas.color.buffer, atlas.color.byteOffset, atlas.color.length), W, H, 'color'),
    encodeKTX2(new Uint8Array(atlas.normal.buffer, atlas.normal.byteOffset, atlas.normal.length), atlas.nW, atlas.nH, 'normal', { rdo: 3 }),
  ]);
  const info = {
    role: cfg.role,
    sex: cfg.sex,
    height: +topY.toFixed(3),
    hips: +hipsY.toFixed(4),
    head,
    chest,
    parts: [...new Set(final.part)].sort(),
    partLum,
    tris: lods.map((l) => l.length / 3),
    alpha: hasAlpha,
    vest: !!cfg.addVest,
  };
  const glb = await writeCharacter({
    name: id,
    bones: skeleton.bones,
    ibm: inverseBinds(skeleton.bones),
    geo: final,
    lods,
    colorKTX2,
    normalKTX2,
    extras: info,
    alphaTest: hasAlpha ? 0.5 : 0,
  });
  await writeFile(new URL(`${id}.glb`, OUT), glb);
  console.log(
    `${id.padEnd(15)} ${(glb.length / 1024).toFixed(0).padStart(5)} KB  tris ${geo.index.length / 3} -> ${info.tris.join('/')} (hidden ${removed})  atlas ${W}x${H} (${(colorKTX2.length / 1024).toFixed(0)} KB) normal ${atlas.nW}x${atlas.nH} (${(normalKTX2.length / 1024).toFixed(0)} KB)${hasAlpha ? ' +alpha' : ''}${wrappedTris ? ` wrapped ${wrappedTris} tris` : ''}  verts ${final.count}  h ${info.height}${skeleton.aliases ? `  aliased ${skeleton.aliases} bones (drift ${skeleton.aliasDrift.toFixed(4)})` : ''}  bindDrift ${geo.bindDrift.toExponential(1)}${atlas.wrapped ? `  WRAPPED UVs ${atlas.wrapped}` : ''}  ${((Date.now() - t0) / 1000).toFixed(1)}s`,
  );
  return info;
}

async function buildAnimations() {
  const ybot = await loadFBX(path(new URL('characters/YBot.fbx', SRC)));
  const skeleton = extractSkeleton(ybot);
  const hips = skeleton.bones.find((b) => b.name === 'Hips').world.elements[13];
  const clips = [];
  const meta = {};
  let rifle = null;
  for (const [name, c] of Object.entries(CLIPS)) {
    const file = new URL(`animations/${name}.fbx`, SRC);
    if (!(await exists(file))) {
      console.warn(`missing ${name}.fbx`);
      continue;
    }
    const root = await loadFBX(path(file));
    const fps = c.fps ?? 30;
    const trim = c.maxLoop ? [0, c.maxLoop + 1] : c.trim;
    const s = sampleClip(root, { trim, fps });
    const m = { loop: !!c.loop, source: CLIP_SOURCES[name] ?? name };
    if (c.root) {
      const n = s.frames - 1;
      m.rootEnd = [+(s.hips[n * 3] - s.hips[0]).toFixed(3), +(s.hips[n * 3 + 2] - s.hips[2]).toFixed(3)];
    } else {
      const v = removeDrift(s);
      if (c.move) {
        m.speed = +Math.hypot(v.vx, v.vz).toFixed(4);
        m.dir = +Math.atan2(v.vx, v.vz).toFixed(4); // 0 = forward (+Z), +PI/2 = left... see game code
        m.phaseShift = alignFootPhase(s);
      }
      if (c.maxLoop && s.duration > c.maxLoop + 0.5) crossfadeLoop(s, c.maxLoop);
      else if (c.loop) closeLoop(s);
    }
    let ik = null;
    if (c.ik) ik = handTargets(s);
    if (c.release) m.release = +peakSpeedTime(s, c.release).toFixed(3);
    // Hips height at the start (crouch vs stand) for hit zone sanity checks.
    s.fk(0);
    m.headY = +worldPos(s, 'Head').y.toFixed(3);
    if (name === 'rifle_idle_aiming') rifle = rifleGrip(s);
    m.ik = !!c.ik;
    m.duration = +s.duration.toFixed(4);
    meta[name] = m;
    clips.push({ name, s, ik });
  }
  // Every bone of the source skeleton that any clip animates, in skeleton order.
  const animated = new Set(clips.flatMap((c) => [...c.s.rot.keys()]));
  const bones = skeleton.bones.map((b) => b.name).filter((n) => animated.has(n));
  const rest = new Map(skeleton.bones.map((b) => [b.name, b.q]));
  const { bin, index } = encodeLibrary(bones, clips, rest);
  await writeFile(new URL('anims.bin', OUT), bin);
  for (const [name, i] of Object.entries(index)) Object.assign(meta[name], i);
  console.log(`anims.bin ${(bin.length / 1024).toFixed(0)} KB, ${clips.length} clips, ${bones.length} bones`);
  const pos = (n) => new THREE.Vector3().setFromMatrixPosition(skeleton.bones.find((b) => b.name === n).world);
  const sourceArm = pos('RightArm').distanceTo(pos('RightForeArm')) + pos('RightForeArm').distanceTo(pos('RightHand'));
  return { file: 'anims.bin', sourceHips: +hips.toFixed(4), sourceArm: +sourceArm.toFixed(4), bones, clips: meta, rifle };
}

/**
 * The rifle's pose in the right hand's frame, from the source aiming pose: the grip in the
 * palm, the barrel straight ahead (the clips aim along +Z; the support wrist sits beside the
 * handguard, so the hand-to-hand line is ~30 degrees off the bore), the top up.
 */
function rifleGrip(s) {
  s.fk(0);
  const rh = s.bones.get('RightHand');
  const p = (n) => worldPos(s, n);
  const grip = p('RightHand').lerp(p('RightHandMiddle1'), 0.55);
  const fwd = new THREE.Vector3(0, 0, 1);
  const up = new THREE.Vector3(0, 1, 0);
  const x = new THREE.Vector3().crossVectors(up, fwd).normalize();
  const y = new THREE.Vector3().crossVectors(fwd, x).normalize();
  const world = new THREE.Matrix4().makeBasis(x, y, fwd).setPosition(grip);
  const handWorld = rh.matrixWorld.clone();
  handWorld.elements[12] *= s.unit;
  handWorld.elements[13] *= s.unit;
  handWorld.elements[14] *= s.unit;
  const local = handWorld.invert().multiply(world);
  const t = new THREE.Vector3();
  const q = new THREE.Quaternion();
  const sc = new THREE.Vector3();
  local.decompose(t, q, sc);
  return { position: t.toArray().map((v) => +v.toFixed(4)), quaternion: q.toArray().map((v) => +v.toFixed(5)), handguard: +p('LeftHand').distanceTo(grip).toFixed(3) };
}

await mkdir(OUT, { recursive: true });
const only = process.argv.slice(2);
const manifestUrl = new URL('manifest.json', OUT);
const manifest = JSON.parse(await readFile(manifestUrl, 'utf8').catch(() => '{"characters":{}}'));
manifest.version = 1;
for (const [id, cfg] of Object.entries(CHARACTERS)) {
  if (only.length && !only.includes(id)) continue;
  manifest.characters[id] = { file: `${id}.glb`, source: cfg.mixamo ?? cfg.src, credit: cfg.credit ?? 'clothes recolored per person in game', ...(await buildCharacter(id, cfg)) };
}
if (!only.length || only.includes('anims')) manifest.anims = await buildAnimations();
await writeFile(manifestUrl, JSON.stringify(manifest, null, 1));
await writeCredits();
