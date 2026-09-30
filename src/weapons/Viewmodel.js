import {
  AdditiveBlending,
  BoxGeometry,
  CanvasTexture,
  CylinderGeometry,
  DirectionalLight,
  DoubleSide,
  Group,
  HemisphereLight,
  MathUtils,
  Mesh,
  MeshBasicMaterial,
  MeshStandardMaterial,
  PerspectiveCamera,
  PlaneGeometry,
  PointLight,
  SRGBColorSpace,
  Scene,
  TorusGeometry,
} from 'three';

// Poses in view space (meters / radians). The rifle model's origin is its rear
// sight aperture, so the ADS pose simply puts the origin on the view axis.
const HIP = { x: 0.1, y: -0.06, z: -0.24, rx: 0.02, ry: 0.06, rz: -0.06 };
const ADS = { x: 0, y: 0, z: -0.19, rx: 0, ry: 0, rz: 0 };
const SPRINT = { x: 0.06, y: -0.13, z: -0.2, rx: -0.3, ry: 0.55, rz: 0.35 };
// Low ready: muzzle down and across the body (weapon safe during the shift).
const LOWERED = { x: 0.07, y: -0.2, z: -0.22, rx: -0.62, ry: 0.4, rz: 0.3 };
// Launcher on the shoulder: its origin is the optical sight, the tube runs beside it.
const L_HIP = { x: 0.11, y: -0.1, z: -0.3, rx: 0.03, ry: 0.04, rz: -0.03 };
const L_ADS = { x: 0, y: 0, z: -0.14, rx: 0, ry: 0, rz: 0 };
const L_TUBE_X = 0.085;
const L_TUBE_Y = -0.07;
const L_FRONT_Z = -0.62;
const MUZZLE_Z = -0.62;
const SIGHT_DROP = 0.022;
const BORE_Y = -0.07 - SIGHT_DROP;
const MAG_Y = -0.13 - SIGHT_DROP;
const FLASH_TIME = 0.05;

function damp(current, target, lambda, dt) {
  return target + (current - target) * Math.exp(-lambda * dt);
}

function smoothstep(a, b, x) {
  const t = MathUtils.clamp((x - a) / (b - a), 0, 1);
  return t * t * (3 - 2 * t);
}

/** Exact critically damped spring step on obj[x] / obj[v] (no allocations). */
function springStep(obj, x, v, w, dt) {
  const k = obj[v] + w * obj[x];
  const e = Math.exp(-w * dt);
  obj[x] = (obj[x] + k * dt) * e;
  obj[v] = (obj[v] - w * k * dt) * e;
}

function pose(key, aim, hip = HIP, ads = ADS) {
  return hip[key] * (1 - aim) + ads[key] * aim;
}

function flashTexture() {
  const size = 128;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  const c = size / 2;
  const g = ctx.createRadialGradient(c, c, 0, c, c, c);
  g.addColorStop(0, 'rgba(255,250,225,1)');
  g.addColorStop(0.25, 'rgba(255,200,90,0.9)');
  g.addColorStop(0.6, 'rgba(255,120,30,0.25)');
  g.addColorStop(1, 'rgba(255,90,0,0)');
  ctx.fillStyle = g;
  // A few spikes plus a soft core read as a muzzle flash at a glance.
  ctx.beginPath();
  const spikes = 7;
  for (let i = 0; i < spikes * 2; i++) {
    const r = i % 2 === 0 ? c : c * 0.32;
    const a = (i / (spikes * 2)) * Math.PI * 2;
    ctx.lineTo(c + Math.cos(a) * r, c + Math.sin(a) * r);
  }
  ctx.closePath();
  ctx.fill();
  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  return tex;
}

