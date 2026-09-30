# Downloads (Mixamo)

Everything below was downloaded on 2026-09-30 from [Mixamo](https://www.mixamo.com) (Adobe),
logged in with the project owner's account, through the site's own export (the same job the
Download button runs). The raw files were moved from `~/Downloads` into `assets-src/mixamo/`.

`assets-src/` is **git-ignored**: Mixamo characters and animations may be used royalty-free in a
game but may not be redistributed on their own. The game ships only the converted, merged and
compressed GLB files in `public/assets/characters/` (built by `npm run assets:characters`, see
`scripts/assets/characters.mjs`). To rebuild them on another machine, download the same files
with the settings below and put them in the same folders.

## Settings

| What | Format | Skin | Pose / in place | Frame rate | Keyframe reduction |
|---|---|---|---|---|---|
| Characters | FBX Binary (.fbx) | With skin | T-pose | - | - |
| Animations | FBX Binary (.fbx) | Without skin (skeleton only, retargeted to **Y Bot**) | In place **off**: root motion kept | 30 fps | none |

Why root motion is kept: the converter measures how fast each walk/run/crouch-walk cycle
moves, then removes the motion itself. The game plays each cycle at the character's real
speed divided by that measured speed, so feet don't slide.

`death_left` is Mixamo's "death from right" exported with **Mirror** on.

## Characters (`assets-src/mixamo/characters/`)

| File | Mixamo character | Mixamo export name | Used as | Size |
|---|---|---|---|---|
| `Swat.fbx` | Swat | Swat.fbx | Squad (recolored olive) | 6 MB |
| `SwatGuy.fbx` | Swat Guy | Ch15_nonPBR.fbx | Squad (recolored olive) | 115 MB |
| `Steve.fbx` | Steve | Ch49_nonPBR.fbx | Squad (olive uniform, helmet; vest added) | 115 MB |
| `Ninja.fbx` | Ninja | Ch24_nonPBR.fbx | Enemy (dark clothes, face covered) | 52 MB |
| `David.fbx` | David | Ch28_nonPBR.fbx | Enemy (dark clothes; face wrap added) | 49 MB |
| `Alex.fbx` | Alex | Ch18_nonPBR.fbx | Enemy (dark clothes; face wrap added) | 14 MB |
| `Brian.fbx` | Brian | Ch01_nonPBR.fbx | Civilian (worshiper) | 54 MB |
| `Joe.fbx` | Joe | Ch33_nonPBR.fbx | Civilian (worshiper in a suit) | 54 MB |
| `Josh.fbx` | Josh | Ch23_nonPBR.fbx | Civilian | 52 MB |
| `Lewis.fbx` | Lewis | Ch12_nonPBR.fbx | Civilian, tour guide | 45 MB |
| `Remy.fbx` | Remy | Remy.fbx | Civilian (tourist) | 28 MB |
| `Bryce.fbx` | Bryce | Ch42_nonPBR.fbx | Civilian (tourist) | 53 MB |
| `Martha.fbx` | Martha | Ch27_nonPBR.fbx | Civilian (woman) | 55 MB |
| `Kate.fbx` | Kate | Ch21_nonPBR.fbx | Civilian (woman) | 52 MB |
| `Elizabeth.fbx` | Elizabeth | Ch26_nonPBR.fbx | Civilian (woman) | 55 MB |
| `Sophie.fbx` | Sophie | Ch02_nonPBR.fbx (Chrome saved it as `ch.fbx`) | Civilian (tourist) | 49 MB |
| `Megan.fbx` | Megan | Ch22_nonPBR.fbx | Civilian (woman) | 59 MB |
| `YBot.fbx` | Y Bot | Y Bot.fbx | Reference skeleton the animations were exported on (not shown in game) | 2 MB |

## Animations (`assets-src/mixamo/animations/`)

Squad and enemies (rifle). "Pro Rifle Pack" clips were exported one by one from the pack.

| File | Mixamo animation | Used for |
|---|---|---|
| `rifle_idle.fbx` | Pro Rifle Pack: idle | Standing, rifle at low ready |
| `rifle_idle_aiming.fbx` | Pro Rifle Pack: idle aiming | Aiming / peeking / firing (standing) |
| `rifle_crouch_idle.fbx` | Pro Rifle Pack: idle crouching | Hiding behind low cover |
| `rifle_crouch_idle_aiming.fbx` | Pro Rifle Pack: idle crouching aiming | Firing crouched |
| `rifle_walk_f/fl/fr/l/r/b/bl/br.fbx` | Pro Rifle Pack: walk (8 directions) | Walking while aiming (strafe blend) |
| `rifle_run_f/fl/fr/l/r/b/bl/br.fbx` | Pro Rifle Pack: run (8 directions) | Running to cover (strafe blend) |
| `rifle_sprint_f.fbx` | Pro Rifle Pack: sprint forward | Not used (the run covers the AI's speeds) |
| `rifle_crouchwalk_f/fl/fr/l/r/b/bl/br.fbx` | Pro Rifle Pack: walk crouching (8 directions) | Moving crouched |
| `rifle_turn_l.fbx`, `rifle_turn_r.fbx` | Pro Rifle Pack: turn 90 left / right | Turning in place |
| `rifle_crouch_turn_l.fbx`, `rifle_crouch_turn_r.fbx` | Pro Rifle Pack: crouching turn 90 left / right | Turning in place, crouched |
| `death_front.fbx` | Pro Rifle Pack: death from the front | Death, shot from the front |
| `death_back.fbx` | Pro Rifle Pack: death from the back | Death, shot from behind |
| `death_right.fbx` | Pro Rifle Pack: death from right | Death, shot from the right |
| `death_left.fbx` | Pro Rifle Pack: death from right (**mirrored**) | Death, shot from the left |
| `death_headshot_front.fbx` | Pro Rifle Pack: death from front headshot | Headshot from the front |
| `death_headshot_back.fbx` | Pro Rifle Pack: death from back headshot | Headshot from behind |
| `death_crouch_headshot.fbx` | Pro Rifle Pack: death crouching headshot front | Death while crouched |
| `rifle_walk_relaxed.fbx` | Rifle Walk (Walking With Rifle Down) | Squad patrol walk (calm shift) |
| `rifle_run_relaxed.fbx` | Rifle Run (Running With Rifle Down) | Squad running, not in combat |
| `rifle_idle_relaxed.fbx` | Rifle Idle (Two Hand Lowered Gun Rifle Idle) | Squad standing (calm shift) |
| `rifle_idle_lookaround.fbx` | Rifle Idle (Rifle Idle Looking Around) | Guards / idle enemies |
| `rifle_fire_stand.fbx` | Firing Rifle (Firing A Rifle While Standing) | Firing (upper-body recoil layer) |
| `rifle_reload_stand.fbx` | Reloading (Reloading Rifle While Standing) | Reload |
| `rifle_reload_crouch.fbx` | Reload (Reload Rifle While In Crouch Position) | Reload behind low cover |
| `grenade_toss_stand.fbx` | Toss Grenade (Throwing Something Holding Rifle Aimed) | Grenade throw, standing |
| `grenade_throw_crouch.fbx` | Throw Grenade (Throwing Grenade While Crouched) | Grenade throw, crouched |
| `hit_rifle_stand.fbx` | Hit Reaction (Hit Reaction While Holding A Rifle) | Hit reaction |
| `hit_rifle_front_left.fbx` | Hit Reaction (Left Reaction To Front Hit Holding A Rifle) | Hit reaction (variation) |
| `hit_rifle_crouch.fbx` | Hit Reaction (Hit Reaction From Rifle Crouched) | Hit reaction, crouched |
| `cover_wall_idle.fbx` | Taking Cover Idle (Cover Idle Against A Wall With Rifle) | Hiding behind high cover |
| `cover_wall_enter.fbx` | Taking Cover (Taking Cover Against A Wall With Rifle) | Not used (the body turns into the cover idle instead) |

Civilians.

| File | Mixamo animation | Used for |
|---|---|---|
| `idle_standing.fbx` | Idle (Standing Idle) | Standing |
| `idle_breathing.fbx` | Breathing Idle | Standing (variation) |
| `idle_weightshift.fbx` | Idle (Weight Shift Idle) | Standing (variation) |
| `idle_lookaround.fbx` | Looking Around (Idle Stand Looking Around) | Tourists |
| `idle_nervous.fbx` | Nervously Look Around (Nervously Looking Around Left To Right - Loop) | Waiting in the shelter |
| `walk_male.fbx` | Walking (Male Standard Walk) | Walking |
| `walk_female.fbx` | Female Walk (Female Normal Walk) | Walking (women) |
| `talk_general.fbx` | Talking (General Conversation) | Talking (tour guide, story lines) |
| `talk_question.fbx` | Talking (Asking A Question With One Hand) | Not used |
| `talk_phone_female.fbx` | Talking On Phone (Female Standing Talking On Phone) | Bystanders |
| `talk_phone_male.fbx` | Talking On A Cell Phone (Male Standing While Talking On A Cell Phone) | Bystanders |
| `texting.fbx` | Texting (Standing Texting On Phone) | Tourists |
| `praying_swaying.fbx` | Praying (Standing Praying While Swaying) | Worshipers at the wall |
| `praying_buckled.fbx` | Praying (Buckled Stand And Praying) | Not used (a deep knee bend: reads oddly at the Kotel) |
| `run_scared_lookback.fbx` | Run Look Back (Running Looking Back) | Running scared to the shelter (upper body over the run) |
| `run_standard.fbx` | Standard Run (Standard Running) | Running to the shelter (4.2 m/s, matches the civilians' flee speed) |
| `run_fast.fbx` | Fast Run (Running Fast) | Not used (5.4 m/s: too fast for the civilians) |
| `run_medium.fbx` | Medium Run (Medium Speed Running) | Not used |
| `jogging.fbx` | Jogging | Not used |
| `terrified.fbx` | Terrified (Being Terrified While Standing) | Frozen by the sirens |
| `cower_hiding.fbx` | Hiding (Crouched Hiding To Ducking) | Cowering (crouched) |
| `cower_ducking.fbx` | Ducking (Ducking For Cover From Standing Idle) | Not used (`cower_hiding` is) |
| `turn_l.fbx`, `turn_r.fbx` | Male Locomotion Pack: left turn 90 / right turn 90 | Turning in place |

The three runs (`run_standard`, `run_medium`, `jogging`) were a second download round, after the
first clips showed no run near the civilians' speed.

`assets-src/mixamo/unused/`: duplicates, not used. `a.fbx` is a second copy of `rifle_run_fr`
(Chrome saved one download as `a.fbx`; same size, re-exported under the right name).
`run_medium_second_copy.fbx`, `run_standard_second_copy.fbx` and `jogging_second_copy.fbx`
are copies from a retried download (the first attempt's files arrived late).
