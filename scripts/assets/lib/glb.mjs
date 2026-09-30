// Writes the game's character GLBs with glTF-Transform: quantized attributes,
// EXT_meshopt_compression (three: MeshoptDecoder) and KTX2 textures (KHR_texture_basisu).
// (Animations go into anims.bin instead: see animbin.mjs.)
import { Document, NodeIO } from '@gltf-transform/core';
import { EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu } from '@gltf-transform/extensions';
import { quantize } from '@gltf-transform/functions';
import { MeshoptEncoder } from 'meshoptimizer';

await MeshoptEncoder.ready;

function io() {
  return new NodeIO().registerExtensions([EXTMeshoptCompression, KHRMeshQuantization, KHRTextureBasisu]).registerDependencies({ 'meshopt.encoder': MeshoptEncoder });
}

function skeletonNodes(doc, parent, bones) {
  const nodes = bones.map((b) => doc.createNode(b.name).setTranslation(b.t).setRotation(b.q));
  bones.forEach((b, i) => (b.parent >= 0 ? nodes[b.parent] : parent).addChild(nodes[i]));
  return nodes;
}

/** Per vertex: the four influences sorted by weight, weights as 8-bit summing to 255. */
function packSkin(srcJ, srcW, boneCount) {
  const n = srcW.length / 4;
  const joints = boneCount < 256 ? new Uint8Array(n * 4) : new Uint16Array(n * 4);
  const weights = new Uint8Array(n * 4);
  const order = [0, 1, 2, 3];
  for (let i = 0; i < n; i++) {
    const o = i * 4;
    order.sort((a, b) => srcW[o + b] - srcW[o + a]);
    let sum = 0;
    for (let k = 0; k < 4; k++) {
      joints[o + k] = srcJ[o + order[k]];
      weights[o + k] = Math.round(srcW[o + order[k]] * 255);
      sum += weights[o + k];
    }
    weights[o] += 255 - sum; // exact sum (rounding goes to the largest)
    for (let k = 0; k < 4; k++) if (weights[o + k] === 0) joints[o + k] = joints[o]; // unused slots
  }
  return { joints, weights };
}

/**
 * One character: skeleton, one mesh whose primitives are the LODs (sharing the vertex
 * accessors), one material (color + normal atlas).
 */
export async function writeCharacter({ name, bones, ibm, geo, lods, colorKTX2, normalKTX2, extras, alphaTest = 0, roughness = 0.8, morphs = [] }) {
  const doc = new Document();
  const buf = doc.createBuffer();
  doc.createExtension(KHRTextureBasisu).setRequired(true);
  const scene = doc.createScene(name);
  const root = doc.createNode(name).setExtras(extras);
  scene.addChild(root);
  const joints = skeletonNodes(doc, root, bones);
  const skin = doc
    .createSkin('skin')
    .setInverseBindMatrices(doc.createAccessor('ibm').setType('MAT4').setArray(ibm).setBuffer(buf))
    .setSkeleton(joints[0]);
  for (const j of joints) skin.addJoint(j);

  const color = doc.createTexture('color').setImage(colorKTX2).setMimeType('image/ktx2');
  const normal = doc.createTexture('normal').setImage(normalKTX2).setMimeType('image/ktx2');
  const mat = doc
    .createMaterial(name)
    .setBaseColorTexture(color)
    .setNormalTexture(normal)
    .setMetallicFactor(0)
    .setRoughnessFactor(roughness)
    .setAlphaMode(alphaTest > 0 ? 'MASK' : 'OPAQUE');
  if (alphaTest > 0) mat.setAlphaCutoff(alphaTest);

  const acc = (type, array) => doc.createAccessor().setType(type).setArray(array).setBuffer(buf);
  const pos = acc('VEC3', geo.position);
  const nrm = acc('VEC3', geo.normal);
  const uv = acc('VEC2', geo.uvAtlas);
  // Skin weights: sorted (largest first) and quantized here, joints permuted with them.
  // (glTF-Transform's own weight sorting runs once per primitive and scrambles joints
  // when the LOD primitives share these accessors.)
  const skinData = packSkin(geo.joints, geo.weights, bones.length);
  const jnt = acc('VEC4', skinData.joints);
  const wgt = acc('VEC4', skinData.weights).setNormalized(true);
  const part = acc('SCALAR', geo.part);
  const mesh = doc.createMesh(name);
  // Morph targets (face: mouthOpen, blink): position deltas, shared by every LOD primitive
  // (glTF wants the same targets on all primitives of a mesh).
  const targets = morphs.map((m) => ({ name: m.name, acc: acc('VEC3', m.delta).setSparse(true) }));
  if (targets.length) mesh.setWeights(targets.map(() => 0)).setExtras({ targetNames: targets.map((t) => t.name) });
  for (const index of lods) {
    const prim = doc
      .createPrimitive()
      .setAttribute('POSITION', pos)
      .setAttribute('NORMAL', nrm)
      .setAttribute('TEXCOORD_0', uv)
      .setAttribute('JOINTS_0', jnt)
      .setAttribute('WEIGHTS_0', wgt)
      .setAttribute('_PART', part)
      .setIndices(acc('SCALAR', geo.count < 65536 ? Uint16Array.from(index) : index))
      .setMaterial(mat);
    for (const t of targets) prim.addTarget(doc.createPrimitiveTarget(t.name).setAttribute('POSITION', t.acc));
    mesh.addPrimitive(prim);
  }
  root.addChild(doc.createNode('body').setMesh(mesh).setSkin(skin));

  await doc.transform(
    quantize({
      pattern: /^(POSITION|NORMAL|TEXCOORD_0)$/,
      normalizeWeights: false, // done in packSkin
      quantizationVolume: 'mesh',
      quantizePosition: 14,
      quantizeNormal: 10,
      quantizeTexcoord: 14,
      quantizeWeight: 8,
    }),
  );
  doc.createExtension(EXTMeshoptCompression).setRequired(true).setEncoderOptions({ method: EXTMeshoptCompression.EncoderMethod.FILTER });
  return io().writeBinary(doc);
}
