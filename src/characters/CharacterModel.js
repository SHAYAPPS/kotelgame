import {
  AdditiveAnimationBlendMode,
  AnimationMixer,
  Group,
  LoopOnce,
  LoopRepeat,
  Matrix4,
  Quaternion,
  Sphere,
  Vector3,
  Vector4,
} from 'three';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';
import { CHARACTER, FAR_LAYER, PARTS } from './config.js';
import { setWorldQuaternion, solveTwoBone } from './ik.js';
import { createRifle } from './weapons.js';

const _v = new Vector3();
const _w = new Vector3();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _m = new Matrix4();
const _inv = new Matrix4();
const _axis = new Vector3();
const _feet = new Vector3();
const SYNC = { sync: true };
const NO_OPTS = {};

/**
 * One animated character: a clone of its type's skinned mesh (three LODs sharing one
 * skeleton), an AnimationMixer driven through weighted "slots", optional tints per clothing
 * part, bone attachments (rifle, gear), spine aim, arm IK and hit zones in model space.
 *
 * The owner (a view) places `root` at the feet each frame (rotation.y = facing, yaw 0 looks
 * down -Z) and calls update(dt). The animators (SoldierAnimator, CivilianAnimator) decide
 * which slots play.
 */
export class CharacterModel {
  constructor(type, { tints = null } = {}) {
    this.type = type;
    this.info = type.info;
    this.root = new Group();
    this.body = SkeletonUtils.clone(type.scene);
    this.body.rotation.y = Math.PI; // glTF characters face +Z; the game's yaw 0 faces -Z
    this.root.add(this.body);

    this.lods = [];
    this.body.traverse((o) => {
      if (o.isSkinnedMesh) this.lods.push(o);
    });
    const skeleton = this.lods[0].skeleton;
    for (const m of this.lods.slice(1)) m.bind(skeleton, m.bindMatrix);
    this.skeleton = skeleton;
    // three recomputes and uploads bone matrices on every render() that draws the mesh
    // (the post chain renders the scene more than once a frame): skip it unless the pose
    // or the body's placement changed since the last upload.
    const updateSkeleton = skeleton.update.bind(skeleton);
    this._skinDirty = true;
    this._skinWorld = new Matrix4();
    skeleton.update = () => {
      if (!this._skinDirty && this.body.matrixWorld.equals(this._skinWorld)) return;
      updateSkeleton();
      this._skinWorld.copy(this.body.matrixWorld);
      this._skinDirty = false;
    };
    this.bones = new Map(skeleton.bones.map((b) => [b.name, b]));

    // Per-person material (same shader program): part tints. `flat` per part: 0 keeps the
    // texture's shading under the tint, 1 a flat color (bare skin dressed as sleeves or
    // trousers, see outfits.js).
    this.tints = Array.from({ length: PARTS }, () => new Vector4(1, 1, 1, 0));
    this.flat = new Array(PARTS).fill(0);
    this.inflate = new Array(PARTS).fill(0); // geometry units, see setInflate()
    this.hide = new Array(PARTS).fill(0); // 1 = part not drawn (e.g. hair under a headscarf)
    if (tints) for (const [part, c] of Object.entries(tints)) this.tints[+part].set(c[0], c[1], c[2], c[3] ?? 1);
    const material = this.lods[0].material.clone();
    const lum = Array.from({ length: PARTS }, (_, i) => this.info.partLum?.[i] ?? 0.3);
    patchMaterial(material, this.tints, lum, this.flat, this.inflate, this.hide);
    for (const m of this.lods) {
      m.material = material;
      m.castShadow = true;
      m.receiveShadow = true;
      m.frustumCulled = true;
      // Generous fixed bounds (any pose, incl. lying dead): no per-frame skinned bounds.
      m.boundingSphere = new Sphere(new Vector3(0, 0.9, 0), 1.9);
    }
    this.material = material;
    this.lod = -1;
    this.setLod(0);

    // IK targets (animated by the rifle clips).
    this.ikR = new Group();
    this.ikR.name = 'ikHandR';
    this.ikL = new Group();
    this.ikL.name = 'ikHandL';
    this.body.add(this.ikR, this.ikL);
    this.ikWeight = 0;
    this.aimPitch = 0;
    this.aimWeight = 0;

    this.mixer = new AnimationMixer(this.body);
    /** @type {Map<string, { action, weight: number, target: number, rate: number, mode: string, sync: boolean }>} */
    this.slots = new Map();
    this._retired = 0;
    this.phase = null; // shared locomotion phase (animators set it)
    this.frozen = false;
    this._accum = 0;
    this._frame = Math.floor(Math.random() * 8); // stagger throttled updates
    this.distance = 0;
    this.onScreen = true;

    // Hit zones in root-local space (the owner maps them with its position / yaw).
    this.hit = { valid: false, yaw: 0, head: new Vector3(), a: new Vector3(), b: new Vector3() };
    this._headCenter = new Vector3();
    const h = this.info.head;
    if (h) this._headCenter.set((h.min[0] + h.max[0]) / 2, h.min[1] + (h.max[1] - h.min[1]) * 0.62, (h.min[2] + h.max[2]) / 2);

    this.rifle = null;
    this.gear = []; // attachments: { object, shadow, hideBeyond }
    this._zoneBones = ['Head', 'LeftFoot', 'RightFoot'].map((n) => this.bone(n)).filter(Boolean);
    this._layer = 0;
  }

