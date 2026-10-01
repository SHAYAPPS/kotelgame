import { uniform, vec4 } from 'three/tsl';

/**
 * The scene camera's matrices as uniforms for a post pass. Inside a pass, three's camera nodes
 * (cameraProjectionMatrix, cameraPosition, ...) are the full-screen quad's own camera, not the
 * one that drew the scene.
 */
export function cameraUniforms(camera) {
  const world = uniform(camera.matrixWorld);
  return {
    projection: uniform(camera.projectionMatrix),
    projectionInverse: uniform(camera.projectionMatrixInverse),
    view: uniform(camera.matrixWorldInverse),
    world,
    position: world.mul(vec4(0, 0, 0, 1)).xyz,
  };
}
