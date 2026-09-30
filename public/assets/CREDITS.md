# Asset credits

Every third-party or generated asset in the game, where it came from and its license.
Only free/CC0 assets are allowed (see CLAUDE.md). This file is rewritten by
`npm run assets:generate` / `npm run assets:fetch`; add hand-made entries to
`scripts/assets/credits.mjs` (the "Other files" list), not here.

## Surface textures (`public/assets/textures/`)

Each set is `<id>_color.ktx2`, `<id>_normal.ktx2` and `<id>_orm.ktx2` (Basis Universal KTX2).

| Set | Source | License |
| --- | --- | --- |
| `limestone_*` | Made in this project from noise by `scripts/assets/generate.mjs` | CC0 |
| `limestone_rough_*` | Made in this project from noise by `scripts/assets/generate.mjs` | CC0 |
| `paving_*` | Made in this project from noise by `scripts/assets/generate.mjs` | CC0 |
| `ashlar_*` | Made in this project from noise by `scripts/assets/generate.mjs` | CC0 |

## Sky / image-based lighting (`public/assets/hdri/`)

| File | Source | License |
| --- | --- | --- |
| `sky_512.exr` | A Poly Haven sky HDRI, resized to 512 x 256, as shipped in the npm package [`@pmndrs/assets`](https://github.com/pmndrs/assets) 1.7.0 (`hdri/sky.exr`); the package is MIT, its Poly Haven HDRIs are CC0. Fallback when `sky_2k.hdr` is missing. | CC0 |

## Other files

| File | Source | License |
| --- | --- | --- |
| Basis Universal transcoder (`basis_transcoder.{js,wasm}`, bundled from three.js `examples/jsm/libs/basis/` at build time) | Binomial LLC, via three.js | Apache-2.0 |
| Leaf cards, prayer notes, bullet holes, scorch marks, dust | Drawn at runtime on canvases / in shaders by the game code | CC0 (this project) |
| All sounds | Synthesized at runtime with Web Audio (`src/weapons/WeaponAudio.js`, `src/story/AmbientAudio.js`) | CC0 (this project) |
