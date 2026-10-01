import {
  AdditiveBlending,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Matrix4,
  Mesh,
  MeshBasicMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  Quaternion,
  Scene,
  Vector3,
} from 'three';
import { LAUNCHER, RED_DOT, RIFLE, VIEWMODEL } from './config.js';
import { models } from '../core/Models.js';
import { BORE_Y, L_FRONT_Z, L_TUBE_X, L_TUBE_Y, MUZZLE_Z, buildLauncher, buildRifle, flashTexture } from './placeholders.js';

const FLASH_TIME = 0.05;
const KEYS = ['x', 'y', 'z', 'rx', 'ry', 'rz'];
// Placeholder poses (the greybox rifle's origin is its rear sight; used until the models load).
const PH = {
  rifle: {
    hip: { x: 0.1, y: -0.06, z: -0.24, rx: 0.02, ry: 0.06, rz: -0.06 },
    ads: { x: 0, y: 0, z: -0.19, rx: 0, ry: 0, rz: 0 },
  },
  launcher: {
    hip: { x: 0.11, y: -0.1, z: -0.3, rx: 0.03, ry: 0.04, rz: -0.03 },
    ads: { x: 0, y: 0, z: -0.14, rx: 0, ry: 0, rz: 0 },
  },
};

function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

function smoothstep(a, b, x) {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** 0 before a, rises to 1 at b, holds, falls back to 0 between c and d. */
function bump(t, a, b, c, d) {
  return smoothstep(a, b, t) * (1 - smoothstep(c, d, t));
}

/** Exact critically damped spring step on obj[x] / obj[v] (no allocations). */
function springStep(obj, x, v, w, dt) {
  const k = obj[v] + w * obj[x];
  const e = Math.exp(-w * dt);
  obj[x] = (obj[x] + k * dt) * e;
  obj[v] = (obj[v] - w * k * dt) * e;
}

/** Under-damped spring (overshoots: things that clatter into place). */
function bouncyStep(obj, x, v, target, w, zeta, dt) {
  const a = -w * w * (obj[x] - target) - 2 * zeta * w * obj[v];
  obj[v] += a * dt;
  obj[x] += obj[v] * dt;
}

function lerpPose(out, a, b, t) {
  for (const k of KEYS) out[k] = a[k] + (b[k] - a[k]) * t;
  return out;
}

const v3 = (a) => new Vector3(a[0], a[1], a[2]);
const dir3 = (x, y, z) => new Vector3(x, y, z).normalize();

/**
 * A hand target in weapon space: palm center, finger direction (wrist -> knuckles), palm
 * facing, finger curls { fingers: [mcp, pip, dip], index: [...], thumb: [a, b, c, swing] }.
 */
function grip(palm, fingers, normal, curls) {
  return { palm: v3(palm), fingers: dir3(...fingers), normal: dir3(...normal), curls };
}

// Hand placements on the rifle (rifle model space, see scripts/assets/weapons.mjs markers).
const RIFLE_GRIPS = {
  // Right hand around the pistol grip; index on the trigger or straight along the receiver.
  grip: grip([0.016, -0.064, 0.122], [-0.22, -0.33, -0.92], [-0.95, 0, -0.3], {
    fingers: [1.2, 1.35, 0.7],
    thumb: [0.35, 0.45, 0.25, 0.4],
  }),
  trigger: [0.55, 0.85, 0.35],
  indexOff: [0.12, 0.08, 0.05],
  // Left hand under the handguard, fingers up its right side, thumb along the left.
  handguard: grip([-0.012, -0.0145, -0.205], [0.9, 0.28, -0.32], [0.3, 0.95, 0], {
    fingers: [0.75, 0.95, 0.55],
    index: [0.6, 0.85, 0.5],
    thumb: [0.15, 0.2, 0.1, -0.35],
  }),
  // Left hand around the magazine (relative to the magazine node: origin at its top).
  mag: grip([-0.004, -0.085, -0.03], [0.95, -0.15, 0.1], [0.05, 0.1, 1], {
    fingers: [0.95, 1.05, 0.55],
    index: [0.85, 1.0, 0.5],
    thumb: [0.4, 0.35, 0.2, 0.2],
  }),
  // Flat palm on the bolt catch (left side of the receiver, above the magwell).
  bolt: grip([-0.026, 0.006, -0.02], [0.05, 0.25, -1], [1, 0, 0.05], {
    fingers: [0.2, 0.2, 0.1],
    thumb: [0.1, 0.1, 0.05, -0.2],
  }),
  // Fingers hooked on the charging handle's latch (behind the optic, left side).
  charge: grip([-0.03, 0.062, 0.125], [0.85, -0.25, 0.3], [0.2, -0.35, -0.9], {
    fingers: [0.9, 1.15, 0.6],
    index: [0.85, 1.1, 0.6],
    thumb: [0.3, 0.3, 0.2, 0.1],
  }),
  // Down at the vest's magazine pouch (out of view below the rifle).
  pouch: grip([-0.09, -0.36, 0.06], [0.1, -0.2, -1], [0.95, 0.1, 0.2], {
    fingers: [0.9, 1.0, 0.55],
    thumb: [0.4, 0.35, 0.2, 0.2],
  }),
};

// Hand placements on the launcher (launcher model space: origin at the rear sight).
const LAUNCHER_GRIPS = {
  grip: grip([0.016, -0.115, 0.075], [-0.2, -0.3, -0.93], [-0.95, 0, -0.3], {
    fingers: [1.2, 1.35, 0.7],
    thumb: [0.35, 0.45, 0.25, 0.4],
  }),
  trigger: [0.55, 0.85, 0.35],
  indexOff: [0.12, 0.08, 0.05],
  front: grip([-0.014, -0.11, -0.09], [0.2, -0.25, -0.95], [0.95, 0, 0.2], {
    fingers: [1.15, 1.3, 0.7],
    index: [1.05, 1.2, 0.6],
    thumb: [0.35, 0.45, 0.25, 0.4],
  }),
  rocket: grip([-0.03, -0.0, 0.0], [0.1, 0.1, -1], [0.9, 0.3, 0.1], {
    fingers: [1.0, 1.1, 0.6],
    thumb: [0.4, 0.35, 0.2, 0.2],
  }),
  pouch: grip([-0.1, -0.4, 0.15], [0.1, -0.2, -1], [0.95, 0.1, 0.2], {
    fingers: [0.9, 1.0, 0.55],
    thumb: [0.4, 0.35, 0.2, 0.2],
  }),
};

const _m2 = new Matrix4();
const _q = new Quaternion();
const _q2 = new Quaternion();
const _v = new Vector3();
const _v2 = new Vector3();
const _p = new Vector3();
const _f = new Vector3();
const _n = new Vector3();
const _pole = new Vector3();
const _pole2 = new Vector3();
const _ups = new Vector3(0, 1, 0);

/**
 * The weapon held in view. Rendered in its own scene and camera on top of the world, so it
 * never clips into walls and the world's ADS zoom does not distort it. The scene is view
 * space (camera at the origin); the world's sun and sky light it (setLighting).
 * Real models (public/assets/weapons/) replace the greybox ones once load() finishes: a rifle
 * with a red dot, gloved arms that hold it (IK), a rocket launcher.
 */
export class Viewmodel {
  constructor() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(VIEWMODEL.fov, 1, 0.01, 5);

    this.hemi = new HemisphereLight(0xdde9f5, 0x7d7465, 1.6);
    this.sun = new DirectionalLight(0xfff0db, 2.4);
    this.sun.position.set(0.6, 1, 0.4);
    // Soft fill from just above the eye: keeps a black rifle readable in the shade.
    this.fill = new DirectionalLight(0xffffff, 0.5);
    this.fill.position.set(-0.2, 0.6, 1);
    this.scene.add(this.hemi, this.sun, this.sun.target, this.fill, this.fill.target);
    this.shade = 1; // 1 = in the sun, 0 = in shade (Game raycasts toward the sun)

    const { rifle, mag } = buildRifle();
    this.rifle = rifle;
    this.mag = mag;
    const { launcher, warhead } = buildLauncher();
    this.launcher = launcher;
    this.warhead = warhead;
    launcher.visible = false;
    this.weapon = 'rifle';
    this.root = new Group(); // posed each frame: its origin is the weapon's sight point
    this.root.add(rifle, launcher);
    this.scene.add(this.root);

    // Muzzle flash: three crossed planes + a light that also brightens the rifle.
    const flashMat = new MeshBasicMaterial({
      map: typeof document === 'undefined' ? null : flashTexture(),
      blending: AdditiveBlending,
      transparent: true,
      depthWrite: false,
      side: DoubleSide,
      toneMapped: false,
    });
    flashMat.color.setScalar(6); // HDR: bright enough to bloom
    this.flash = new Group();
    this.flash.position.set(0, BORE_Y, MUZZLE_Z - 0.06);
    const facing = new Mesh(new PlaneGeometry(0.14, 0.14), flashMat);
    const side1 = new Mesh(new PlaneGeometry(0.1, 0.2), flashMat);
    side1.rotation.set(Math.PI / 2, 0, 0);
    side1.position.z = -0.05;
    const side2 = side1.clone();
    side2.rotation.set(Math.PI / 2, Math.PI / 2, 0);
    this.flash.add(facing, side1, side2);
    this.flash.visible = false;
    rifle.add(this.flash);
    this.launcherFlash = this.flash.clone();
    this.launcherFlash.position.set(L_TUBE_X, L_TUBE_Y, L_FRONT_Z - 0.1);
    this.launcherFlash.scale.setScalar(2.2);
    this.launcherFlash.visible = false;
    launcher.add(this.launcherFlash);
    this.flashLight = new PointLight(0xffb45a, 0, 1.5, 2);
    this.flashLight.position.set(0, BORE_Y, MUZZLE_Z - 0.05);
    rifle.add(this.flashLight);

    this.models = null; // the real models once loaded (see load())
    this.flashTimer = 0;
    this.kickZ = 0;
    this.kickZVel = 0;
    this.kickRot = 0;
    this.kickRotVel = 0;
    this.kickYaw = 0;
    this.kickYawVel = 0;
    this.kickRoll = 0;
    this.kickRollVel = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.sprint = 0;
    this.lowered = 0;
    this.stow = 0;
    this.trigger = 0; // index finger on the trigger (0..1)
    this.time = 0;
    this.cover = 0; // dust cover: 0 closed .. 1 open
    this.coverVel = 0;
    this.coverOpen = false;
    this.boltJolt = 0;
    this.boltJoltVel = 0;
    this.shots = 0;
    /** (positionView: Vector3, velocityView: Vector3) => void: a spent casing leaves the port. */
    this.onEject = null;
    this._ejects = 0;
    this._pose = { x: 0, y: 0, z: 0, rx: 0, ry: 0, rz: 0 };
    this._ejectPos = new Vector3();
    this._ejectVel = new Vector3();
  }

  /**
   * Loads the real models (public/assets/weapons/, through core/Models.js). Until then (and
   * if it fails) the greybox weapons stay.
   */
  async load() {
    const [{ ArmsRig }, { buildRedDot }] = await Promise.all([import('./ArmsRig.js'), import('./RedDot.js')]);
    const [rifle, arms, launcher] = await Promise.all(['rifle', 'arms', 'launcher'].map((n) => models.load(`assets/weapons/${n}.glb`)));
    const node = (g, name) => g.scene.getObjectByName(name);
    const extras = (g) => {
      let m = null;
      g.scene.traverse((o) => (m ??= o.userData.markers ?? null));
      return m;
    };
    const markers = extras(rifle);
    const lmarkers = extras(launcher);

    // Rifle: the model hangs under rifleNode, shifted so the root's origin is the red dot's
    // rear lens (the sight point).
    const rifleNode = new Group();
    const sight = new Vector3(0, markers.railTop + RED_DOT.height, RED_DOT.rearZ);
    rifle.scene.position.copy(sight).negate();
    rifleNode.add(rifle.scene);
    const dot = buildRedDot();
    dot.position.copy(sight);
    rifle.scene.add(dot);
    const mag = node(rifle, 'magazine');
    const cover = node(rifle, 'dust_cover');
    const charging = node(rifle, 'charging_handle');
    // Launcher: its origin is already the rear sight.
    const launcherNode = new Group();
    launcherNode.add(launcher.scene);
    const rocket = node(launcher, 'rocket');
    const armsRig = new ArmsRig(arms.scene);
    for (const g of [rifle.scene, launcher.scene, arms.scene]) {
      g.traverse((o) => {
        if (!o.isMesh) return;
        o.frustumCulled = false;
        if (o.material?.isMeshStandardMaterial) o.material.envMapIntensity = 1;
      });
    }
    // The flash and its light move to the real muzzles.
    const muzzle = v3(markers.bore).sub(sight);
    const lmuzzle = new Vector3(0, lmarkers.tubeY, lmarkers.front);
    this.flash.position.set(muzzle.x, muzzle.y, muzzle.z - 0.045);
    this.flash.scale.setScalar(0.85);
    this.flashLight.position.set(muzzle.x, muzzle.y, muzzle.z - 0.05);
    this.launcherFlash.position.set(lmuzzle.x, lmuzzle.y, lmuzzle.z - 0.12);
    rifleNode.add(this.flash, this.flashLight);
    launcherNode.add(this.launcherFlash);

    this.root.remove(this.rifle, this.launcher);
    this.root.add(rifleNode, launcherNode);
    this.scene.add(arms.scene);
    this.models = {
      rifle: rifleNode,
      launcher: launcherNode,
      rifleModel: rifle.scene,
      launcherModel: launcher.scene,
      markers,
      lmarkers,
      sight,
      mag,
      magRest: mag.position.clone(),
      cover,
      coverRest: cover.rotation.z,
      charging,
      chargingRest: charging.position.clone(),
      rocket,
      rocketRest: rocket.position.clone(),
      reticle: dot.userData.reticle,
      arms: armsRig,
      port: v3(markers.port).sub(sight),
    };
    // Dust cover closed until the first shot: rotate it up over the port.
    this.cover = 0;
    this._applyCover();
    this.setWeapon(this.weapon);
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Which weapon is in hand ('rifle' | 'launcher'); swap while it's lowered out of view. */
  setWeapon(name) {
    this.weapon = name;
    const M = this.models;
    if (M) {
      M.rifle.visible = name === 'rifle';
      M.launcher.visible = name === 'launcher';
    } else {
      this.rifle.visible = name === 'rifle';
      this.launcher.visible = name === 'launcher';
    }
  }

  /** New life / level restart: dust cover shut again, springs at rest. */
  reset() {
    this.coverOpen = false;
    this.cover = 0;
    this.coverVel = 0;
    this.kickZ = this.kickZVel = this.kickRot = this.kickRotVel = 0;
    this.kickYaw = this.kickYawVel = this.kickRoll = this.kickRollVel = 0;
    if (this.models) this._applyCover();
  }

  /** Rocket away: a heavy shove back and up. */
  onLauncherShot() {
    this.kickZVel += 0.06 * 28 * Math.E;
    this.kickRotVel += 0.1 * 30 * Math.E;
    this.flashTimer = FLASH_TIME * 2;
  }

  /** A shot: kick the rifle back and up, show the flash, open the dust cover, eject a casing. */
  onShot(aim) {
    // Impulses sized so a single shot peaks near 2.2 cm back / 0.055 rad muzzle-up at the hip.
    const k = aim > 0.5 ? 0.45 : 1;
    this.kickZVel += 0.022 * 28 * Math.E * k;
    this.kickRotVel += 0.05 * 30 * Math.E * k;
    this.kickYawVel += (Math.random() - 0.5) * 0.02 * 30 * Math.E * k;
    this.kickRollVel += (Math.random() - 0.35) * 0.05 * 26 * Math.E * k;
    this.flashTimer = FLASH_TIME;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar((this.models ? 0.7 : 0.8) + Math.random() * 0.45);
    this.shots++;
    if (!this.coverOpen) {
      this.coverOpen = true;
      this.coverVel = 14; // it snaps open and bounces on its spring
    }
    this._ejects = (this._ejects ?? 0) + 1;
  }

  /**
   * World lighting for the weapon: the sun (direction in world space), the sky's image-based
   * light and whether the player stands in shade. Call once per frame before update().
   */
  setLighting(camera, env, shade, dt) {
    this.shade = damp(this.shade, shade, 7, dt);
    camera.getWorldQuaternion(_q);
    _q2.copy(_q).invert();
    this.sun.position.copy(env.sunDir).applyQuaternion(_q2);
    this.sun.color.copy(env.sunColor);
    this.sun.intensity = env.sunIntensity * (0.04 + 0.96 * this.shade);
    this.hemi.position.copy(_ups).applyQuaternion(_q2);
    this.hemi.intensity = env.envMap ? 0.45 : 1.6;
    if (env.envMap && this.scene.environment !== env.envMap) this.scene.environment = env.envMap;
    this.scene.environmentIntensity = (env.o?.envIntensity ?? 0.55) * 1.15;
    this.scene.environmentRotation.setFromQuaternion(_q2);
  }

  /**
   * Per rendered frame.
   * @param {number} dt
   * @param {{ aim: number, reload: number, reloadEmpty?: boolean, loaded?: boolean,
   *   sprinting: boolean, lowered: boolean, stow?: number, check?: number, firing?: boolean,
   *   lookX: number, lookY: number, bobPhase: number, bobWeight: number, dip: number }} s
   */
  update(dt, s) {
    this.time += dt;
    this._reloadEmpty = !!s.reloadEmpty;
    this._loaded = s.loaded ?? true;
    this._charge = s.charge ?? 0;
    const aim = smoothstep(0, 1, s.aim);
    const isLauncher = this.weapon === 'launcher';
    this.sprint = damp(this.sprint, s.sprinting ? 1 : 0, 9, dt);
    this.lowered = damp(this.lowered, s.lowered ? 1 : 0, 6, dt);
    this.stow = damp(this.stow, s.stow ?? 0, 14, dt);
    const ck = s.check ?? 0;
    const checkPose = ck > 0 ? bump(ck, 0, 0.2, 0.8, 1) : 0;

    // Sway: the weapon lags a little behind mouse movement.
    const swayScale = 1 - 0.8 * aim;
    this.swayX = damp(this.swayX, MathUtils.clamp(-s.lookX * 0.00022, -0.025, 0.025), 12, dt);
    this.swayY = damp(this.swayY, MathUtils.clamp(s.lookY * 0.00022, -0.025, 0.025), 12, dt);
    // Bob, phase-locked with the camera's head bob (one cycle per two steps); bigger when sprinting.
    const bobScale = s.bobWeight * (1 - 0.85 * aim) * (1 + this.sprint * 1.2);
    const bobX = Math.sin(Math.PI * s.bobPhase) * 0.011 * bobScale;
    const bobY = -Math.abs(Math.cos(Math.PI * s.bobPhase)) * 0.009 * bobScale;
    const bobR = Math.sin(Math.PI * s.bobPhase) * 0.035 * bobScale * this.sprint;
    // Breathing: a slow drift, smaller when aiming.
    const breathe = 1 - 0.7 * aim;
    const brX = Math.sin(this.time * 0.9) * 0.0018 * breathe;
    const brY = Math.sin(this.time * 1.7) * 0.0014 * breathe;

    springStep(this, 'kickZ', 'kickZVel', 28, dt);
    springStep(this, 'kickRot', 'kickRotVel', 30, dt);
    springStep(this, 'kickYaw', 'kickYawVel', 26, dt);
    springStep(this, 'kickRoll', 'kickRollVel', 22, dt);
    springStep(this, 'boltJolt', 'boltJoltVel', 30, dt);

    // Reload: seconds into it.
    const reloadTime = isLauncher ? LAUNCHER.reloadTime : RIFLE.reloadTime;
    const T = s.reload > 0 ? s.reload * reloadTime : -1;
    const reloadPose = T >= 0 ? bump(T, 0, 0.25, reloadTime - 0.45, reloadTime - 0.1) : 0;

    // Base pose: hip -> ADS, then sprint, lowered (low ready), stowed (switching weapons).
    const M = this.models;
    const P = M ? VIEWMODEL[this.weapon] : null;
    const ph = PH[this.weapon];
    const pose = lerpPose(this._pose, P ? P.hip : ph.hip, P ? P.ads : ph.ads, aim);
    const spr = this.sprint * (1 - aim);
    if (P) {
      lerpPose(pose, pose, P.sprint, spr);
      lerpPose(pose, pose, P.lowered, this.lowered);
      lerpPose(pose, pose, P.stowed, this.stow);
    } else {
      lerpPose(pose, pose, { x: 0.06, y: -0.13, z: -0.2, rx: -0.3, ry: 0.55, rz: 0.35 }, spr);
      lerpPose(pose, pose, { x: 0.07, y: -0.2, z: -0.22, rx: -0.62, ry: 0.4, rz: 0.3 }, Math.max(this.lowered, this.stow));
    }
    // Reload / magazine check: the weapon turns its magwell (or muzzle) toward the eye.
    const RP = P ? P.reload : null;
    const CP = P ? P.check : null;
    const add = (k) => (RP ? RP[k] * reloadPose + CP[k] * checkPose : 0);
    // Aiming in: a small dip and roll on the way up.
    const arc = Math.sin(Math.PI * MathUtils.clamp(s.aim, 0, 1));
    const r = this.root;
    r.position.set(
      pose.x + add('x') + this.swayX * swayScale + bobX + brX,
      pose.y + add('y') + this.swayY * swayScale + bobY + brY + s.dip * 0.4 - arc * 0.012 + this.boltJolt * 0.01,
      pose.z + add('z') + this.kickZ,
    );
    r.rotation.set(
      pose.rx + add('rx') + this.kickRot + this.swayY * 1.5 * swayScale + brY * 2,
      pose.ry + add('ry') + this.kickYaw + this.swayX * 1.5 * swayScale + brX * 2,
      pose.rz + add('rz') + this.kickRoll * (1 - 0.6 * aim) + this.swayX * 2 * swayScale + bobR + arc * 0.05,
    );
    // Kick pivots near the shoulder: the whole weapon rises a little with the muzzle.
    r.position.y += this.kickRot * 0.12;

    // A slightly narrower viewmodel FOV while aiming makes the sights read bigger.
    const fov = VIEWMODEL.fov + (VIEWMODEL.adsFov - VIEWMODEL.fov) * aim;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    if (M) this._updateModels(dt, s, T, aim, ck);
    else this._updatePlaceholder(s, T, ck);

    // Show first, then count down: every shot's flash is drawn for at least one frame.
    this.flash.visible = this.flashTimer > 0 && !isLauncher;
    this.launcherFlash.visible = this.flashTimer > 0 && isLauncher;
    this.flashLight.intensity = this.flashTimer > 0 ? 1.5 * (1 - 0.6 * aim) : 0;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
  }

  _updatePlaceholder(s, T, ck) {
    const t = s.reload;
    const magOut = t > 0 ? bump(t, 0.18, 0.32, 0.52, 0.7) : 0;
    const checkMag = ck > 0 ? bump(ck, 0.25, 0.4, 0.6, 0.75) : 0;
    this.mag.position.y = -0.152 - magOut * 0.28 - checkMag * 0.07;
    this.mag.visible = magOut < 0.98;
    this.warhead.visible = this.weapon === 'launcher' && (s.loaded ?? true) && !(t > 0.2 && t < 0.75);
  }

  _applyCover() {
    const M = this.models;
    const d = M.markers.dustCover;
    // cover 0 = closed (rotated up over the port), 1 = hanging open as modeled.
    M.cover.rotation.z = M.coverRest + (d.closed - d.open) * (1 - this.cover);
  }

  _updateModels(dt, s, T, aim, ck) {
    const M = this.models;
    const isLauncher = this.weapon === 'launcher';
    const C = VIEWMODEL[this.weapon];
    const G = isLauncher ? LAUNCHER_GRIPS : RIFLE_GRIPS;
    // Hand placements are in model space (the rifle model sits shifted under its node).
    const weapon = isLauncher ? M.launcher : M.rifleModel;
    this.root.updateMatrixWorld(true);

    // Dust cover: springs open on the first shot, overshoots, settles.
    if (this.coverOpen) {
      bouncyStep(this, 'cover', 'coverVel', 1, 34, 0.22, Math.min(dt, 1 / 60));
      if (this.cover > 1.08) {
        this.cover = 1.08;
        this.coverVel = -Math.abs(this.coverVel) * 0.3;
      }
      this._applyCover();
    }

    // Left hand (and the magazine) through the reload / magazine check.
    const L = this._leftHand(T, ck, isLauncher, G);
    // Trigger finger: on the trigger when ready, along the frame when not.
    const ready = s.reload > 0 || this.lowered > 0.5 || this.stow > 0.1 || this.sprint > 0.5 ? 0 : 1;
    this.trigger = damp(this.trigger, ready, 12, dt);

    // Casings out of the ejection port (rifle only), in view space.
    for (; this._ejects > 0; this._ejects--) {
      if (isLauncher || !this.onEject) continue;
      const m = M.rifle.matrixWorld;
      this._ejectPos.copy(M.port).applyMatrix4(m);
      _q.setFromRotationMatrix(m);
      this._ejectVel.set(2.6 + Math.random() * 0.8, 1.3 + Math.random() * 0.7, 0.4 + Math.random() * 0.5).applyQuaternion(_q);
      this.onEject(this._ejectPos, this._ejectVel);
    }

    // Red dot reticle: the sight's axis in view space.
    if (!isLauncher) M.reticle.uniforms.axis.value.set(0, 0, -1).applyQuaternion(_q.setFromRotationMatrix(M.rifle.matrixWorld));

    // Arms: shoulders follow the weapon a little (they're attached to it, after all).
    const A = M.arms;
    const sh = C.shoulders;
    const sa = C.shouldersAds;
    A.setShoulders(
      sh.x + (sa.x - sh.x) * aim + this.swayX * 0.4,
      sh.y + (sa.y - sh.y) * aim + this.kickRot * 0.05,
      sh.z + (sa.z - sh.z) * aim + this.kickZ * 0.6,
    );
    // Right hand on the grip.
    this._place(A, 'R', G.grip, weapon.matrixWorld);
    const c = G.grip.curls;
    for (const f of ['middle', 'ring', 'pinky']) A.curl('R', f, c.fingers[0], c.fingers[1], c.fingers[2]);
    const tr = this.trigger;
    A.curl('R', 'index', ...[0, 1, 2].map((i) => G.indexOff[i] + (G.trigger[i] - G.indexOff[i]) * tr));
    A.curl('R', 'thumb', c.thumb[0], c.thumb[1], c.thumb[2], c.thumb[3]);
    // Left hand: from the timeline (a blend of two placements).
    this._placeBlend(A, 'L', L.a, L.b, L.t, L.ma, L.mb);
    const pR = C.poleR;
    const pL = C.poleL;
    A.solve(_pole.set(pR[0], pR[1], pR[2]), _pole2.set(pL[0], pL[1], pL[2]));
  }

  /** Puts a hand on a placement given in weapon space (matrix: weapon space -> view). */
  _place(A, side, g, matrix) {
    _p.copy(g.palm).applyMatrix4(matrix);
    _q.setFromRotationMatrix(matrix);
    _f.copy(g.fingers).applyQuaternion(_q);
    _n.copy(g.normal).applyQuaternion(_q);
    A.placeHand(side, _p, _f, _n);
  }

  /** Blend of two placements (each with its own space matrix), curls blended too. */
  _placeBlend(A, side, a, b, t, ma, mb) {
    _p.copy(a.palm).applyMatrix4(ma);
    _v.copy(b.palm).applyMatrix4(mb);
    _p.lerp(_v, t);
    // Lift the hand on its way between placements (an arc instead of a straight line through the gun).
    _p.y += Math.sin(Math.PI * t) * (a === b ? 0 : -0.03);
    _q.setFromRotationMatrix(ma);
    _q2.setFromRotationMatrix(mb);
    _f.copy(a.fingers).applyQuaternion(_q);
    _v2.copy(b.fingers).applyQuaternion(_q2);
    _f.lerp(_v2, t).normalize();
    _n.copy(a.normal).applyQuaternion(_q);
    _v2.copy(b.normal).applyQuaternion(_q2);
    _n.lerp(_v2, t).normalize();
    A.placeHand(side, _p, _f, _n);
    const ca = a.curls;
    const cb = b.curls;
    const mix = (x, y) => x + (y - x) * t;
    const fi = (c) => c.index ?? c.fingers;
    for (const f of ['middle', 'ring', 'pinky']) A.curl(side, f, mix(ca.fingers[0], cb.fingers[0]), mix(ca.fingers[1], cb.fingers[1]), mix(ca.fingers[2], cb.fingers[2]));
    A.curl(side, 'index', mix(fi(ca)[0], fi(cb)[0]), mix(fi(ca)[1], fi(cb)[1]), mix(fi(ca)[2], fi(cb)[2]));
    A.curl(side, 'thumb', mix(ca.thumb[0], cb.thumb[0]), mix(ca.thumb[1], cb.thumb[1]), mix(ca.thumb[2], cb.thumb[2]), mix(ca.thumb[3], cb.thumb[3]));
  }

  /**
   * The left hand's placement this frame and the magazine / rocket it carries.
   * Returns { a, b, t, ma, mb }: blend from placement a (space ma) to b (space mb).
   */
  _leftHand(T, ck, isLauncher, G) {
    const M = this.models;
    const out = this._lh ?? (this._lh = { a: null, b: null, t: 0, ma: new Matrix4(), mb: new Matrix4() });
    const weaponM = (isLauncher ? M.launcher : M.rifleModel).matrixWorld;
    const rest = isLauncher ? G.front : G.handguard;
    const set = (a, ma, b, mb, t) => {
      out.a = a;
      out.b = b;
      out.t = t;
      out.ma.copy(ma);
      out.mb.copy(mb);
      return out;
    };
    // The hand exactly on a carried object (it moves the object, the hand follows).
    const on = (g, obj) => {
      obj.updateMatrixWorld(true);
      return set(g, obj.matrixWorld, g, obj.matrixWorld, 0);
    };
    if (isLauncher) return this._launcherHand(T, G, weaponM, rest, set, on);

    // Magazine: in the well unless the timeline moves it.
    const mag = M.mag;
    mag.visible = true;
    mag.position.copy(M.magRest);
    mag.rotation.set(0, 0, 0);
    mag.updateMatrixWorld(true);
    const R = VIEWMODEL.reload;
    if (T >= 0) {
      const empty = this._reloadEmpty;
      const out1 = R.magOut;
      const upStart = empty ? 0.8 : 0.92;
      const upEnd = upStart + 0.2;
      if (empty && T < upStart) {
        // Empty: the magazine drops free, the hand goes straight for a fresh one.
        if (T >= out1) {
          const f = T - out1;
          mag.position.y -= 0.6 * f + 4.9 * f * f;
          mag.rotation.x = -f * 2.5;
          mag.visible = f < 0.45;
        }
        return set(rest, weaponM, G.pouch, weaponM, smoothstep(0.05, 0.42, T));
      }
      if (!empty && T < upStart) {
        // Tactical: grab the magazine, pull it out, take it down to the pouch.
        if (T < out1) return set(rest, weaponM, G.mag, mag.matrixWorld, smoothstep(0.02, out1 - 0.04, T));
        const pull = smoothstep(out1, out1 + 0.16, T);
        mag.position.y -= pull * 0.11;
        mag.rotation.x = -pull * 0.12;
        this._carry(mag, G.mag, G.pouch, smoothstep(out1 + 0.14, 0.72, T), weaponM);
        return on(G.mag, mag);
      }
      if (T < R.magIn) {
        // Back up with a fresh magazine, from the pouch to under the well, then in.
        const up = smoothstep(upStart, upEnd, T);
        const seat = smoothstep(upEnd - 0.03, R.magIn, T);
        mag.position.y = M.magRest.y - (1 - seat) * 0.07;
        mag.rotation.x = -(1 - seat) * 0.1;
        this._carry(mag, G.mag, G.pouch, 1 - up, weaponM);
        return on(G.mag, mag);
      }
      // Seated: a tap on the floorplate, then the bolt (empty) and back to the handguard.
      mag.position.y = M.magRest.y + bump(T, R.magIn, R.magIn + 0.04, R.magIn + 0.08, R.magIn + 0.16) * 0.002;
      mag.updateMatrixWorld(true);
      if (empty) {
        if (T < R.bolt + 0.02) return set(G.mag, mag.matrixWorld, G.bolt, weaponM, smoothstep(R.magIn + 0.06, R.bolt - 0.02, T));
        if (!this._bolted) {
          this._bolted = true;
          this.boltJoltVel += 1.2;
        }
        return set(G.bolt, weaponM, rest, weaponM, smoothstep(R.bolt + 0.04, R.bolt + 0.32, T));
      }
      return set(G.mag, mag.matrixWorld, rest, weaponM, smoothstep(R.magIn + 0.1, R.magIn + 0.42, T));
    }
    this._bolted = false;
    // Charging handle: hand up to it, pull it back, let it fly home, hand back.
    const ch = this._charge;
    M.charging.position.copy(M.chargingRest);
    if (ch > 0) {
      const t = ch * 0.8;
      const pull = smoothstep(0.24, 0.42, t) * (1 - smoothstep(0.47, 0.5, t));
      M.charging.position.z += pull * 0.07;
      if (t > 0.47 && !this._racked) {
        this._racked = true;
        this.boltJoltVel += 0.8;
      }
      M.rifleModel.updateMatrixWorld(true);
      // The hand rides the handle while pulling.
      if (t < 0.26) return set(rest, weaponM, G.charge, M.charging.matrixWorld, smoothstep(0.0, 0.24, t));
      if (t < 0.5) return set(G.charge, M.charging.matrixWorld, G.charge, M.charging.matrixWorld, 0);
      return set(G.charge, M.charging.matrixWorld, rest, weaponM, smoothstep(0.52, 0.78, t));
    }
    this._racked = false;
    // Magazine check: pull it down a little, look, push it back.
    if (ck > 0) {
      const t = ck * 1.3;
      const pull = bump(t, 0.32, 0.45, 0.82, 0.93);
      mag.position.y -= pull * 0.045;
      mag.rotation.x = -pull * 0.08;
      mag.updateMatrixWorld(true);
      if (t < 0.95) return set(rest, weaponM, G.mag, mag.matrixWorld, smoothstep(0.02, 0.28, t));
      return set(G.mag, mag.matrixWorld, rest, weaponM, smoothstep(0.95, 1.22, t));
    }
    return set(rest, weaponM, rest, weaponM, 0);
  }

  /**
   * Moves an object held in the left hand part of the way (t) from where it is toward a
   * placement b (space mb): the grip a on the object travels to b's palm along an arc, the
   * object turns a little as it goes.
   */
  _carry(obj, a, b, t, mb) {
    obj.updateMatrixWorld(true);
    if (t <= 0) return;
    _v.copy(a.palm).applyMatrix4(obj.matrixWorld);
    _v2.copy(b.palm).applyMatrix4(mb);
    _v2.sub(_v).multiplyScalar(t);
    _v2.y -= Math.sin(Math.PI * t) * 0.03;
    _m2.copy(obj.parent.matrixWorld).invert();
    _p.setFromMatrixPosition(obj.matrixWorld).add(_v2).applyMatrix4(_m2);
    obj.position.copy(_p);
    obj.rotation.x -= t * 0.5;
    obj.rotation.z += t * 0.4;
    obj.updateMatrixWorld(true);
  }

  _launcherHand(T, G, weaponM, rest, set, on) {
    const M = this.models;
    const rocket = M.rocket;
    rocket.position.copy(M.rocketRest);
    rocket.rotation.set(0, 0, 0);
    rocket.visible = this._loaded;
    rocket.updateMatrixWorld(true);
    if (T < 0) return set(rest, weaponM, rest, weaponM, 0);
    const R = VIEWMODEL.launcherReload;
    const len = M.lmarkers.rocketLength;
    // Palm on the rocket's motor, behind the warhead (it reaches the muzzle as the rocket seats).
    const hold = this._rocketGrip ?? (this._rocketGrip = { ...G.rocket, palm: new Vector3(-0.034, 0, -len * 0.3) });
    // Hand down to the pouch, back with a rocket, slide it in at the front, back to the grip.
    if (T < 0.9) {
      rocket.visible = false;
      return set(rest, weaponM, G.pouch, weaponM, smoothstep(0.15, 0.7, T));
    }
    rocket.visible = true;
    if (T < R.rocketIn) {
      const up = smoothstep(0.9, 1.3, T);
      const slide = smoothstep(1.28, R.rocketIn, T);
      rocket.position.z = M.rocketRest.z - (1 - slide) * (len * 0.4);
      this._carry(rocket, hold, G.pouch, 1 - up, weaponM);
      return on(hold, rocket);
    }
    return set(hold, rocket.matrixWorld, rest, weaponM, smoothstep(R.rocketIn + 0.05, R.rocketIn + 0.45, T));
  }
}