  bone(name) {
    return this.bones.get(name) ?? null;
  }

  setLod(i) {
    if (i === this.lod) return;
    this.lod = i;
    this.lods.forEach((m, k) => (m.visible = k === i));
  }

  /**
   * Attach a rigid mesh to a bone (gear, head wear).
   * @param {{ shadow?: boolean, hideBeyond?: number }} opts shadow: casts a shadow up close;
   *   hideBeyond: not drawn farther than this (small things vanish in the distance anyway)
   */
  attach(boneName, object, { shadow = false, hideBeyond = Infinity } = {}) {
    const b = this.bone(boneName);
    if (b) b.add(object);
    object.castShadow = false;
    this.gear.push({ object, shadow, hideBeyond });
    return object;
  }

  /** The rifle in the right hand, posed with the grip measured from the source clips. */
  addRifle(kind) {
    const r = createRifle(kind);
    const g = this.type.rifle;
    r.root.position.fromArray(g.position);
    r.root.quaternion.fromArray(g.quaternion);
    this.attach('RightHand', r.root);
    this.gear.push({ object: r.mesh, shadow: true, hideBeyond: Infinity });
    this.rifle = r;
    return r;
  }

  // ---------------------------------------------------------------------------
  // Blending

  /**
   * Fade a clip toward a weight.
   * @param {string} name clip
   * @param {number} target weight (base: the base layer's weights should sum to 1)
   * @param {number} time seconds to get there
   * @param {{ mode?: 'base'|'upper'|'add'|'addUpper', loop?: boolean, sync?: boolean, restart?: boolean,
   *   timeScale?: number, startAt?: number, key?: string }} opts key: slot name (one clip at a
   *   time per key; switching clips fades the old one out)
   */
  fade(name, target, time = CHARACTER.fade, opts = {}) {
    const key = opts.key ?? name;
    let s = this.slots.get(key);
    if (s && s.name !== name) {
      // Same slot, another clip: let the old one fade out on its own.
      this.slots.delete(key);
      s.target = 0;
      s.rate = Math.max(s.rate === Infinity ? 0 : s.rate, time > 0 ? 1 / time : 10);
      this.slots.set(`${key}~${++this._retired}`, s);
      s = null;
    }
    if (!s) {
      if (target <= 0) return null;
      const mode = opts.mode ?? 'base';
      const clip = this.type.clip(name, { upper: mode === 'upper' || mode === 'addUpper', additive: mode === 'add' || mode === 'addUpper' });
      if (!clip) return null;
      const action = this.mixer.clipAction(clip);
      if (mode === 'add' || mode === 'addUpper') action.blendMode = AdditiveAnimationBlendMode;
      const loop = opts.loop ?? this.type.meta[name]?.loop ?? true;
      action.setLoop(loop ? LoopRepeat : LoopOnce, Infinity);
      action.clampWhenFinished = !loop;
      action.enabled = true;
      action.setEffectiveWeight(0);
      action.time = opts.startAt ?? 0;
      action.timeScale = opts.sync ? 0 : opts.timeScale ?? 1;
      action.play();
      s = { action, weight: 0, target: 0, rate: 1, mode, sync: !!opts.sync, clip, name };
      this.slots.set(key, s);
    } else if (opts.restart) {
      s.action.reset();
      s.action.time = opts.startAt ?? 0;
      s.action.enabled = true;
      s.action.play();
    }
    if (opts.timeScale !== undefined && !s.sync) s.action.timeScale = opts.timeScale;
    s.target = target;
    s.rate = time > 0 ? 1 / time : Infinity;
    return s;
  }