/** Placeholder rifle (greybox shapes) built around the rear sight at the origin, barrel toward -Z. */
function buildRifle() {
  const rifle = new Group();
  // Low metalness: there is no environment map yet, so metallic surfaces would render black.
  const metal = new MeshStandardMaterial({ color: 0x45484d, roughness: 0.5, metalness: 0.25 });
  const polymer = new MeshStandardMaterial({ color: 0x3c3e41, roughness: 0.75, metalness: 0 });
  const tan = new MeshStandardMaterial({ color: 0x8a7a5c, roughness: 0.85, metalness: 0 });
  const glove = new MeshStandardMaterial({ color: 0x5e5c47, roughness: 0.95, metalness: 0 });

  const part = (geo, mat, x, y, z, rx = 0) => {
    const m = new Mesh(geo, mat);
    m.position.set(x, y, z);
    m.rotation.x = rx;
    rifle.add(m);
    return m;
  };
  const box = (w, h, d, mat, x, y, z, rx = 0) => part(new BoxGeometry(w, h, d), mat, x, y, z, rx);
  const cyl = (r, len, mat, x, y, z) => part(new CylinderGeometry(r, r, len, 12), mat, x, y, z, Math.PI / 2);

  // Sights sit well above the bore (like an M4 carry handle rear sight): everything
  // else hangs DROP below the sight line (y = 0).
  const D = -SIGHT_DROP;
  // Rear sight: peep ring on the sight line, protected by two thin ears.
  part(new TorusGeometry(0.0075, 0.0017, 8, 24), metal, 0, 0, 0);
  box(0.003, 0.012, 0.004, metal, 0, -0.013, 0);
  box(0.004, 0.028, 0.012, metal, -0.014, -0.012, 0);
  box(0.004, 0.028, 0.012, metal, 0.014, -0.012, 0);
  box(0.034, 0.03, 0.03, metal, 0, -0.037, 0);
  // Upper receiver + rail, lower receiver, magwell.
  box(0.05, 0.055, 0.27, metal, 0, -0.063 + D, 0.03);
  box(0.034, 0.008, 0.27, metal, 0, -0.033 + D, 0.03);
  box(0.046, 0.05, 0.13, polymer, 0, -0.112 + D, -0.02);
  // Handguard (tan) and barrel with flash hider.
  box(0.058, 0.058, 0.25, tan, 0, -0.068 + D, -0.225);
  cyl(0.009, 0.28, metal, 0, BORE_Y, -0.47);
  cyl(0.012, 0.05, metal, 0, BORE_Y, MUZZLE_Z + 0.025);
  // Front sight: A-frame base, two wings and a thin post whose tip sits on the sight line.
  box(0.024, 0.05, 0.02, metal, 0, -0.06, -0.38);
  box(0.004, 0.03, 0.01, metal, -0.011, -0.022, -0.38);
  box(0.004, 0.03, 0.01, metal, 0.011, -0.022, -0.38);
  box(0.003, 0.04, 0.003, metal, 0, -0.02, -0.38);
  // Pistol grip, stock.
  box(0.03, 0.1, 0.042, polymer, 0, -0.14 + D, 0.085, -0.35);
  box(0.044, 0.068, 0.2, polymer, 0, -0.08 + D, 0.28);
  box(0.048, 0.1, 0.02, polymer, 0, -0.095 + D, 0.385);

  // Magazine on its own pivot so the reload can pull it out.
  const mag = new Group();
  mag.position.set(0, MAG_Y, -0.03);
  const magBody = new Mesh(new BoxGeometry(0.028, 0.16, 0.07), polymer);
  magBody.position.set(0, -0.07, -0.005);
  magBody.rotation.x = 0.18;
  mag.add(magBody);
  rifle.add(mag);

  // Gloved hands: right on the grip, left under the handguard.
  box(0.05, 0.07, 0.09, glove, 0.012, -0.15 + D, 0.09, -0.35);
  box(0.06, 0.05, 0.11, glove, -0.012, -0.105 + D, -0.25);

  return { rifle, mag };
}

