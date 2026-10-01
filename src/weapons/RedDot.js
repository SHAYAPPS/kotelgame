import {
  BoxGeometry,
  CircleGeometry,
  Color,
  CustomBlending,
  CylinderGeometry,
  DoubleSide,
  Group,
  LatheGeometry,
  Mesh,
  MeshStandardMaterial,
  OneFactor,
  OneMinusSrcAlphaFactor,
  ShaderMaterial,
  Vector2,
  Vector3,
} from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';
import { RED_DOT } from './config.js';

/**
 * The red dot sight: a tube optic (generic, Aimpoint-like) on a riser mount, built from
 * primitives. Its rear lens draws the reticle as a *collimated* dot: the dot is wherever the
 * eye looks exactly along the sight's axis, so it sits at infinity, stays on the aim point
 * when the head moves, and slides off the glass when the rifle is held off-axis (hip fire),
 * like the real thing. Origin: the optic's axis at its rear end; the tube runs toward -Z.
 */
export function buildRedDot() {
  const C = RED_DOT;
  const g = new Group();
  g.name = 'red_dot';
  const body = new MeshStandardMaterial({ color: 0x1b1c1e, roughness: 0.42, metalness: 0.55 });
  const rubber = new MeshStandardMaterial({ color: 0x141414, roughness: 0.85, metalness: 0 });

  // Tube: a closed profile (outer surface forward, inner wall back), so it has a dark inside.
  const L = C.length;
  const R = C.radius;
  const pts = [
    [C.lensRadius + 0.0005, 0],
    [R + 0.0018, 0],
    [R + 0.0018, -0.012],
    [R, -0.016],
    [R, -L + 0.02],
    [R + 0.0022, -L + 0.016],
    [R + 0.0022, -L],
    [C.lensRadius + 0.0005, -L],
  ];
  const profile = [];
  for (let i = 0; i < pts.length; i++) profile.push(new Vector2(pts[i][0], pts[i][1]));
  // Lathe revolves around Y: build along Y, then turn so +Y becomes -Z... (y = z here).
  const tube = new LatheGeometry(profile, 40);
  tube.rotateX(Math.PI / 2); // lathe y -> z (the profile runs from 0 to -L)
  const shell = new Mesh(tube, body);

  // Turrets (elevation on top, windage on the right), the brightness knob on the left.
  const cap = (r, h) => new CylinderGeometry(r, r, h, 20);
  const top = cap(0.0085, 0.011).translate(0, R + 0.005, -L * 0.5);
  const right = cap(0.0085, 0.011).rotateZ(Math.PI / 2).translate(R + 0.005, 0, -L * 0.5);
  const knob = cap(0.0095, 0.012).rotateZ(Math.PI / 2).translate(-(R + 0.006), 0, -L * 0.42);
  const turretBase = new BoxGeometry(0.022, 0.006, 0.03).translate(0, R + 0.0005, -L * 0.5);
  const caps = new Mesh(mergeGeometries([top, right, knob, turretBase]), body);
  caps.geometry.computeVertexNormals();

  // Mount: a ring around the tube and the riser block down to the rail (C.height above it).
  const ring = new CylinderGeometry(R + 0.003, R + 0.003, 0.018, 32, 1, true).rotateX(Math.PI / 2).translate(0, 0, -L * 0.5);
  const riser = new BoxGeometry(0.02, C.height - R + 0.002, 0.026).translate(0, -(R + (C.height - R) / 2) + 0.001, -L * 0.5);
  const clamp = new BoxGeometry(0.028, 0.008, 0.03).translate(0, -C.height + 0.004, -L * 0.5);
  const lever = new BoxGeometry(0.006, 0.004, 0.026).translate(0.016, -C.height + 0.008, -L * 0.5 - 0.004);
  const mount = new Mesh(mergeGeometries([ring, riser, clamp, lever]), body);

  // Rubber lens hoods' lips.
  const lip = new Mesh(new CylinderGeometry(R + 0.0021, R + 0.0021, 0.003, 32, 1, true).rotateX(Math.PI / 2).translate(0, 0, -0.0015), rubber);

  for (const m of [shell, caps, mount, lip]) {
    m.castShadow = false;
    g.add(m);
  }

  // Front glass: a coated, slightly reflective disc (no reticle).
  const front = new Mesh(new CircleGeometry(C.lensRadius, 32), lensMaterial(false));
  front.position.z = -L + 0.006;
  front.renderOrder = 2;
  g.add(front);
  // Rear glass with the reticle.
  const rear = new Mesh(new CircleGeometry(C.lensRadius, 32), lensMaterial(true));
  rear.position.z = -0.004;
  rear.renderOrder = 3;
  g.add(rear);
  g.userData.reticle = rear.material;
  g.userData.front = front.material;
  return g;
}

/**
 * Lens shader. In view space the eye is at the origin; a fragment shows the dot when the
 * direction to it lies within the dot's angular radius of the sight axis (uniform `axis`,
 * view space: the optic's -Z). Additive dot over a faint coating tint.
 */
function lensMaterial(reticle) {
  const C = RED_DOT;
  return new ShaderMaterial({
    uniforms: {
      axis: { value: new Vector3(0, 0, -1) },
      dotColor: { value: new Color(...C.color) },
      dotSize: { value: C.dotSize },
      glow: { value: C.glow },
      brightness: { value: 1 },
      tint: { value: new Color(...(reticle ? C.rearTint : C.frontTint)) },
      lensRadius: { value: C.lensRadius },
    },
    defines: reticle ? { RETICLE: 1 } : {},
    vertexShader: /* glsl */ `
      varying vec3 vView;
      varying vec2 vLocal;
      varying vec3 vNormalV;
      void main() {
        vec4 mv = modelViewMatrix * vec4(position, 1.0);
        vView = mv.xyz;
        vLocal = position.xy;
        vNormalV = normalize(normalMatrix * normal);
        gl_Position = projectionMatrix * mv;
      }
    `,
    fragmentShader: /* glsl */ `
      uniform vec3 axis;
      uniform vec3 dotColor;
      uniform float dotSize;
      uniform float glow;
      uniform float brightness;
      uniform vec3 tint;
      uniform float lensRadius;
      varying vec3 vView;
      varying vec2 vLocal;
      varying vec3 vNormalV;
      void main() {
        vec3 v = normalize(vView);
        float r = clamp(length(vLocal) / lensRadius, 0.0, 1.0);
        // Coating: a faint colored sheen, stronger toward the rim and at grazing angles.
        float facing = abs(dot(v, normalize(vNormalV)));
        float sheen = (0.25 + 0.75 * r * r) * (0.35 + 0.65 * pow(1.0 - facing, 2.0));
        vec3 col = tint * sheen;
        float alpha = 0.02 + 0.06 * sheen;
        #ifdef RETICLE
          float ang = acos(clamp(dot(v, normalize(axis)), -1.0, 1.0));
          float core = 1.0 - smoothstep(dotSize * 0.55, dotSize, ang);
          float halo = exp(-pow(ang / (dotSize * 2.6), 2.0)) * glow;
          col += dotColor * brightness * (core + halo);
        #endif
        gl_FragColor = vec4(col, alpha);
      }
    `,
    transparent: true,
    depthWrite: false,
    side: DoubleSide,
    blending: CustomBlending,
    blendSrc: OneFactor,
    blendDst: OneMinusSrcAlphaFactor,
    toneMapped: false,
  });
}