  /** Fade every slot of a mode (or all) to zero, except `keep`. */
  fadeOut(time = CHARACTER.fade, mode = null, keep = null) {
    for (const [k, s] of this.slots) {
      if (mode && s.mode !== mode) continue;
      if (keep && keep.has(k)) continue;
      s.target = 0;
      s.rate = time > 0 ? 1 / time : Infinity;
    }
  }

  /**
   * Per-frame weight for a slot (no fade: the animators smooth their own weights). Creates
   * the slot the first time; no allocation afterwards.
   */
  setWeight(name, weight, sync = false) {
    const s = this.slots.get(name);
    if (s && s.name === name) {
      s.target = weight;
      s.rate = Infinity;
      return s;
    }
    return weight > 0 ? this.fade(name, weight, 0, sync ? SYNC : NO_OPTS) : null;
  }

  weightOf(name) {
    return this.slots.get(name)?.weight ?? 0;
  }

  /** Locomotion cycles advance together: every synced slot at the same normalized phase. */
  setPhase(phase) {
    for (const s of this.slots.values()) if (s.sync) s.action.time = (phase % 1) * s.clip.duration;
  }

  /** Time into a slot's clip (seconds) or -1. */
  timeOf(name) {
    const s = this.slots.get(name);
    return s ? s.action.time : -1;
  }

  _blend(dt) {
    for (const [k, s] of this.slots) {
      if (s.weight !== s.target) {
        if (s.rate === Infinity) s.weight = s.target;
        else {
          const step = s.rate * dt;
          s.weight = s.weight < s.target ? Math.min(s.target, s.weight + step) : Math.max(s.target, s.weight - step);
        }
      }
      if (s.weight <= 0 && s.target <= 0) {
        s.action.stop();
        this.slots.delete(k);
        continue;
      }
      // Upper-body overrides win over the base layer: w / (1 - w) against a base of 1.
      const w = s.mode === 'upper' ? Math.min(400, s.weight / Math.max(1e-3, 1 - s.weight)) : s.weight;
      s.action.setEffectiveWeight(w);
    }
  }

  /** Push a part's surface out along its normals (m): skin dressed as sleeves / trousers. */
  setInflate(part, meters) {
    this.inflate[part] = meters / (this.type.unit || 1);
  }

  /**
   * Jump to the last frame of a one-shot clip at full weight (every other slot out) and pose
   * it now: a body about to freeze ends fully fallen even if its updates lagged behind (far
   * away or off screen, the updates are throttled).
   */
  finish(name) {
    for (const s of this.slots.values()) {
      const on = s.name === name;
      s.weight = s.target = on ? 1 : 0;
      if (on) s.action.time = s.clip.duration;
    }
    this._accum = 0;
    this.update(0, null, true);
  }

  /** Stop animating and keep the current pose (bodies that stay down). */
  freeze() {
    this.frozen = true;
    this.hit.valid = false;
    this._skinDirty = true; // one last upload of the final pose
  }

  // ---------------------------------------------------------------------------
  // Per frame

