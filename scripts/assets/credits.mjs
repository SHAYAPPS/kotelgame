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
  const lines = [
    '# Asset credits',
    '',
    'Every third-party or generated asset in the game, where it came from and its license.',
    'Only free/CC0 assets are allowed (see CLAUDE.md). This file is rewritten by',
    '`npm run assets:generate` / `npm run assets:fetch`; add hand-made entries to',
    '`scripts/assets/credits.mjs` (the "Other files" list), not here.',
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
