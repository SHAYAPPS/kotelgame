import {
  BoxGeometry,
  CanvasTexture,
  ExtrudeGeometry,
  Mesh,
  MeshStandardMaterial,
  RepeatWrapping,
  SRGBColorSpace,
  Shape,
} from 'three';

// Greybox color key (see the test range layout).
export const PALETTE = {
  ground: 0x9a9b98,
  stone: 0xcbbd9f, // warm "Jerusalem stone" grey
  concrete: 0xa3a7ab,
  step: 0x72b06b, // green: walk onto it
  jump: 0xe2ac3f, // amber: jump onto it
  high: 0xd45b43, // red: crouch-jump onto it
  crouch: 0x5585bd, // blue: crouch under it
  ramp: 0x5daaa4, // teal: walkable slope
  steep: 0x93504c, // dark red: too steep to walk
  crate: 0xa77d50,
  boundary: 0x85817a,
};

/** 1 m x 1 m prototype grid tile, generated on a canvas (no external assets). */
export function createGridTexture(maxAnisotropy = 8) {
  const size = 512;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');

  ctx.fillStyle = '#e4e4e4';
  ctx.fillRect(0, 0, size, size);
  // 25 cm lines
  ctx.fillStyle = '#d6d6d6';
  for (let i = 1; i < 4; i++) {
    const p = (i * size) / 4;
    ctx.fillRect(p - 1, 0, 2, size);
    ctx.fillRect(0, p - 1, size, 2);
  }
  // 50 cm cross
  ctx.fillStyle = '#c9c9c9';
  ctx.fillRect(size / 2 - 2, 0, 4, size);
  ctx.fillRect(0, size / 2 - 2, size, 4);
  // 1 m border (half on each edge so tiles join into one line)
  ctx.fillStyle = '#a9a9a9';
  ctx.fillRect(0, 0, size, 4);
  ctx.fillRect(0, size - 4, size, 4);
  ctx.fillRect(0, 0, 4, size);
  ctx.fillRect(size - 4, 0, 4, size);

  const tex = new CanvasTexture(canvas);
  tex.colorSpace = SRGBColorSpace;
  tex.wrapS = RepeatWrapping;
  tex.wrapT = RepeatWrapping;
  tex.anisotropy = maxAnisotropy;
  return tex;
}

/** Returns colorHex => shared MeshStandardMaterial using the grid texture. */
export function createGreyboxMaterials(gridTexture) {
  const cache = new Map();
  return (color) => {
    if (!cache.has(color)) {
      cache.set(color, new MeshStandardMaterial({ color, map: gridTexture, roughness: 0.88, metalness: 0 }));
    }
    return cache.get(color);
  };
}

/**
 * BoxGeometry whose UVs are in meters (the grid texture tiles at 1 m on every face).
 * Origin at the bottom center, like rampGeometry.
 */
export function boxGeometry(w, h, d) {
  const geo = new BoxGeometry(w, h, d);
  const uv = geo.getAttribute('uv');
  // Face order: +x, -x, +y, -y, +z, -z (4 vertices each).
  const uScale = [d, d, w, w, w, w];
  const vScale = [h, h, d, d, h, h];
  for (let f = 0; f < 6; f++) {
    for (let v = 0; v < 4; v++) {
      const i = f * 4 + v;
      uv.setXY(i, uv.getX(i) * uScale[f], uv.getY(i) * vScale[f]);
    }
  }
  geo.translate(0, h / 2, 0);
  return geo;
}

/**
 * Right-triangle prism (a ramp) rising toward -Z: `length` along Z, `height` up,
 * `width` across X. Origin at the low edge's center on the ground.
 */
export function rampGeometry(width, height, length) {
  const shape = new Shape();
  shape.moveTo(0, 0);
  shape.lineTo(length, 0);
  shape.lineTo(length, height);
  shape.closePath();
  const geo = new ExtrudeGeometry(shape, { depth: width, bevelEnabled: false });
  // Shape is in XY and extruded along +Z: turn it so length runs along -Z.
  geo.rotateY(Math.PI / 2);
  geo.translate(-width / 2, 0, 0);
  return geo;
}

/** Mesh helper: casts and receives shadows, positioned by its bottom center. */
export function greyboxMesh(geometry, material, x, bottom, z, rotY = 0) {
  const mesh = new Mesh(geometry, material);
  mesh.position.set(x, bottom, z);
  mesh.rotation.y = rotY;
  mesh.castShadow = true;
  mesh.receiveShadow = true;
  return mesh;
}
