// Civilian clothing rules (src/characters/wardrobe.js): head coverings, modest dress, and
// neighbors that never look the same.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync, readFileSync } from 'node:fs';
import { CAST, dressPerson, likeness, makeOutfit } from '../src/characters/wardrobe.js';

const MANIFEST = new URL('../public/assets/characters/manifest.json', import.meta.url);
const manifest = existsSync(MANIFEST) ? JSON.parse(readFileSync(MANIFEST, 'utf8')) : null;
const infoOf = (id) => manifest?.characters[id] ?? null;

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('every man covers his head; haredim wear black hats, the rest kippot', { skip: !manifest }, () => {
  const rand = seeded(7);
  for (const kind of ['worshipper', 'civilian', 'tourist', 'guide']) {
    for (const id of Object.keys(CAST[kind])) {
      const info = infoOf(id);
      if (info.sex !== 'm') continue;
      for (let k = 0; k < 20; k++) {
        const o = makeOutfit(id, info, kind, rand);
        assert.ok(o.head, `${kind} ${id} bareheaded`);
        if (o.look === 'haredi') assert.equal(o.head.type, 'blackHat');
        else {
          assert.equal(o.head.type, 'kippah', `${kind} ${id} ${o.look}`);
          assert.ok(['velvet', 'white', 'knit'].includes(o.head.style));
        }
      }
    }
  }
});

test('women wear long skirts, and long sleeves over bare arms', { skip: !manifest }, () => {
  const rand = seeded(11);
  for (const [id, info] of Object.entries(manifest.characters)) {
    if (info.role !== 'civilian' || info.sex !== 'f') continue;
    assert.ok(info.parts.includes(7), `${id} has no skirt`);
    for (let k = 0; k < 10; k++) {
      const o = makeOutfit(id, info, 'tourist', rand);
      assert.equal(o.tints[7]?.[3], 1, `${id} skirt color`);
      if (info.parts.includes(8)) {
        assert.equal(o.tints[8]?.[3], 1, `${id} sleeves`);
        assert.deepEqual(o.tints[8].slice(0, 3), o.tints[1].slice(0, 3), 'sleeves match the top');
      }
      assert.ok(!o.head || o.head.type === 'scarf');
    }
  }
});

test('most men at the wall dress like Kotel visitors: black suits or white shirts', { skip: !manifest }, () => {
  const rand = seeded(3);
  const looks = {};
  for (let k = 0; k < 400; k++) {
    const pick = dressPerson('worshipper', [], infoOf, rand);
    looks[pick.outfit.look] = (looks[pick.outfit.look] ?? 0) + 1;
  }
  const formal = (looks.haredi ?? 0) + (looks.suit ?? 0) + (looks.whiteShirt ?? 0);
  assert.ok(formal / 400 > 0.65, JSON.stringify(looks));
  assert.ok((looks.haredi ?? 0) > 40, 'some haredim');
});

test('people standing next to each other never look the same', { skip: !manifest }, () => {
  for (const [kind, spacing] of [['worshipper', 1.6], ['worshipperWoman', 1.2], ['tourist', 1.1], ['civilian', 2]]) {
    const rand = seeded(kind.length * 31);
    const placed = [];
    for (let i = 0; i < 14; i++) {
      const x = i * spacing;
      const neighbors = placed.filter((p) => Math.abs(p.x - x) < 9).map((p) => ({ sig: p.sig, near: 1 - Math.abs(p.x - x) / 9 }));
      const pick = dressPerson(kind, neighbors, infoOf, rand);
      placed.push({ x, sig: pick.outfit.sig });
    }
    for (let i = 1; i < placed.length; i++) {
      const a = placed[i].sig;
      const b = placed[i - 1].sig;
      assert.notEqual(a.id, b.id, `${kind}: neighbors ${i - 1}/${i} are both ${a.id}`);
      assert.ok(likeness(a, b) < 3.5, `${kind}: ${i - 1}/${i} look alike`);
    }
  }
});