  /**
   * @param {number} dt
   * @param {{ camera: import('three').Camera, frustum?: import('three').Frustum }} ctx
   * @param {boolean} force update the animation this frame (e.g. something just happened)
   */
  update(dt, ctx, force = false) {
    const cam = ctx?.camera;
    if (cam) {
      this.root.getWorldPosition(_w);
      this.distance = cam.position.distanceTo(_w);
      const c = CHARACTER;
      const d = this.distance / c.lodScale;
      const hy = c.lodHysteresis;
      if (this.lod === 0 && d > c.lodNear + hy) this.setLod(1);
      else if (this.lod === 1 && d < c.lodNear - hy) this.setLod(0);
      else if (this.lod === 1 && d > c.lodFar + hy) this.setLod(2);
      else if (this.lod === 2 && d < c.lodFar - hy) this.setLod(1);
      else if (this.lod === 2 && d < c.lodNear) this.setLod(0);
      const shadow = this.distance < c.shadowDistance;
      if (this.lods[this.lod].castShadow !== shadow) for (const m of this.lods) m.castShadow = shadow;
      // Far: out of the AO prepass (and shadows).
      const layer = this.distance > c.aoDistance * c.lodScale ? FAR_LAYER : 0;
      if (layer !== this._layer) {
        this._layer = layer;
        for (const m of this.lods) m.layers.set(layer);
        for (const g of this.gear) g.object.layers.set(layer);
        if (this.rifle) this.rifle.flash.layers.set(layer);
      }
      // Gear: shadows only close by, small pieces hidden far away.
      const gearShadow = this.distance < c.shadowDistance * 0.5;
      for (const g of this.gear) {
        g.object.visible = this.distance < g.hideBeyond * c.lodScale;
        g.object.castShadow = g.shadow && gearShadow;
      }
      if (ctx.frustum) {
        _v.copy(_w);
        _v.y += 0.9;
        this.onScreen = ctx.frustum.containsPoint(_v) || this.distance < 3 || sphereVisible(ctx.frustum, _v);
      }
    }
    if (this.frozen) return;
    this._accum += dt;
    this._frame++;
    const c = CHARACTER;
    const dl = this.distance / c.lodScale;
    const every = !this.onScreen ? c.offscreenEvery : dl < c.updateFull ? 1 : dl < c.updateHalf ? 2 : 4;
    if (!force && every > 1 && this._frame % every !== 0) return;
    const step = Math.min(this._accum, 0.25);
    this._accum = 0;
    this._blend(step);
    if (this.phase !== null) this.setPhase(this.phase);
    this.mixer.update(step);
    this._skinDirty = true;
    const near = this.distance < c.ikDistance * c.lodScale;
    const aim = this.aimWeight > 0.01 && near;
    const ik = this.ikWeight > 0.01 && near;
    if (aim || ik) {
      this.root.updateMatrixWorld(true);
      if (aim) this._aim();
      if (ik) this._ik();
    } else {
      // Only the bones the hit zones read (the renderer updates the rest).
      for (const b of this._zoneBones) b.updateWorldMatrix(true, false);
    }
    this._hitZones();
  }

  _aim() {
    // Pitch the spine about the character's left-right axis toward the target.
    const pitch = Math.max(-CHARACTER.aimPitchLimit, Math.min(CHARACTER.aimPitchLimit, this.aimPitch)) * this.aimWeight;
    this.body.getWorldQuaternion(_q);
    _axis.set(1, 0, 0).applyQuaternion(_q); // the model's +X (its left)
    const share = CHARACTER.aimShare;
    ['Spine', 'Spine1', 'Spine2'].forEach((n, i) => {
      const b = this.bone(n);
      if (!b) return;
      _q2.setFromAxisAngle(_axis, -pitch * share[i]);
      b.getWorldQuaternion(_q);
      setWorldQuaternion(b, _q.premultiply(_q2));
      b.updateMatrixWorld(true);
    });
  }

