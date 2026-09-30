import { BoxGeometry, CylinderGeometry, SphereGeometry } from 'three';
import { PropType } from './instancing.js';

// Greybox props for the Kotel plaza. Each factory returns a PropType; call .add(placement(...))
// for every copy, then .build(). Prop space: origin at floor level; +Z is the back of the prop.
// Sizes are real-world meters.

const box = (w, h, d) => new BoxGeometry(w, h, d);
const cyl = (r, h, seg = 8) => new CylinderGeometry(r, r, h, seg);

/** White plastic stacking chair (the ones seen all over the prayer area). */
export function plasticChair(m) {
  const white = m('plastic');
  const p = new PropType('plastic-chair', { size: [0.5, 0.86, 0.5] });
  p.part(box(0.46, 0.035, 0.44), white, [0, 0.44, 0]);
  p.part(box(0.44, 0.36, 0.03), white, [0, 0.66, 0.21], [-0.12, 0, 0]);
  for (const [x, z] of [[-0.2, -0.19], [0.2, -0.19], [-0.2, 0.19], [0.2, 0.19]]) {
    p.part(cyl(0.018, 0.44, 6), white, [x, 0.22, z]);
  }
  p.part(box(0.04, 0.2, 0.36), white, [-0.23, 0.56, 0]); // arm rests
  p.part(box(0.04, 0.2, 0.36), white, [0.23, 0.56, 0]);
  return p;
}

/** Shtender: a wooden standing lectern for prayer books. */
export function lectern(m) {
  const wood = m('woodLight');
  const p = new PropType('lectern', { size: [0.5, 1.15, 0.45] });
  p.part(box(0.5, 0.03, 0.4), wood, [0, 1.05, 0], [0.35, 0, 0]);
  p.part(box(0.5, 0.06, 0.03), wood, [0, 0.96, -0.2]);
  p.part(box(0.08, 1.0, 0.08), wood, [0, 0.5, 0.02]);
  p.part(box(0.44, 0.05, 0.4), wood, [0, 0.025, 0]);
  return p;
}

/** Folding table (tefillin stands / tables near the wall). */
export function table(m) {
  const top = m('tableTop');
  const metal = m('metal');
  const p = new PropType('table', { size: [1.2, 0.78, 0.7] });
  p.part(box(1.2, 0.04, 0.7), top, [0, 0.74, 0]);
  for (const [x, z] of [[-0.55, -0.3], [0.55, -0.3], [-0.55, 0.3], [0.55, 0.3]]) {
    p.part(cyl(0.02, 0.72, 6), metal, [x, 0.36, z]);
  }
  return p;
}

/** Glass-fronted wooden bookcase of prayer books (sifrei kodesh). Back side is +Z. */
export function bookshelf(m) {
  const wood = m('woodDark');
  const books = m('books');
  const p = new PropType('bookshelf', { size: [1.2, 1.9, 0.5] });
  p.part(box(1.2, 1.9, 0.08), wood, [0, 0.95, 0.21]); // back
  p.part(box(0.06, 1.9, 0.5), wood, [-0.57, 0.95, 0]);
  p.part(box(0.06, 1.9, 0.5), wood, [0.57, 0.95, 0]);
  p.part(box(1.2, 0.06, 0.5), wood, [0, 1.87, 0]);
  p.part(box(1.2, 0.12, 0.5), wood, [0, 0.06, 0]);
  for (const y of [0.5, 0.95, 1.4]) {
    p.part(box(1.08, 0.03, 0.42), wood, [0, y - 0.03, 0.02]);
    p.part(box(1.06, 0.36, 0.3), books, [0, y + 0.16, 0.05]); // a row of books
  }
  return p;
}

/** Tall plaza lamp post. */
export function lampPost(m) {
  const metal = m('metalDark');
  const glass = m('lampGlass');
  const p = new PropType('lamp-post', { size: [0.3, 5.6, 0.3] });
  p.part(cyl(0.16, 0.5, 8), metal, [0, 0.25, 0]);
  p.part(cyl(0.07, 5.2, 8), metal, [0, 2.9, 0]);
  p.part(box(0.9, 0.06, 0.06), metal, [0, 5.3, 0]);
  p.part(box(0.3, 0.35, 0.3), glass, [-0.45, 5.1, 0]);
  p.part(box(0.3, 0.35, 0.3), glass, [0.45, 5.1, 0]);
  return p;
}