/** Placeholder rocket launcher around its sight at the origin, tube toward -Z. */
function buildLauncher() {
  const g = new Group();
  const olive = new MeshStandardMaterial({ color: 0x4f5836, roughness: 0.8, metalness: 0 });
  const dark = new MeshStandardMaterial({ color: 0x2c2f2a, roughness: 0.6, metalness: 0.2 });
  const glove = new MeshStandardMaterial({ color: 0x5e5c47, roughness: 0.95, metalness: 0 });
  const warheadMat = new MeshStandardMaterial({ color: 0x6b6b4a, roughness: 0.5, metalness: 0.2 });
  const tube = new Mesh(new CylinderGeometry(0.048, 0.048, 0.9, 16), olive);
  tube.rotation.x = Math.PI / 2;
  tube.position.set(L_TUBE_X, L_TUBE_Y, -0.17);
  const rear = new Mesh(new CylinderGeometry(0.07, 0.05, 0.12, 16), dark);
  rear.rotation.x = Math.PI / 2;
  rear.position.set(L_TUBE_X, L_TUBE_Y, 0.3);
  const front = new Mesh(new CylinderGeometry(0.055, 0.055, 0.06, 16), dark);
  front.rotation.x = Math.PI / 2;
  front.position.set(L_TUBE_X, L_TUBE_Y, L_FRONT_Z + 0.03);
  // Optical sight: a short box with a dark lens around the view axis.
  const sight = new Mesh(new BoxGeometry(0.034, 0.034, 0.12), dark);
  sight.position.set(0, -0.004, 0.02);
  const mount = new Mesh(new BoxGeometry(0.06, 0.02, 0.05), dark);
  mount.position.set(0.04, -0.03, 0.02);
  // Grips and hands under the tube.
  const grip = new Mesh(new BoxGeometry(0.03, 0.09, 0.04), dark);
  grip.position.set(L_TUBE_X, L_TUBE_Y - 0.09, 0.06);
  grip.rotation.x = -0.25;
  const hand1 = new Mesh(new BoxGeometry(0.05, 0.07, 0.09), glove);
  hand1.position.set(L_TUBE_X + 0.005, L_TUBE_Y - 0.1, 0.07);
  const hand2 = new Mesh(new BoxGeometry(0.06, 0.05, 0.1), glove);
  hand2.position.set(L_TUBE_X - 0.02, L_TUBE_Y - 0.06, -0.3);
  // The loaded rocket's warhead poking out of the front.
  const warhead = new Group();
  const cone = new Mesh(new CylinderGeometry(0.0, 0.06, 0.2, 14), warheadMat);
  cone.rotation.x = -Math.PI / 2;
  cone.position.z = -0.16;
  const neck = new Mesh(new CylinderGeometry(0.06, 0.045, 0.08, 14), warheadMat);
  neck.rotation.x = Math.PI / 2;
  neck.position.z = -0.03;
  warhead.add(cone, neck);
  warhead.position.set(L_TUBE_X, L_TUBE_Y, L_FRONT_Z);
  g.add(tube, rear, front, sight, mount, grip, hand1, hand2, warhead);
  return { launcher: g, warhead };
}

/**
 * The weapon held in view. Rendered in its own scene and camera on top of the world,
 * so it never clips into walls and the world's ADS zoom does not distort it.
 */