  _ik() {
    const spine = this.bone('Spine2');
    const rh = this.bone('RightHand');
    const lh = this.bone('LeftHand');
    if (!spine || !rh || !lh) return;
    const w = this.ikWeight;
    // Right hand: where the source skeleton held it relative to the chest.
    _m.compose(this.ikR.position, this.ikR.quaternion, _w.set(1, 1, 1)).premultiply(spine.matrixWorld);
    _v.setFromMatrixPosition(_m);
    solveTwoBone(this.bone('RightArm'), this.bone('RightForeArm'), rh, _v, w);
    _q.setFromRotationMatrix(_m);
    rh.getWorldQuaternion(_q2);
    setWorldQuaternion(rh, _q2.slerp(_q, w));
    rh.updateMatrixWorld(true);
    // Left hand: on the handguard, relative to the (corrected) right hand.
    _m.compose(this.ikL.position, this.ikL.quaternion, _w.set(1, 1, 1)).premultiply(rh.matrixWorld);
    _v.setFromMatrixPosition(_m);
    solveTwoBone(this.bone('LeftArm'), this.bone('LeftForeArm'), lh, _v, w);
    _q.setFromRotationMatrix(_m);
    lh.getWorldQuaternion(_q2);
    setWorldQuaternion(lh, _q2.slerp(_q, w));
    lh.updateMatrixWorld(true);
  }

  _hitZones() {
    const head = this.bone('Head');
    const neck = this.bone('Neck');
    const hips = this.bone('Hips');
    const lf = this.bone('LeftFoot');
    const rf = this.bone('RightFoot');
    if (!head || !neck || !hips || !lf || !rf) return;
    _inv.copy(this.root.matrixWorld).invert();
    const hit = this.hit;
    hit.head.copy(this._headCenter).applyMatrix4(head.matrixWorld).applyMatrix4(_inv);
    // Body: from between the feet and hips up to the neck (radius added by the owner).
    _feet.setFromMatrixPosition(lf.matrixWorld).add(_v.setFromMatrixPosition(rf.matrixWorld)).multiplyScalar(0.5).applyMatrix4(_inv);
    _v.setFromMatrixPosition(hips.matrixWorld).applyMatrix4(_inv);
    hit.a.copy(_feet).lerp(_v, 0.35);
    hit.b.setFromMatrixPosition(neck.matrixWorld).applyMatrix4(_inv);
    hit.yaw = this.root.rotation.y;
    hit.valid = true;
  }

  /** World position of the rifle muzzle (for flashes and tracers), or null. */
  muzzleWorld(out) {
    if (!this.rifle) return null;
    return this.rifle.muzzle.getWorldPosition(out);
  }

  dispose() {
    this.mixer.stopAllAction();
    this.mixer.uncacheRoot(this.body);
    this.material.dispose();
    this.root.removeFromParent();
  }
}

function sphereVisible(frustum, center) {
  _sphere.center.copy(center);
  return frustum.intersectsSphere(_sphere);
}
const _sphere = new Sphere(new Vector3(), 1.3);

/**
 * Per-part recolor on top of the atlas (shared shader, per-person uniforms): the texel's
 * luminance times the tint color, relative to the part's mean luminance.
 */
function patchMaterial(material, tints, partLum, flat, inflate, hide) {
  material.onBeforeCompile = (shader) => {
    shader.uniforms.uTint = { value: tints };
    shader.uniforms.uPartLum = { value: partLum };
    shader.uniforms.uFlat = { value: flat };
    shader.uniforms.uInflate = { value: inflate };
    shader.uniforms.uHide = { value: hide };
    // Per part: pushed out along the normal (dressed skin), or collapsed to a point (hidden).
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute float _part;\nvarying float vPart;\nuniform float uInflate[${PARTS}];\nuniform float uHide[${PARTS}];`)
      .replace(
        '#include <begin_vertex>',
        `#include <begin_vertex>
        vPart = _part;
        int part = int(_part + 0.5);
        transformed += normal * uInflate[part];
        if (uHide[part] > 0.5) transformed = vec3(0.0);`,
      );
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', `#include <common>\nuniform vec4 uTint[${PARTS}];\nuniform float uPartLum[${PARTS}];\nuniform float uFlat[${PARTS}];\nvarying float vPart;`)
      .replace(
        '#include <map_fragment>',
        `#include <map_fragment>
        {
          int p = int(vPart + 0.5);
          vec4 t = uTint[p];
          if (t.a > 0.0) {
            float l = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));
            float rel = mix(l / max(uPartLum[p], 0.02), 1.0, uFlat[p]);
            diffuseColor.rgb = mix(diffuseColor.rgb, t.rgb * rel, t.a);
          }
        }`,
      );
  };
}
