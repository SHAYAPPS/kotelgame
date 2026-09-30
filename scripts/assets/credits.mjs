// Writes public/assets/CREDITS.md from the texture and HDRI manifests plus the fixed list
// of other third-party files. Run by the asset scripts; safe to run on its own:
//   node scripts/assets/credits.mjs
import { readFile, writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';

const ASSETS = new URL('../../public/assets/', import.meta.url);

const json = async (url) => JSON.parse(await readFile(url, 'utf8').catch(() => '{}'));

function row(file, a) {
  if (a.source === 'generated') {
    return `| \`${file}\` | Made in this project from noise by \`scripts/assets/generate.mjs\` | CC0 |`;
  }
  const by = a.authors?.length ? ` by ${a.authors.join(', ')}` : '';
  const name = a.name ?? a.asset;
  const link = name && a.url ? `[${name}](${a.url})` : name;
  return `| \`${file}\` | ${[link && link + by, a.source].filter(Boolean).join(', ')} | ${a.license} |`;
}

export async function writeCredits() {
  const tex = await json(new URL('textures/manifest.json', ASSETS));
  const hdri = await json(new URL('hdri/manifest.json', ASSETS));
  const chars = await json(new URL('characters/manifest.json', ASSETS));
  const clipRows = Object.entries(chars.anims?.clips ?? {}).map(([name, c]) => `| \`${name}\` | ${c.source ?? name} |`);
  const lines = [
    '# Asset credits',
    '',
    'Every third-party or generated asset in the game, where it came from and its license.',
    'Only free/CC0 assets are allowed (see CLAUDE.md), except the Mixamo characters below.',
    'This file is rewritten by `npm run assets:generate` / `npm run assets:fetch` /',
    '`npm run assets:characters`; add hand-made entries to `scripts/assets/credits.mjs` (the',
    '"Other files" list), not here.',
    '',
    '## Surface textures (`public/assets/textures/`)',
    '',
    'Each set is `<id>_color.ktx2`, `<id>_normal.ktx2` and `<id>_orm.ktx2` (Basis Universal KTX2).',
    '',
    '| Set | Source | License |',
    '| --- | --- | --- |',
    ...Object.entries(tex).map(([id, a]) => row(`${id}_*`, a)),
    '',
    '## Sky / image-based lighting (`public/assets/hdri/`)',
    '',
    '| File | Source | License |',
    '| --- | --- | --- |',
    ...Object.values(hdri).map((a) => row(a.file, a)),
    '| `sky_512.exr` | A Poly Haven sky HDRI, resized to 512 x 256, as shipped in the npm package [`@pmndrs/assets`](https://github.com/pmndrs/assets) 1.7.0 (`hdri/sky.exr`); the package is MIT, its Poly Haven HDRIs are CC0. Fallback when `sky_2k.hdr` is missing. | CC0 |',
    '',
    '## Characters and animations (`public/assets/characters/`)',
    '',
    'From [Mixamo](https://www.mixamo.com) (Adobe), downloaded with the project owner\'s account',
    '(list and settings: `DOWNLOADS.md`). **License:** Mixamo characters and animations are free',
    'to use royalty-free in games and other projects, commercial or not, under Adobe\'s terms of',
    'use; they may **not** be redistributed on their own (as standalone character or animation',
    'files). They ship only inside the game, converted, merged, recolored and compressed by',
    '`scripts/assets/characters.mjs`; the raw Mixamo files are kept out of the repository',
    '(`assets-src/`, git-ignored). They are not CC0: this is the one exception to the',
    'free/CC0-only rule, made for the characters.',
    '',
    '| File | Mixamo character | Changes |',
    '| --- | --- | --- |',
    ...Object.values(chars.characters ?? {}).map((c) => `| \`${c.file}\` | ${c.source} | ${c.credit ?? ''}; merged into one mesh, simplified (3 LODs), one texture atlas |`),
    '',
    '`anims.bin`: these Mixamo animations (exported on Y Bot, retargeted in the game):',
    '',
    '| Clip | Mixamo animation |',
    '| --- | --- |',
    ...clipRows,
    '',
    'Rifles, vest, headbands, kippot, hats and headscarves on the characters are built from',
    'primitive shapes in code (`src/characters/weapons.js`, `attachments.js`): CC0 (this project).',
    '',
    '## Other files',
    '',
    '| File | Source | License |',
    '| --- | --- | --- |',
    '| Basis Universal transcoder (`basis_transcoder.{js,wasm}`, bundled from three.js `examples/jsm/libs/basis/` at build time) | Binomial LLC, via three.js | Apache-2.0 |',
    '| Leaf cards, prayer notes, bullet holes, scorch marks, dust | Drawn at runtime on canvases / in shaders by the game code | CC0 (this project) |',
    '| All sounds | Synthesized at runtime with Web Audio (`src/weapons/WeaponAudio.js`, `src/story/AmbientAudio.js`) | CC0 (this project) |',
    '',
  ];
  await writeFile(new URL('CREDITS.md', ASSETS), lines.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeCredits();
