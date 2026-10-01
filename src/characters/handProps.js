import { AdditiveBlending, BoxGeometry, Color, CylinderGeometry, Float32BufferAttribute, Group, Mesh, MeshBasicMaterial, MeshStandardMaterial, PlaneGeometry, TorusGeometry } from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

// Things people carry (story/people.js `prop`): a cane, a prayer book, a phone (its flash for
// photos), a charity can, a box of paper kippot. Simple shapes, made once and shared; each is
// held in a hand bone (Mixamo's hand frame: +Y along the fingers, +X across the palm, the
// palm facing -Z for the right hand), placed by CharacterModel.attach.

const mat = new MeshStandardMaterial({ vertexColors: true, roughness: 0.6, metalness: 0.05 });

function colored(geo, hex) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute('uv');
  const c = new Color(hex);
  const n = g.getAttribute('position').count;
  const col = new Float32Array(n * 3);
  for (let i = 0; i < n; i++) col.set([c.r, c.g, c.b], i * 3);
  g.setAttribute('color', new Float32BufferAttribute(col, 3));
  return g;
}

const shapes = new Map();
function shape(name, make) {
  if (!shapes.has(name)) shapes.set(name, mergeGeometries(make()));
  return shapes.get(name);
}

const flashMat = new MeshBasicMaterial({ color: new Color(1, 1, 1).multiplyScalar(8), transparent: true, opacity: 0, blending: AdditiveBlending, depthWrite: false, toneMapped: false });

/**
 * A prop: { bone, object } (object positioned in the bone's frame; bone null: the model's
 * root). phone: object.userData.flash is a plane the view lights for a photo; cane:
 * object.userData.vertical { shaft, crook }, the view stands it under the right hand.
 */
export function handProp(name) {
  const g = new Group();
  let bone = 'RightHand';
  switch (name) {
    case 'cane': {
      // Standing on the floor under the right hand (the view keeps it there: `vertical`): a
      // unit shaft scaled to the hand's height, the crook on top.
      bone = null;
      const shaft = new Mesh(shape('caneShaft', () => [colored(new CylinderGeometry(0.011, 0.013, 1, 8).translate(0, 0.5, 0), 0x3b2516)]), mat);
      const crook = new Mesh(shape('caneCrook', () => [colored(new TorusGeometry(0.045, 0.012, 6, 10, Math.PI).rotateY(Math.PI / 2).translate(0, 0, 0.045), 0x3b2516)]), mat);
      g.add(shaft, crook);
      g.userData.vertical = { shaft, crook };
      break;
    }
    case 'book': {
      // An open prayer book on the lap, tilted up toward the reader (sitting).
      bone = 'Hips';
      const geo = shape('book', () => [
        colored(new BoxGeometry(0.15, 0.012, 0.21).translate(-0.078, 0, 0).rotateZ(0.12), 0x4a1416),
        colored(new BoxGeometry(0.15, 0.012, 0.21).translate(0.078, 0, 0).rotateZ(-0.12), 0x4a1416),
        colored(new BoxGeometry(0.29, 0.006, 0.2).translate(0, 0.012, 0), 0xf0e9d6),
      ]);
      const m = new Mesh(geo, mat);
      m.position.set(0, 0.1, 0.3);
      m.rotation.set(-0.55, 0, 0);
      g.add(m);
      break;
    }
    case 'phone': {
      const geo = shape('phone', () => [colored(new BoxGeometry(0.072, 0.15, 0.009), 0x111214)]);
      const m = new Mesh(geo, mat);
      m.position.set(-0.01, 0.07, -0.03);
      g.add(m);
      const flash = new Mesh(new PlaneGeometry(0.05, 0.05), flashMat.clone());
      flash.position.set(-0.01, 0.12, -0.04);
      flash.rotation.y = Math.PI;
      flash.userData.noCSM = true;
      g.add(flash);
      g.userData.flash = flash;
      break;
    }
    case 'can': {
      bone = 'LeftHand';
      const geo = shape('can', () => [
        colored(new CylinderGeometry(0.045, 0.045, 0.12, 10), 0xb3242a),
        colored(new BoxGeometry(0.03, 0.004, 0.006).translate(0, 0.061, 0), 0x222222),
      ]);
      const m = new Mesh(geo, mat);
      m.position.set(0.01, 0.08, -0.04);
      g.add(m);
      break;
    }
    case 'box': {
      // A cardboard box of white paper kippot.
      bone = 'LeftHand';
      const geo = shape('box', () => [
        colored(new BoxGeometry(0.26, 0.11, 0.18).translate(0, 0.055, 0), 0xa9824f),
        colored(new CylinderGeometry(0.06, 0.06, 0.02, 10).translate(-0.06, 0.115, 0), 0xf4f4f0),
        colored(new CylinderGeometry(0.06, 0.06, 0.02, 10).translate(0.06, 0.12, 0.02), 0xf4f4f0),
      ]);
      const m = new Mesh(geo, mat);
      m.position.set(0.05, 0.08, -0.08);
      m.rotation.set(0, 0, 0.2);
      g.add(m);
      break;
    }
    case 'snack': {
      const geo = shape('snack', () => [colored(new BoxGeometry(0.12, 0.08, 0.04), 0xe0b03a)]);
      const m = new Mesh(geo, mat);
      m.position.set(0, 0.08, -0.04);
      g.add(m);
      break;
    }
    default:
      return null;
  }
  return { bone, object: g };
}
