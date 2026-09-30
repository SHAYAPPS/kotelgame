# Asset credits

Every third-party or generated asset in the game, where it came from and its license.
Only free/CC0 assets are allowed (see CLAUDE.md), except the Mixamo characters below.
This file is rewritten by `npm run assets:generate` / `npm run assets:fetch` /
`npm run assets:characters`; add hand-made entries to `scripts/assets/credits.mjs` (the
"Other files" list), not here.

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

## Characters and animations (`public/assets/characters/`)

From [Mixamo](https://www.mixamo.com) (Adobe), downloaded with the project owner's account
(list and settings: `DOWNLOADS.md`). **License:** Mixamo characters and animations are free
to use royalty-free in games and other projects, commercial or not, under Adobe's terms of
use; they may **not** be redistributed on their own (as standalone character or animation
files). They ship only inside the game, converted, merged, recolored and compressed by
`scripts/assets/characters.mjs`; the raw Mixamo files are kept out of the repository
(`assets-src/`, git-ignored). They are not CC0: this is the one exception to the
free/CC0-only rule, made for the characters.

| File | Mixamo character | Changes |
| --- | --- | --- |
| `squad_swat.glb` | Swat | recolored olive, "SWAT" lettering removed; merged into one mesh, simplified (3 LODs), one texture atlas |
| `squad_swatguy.glb` | Swat Guy | recolored olive; merged into one mesh, simplified (3 LODs), one texture atlas |
| `squad_steve.glb` | Steve | toned to olive; a vest is added in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `enemy_ninja.glb` | Ninja | darkened; merged into one mesh, simplified (3 LODs), one texture atlas |
| `enemy_david.glb` | David | darkened; hair removed, balaclava painted on; merged into one mesh, simplified (3 LODs), one texture atlas |
| `enemy_alex.glb` | Alex | darkened; face wrap painted on; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_brian.glb` | Brian | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_joe.glb` | Joe | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_josh.glb` | Josh | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_lewis.glb` | Lewis | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_remy.glb` | Remy | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_bryce.glb` | Bryce | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_martha.glb` | Martha | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_kate.glb` | Kate | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_elizabeth.glb` | Elizabeth | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_sophie.glb` | Sophie | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |
| `civ_megan.glb` | Megan | clothes recolored per person in game; merged into one mesh, simplified (3 LODs), one texture atlas |

`anims.bin`: these Mixamo animations (exported on Y Bot, retargeted in the game):

| Clip | Mixamo animation |
| --- | --- |
| `rifle_idle` | Pro Rifle Pack: idle |
| `rifle_idle_aiming` | Pro Rifle Pack: idle aiming |
| `rifle_crouch_idle` | Pro Rifle Pack: idle crouching |
| `rifle_crouch_idle_aiming` | Pro Rifle Pack: idle crouching aiming |
| `rifle_idle_relaxed` | Rifle Idle (Two Hand Lowered Gun Rifle Idle) |
| `rifle_idle_lookaround` | Rifle Idle (Rifle Idle Looking Around) |
| `rifle_walk_f` | Pro Rifle Pack: walk forward |
| `rifle_run_f` | Pro Rifle Pack: run forward |
| `rifle_crouchwalk_f` | Pro Rifle Pack: walk crouching forward |
| `rifle_walk_fl` | Pro Rifle Pack: walk forward left |
| `rifle_run_fl` | Pro Rifle Pack: run forward left |
| `rifle_crouchwalk_fl` | Pro Rifle Pack: walk crouching forward left |
| `rifle_walk_fr` | Pro Rifle Pack: walk forward right |
| `rifle_run_fr` | Pro Rifle Pack: run forward right |
| `rifle_crouchwalk_fr` | Pro Rifle Pack: walk crouching forward right |
| `rifle_walk_l` | Pro Rifle Pack: walk left |
| `rifle_run_l` | Pro Rifle Pack: run left |
| `rifle_crouchwalk_l` | Pro Rifle Pack: walk crouching left |
| `rifle_walk_r` | Pro Rifle Pack: walk right |
| `rifle_run_r` | Pro Rifle Pack: run right |
| `rifle_crouchwalk_r` | Pro Rifle Pack: walk crouching right |
| `rifle_walk_b` | Pro Rifle Pack: walk backward |
| `rifle_run_b` | Pro Rifle Pack: run backward |
| `rifle_crouchwalk_b` | Pro Rifle Pack: walk crouching backward |
| `rifle_walk_bl` | Pro Rifle Pack: walk backward left |
| `rifle_run_bl` | Pro Rifle Pack: run backward left |
| `rifle_crouchwalk_bl` | Pro Rifle Pack: walk crouching backward left |
| `rifle_walk_br` | Pro Rifle Pack: walk backward right |
| `rifle_run_br` | Pro Rifle Pack: run backward right |
| `rifle_crouchwalk_br` | Pro Rifle Pack: walk crouching backward right |
| `rifle_walk_relaxed` | Rifle Walk (Walking With Rifle Down) |
| `rifle_run_relaxed` | Rifle Run (Running With Rifle Down) |
| `rifle_fire_stand` | Firing Rifle (Firing A Rifle While Standing) |
| `rifle_reload_stand` | Reloading (Reloading Rifle While Standing) |
| `rifle_reload_crouch` | Reload (Reload Rifle While In Crouch Position) |
| `grenade_toss_stand` | Toss Grenade (Throwing Something Holding Rifle Aimed) |
| `grenade_throw_crouch` | Throw Grenade (Throwing Grenade While Crouched) |
| `hit_rifle_stand` | Hit Reaction (Hit Reaction While Holding A Rifle) |
| `hit_rifle_front_left` | Hit Reaction (Left Reaction To Front Hit Holding A Rifle) |
| `hit_rifle_crouch` | Hit Reaction (Hit Reaction From Rifle Crouched) |
| `cover_wall_idle` | Taking Cover Idle (Cover Idle Against A Wall With Rifle) |
| `death_front` | Pro Rifle Pack: death from the front |
| `death_back` | Pro Rifle Pack: death from the back |
| `death_left` | Pro Rifle Pack: death from right (mirrored) |
| `death_right` | Pro Rifle Pack: death from right |
| `death_headshot_front` | Pro Rifle Pack: death from front headshot |
| `death_headshot_back` | Pro Rifle Pack: death from back headshot |
| `death_crouch_headshot` | Pro Rifle Pack: death crouching headshot front |
| `idle_standing` | Idle (Standing Idle) |
| `idle_breathing` | Breathing Idle |
| `idle_weightshift` | Idle (Weight Shift Idle) |
| `idle_lookaround` | Looking Around (Idle Stand Looking Around) |
| `idle_nervous` | Nervously Look Around (Nervously Looking Around Left To Right - Loop) |
| `talk_general` | Talking (General Conversation) |
| `talk_phone_female` | Talking On Phone (Female Standing Talking On Phone) |
| `talk_phone_male` | Talking On A Cell Phone (Male Standing While Talking On A Cell Phone) |
| `texting` | Texting (Standing Texting On Phone) |
| `praying_swaying` | Praying (Standing Praying While Swaying) |
| `terrified` | Terrified (Being Terrified While Standing) |
| `walk_male` | Walking (Male Standard Walk) |
| `walk_female` | Female Walk (Female Normal Walk) |
| `run_scared_lookback` | Run Look Back (Running Looking Back) |
| `run_standard` | Standard Run (Standard Running) |
| `cower_hiding` | Hiding (Crouched Hiding To Ducking) |

Rifles, vest, headbands, kippot, hats and headscarves on the characters are built from
primitive shapes in code (`src/characters/weapons.js`, `attachments.js`): CC0 (this project).

## Other files

| File | Source | License |
| --- | --- | --- |
| Basis Universal transcoder (`basis_transcoder.{js,wasm}`, bundled from three.js `examples/jsm/libs/basis/` at build time) | Binomial LLC, via three.js | Apache-2.0 |
| Leaf cards, prayer notes, bullet holes, scorch marks, dust | Drawn at runtime on canvases / in shaders by the game code | CC0 (this project) |
| All sounds | Synthesized at runtime with Web Audio (`src/weapons/WeaponAudio.js`, `src/story/AmbientAudio.js`) | CC0 (this project) |