/** Steel police crowd barrier ("bike rack"), 2.2 m long along X. */
export function policeBarrier(m) {
  const steel = m('steel');
  const p = new PropType('police-barrier', { size: [2.2, 1.1, 0.12] });
  p.part(cyl(0.022, 2.2, 6), steel, [0, 1.07, 0], [0, 0, Math.PI / 2]);
  p.part(cyl(0.022, 2.2, 6), steel, [0, 0.18, 0], [0, 0, Math.PI / 2]);
  for (let i = 0; i <= 10; i++) p.part(cyl(0.01, 0.9, 4), steel, [-1.05 + i * 0.21, 0.62, 0]);
  p.part(box(0.06, 0.03, 0.6), steel, [-0.95, 0.015, 0]); // feet
  p.part(box(0.06, 0.03, 0.6), steel, [0.95, 0.015, 0]);
  return p;
}

/** Concrete security block (jersey barrier) at the checkpoint. */
export function concreteBlock(m) {
  const concrete = m('concrete');
  const p = new PropType('concrete-block', { size: [2.0, 0.85, 0.6] });
  p.part(box(2.0, 0.35, 0.6), concrete, [0, 0.175, 0]);
  p.part(box(2.0, 0.5, 0.3), concrete, [0, 0.6, 0]);
  return p;
}

/**
 * Hand-washing station (netilat yadayim): a stone trough with taps and cups,
 * about 3 m long along X.
 */
export function washStation(m) {
  const stone = m('stoneLight');
  const metal = m('steel');
  const p = new PropType('wash-station', { size: [3.0, 1.0, 0.9] });
  p.part(box(3.0, 0.75, 0.9), stone, [0, 0.375, 0]);
  p.part(box(2.8, 0.06, 0.7), m('basin'), [0, 0.76, 0]);
  p.part(box(3.0, 0.5, 0.15), stone, [0, 1.0, 0.38]); // back splash with the taps
  for (let i = 0; i < 6; i++) {
    const x = -1.25 + i * 0.5;
    p.part(cyl(0.02, 0.18, 6), metal, [x, 1.05, 0.25], [Math.PI / 2, 0, 0]);
    p.part(cyl(0.05, 0.12, 8), metal, [x, 0.86, -0.1]); // washing cup (natla)
  }
  return p;
}

/** Metal detector gate at the security checkpoint (walk-through frame). */
export function metalDetector(m) {
  const grey = m('plasticGrey');
  const p = new PropType('metal-detector', null); // walk-through: sides collide via the booth walls
  p.part(box(0.12, 2.1, 0.6), grey, [-0.45, 1.05, 0]);
  p.part(box(0.12, 2.1, 0.6), grey, [0.45, 1.05, 0]);
  p.part(box(1.02, 0.15, 0.6), grey, [0, 2.17, 0]);
  return p;
}

/** X-ray bag scanner with a roller table. */
export function xrayScanner(m) {
  const grey = m('plasticGrey');
  const metal = m('steel');
  const p = new PropType('xray', { size: [1.0, 1.4, 2.8] });
  p.part(box(1.0, 1.3, 1.4), grey, [0, 0.65, 0]);
  p.part(box(0.7, 0.05, 2.8), metal, [0, 0.75, 0]);
  return p;
}

/** Stone planter with a small tree (Jerusalem plazas have olive trees in planters). */
export function planterTree(m) {
  const p = new PropType('planter', { size: [1.4, 0.6, 1.4] });
  p.part(box(1.4, 0.55, 1.4), m('stoneLight'), [0, 0.275, 0]);
  p.part(cyl(0.1, 1.6, 6), m('bark'), [0, 1.3, 0]);
  p.part(new SphereGeometry(0.9, 8, 6), m('foliage'), [0, 2.5, 0]);
  return p;
}

/** Torah ark (aron kodesh): a large wooden cabinet with a curtain. Back is +Z. */
export function torahArk(m) {
  const p = new PropType('torah-ark', { size: [3.2, 3.2, 1.0] });
  p.part(box(3.2, 3.2, 1.0), m('woodDark'), [0, 1.6, 0]);
  p.part(box(2.2, 2.3, 0.05), m('flagBlue'), [0, 1.65, -0.52]); // parochet
  p.part(box(3.4, 0.25, 1.1), m('woodLight'), [0, 3.3, 0]);
  return p;
}
