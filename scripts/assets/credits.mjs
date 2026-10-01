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
  const weapons = await json(new URL('weapons/manifest.json', ASSETS));
  const audio = await json(new URL('audio/manifest.json', ASSETS));
  const audioRows = Object.values(audio.credits ?? {}).map((c) => {
    const lic = c.licenseUrl ? `[${c.license}](${c.licenseUrl})` : c.license;
    return `| ${c.sounds.map((x) => `\`${x}\``).join(', ')} | [${c.title}](${c.page}) by ${c.author} | ${lic} |`;
  });
  const WEAPON_USE = {
    rifle: 'The assault rifle (rear sight folded, textures packed, metalness toned down)',
    arms: 'The first-person arms (gloves and olive sleeves painted over the bare-skin texture, new normal map)',
    launcher: 'The rocket launcher and its rocket (re-oriented, smoothed normals)',
    truck: "The armed pickup (resized, smoothed normals, the maker's badge removed, materials by part)",
  };
  const weaponRows = Object.entries(weapons.models ?? {}).map(([id, m]) => {
    const s = m.source ?? {};
    const lic = s.licenseUrl ? `[${s.license}](${s.licenseUrl})` : s.license;
    return `| \`${m.file}\` | ${WEAPON_USE[id] ?? id} | [${s.title}](${s.url}) by ${s.author} | ${lic} |`;
  });
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
    '## Weapons and vehicles (`public/assets/weapons/`)',
    '',
    'Converted by `scripts/assets/weapons.mjs` (sources: `scripts/assets/weapons.config.mjs`). The game',
    'uses generic names for them. CC-BY models are credited here as their license requires.',
    '',
    '| File | Used as | Source | License |',
    '| --- | --- | --- | --- |',
    ...weaponRows,
    '| Red dot sight | Built from primitives in code (`src/weapons/RedDot.js`) | This project | CC0 |',
    '| Spent casings | Built in code (`src/weapons/Casings.js`) | This project | CC0 |',
    '',
    '## Sounds and music (`public/assets/audio/`)',
    '',
    'Recordings sliced, filtered, re-pitched, looped and loudness-matched by',
    '`scripts/assets/audio.mjs` (sources: `scripts/assets/audio.config.mjs`), encoded as Ogg Opus.',
    'The plaza reverb is generated in code (`src/audio/reverb.js`, CC0, this project). CC-BY works',
    'are credited here as their licenses require.',
    '',
    '| Sounds | Source | License |',
    '| --- | --- | --- |',
    ...audioRows,
    '',
    'Music: "Desert City", "Drums of the Deep", "Urban Gauntlet", "The Escalation" and "Heart of',
    'Nowhere" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution',
    '4.0 License, http://creativecommons.org/licenses/by/4.0/',
    '',
    '## Other files',
    '',
    '| File | Source | License |',
    '| --- | --- | --- |',
    '| Basis Universal transcoder (`basis_transcoder.{js,wasm}`, bundled from three.js `examples/jsm/libs/basis/` at build time) | Binomial LLC, via three.js | Apache-2.0 |',
    '| Leaf cards, prayer notes, bullet holes, scorch marks, dust | Drawn at runtime on canvases / in shaders by the game code | CC0 (this project) |',
    '',
  ];
  await writeFile(new URL('CREDITS.md', ASSETS), lines.join('\n'));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) writeCredits();
