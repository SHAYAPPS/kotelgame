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
| `night_1k.hdr`, `night_sky.jpg` | [Kloppenheim 02 (Pure Sky)](https://polyhaven.com/a/kloppenheim_02_puresky) by Greg Zaal, Jarod Guest, Poly Haven (the visible sky: its tonemapped JPG, upper half, 4096 x 1024) | CC0 |
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
| `talk_question_left` | Talking (Asking A Question With One Hand), mirrored |
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
| `sit_chair` | Sitting Idle (Sitting In Chair Hands Resting On Thighs) |
| `sit_reading` | Seated Idle (Seated Idle With Hands On A Table) |
| `old_idle` | Old Man Idle (Old Man Standing Idle) |
| `old_walk` | Old Man Walk (Slow Old Man Shuffle Walk) |
| `walk_back_male` | Walking Backwards |
| `walk_back_female` | Walking Backwards (Female Walk Backwards) |
| `wall_reach` | Unarmed Grab Torch From Wall (Picking Up Torch From Wall) |
| `wall_touch` | Petting (Petting A Large Animal) |
| `bow_quick` | Quick Informal Bow |
| `reach_out` | Reaching Out (Reaching Out Gesture) |
| `salute` | Salute (Formal Military Salute) |
| `wave` | Waving |
| `thumbs_up` | Standing Thumbs Up (Giving Thumbs Up While Standing) |
| `clap` | Clapping (Clap While Standing) |
| `happy_idle` | Happy Idle (Happy Idle Variation 1) |
| `stairs_walk_up` | Ascending Stairs (Walking Up A Set Of Stairs) |
| `stairs_walk_down` | Descending Stairs (Walking Down A Set Of Stairs) |
| `stairs_run_up` | Running Up Stairs |
| `stairs_run_down` | Descending Stairs (Running Down A Set Of Stairs) |

Rifles, vest, headbands, kippot, hats and headscarves on the characters are built from
primitive shapes in code (`src/characters/weapons.js`, `attachments.js`): CC0 (this project).

## Weapons and vehicles (`public/assets/weapons/`)

Converted by `scripts/assets/weapons.mjs` (sources: `scripts/assets/weapons.config.mjs`). The game
uses generic names for them. CC-BY models are credited here as their license requires.

| File | Used as | Source | License |
| --- | --- | --- | --- |
| `rifle.glb` | The assault rifle (rear sight folded, textures packed, metalness toned down) | [M4A1 Assault Rifle](https://opengameart.org/content/m4a1-assault-rifle) by nisu | CC0 |
| `arms.glb` | The first-person arms (gloves and olive sleeves painted over the bare-skin texture, new normal map) | [FPS Arms (rigged only)](https://opengameart.org/content/fps-arms-rigged-only) by para | CC0 |
| `launcher.glb` | The rocket launcher and its rocket (re-oriented, smoothed normals) | [Low poly RPG7](https://opengameart.org/content/low-poly-rpg7) by Lucian Pavel | CC0 |
| `truck.glb` | The armed pickup (resized, smoothed normals, the maker's badge removed, materials by part) | [Mitsubishi L200](https://poly.pizza/m/4qjS9tFhsJg) by Muhammad Reyhan | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| Red dot sight | Built from primitives in code (`src/weapons/RedDot.js`) | This project | CC0 |
| Spent casings | Built in code (`src/weapons/Casings.js`) | This project | CC0 |

## Sounds and music (`public/assets/audio/`)

Recordings sliced, filtered, re-pitched, looped and loudness-matched by
`scripts/assets/audio.mjs` (sources: `scripts/assets/audio.config.mjs`), encoded as Ogg Opus.
The plaza reverb is generated in code (`src/audio/reverb.js`, CC0, this project). CC-BY works
are credited here as their licenses require.

| Sounds | Source | License |
| --- | --- | --- |
| `rifle_close`, `rifle_tail`, `ar_near`, `ar_mid`, `ar_far`, `ak_near`, `ak_mid`, `ak_far`, `crack` | [The Free Firearm Sound Library](https://opengameart.org/content/the-free-firearm-sound-library) by Ben Jaszczak, Brian Nelson, Kevin Heras and Matthew Nanney | CC0 |
| `rifle_mech`, `grenade_pin`, `dry_fire` | [2 Metal Weapon Clicks](https://opengameart.org/content/2-metal-weapon-clicks) by Michel Baradari (apollo-music.de) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `whiz`, `grenade_throw` | [Air Whoosh](https://opengameart.org/content/air-whoosh) by pyranostudios | CC0 |
| `explosion`, `explosion_small` | [2 High Quality Explosions](https://opengameart.org/content/2-high-quality-explosions) by Michel Baradari (apollo-music.de) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `explosion`, `explosion_small` | [Explosions](https://opengameart.org/content/explosions-4) by EZduzziteh | CC0 |
| `boom_far`, `siren` | [Civil defense siren and missile explosions sounds in Israel during Iran war 2026](https://commons.wikimedia.org/wiki/File:Civil_defense_siren_and_missile_explosions_sounds_in_Israel_during_Iran_war_2026.ogg) by Yoram Shurek (יורם שורק) | CC0 |
| `rocket_launch` | [4 Projectile Launches](https://opengameart.org/content/4-projectile-launches) by Michel Baradari (apollo-music.de) | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `grenade_bounce`, `casing`, `launcher_load`, `step_stone`, `step_wood` | [Impact Sounds](https://kenney.nl/assets/impact-sounds) by Kenney (www.kenney.nl) | CC0 |
| `mag_out`, `mag_in`, `bolt`, `charge`, `launcher_load` | [Gun Reload Sounds](https://opengameart.org/content/gun-reload-sounds) by SpringySpringo | CC0 |
| `mag_check`, `resupply` | [Gun Reload Sound Effects](https://opengameart.org/content/gun-reload-sound-effects) by BMacZero | CC0 |
| `gear`, `resupply` | [Equipment Clicks II](https://opengameart.org/content/equipment-clicks-ii) by LFA | CC0 |
| `hit`, `hit_head`, `chime` | [Interface Sounds](https://kenney.nl/assets/interface-sounds) by Kenney (www.kenney.nl) | CC0 |
| `radio_squelch` | [Frequency Static Sound Effects](https://opengameart.org/content/frequency-static-sound-effects) by bretbernhoft | CC0 |
| `radio_static` | [Static](https://opengameart.org/content/static) by xhunterko | CC0 |
| `scream` | [Female Screams (the CC0 ones: tcrocker68, pushkin, Archeos via Freesound)](https://opengameart.org/content/female-screams) by congusbongus (compilation) | CC0 |
| `scream` | [Aargh (male screams; the CC0 ones: JohnsonBrandEditing via Freesound)](https://opengameart.org/content/aargh-male-screams) by congusbongus (compilation) | CC0 |
| `amb_city` | [High traffic road sounds](https://opengameart.org/content/high-traffic-road-sounds) by IgnasD | CC0 |
| `amb_street` | [Karlova 0001 (street ambience, Prague)](https://commons.wikimedia.org/wiki/File:Karlova_0001.ogg) by Juan de Vojníkov | Public domain |
| `amb_crowd` | [Festival concert people crowd](https://commons.wikimedia.org/wiki/File:Festival_concert_people_crowd.ogg) by stephan | Public domain |
| `amb_birds` | [Ambient Bird Sounds](https://opengameart.org/content/ambient-bird-sounds) by isaiah658 | CC0 |
| `amb_wind` | [Park ambiences](https://opengameart.org/content/park-ambiences) by Thimras | CC0 |
| `amb_panic` | [Crowd shouting/speaking ambience](https://opengameart.org/content/crowd-shoutingspeaking-ambience) by StarNinjas | CC0 |
| `truck_engine` | [Car Engine Loop (96kHz 4s)](https://opengameart.org/content/car-engine-loop-96khz-4s) by qubodup | [CC-BY 3.0](https://creativecommons.org/licenses/by/3.0/) |
| `radio_words` | [Lingua Libre Hebrew word recordings](https://commons.wikimedia.org/wiki/Category:Lingua_Libre_pronunciation-heb) by YaronSh (Lingua Libre) | CC0 |
| `pa_cantor` | [Ashamnu Mikol Am and Hayom Teamtzenu (78 rpm records, 1922)](https://commons.wikimedia.org/wiki/File:Oshamnu_Mikol_Om_by_David_Roitman.ogg) by David Roitman | Public domain |
| `pa_cantor` | [Yom Kippur Musaf, Avot and Gevurot (Nusach Ashkenaz), a cantor practicing](https://commons.wikimedia.org/wiki/File:YK_musaf_avot_ashkenaz_s.ogg) by Daniel Zvi (דניאל צבי) | Public domain |
| `Desert City`, `Drums of the Deep`, `Urban Gauntlet`, `The Escalation`, `Heart of Nowhere` | [Music by Kevin MacLeod (incompetech.com)](https://incompetech.com/music/royalty-free/) by Kevin MacLeod | [CC-BY 4.0](https://creativecommons.org/licenses/by/4.0/) |

Music: "Desert City", "Drums of the Deep", "Urban Gauntlet", "The Escalation" and "Heart of
Nowhere" by Kevin MacLeod (incompetech.com), licensed under Creative Commons: By Attribution
4.0 License, http://creativecommons.org/licenses/by/4.0/

## Voices (`src/assets/voice/`)

The mission's spoken lines (`src/story/text.he.js`), generated with
[ElevenLabs](https://elevenlabs.io) text to speech (model Eleven v4) on the project owner's
account with voices from the ElevenLabs voice library, some shifted in pitch to play
another person (`scripts/assets/voices.config.mjs`):

| Part | ElevenLabs voice |
| --- | --- |
| Sgt. Alon, the commander | Omer - Confident, Upbeat Ad |
| Yonatan | Itai - Upbeat Social Creator |
| Noam | Tomer - Calm, Curious Narrator |
| Control (radio) | Dana - Patient Support Agent |
| Lookout 3 (radio) | Yael - Gentle, Confident Ad |
| The player | Amit - Calm, Curious Narrator |
| Shimon, the guard | Tomer - Calm, Curious Narrator (-2.5 semitones) |
| The tour guide | Noa - Warm, Patient Narrator |
| Visitors | Omer - Confident, Upbeat Ad (-2.5 semitones) |
| Visitors (women) | Shira - Cheerful Social Creator |
| Worshipers | Itai - Upbeat Social Creator (-3 semitones) |
| Worshipers (women) | Tamar - Gentle, Confident Ad |
| A father | Amit - Calm, Curious Narrator (-2.5 semitones) |
| A mother | Michal - Patient Support Agent |
| A grandfather | Bill - Wise, Mature, Balanced |
| A grandmother | Dana - Patient Support Agent (-3 semitones) |
| A boy | Maya - Cheerful, Friendly Creator (+4 semitones) |
| A girl | Shira - Cheerful Social Creator (+5 semitones) |
| A teenager | Itai - Upbeat Social Creator (+2.5 semitones) |
| A tourist | Chris - Charming, Down-to-Earth |
| A tourist (woman) | Jessica - Playful, Bright, Warm |
| A yeshiva student | Liam - Energetic, Social Media Creator |
| An usher | Amit - Calm, Curious Narrator (+2 semitones) |
| A charity collector | George - Warm, Captivating Storyteller |
| A soldier visiting | Tomer - Calm, Curious Narrator (+2 semitones) |
| A Border Police officer | Omer - Confident, Upbeat Ad (+2 semitones) |
| People fleeing | Roger - Laid-Back, Casual, Resonant |
| People fleeing (women) | Maya - Cheerful, Friendly Creator |


The crowd's prayer (`crowd_prayer_1..4`, seamless 11 s loops): ElevenLabs Sound Effects
(text to sound v2) from the prompt "Hundreds of Jewish men praying aloud together at night
in a huge open stone plaza at the Western Wall in Jerusalem: a dense murmur of Hebrew prayer,
chanting and swaying, overlapping voices near and far, soft echo off ancient stone walls."

License: the ElevenLabs Terms of Service. A commercial release needs audio generated on a
paid ElevenLabs plan (the free plan requires attribution and has no commercial license).
Voiced with ElevenLabs (elevenlabs.io). A line recorded in the booth (`dev/booth.html`)
replaces its generated take.

## Other files

| File | Source | License |
| --- | --- | --- |
| Basis Universal transcoder (`basis_transcoder.{js,wasm}`, bundled from three.js `examples/jsm/libs/basis/` at build time) | Binomial LLC, via three.js | Apache-2.0 |
| Leaf cards, prayer notes, bullet holes, scorch marks, dust | Drawn at runtime on canvases / in shaders by the game code | CC0 (this project) |
