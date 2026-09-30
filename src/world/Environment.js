import {
  BackSide,
  Color,
  DirectionalLight,
  Fog,
  HemisphereLight,
  Mesh,
  ShaderMaterial,
  SphereGeometry,
} from 'three';

const SKY_ZENITH = new Color(0x5d8fc9);
const SKY_HORIZON = new Color(0xc9dbe8);
const GROUND_BELOW = new Color(0x9c9a92);

/**
 * Sky dome, distance fog and a sun + sky light rig.
 * Shadows are rendered once (static world, the player casts none), so they
 * cost nothing per frame; call refreshShadows() if static geometry changes.
 */
export class Environment {
  constructor(scene, renderer, { shadowCenter = [0, 0, 0], shadowExtent = 50 } = {}) {
    this.scene = scene;
    this.renderer = renderer;

    scene.fog = new Fog(SKY_HORIZON.clone(), 60, 320);

    this.sky = new Mesh(
      new SphereGeometry(500, 32, 16),
      new ShaderMaterial({
        side: BackSide,
        depthWrite: false,
        fog: false,
        uniforms: {
          zenith: { value: SKY_ZENITH },
          horizon: { value: SKY_HORIZON },
          below: { value: GROUND_BELOW },
        },
        vertexShader: /* glsl */ `
          varying vec3 vDir;
          void main() {
            vDir = normalize(position);
            gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            gl_Position.z = gl_Position.w; // always at the far plane
          }
        `,
        fragmentShader: /* glsl */ `
          uniform vec3 zenith;
          uniform vec3 horizon;
          uniform vec3 below;
          varying vec3 vDir;
          void main() {
            float h = normalize(vDir).y;
            vec3 col = h >= 0.0
              ? mix(horizon, zenith, pow(h, 0.55))
              : mix(horizon, below, clamp(-h * 6.0, 0.0, 1.0));
            gl_FragColor = vec4(col, 1.0);
            #include <tonemapping_fragment>
            #include <colorspace_fragment>
          }
        `,
      }),
    );
    this.sky.frustumCulled = false;
    this.sky.renderOrder = -1;
    scene.add(this.sky);

    const hemi = new HemisphereLight(0xdde9f5, 0x9a8f7c, 2.0);
    scene.add(hemi);

    // Sun from behind the spawn's right shoulder, so the faces you see are lit.
    const sun = new DirectionalLight(0xfff0db, 2.4);
    const [cx, cy, cz] = shadowCenter;
    sun.position.set(cx + 35, cy + 70, cz + 45);
    sun.target.position.set(cx, cy, cz);
    sun.castShadow = true;
    sun.shadow.mapSize.set(2048, 2048);
    sun.shadow.bias = -0.0004;
    sun.shadow.normalBias = 0.03;
    sun.shadow.radius = 2;
    const cam = sun.shadow.camera;
    cam.left = -shadowExtent;
    cam.right = shadowExtent;
    cam.top = shadowExtent;
    cam.bottom = -shadowExtent;
    cam.near = 1;
    cam.far = 200;
    scene.add(sun, sun.target);
    this.sun = sun;

    renderer.shadowMap.autoUpdate = false;
    this.refreshShadows();
  }

  refreshShadows() {
    this.renderer.shadowMap.needsUpdate = true;
  }

  /** Keep the sky centered on the camera. */
  update(camera) {
    this.sky.position.copy(camera.position);
  }
}