export class Viewmodel {
  constructor() {
    this.scene = new Scene();
    this.camera = new PerspectiveCamera(54, 1, 0.01, 5);

    this.scene.add(new HemisphereLight(0xdde9f5, 0x7d7465, 2.2));
    const key = new DirectionalLight(0xfff0db, 2.4);
    key.position.set(0.6, 1, 0.4);
    this.scene.add(key);

    const { rifle, mag } = buildRifle();
    this.rifle = rifle;
    this.mag = mag;
    const { launcher, warhead } = buildLauncher();
    this.launcher = launcher;
    this.warhead = warhead;
    launcher.visible = false;
    this.weapon = 'rifle';
    this.root = new Group(); // posed each frame
    this.root.add(rifle, launcher);
    this.scene.add(this.root);

    // Muzzle flash: three crossed planes + a light that also brightens the rifle.
    const flashMat = new MeshBasicMaterial({
      map: flashTexture(),
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
    // The launcher's flash at the tube's front.
    this.launcherFlash = this.flash.clone();
    this.launcherFlash.position.set(L_TUBE_X, L_TUBE_Y, L_FRONT_Z - 0.1);
    this.launcherFlash.scale.setScalar(2.2);
    this.launcherFlash.visible = false;
    launcher.add(this.launcherFlash);
    this.flashLight = new PointLight(0xffb45a, 0, 1.5, 2);
    this.flashLight.position.set(0, BORE_Y, MUZZLE_Z - 0.05);
    rifle.add(this.flashLight);

    this.flashTimer = 0;
    this.kickZ = 0;
    this.kickZVel = 0;
    this.kickRot = 0;
    this.kickRotVel = 0;
    this.swayX = 0;
    this.swayY = 0;
    this.sprint = 0;
    this.lowered = 0;
  }

  setAspect(aspect) {
    this.camera.aspect = aspect;
    this.camera.updateProjectionMatrix();
  }

  /** Which weapon is in hand ('rifle' | 'launcher'); swap while it's lowered out of view. */
  setWeapon(name) {
    this.weapon = name;
    this.rifle.visible = name === 'rifle';
    this.launcher.visible = name === 'launcher';
  }

  /** Rocket away: a heavy shove back and up. */
  onLauncherShot() {
    this.kickZVel += 0.06 * 28 * Math.E;
    this.kickRotVel += 0.1 * 30 * Math.E;
    this.flashTimer = FLASH_TIME * 2;
  }

  /** A shot: kick the rifle back and up, show the flash. */
  onShot(aim) {
    // Impulses sized so a single shot peaks near 2.2 cm back / 0.055 rad muzzle-up.
    const k = aim > 0.5 ? 0.45 : 1;
    this.kickZVel += 0.022 * 28 * Math.E * k;
    this.kickRotVel += 0.055 * 30 * Math.E * k;
    this.flashTimer = FLASH_TIME;
    this.flash.rotation.z = Math.random() * Math.PI * 2;
    this.flash.scale.setScalar(0.8 + Math.random() * 0.5);
  }

  /**
   * Per rendered frame.
   * @param {number} dt
   * @param {{ aim: number, reload: number, sprinting: boolean, lookX: number, lookY: number,
   *   bobPhase: number, bobWeight: number, dip: number }} s
   */
  update(dt, s) {
    const aim = smoothstep(0, 1, s.aim);
    this.sprint = damp(this.sprint, s.sprinting ? 1 : 0, 10, dt);
    this.lowered = damp(this.lowered, s.lowered ? 1 : 0, 6, dt);
    // Magazine check: tilt the rifle toward you and slide the magazine halfway out.
    const ck = s.check ?? 0;
    const checkPose = ck > 0 ? smoothstep(0, 0.2, ck) * (1 - smoothstep(0.8, 1, ck)) : 0;
    const checkMag = ck > 0 ? smoothstep(0.25, 0.4, ck) * (1 - smoothstep(0.6, 0.75, ck)) : 0;

    // Sway: the rifle lags a little behind mouse movement.
    const swayScale = 1 - 0.8 * aim;
    this.swayX = damp(this.swayX, MathUtils.clamp(-s.lookX * 0.00022, -0.025, 0.025), 12, dt);
    this.swayY = damp(this.swayY, MathUtils.clamp(s.lookY * 0.00022, -0.025, 0.025), 12, dt);

    // Bob, phase-locked with the camera's head bob (one cycle per two steps).
    const bobScale = s.bobWeight * (1 - 0.85 * aim);
    const bobX = Math.sin(Math.PI * s.bobPhase) * 0.011 * bobScale;
    const bobY = -Math.abs(Math.cos(Math.PI * s.bobPhase)) * 0.009 * bobScale;

    // Kick: springs that recover in ~0.1 s.
    springStep(this, 'kickZ', 'kickZVel', 28, dt);
    springStep(this, 'kickRot', 'kickRotVel', 30, dt);

    // Reload: tilt the rifle, drop the magazine out and bring a new one in.
    const t = s.reload;
    const reloadPose = t > 0 ? smoothstep(0, 0.15, t) * (1 - smoothstep(0.85, 1, t)) : 0;
    const magOut = t > 0 ? smoothstep(0.18, 0.32, t) * (1 - smoothstep(0.52, 0.7, t)) : 0;
    this.mag.position.y = MAG_Y - magOut * 0.28 - checkMag * 0.07;
    this.mag.visible = magOut < 0.98;
    const isLauncher = this.weapon === 'launcher';
    // Launcher: the warhead is out of the tube between shot and reload end.
    this.warhead.visible = isLauncher && (s.loaded ?? true) && !(t > 0.2 && t < 0.75);

    const spr = this.sprint * (1 - aim);
    const low = this.lowered;
    const hip = isLauncher ? L_HIP : HIP;
    const ads = isLauncher ? L_ADS : ADS;
    const base = (key) => MathUtils.lerp(MathUtils.lerp(pose(key, aim, hip, ads), SPRINT[key], spr), LOWERED[key], low);
    const r = this.root;
    r.position.set(
      base('x') - checkPose * 0.05 + this.swayX * swayScale + bobX,
      base('y') + checkPose * 0.08 + this.swayY * swayScale + bobY + s.dip * 0.4 - reloadPose * 0.04,
      base('z') + checkPose * 0.04 + this.kickZ,
    );
    r.rotation.set(
      base('rx') + checkPose * 0.5 + this.kickRot - reloadPose * 0.35 + this.swayY * 1.5 * swayScale,
      base('ry') - checkPose * 0.3 + this.swayX * 1.5 * swayScale,
      base('rz') + checkPose * 0.9 + reloadPose * 0.6 + this.swayX * 2 * swayScale,
    );

    // A slightly narrower viewmodel FOV while aiming makes the sights read bigger.
    const fov = 54 - 10 * aim;
    if (Math.abs(this.camera.fov - fov) > 1e-3) {
      this.camera.fov = fov;
      this.camera.updateProjectionMatrix();
    }

    // Show first, then count down: every shot's flash is drawn for at least one frame.
    this.flash.visible = this.flashTimer > 0 && !isLauncher;
    this.launcherFlash.visible = this.flashTimer > 0 && isLauncher;
    this.flashLight.intensity = this.flashTimer > 0 ? 1.5 : 0;
    this.flashTimer = Math.max(0, this.flashTimer - dt);
  }
}
