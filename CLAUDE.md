# CLAUDE.md — kotelgame

A browser-based 3D first-person story shooter.
**No game engine:** Three.js + Vite, plus small libraries only when they are truly needed.

## Game vision

- A linear, cinematic story campaign in the style of Call of Duty.
- The player is a soldier in an elite IDF unit.
- **Mission 1** opens on a calm, normal shift at the Kotel (Western Wall) plaza.
  Then sirens start, Hamas terrorists attack to seize the Kotel, and the team must secure it.
- Tone: grounded and intense, with realistic weapon feel and squad AI.
- Hebrew UI and dialogue (RTL).
- Visuals: start with greybox shapes, then move to realistic textures and lighting later.
  **Free/CC0 assets only.** One exception, chosen by the project owner: the characters and
  animations come from Mixamo (free to use in the game, not redistributable on their own;
  they ship only converted, inside the game; raw files stay out of git, see `DOWNLOADS.md`).

## Working rules

- Build **one feature at a time**. Stop after each one and tell the user how to test it
  (the command to run and what to try).
- **Commit to git after every working feature.**
- Keep the code modular: `src/player`, `src/weapons`, `src/world`, `src/ai`, `src/story`, `src/ui`,
  `src/characters` (animated people). (`src/core` holds engine plumbing: renderer, game loop, input.)
- Target a smooth **60 FPS on an average laptop**.

## Roadmap

1. [x] Movement: first-person controller, tried out on a greybox test range
2. [x] Gun: hitscan rifle with ADS, recoil, impacts, reload, procedural sound
3. [x] Greybox Kotel: 1:1 plaza layout (reference: `docs/kotel-reference.md`)
4. [x] First enemy: perception, cover AI, navmesh, hitscan + tracers; player health
5. [x] Opening story beat
   - [x] Part 1: mission system + the calm shift (ends on the radio chatter, before the sirens)
   - [x] Part 2: sirens, civilians to shelter, first contact
   - [x] Part 3: holding the plaza, three waves, grenades, ammo crates
   - [x] Part 4: the final push (armed truck, rocket launcher), counterattack, ending + stats
6. [ ] Realism pass
   - [x] Part 1: textures (KTX2), HDRI lighting, time-of-day sun, cascaded shadows, post FX,
     wall detail (plants, prayer notes), building facades, impact dust/scorch, flash lights,
     graphics setting (low/medium/high)
   - [x] Part 2: animated characters (Mixamo) replace the capsules: squad (olive, helmets,
     vests), enemies (dark, faces covered, role-colored headbands), civilians (varied clothes);
     8-way blended locomotion at the real ground speed, cover / reload / grenade / hit
     overlays, deaths by hit direction, model hit zones, LODs and distance-based update rates;
     then: civilian clothing (kippot, hats, headscarves, long skirts), talking faces (lip sync,
     blinks, head turns), stairs (stair clips over the flights, foot IK, smooth camera,
     footsteps), error-bounded LODs (no collapsed limbs), clothing layers (no waistband through a
     hem), cloth in motion (skirts and shirt / jacket hems on simulated cloth bones), a busier
     plaza (about 90 people: rows at the wall, visitors, chatting groups, stair walkers)
   - [x] Part 3: weapons and sound
     - [x] Weapons: an M4-style rifle with a red dot (collimated dot), gloved arms on IK,
       procedural reload (magazine out / in, bolt release on empty), sprint, aim, recoil, dust
       cover, charging handle; ejected casings; launcher and pickup models
     - [x] Sound: recordings everywhere (layered gunshots by distance, real cracks, the real
       siren), plaza reverb + wall slap-backs, suppression (muffle + edge blur), footsteps on
       stone / wood, city / crowd / birds ambience, music by mood, dialogue ducking, volume
       sliders
     - [x] Character fixes: heads no longer drift and spin (clean pose before the mixer),
       walking down stairs on the walk + foot IK (upright), calmer skirts on stairs, head wear
       fitted to each model's real head (kippot, hats, headbands, headscarves), the squad's
       added vest fitted to the torso
7. [x] Game shell: loading screen (progress, lines about the Kotel), main menu over the plaza
   at dawn (camera drifts, the early prayer, calm music; Continue / New Game / Settings /
   Credits / Quit in the desktop version), pause menu (Resume / Restart from checkpoint /
   Settings / Quit to the main menu), settings saved between sessions (mouse and aiming
   sensitivity, invert Y, key rebinding, quality, field of view, FPS counter, volumes,
   difficulty easy / normal / hard, subtitles), the last checkpoint saved for Continue,
   scrolling credits built from CREDITS.md

## Commands

- `npm install`: install dependencies (Node >= 20.19)
- `npm run dev`: dev server at http://localhost:5173 (Kotel plaza; add `?level=range` for the
  movement/gun test range)
- `npm test`: physics, collision, weapon, grenade, level-route, AI and mission tests (Node's built-in test runner, no browser needed; the scripted Mission 1 playthrough takes ~1 min)
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the production build locally
- `npm run assets:generate [id ...]`: rebuild the generated stone texture sets (KTX2) in
  `public/assets/textures/` (~20 s per set); rewrites `public/assets/CREDITS.md`
- `npm run assets:fetch [id | id=polyhaven:<asset> | id=ambientcg:<Asset> | hdri]`: replace them
  with CC0 photoscans from Poly Haven / ambientCG and fetch a 2k sky HDRI (needs network access
  to api.polyhaven.com, dl.polyhaven.org, ambientcg.com). `LOCAL=<dir>` imports files you
  downloaded yourself (`<id>_color/_normal/_rough[/_ao].jpg`). A set that fails keeps what's there.
- `npm run screenshots -- [outDir] [low|medium|high]`: Playwright screenshots from 5 fixed
  spots around the plaza (dev server must be running; `playwright` is a dev dependency)
- `npm run assets:characters [id ... | anims]`: rebuild the characters (`public/assets/characters/`)
  from the Mixamo FBX files in `assets-src/mixamo/` (git-ignored; see `DOWNLOADS.md` for how to
  get them). ~15 s per character; rewrites the manifest and `public/assets/CREDITS.md`
- `npm run assets:weapons [rifle|arms|launcher|truck ...]`: rebuild `public/assets/weapons/`
  (GLB + KTX2) from free models (CC0 / CC-BY; sources, URLs and credits in
  `scripts/assets/weapons.config.mjs`). The raw downloads go to `assets-src/models/<id>/`
  (git-ignored) and are fetched again when missing. Rewrites the manifest and `CREDITS.md`.
- `npm run assets:audio [id ... | music]`: rebuild `public/assets/audio/` (Ogg Opus + manifest)
  from free recordings (CC0 / public domain / CC-BY; sources, slices and processing in
  `scripts/assets/audio.config.mjs`; raw files in `assets-src/sfx/<pack>/`, git-ignored, fetched
  when missing). Needs ffmpeg with libopus. Rewrites `CREDITS.md`.
- `npm run weapon-shots -- [outDir] [name filter]`: Playwright screenshots of the weapon in the
  game (hip, aimed, in shade, firing, reload out / in, sprint, casings, launcher). The weapon on
  its own: http://localhost:5173/dev/viewmodel.html (`weapon=rifle|launcher`,
  `state=hip|ads|sprint|lowered|stow|reload|check|charge`, `t=<s>`, `empty=1`,
  `cam=view|side|left|top|front|port`). Any model file: http://localhost:5173/dev/models.html
  (`url=`, `map=`/`normal=`/`rough=`/`metal=`, `cam=`, `only=<mesh regex>`)
- `npm run character-shots -- [outDir] [name filter]`: Playwright screenshots of the characters
  in the dev preview and at moments of Mission 1 (`GAME_SHOTS`: prayer, patrol, sirens,
  shelter, combat, bodies, the commander / the guide talking, stairs up / down, the crowd, a
  chatting group, the rows at the wall, skirts on the stairs and running; dev server must be
  running). Game shots run with `__game.fixedFrame = 1/60` and wait in game time. The preview
  itself: `npm run dev`, then http://localhost:5173/dev/characters.html
  (`?role=squad|enemy|civilian`, `ids=`, `clip=`, `cam=front|side|back|close|far|x,y,z,tx,ty,tz`,
  `t=`, `deaths=1`, `yaw=`, `move=<m/s>` walks them forward (cloth inertia))

## Architecture

- `src/main.js` -> `src/core/Game.js`: `new Game()` makes the settings and the shell (the
  loading screen shows at once); `await game.init()` builds the world (yielding between the
  heavy parts so the progress bar moves) and waits for every load (textures, characters and
  their fitted gear, weapon models, sounds), drawing the menu's scene behind the loading screen
  meanwhile (shaders compile there). Renderer, scene, fixed-timestep loop (physics at 120 Hz,
  rendering interpolated between steps). Modes: `loading` -> `title` (click to continue: it
  unlocks the sound) -> `menu` (`toMenu()`: dawn, the menu camera, the story's `menuScene()`)
  -> `playing` <-> `paused` (the pointer lock: losing it while playing pauses; Resume asks for
  it again). `newGame(chapter)` / `continueGame()` set what `_beginPlay()` starts once the
  mouse locks. Dev automation: `__game.setActive(true)` plays straight from any mode.
- `src/core/Input.js`: keyboard by `event.code`, mouse deltas, pointer lock (raw mouse input when
  the browser supports it). Key presses are edges consumed by the first physics step. Game
  reads actions through the player's bindings: `anyDown(codes)` / `consumeAny(codes)`.
- `src/core/Bindings.js` (pure): the rebindable actions (move, jump, sprint, crouch, fire, aim,
  reload, grenade, interact, weapon 1 / 2), each one key the player can change plus fixed
  alternates (arrows, right Shift) that step aside when taken; rebinding a used key swaps;
  Esc, `, P, F1, F2 are reserved; `keyLabel(code)`.
- `src/core/Settings.js` (pure, storage passed in): every player setting in one localStorage
  object (`kotelgame.settings`): controls, graphics, volumes, difficulty, subtitles; checked
  and clamped on load; the old separate keys are taken over once. `Game.setSetting(key, v)`
  applies one live and saves.
- `src/core/MenuCamera.js` (pure): the main menu's background, slow drifts through the level's
  `menu.shots` (kotel `config.js`: from / to, look / lookTo, seconds) with black between them.
- `src/story/SaveGame.js` (pure): the last checkpoint (`kotelgame.save`: step id, stats,
  difficulty), written on every checkpoint (`StoryDirector.onCheckpoint`), cleared when the
  mission is complete or a new game starts; `chapterOf()` names it for Continue.
- `src/ui/menu/`: the shell (Hebrew, RTL, the HUD's palette; `menu.css`). `Shell.js` (main
  menu, pause menu, new game: difficulty + start or a chapter, yes / no questions; arrow keys
  and Enter, Esc backs out of a panel), `SettingsPanel.js` (tabs: controls with key capture,
  graphics, audio, gameplay), `LoadingScreen.js`, `CreditsScreen.js` (the roll: the game's own
  credits from `src/ui/gameCredits.he.js` (fill in the names there), then
  `creditsRoll.js` (pure): CREDITS.md's sections and tables -> entries, CC notices kept word
  for word), `kit.js` (DOM helpers). Quit shows only when the page has
  `window.kotelDesktop.quit` (a desktop wrapper).
- `src/player/PlayerController.js`: kinematic character controller. Pure logic (no DOM), unit-tested.
  - "Floating capsule": on the ground, the capsule's lower `stepHeight` is left out of collision,
    and a ring of 9 downward rays (the feet) holds the player on the ground. That handles stairs,
    curbs, slopes and ledge edges. In the air the full capsule collides.
  - Walk / sprint (hold Shift, forward only) / crouch (C toggles; headroom check; tucks the legs
    in the air, so a crouch-jump reaches higher), jump with coyote time and a jump buffer.
  - Reports `feetShift` / `landingSpeed` each step so the camera can smooth them.
- `src/player/PlayerCamera.js`: mouse look (applied every rendered frame) + camera feel stepped with
  the physics: eye-height smoothing (crouch, steps), head bob, landing dip, sprint FOV, strafe roll.
- `src/player/config.js`: every movement and camera tuning value.
- `src/player/StairTracker.js` (pure): a body's step snaps (instant height changes while on
  the ground) -> a drawn height `offset` (critically damped spring, led by the climbing speed,
  so a flight of steps is a smooth climb) and `amount` / `dir` (on stairs, up or down). The
  player's camera uses one (`view.steps`: eye offset; footsteps: one per stair step, else one
  per head-bob cycle, `WeaponAudio.footstep`); NPC / enemy views use one to draw the body.
- `src/world/CollisionWorld.js`: static triangles in a uniform XZ grid; capsule contacts and
  raycasts with no allocations. Built from meshes; `userData.noCollision` skips a mesh.
  Use `raycast()` for bullets too.
- `src/world/capsuleContact.js`: exact capsule-vs-triangle contact (closest points).
- `src/core/Models.js`: `models.load(path)` loads a GLB once (meshopt, KTX2 via the
  TextureLibrary's loader, set by Game).
- `src/core/Graphics.js`: the `QUALITY` presets (low / medium / high: pixel ratio, MSAA, shadow
  cascades / map size / distance, AO, bloom, flash-light count, anisotropy), picked in
  Settings > Graphics; `Game.setQuality()` applies one live.
- `src/core/PostFX.js`: EffectComposer chain: world (half-float, MSAA) -> GTAO (half-res on
  medium) -> the viewmodel on top (depth cleared) -> bloom (threshold 3.2: only HDR-bright
  flashes, fire, the sun) -> OutputPass (ACES filmic) -> color grade (contrast, split tone,
  vignette). Flash materials are colored well above 1 so they bloom.
- `src/world/Environment.js`: sky dome shader (gradient, sun disc, drifting clouds), FogExp2
  haze, HDRI image-based light (PMREM, the HDRI's sun clamped; list of files tried in order),
  a warm hemisphere bounce fill, and the sun as three's `CSM` (cascaded shadow maps, updated
  every frame). `src/world/sun.js`: solar position from the level's date/time/place (Mission 1:
  11:40 on the title card -> sun high in the south-east, the west-facing wall in shade).
- `src/world/Textures.js`: `TextureLibrary` loads KTX2 texture sets (`<id>_color/_normal/_orm`,
  see `public/assets/textures/manifest.json`) and streams them into existing materials
  (`apply(material, id, { scale, normalScale })`; UVs are in meters). Asset scripts live in
  `scripts/assets/` (`generate.mjs`, `fetch.mjs`, `credits.mjs`, `ktx2.mjs`).
- `src/world/FlashLights.js`: a small pool of point lights (count per quality) for muzzle
  flashes, explosions and the rocket launch; the dimmest one is reused.
- `src/world/greybox.js`: procedural 1 m grid texture, color palette, box/ramp geometry with UVs in meters
  (the test range still uses the grid).
- `src/world/kotel/`: the greybox Western Wall plaza (Mission 1), 1 unit = 1 m.
  - `config.js`: **every dimension** (wall, prayer area, mechitza, Wilson's Arch, bridge, terraces,
    buildings, checkpoint, backdrop, spawn, lighting) plus the plain greybox colors. Axes: +X east
    (toward the wall), +Z south; wall face at x = 0, prayer floor y = 0, men north (-Z) of the
    mechitza. Facts and estimates behind the numbers: `docs/kotel-reference.md`.
  - `KotelLevel.js`: builds floors/terraces, the wall, prayer area, Wilson's Arch; `groundY(x, z)`.
  - `kotelSurroundings.js`: plaza edges, tunnels entrance, stairs, southern checkpoint, dig,
    Mughrabi Bridge, plaza props, skyline.
  - `wallStones.js`: procedural instanced ashlar courses (bands, drafted margins; the top band
    is `rough`), textures projected from world space with a per-stone offset, caper plants
    in clumps (leaf cards), prayer notes in the joints at hand height.
  - `facades.js`: instanced windows (stone surrounds, glass), arches and shutters on the
    plaza-facing building fronts. `KotelLevel.js` `SURFACES` maps each color role to a texture
    set; StaticBatch writes world-space UVs (`worldUVs`).
    The wall's collision is one invisible blocker just in front of the stone faces.
  - `batch.js`: StaticBatch merges static boxes per color (few draw calls); `blocker()` adds
    invisible out-of-bounds walls. `instancing.js` + `props.js`: instanced props, each with one
    simple collision box.
- `src/world/TestRange.js`: movement test course (green = step onto, amber = jump,
  red = crouch-jump, blue = crouch under, teal = walkable ramp, dark red = too steep).
- `src/weapons/`: the rifle.
  - `config.js`: all weapon tuning (fire rate, magazine, reload time, spread, recoil, ADS), the
    red dot (`RED_DOT`) and the first-person poses / reload timeline (`VIEWMODEL`).
  - `WeaponState.js`: magazine / fire-rate / reload / aim logic (pure, unit-tested).
  - `Recoil.js`: view kick that springs back to the aim point (pure, unit-tested); the rifle
    writes it into `PlayerCamera.offsetPitch/offsetYaw`, plus `fovScale`/`lookScale` for ADS.
  - `Rifle.js`: ties it together; hitscan via `CollisionWorld.raycast` from the eye along
    `PlayerCamera.getAimDirection()` plus a spread cone. `rifle.onHit(hit, dir)` is the hook
    for damaging enemies later.
  - `Viewmodel.js`: the weapon in hand, its own scene/camera (view space), drawn after the
    world with a cleared depth buffer (no wall clipping). `load()` swaps the greybox weapons
    (`placeholders.js`) for `public/assets/weapons/` (rifle, arms, launcher). The root's origin
    is the sight point (the red dot's rear lens / the launcher's rear sight), so the ADS pose
    puts it on the view axis. Poses blend hip -> ADS (with a small arc) -> sprint -> lowered ->
    stowed (weapon switch), plus `reload` / `check` offsets that turn the magwell toward the
    eye; sway, bob, breathing, recoil springs (pivoting near the shoulder). Hands: right on the
    grip (index on the trigger when ready), left from a timeline (`_leftHand`): handguard ->
    magazine (pulled out, carried to the pouch, a new one brought up and seated, a tap; empty:
    the old one drops and the left hand slaps the bolt release) -> handguard; also the
    magazine check and the charging-handle pull (`rifle.charge()`, when the story makes the
    rifle ready). Dust cover closed until the first shot, then springs open; `onEject` hands a
    casing to the game. `setLighting()`: the world's sun (direction into view space, dimmed in
    shade: Game raycasts toward the sun), sky light (environment rotated with the camera), a
    soft fill. Timings that sounds share: `VIEWMODEL.reload` (magOut, magIn, bolt).
  - `ArmsRig.js`: the first-person arms: hands placed by palm position / finger direction / palm
    facing (`placeHand`), two-bone IK with a pole per elbow, the forearm taking part of the
    wrist's twist, the shoulder sliding forward when a hand is out of reach, finger curls per
    joint (`curl`). The rig's hands hang off control bones, not the forearms.
  - `RedDot.js`: the tube sight from primitives; its rear lens draws the dot where the eye looks
    along the sight's axis (`axis` uniform, view space), so the dot sits at infinity on the aim
    point and slides off the glass off-axis. Lower 1/3 riser: the front sight post shows under it.
  - `Casings.js`: spent casings (one InstancedMesh, raycast bounces, `onBounce` for the clink,
    then they lie flat; the oldest is reused). `viewToWorld()` carries the port's screen
    position from the viewmodel camera to the world camera.
  - `Impacts.js`: pooled bullet-hole decals (one InstancedMesh), sparks (one Points), stone
    dust puffs (`puff()`, one Points with a soft-particle shader) and scorch decals (`scorch()`).
  - `WeaponAudio.js`: the game's sound (it kept its name and interface): recorded effects
    through `src/audio/` (see below). `play(id, { at, ref, gain, rate, delay, send, lowpass,
    bus })` and `loop(id, ...)` (a handle: setPosition / setRate / setGain / stop). Your shot =
    close blast + action + the mid mic's tail + reverb + slap-backs off the level's walls
    (`walls`, from the level's `acoustics`: `wallEcho` in `src/audio/reverb.js`). Other guns
    (`shotAt(p, 'ak' | 'ar' | 'mg')`): near / mid / far recordings crossfaded by distance, a
    lowpass for air absorption, more reverb farther out, heard after the sound's travel time
    (343 m/s). Near misses: real supersonic cracks + whizzes, and suppression. Footsteps by
    surface (`footstep(level, stair, surface)`), casings, reload sounds on the animation's
    marks (`VIEWMODEL.reload`). `speaking(s)` ducks the rest under dialogue; `setMusic(mood)`;
    `update(dt)` drives muffle / ducking; `blur` (suppression) goes to PostFX. `init()` makes
    the AudioContext and decodes every sound during the loading screen; `unlock()` (from a
    user gesture: the title click) lets it play; `setPaused()` for the pause menu.
- `src/audio/`: the sound system.
  - `Mixer.js`: buses: effects (-> muffle lowpass -> duck -> volume), ambience (into effects),
    reverb (a convolver with the plaza IR, returns into effects), music, voice (never ducked),
    a limiter on the master. Volumes (master / music / effects / voice: Settings > Audio).
    `setPaused()`: the world and the voices dulled and dimmed under the pause menu, the music
    as it was.
  - `SoundBank.js`: `public/assets/audio/manifest.json` -> decoded variants; `buffer(id)`
    never repeats the last variant.
  - `reverb.js` (pure): the plaza impulse response (early slaps off the wall and buildings, a
    short damped tail) and `wallEcho()` (mirror-image slap-back off a wall plane).
  - `Suppression.js` (pure): near misses, close impacts, hits and blasts build a level that
    holds then drains; `muffle` (the lowpass over the world) and `blur` (PostFX's edge blur).
  - `Music.js`: one streamed track per mood (calm / tense / combat / push / end, Kevin
    MacLeod, CC-BY), crossfaded; mission1 sets the mood with `music` actions.
- `src/ai/`: enemies.
  - `config.js`: all AI tuning (health/damage, vision, hearing, reaction time, burst fire,
    spread tightening, cover timings, speeds) and the nav grid settings.
  - `NavGrid.js`: grid navmesh baked at load from the collision world (~0.65 s on the plaza):
    top-down floor probes per 0.5 m cell (stacked levels such as the bridge), headroom checks,
    neighbor links for steps/slopes with knee/chest obstacle rays, largest region kept.
    A* + string-pulling smoothing (`findPath`).
  - `CoverPoints.js`: cover generated from the geometry: nav nodes next to an obstacle at
    crouched-chest height; low (peek over) vs high (peek around a side). `protects()`, `canSee()`.
  - `Enemy.js`: pure logic, unit-tested. Vision cone + LOS (head/chest rays), awareness meter,
    hearing player shots; states idle -> alerted -> combat -> dead; combat picks cover, hides,
    peeks and fires bursts, relocates when flanked/exposed or crowded. Reaction delay, spread
    tightens with continuous LOS. Moves with a `PlayerController` body (stairs etc.).
    Hit zones: head sphere + body capsule (`hitZones.js`).
  - `EnemyManager.js`: spawns/resets, routes enemy shots (tracers, positional sound, player
    damage, impacts, near-miss cracks), player bullets -> `raycast()`/`hit()`, body separation.
    Factions: `addFriendly(body)` puts the same AI (`FRIENDLY` config: can't die, a bit less
    accurate, picks cover within 16 m of the player = its `anchor`, relocates when it sees nobody)
    on a story NPC's body. Every agent re-picks its `target` a few times a second (closest in
    sight; hostiles slightly prefer the player). A target is the player info object or another
    agent's `asTarget` (`CombatTarget`); shots between agents go through `takeHit`.
    `spawnAttacker(pos, yaw, threat, config, via)` spawns a hostile already in combat;
    `onEnemyKilled(enemy, killer)`. Enemy grenades: `grenades` (a GrenadeSim) + a camping
    check on the player (`campTime`); `explode()` / `explosionDamageAt()` for blasts.
  - `Truck.js` / `TruckView.js`: the armed pickup (kinematic: drives a path, parks; turret MG with
    its own target LOS, bursts and suppressive fire; box hit test; bullets barely hurt it; wreck
    with fire/smoke). The view uses `public/assets/weapons/truck.glb` (materials by role: dusty
    off-white paint with dirt toward the wheels in a shader, `uCharred` for the wreck; the wheels
    turn with the distance driven), boxes until it loads. It sits in EnemyManager's list like an Enemy (`isVehicle`); `spawnTruck()`,
    `onVehicleDestroyed`, `applyDamage()` (rocket hits, with kill bookkeeping).
  - Friendly bounding: `anchorOverride` / `anchorRadius` / `holdPosition` / `relocate()` on the
    squad's AI (set by StoryDirector during the counterattack).
  - Attacker roles (config flags read by `Enemy.js`): `assault` (push toward the defenders
    when nobody is in sight), `via` (flankers run a route first), `rusher` (charge, fire on the
    move), `suppress` (keep firing at the last known spot), `marksman` (aimed single shots,
    `glint` 0..1 drawn as a scope glint by EnemyView), `defender` (holds a post).
  - `EnemyView.js`: the enemy's animated character (see `src/characters/`), a capsule
    placeholder until the characters load; `soldierState()`; `Tracers` (they start at the
    model's muzzle: `enemy.visualMuzzle`).
  - `DebugDraw.js`: F1 overlay (navmesh points, cover points, vision cones, paths, state labels).
- `src/story/`: the mission system (pure logic except the views/audio) and Mission 1.
  - `Mission.js`: a script is a list of steps; each step runs `do` actions on entry and waits for
    its `until` trigger (`reach`, `talk`, `timer`, `enemiesDead`, `dialogueDone`, `arrived`,
    `action`, `civiliansSheltered`, `all`/`any`). Actions: objective (optional `counter`),
    hint, dialogue, npc (spawn/route/place/face/talkable/escort), populate, weapon, sound,
    ambience (crowd/birds/siren/panic), fade, title, endCard, checkpoint, sky (barrage level),
    civilians (panic/runAll/emerge), combat (squad on/off the combat AI), wave (timed attacker
    spawns with radio callouts per group), crate (`launcher: true` hands out the launcher), truck,
    arm, slowmo, retreat (survivors fall back to posts), bounding (squad advance), stats.
    Triggers also: `truckDestroyed`, `hasLauncher`, `clear` (no hostile near a point). A fast-forwarded `wave` spawns nothing (that fight was won);
    a fast `runAll` puts every civilian straight into the shelter.
    `jumpTo(i)` replays the earlier steps' state actions in fast mode (no dialogue, NPCs placed at
    their route ends) and enters step i; checkpoints restart this way. `fail()` freezes it.
  - `mission1.js`: Mission 1's steps, squad routes, checkpoints, crowd groups (worshipers in
    two rows at the wall and in the women's section, visitors walking up to the wall and back,
    crossers (over the terrace steps and up the western stairs too), chatting groups
    (`chats`), people standing around, the tour group, bystanders who freeze at the sirens:
    about 90 people), the shelter spots (the hall under Wilson's Arch, 132 of them), the
    defense positions (the low wall at x = -30, then near the wall) and the `chapters` shown on
    the start screen. Every spot and route is on the navmesh (checked when changing them).
  - `difficulty.js`: **all difficulty tuning**: global accuracy/damage/reaction multipliers,
    per-role overrides, grenades (fuse, radius, damage, enemy throw frequency), ammo, prep times,
    spawn points, flank routes and every wave's groups (`expandWave`, `attackerConfig`).
  - `AmmoCrate.js`: E refills reserve + grenades; not in the static collision world, the player
    is pushed out of its box instead. `text.he.js`: **all** dialogue, speakers, objectives,
    hints and cards (placeholder Hebrew; edit text there only).
  - `Dialogue.js`: queued subtitle lines with reading-time durations; `bark()` for callouts
    (dropped when lines are waiting; `{ next: true }` jumps the queue). A line with
    `radio: true` (or a radio speaker) is shown and heard as radio.
  - `Npc.js`: NPCs on `PlayerController` bodies walking navmesh routes; a `leash` makes the
    squad wait (looking back) only when the player lags behind; tour members follow a leader;
    walkers slow to a stair pace on a flight (`stairUpSpeed` / `stairDownSpeed`, the level's
    stair zones); stuck: a sidestep (thin posts slip through the navmesh), or back onto the path
    when pushed off the floor. Standing still with nothing to do (praying, waiting, chatting)
    the physics sleeps after `NPC.settle` s (a push, a route or a placement wakes it): a big
    crowd is cheap. `NpcManager` spawns, separates bodies (never off the navmesh; two sleepers
    skip), finds the E talk target, ray-tests friendly fire, and runs small talk
    (`populate({ chats })`: people facing in, taking turns to talk, `npc.chatting`).
    Emergency: `panic()` (civilians flee to shelter spots with staggered reactions, bystanders
    freeze until E), `escort` (squad keeps near the player), `brain` (the combat AI drives the
    body; the NPC only mirrors it).
  - `NpcView.js`: the NPC's animated character: squad members by name (SoldierAnimator,
    relaxed off duty, full combat behavior once their AI takes over), civilians by kind
    (CivilianAnimator); placeholder figures until the characters load (and in tests).
    StoryDirector sets `npc.speaking` while the NPC has the current line; a chatting NPC plays
    the talk clip with made-up words on its lips (`LipSync.babble`), the others listen and
    look at it.
  - `AmbientAudio.js`: recorded beds (city traffic far off, a street crowd, the plaza's murmur,
    birds, wind; panic + random screams), the real Israeli civil-defense siren from three
    far-off emitters once the attack starts (`ambience` levels), distant booms (the real
    interception booms), radio lines (squelch, static, real Hebrew words through a radio's
    band and distortion: `radioLine`), the story's one-shots (`play`).
  - `StoryDirector.js`: the mission context; tutorial events (move/sprint/crouch/mag check),
    E to talk / send a frozen civilian off, friendly fire -> fail -> restart at the last
    checkpoint, F2 jumps, the objective counters, kill callouts, booms + camera shake timed by
    the speed of sound.
- `src/world/SkyFx.js`: rocket barrage over the city (pooled interceptor trails, flashes, smoke
  puffs, horizon impacts); `onFlash(distance, strength)`.
- `WeaponAudio.echoBus`: the plaza reverb's send (`Mixer.reverb`); gunshots, explosions, the
  siren, shouts and voices send into it.
- `PlayerCamera.addShake(amount)`: view-only shake (the aim is unaffected).
- `src/weapons/Grenades.js`: `GrenadeSim` (pure: gravity, bounces off the collision world, rest,
  fuse, `predict()` for the aiming arc), `solveThrow()` (ballistic launch velocity to a point),
  `GrenadeView` (pooled grenades, blasts, the dashed arc). `GrenadeThrower.js`: the player's
  3 grenades (hold G = aim with the arc, release = throw). `Game._explode()` applies damage.
- `src/ui/GrenadeWarning.js`: icon around the crosshair toward enemy grenades within 9 m.
- `src/characters/`: the animated people (Mixamo). Assets in `public/assets/characters/`:
  one `<id>.glb` per character (skinned mesh whose 3 primitives are LOD0-2 sharing one vertex
  buffer, one material: color + normal atlas in KTX2, `_part` vertex attribute: `PART` in
  `config.js`: fixed, top, bottom, shoes, hair, extra (belt/tie), shirt (under a suit),
  skirt (generated), arms / legs (bare skin an outfit can dress)),
  `anims.bin` (every clip, see below) and `manifest.json` (roles, head/chest measurements,
  clip data: loop, measured locomotion speed, IK, grenade release time, death fall direction).
  - `CharacterLibrary.js`: loads it all (the TextureLibrary's KTX2 loader, three's
    MeshoptDecoder); `characters` (module singleton: `library`, `camera`, `frustum`, set by
    Game) is how views find it. Per type: its clip set with the hips track scaled to the
    body (`hipsRatio`) and the IK target scaled to the arms (`armRatio`).
  - `animLibrary.js`: decodes `anims.bin` into three clips (bone quaternions, hips position,
    IK targets `ikHandR` / `ikHandL`).
  - `CharacterModel.js`: one character: `SkeletonUtils.clone`, LODs on one skeleton, a
    per-person material (per part: `tints`, `flat` (tint without the texture's shading),
    `setInflate` (push out along the normals: skin dressed as sleeves / trousers), `hide`
    (collapsed in the vertex shader: hair under a headscarf)), weighted slots over an AnimationMixer
    (`fade`, `setWeight`; modes base / upper (overrides the upper body) / add / addUpper),
    a shared locomotion `phase`, spine aim pitch, two-bone arm IK (`ik.js`: right hand where
    the source clip held it vs Spine2, left hand on the handguard vs the right hand), bone
    attachments (`attach`, rifle via `addRifle`), and the hit zones in root space (`hit`).
    Performance: LOD by distance, animation every frame < 16 m / every 2nd < 36 m / every 4th,
    off-screen every 8th (never drawn before its first pose); IK < 18 m; shadows <
    `characterShadows` (Graphics.js); characters
    beyond 20 m on `FAR_LAYER` (drawn, but not in the AO prepass or shadow maps); bone
    matrices uploaded only when the pose or placement changed. Tuning: `config.js`.
  - `SoldierAnimator.js`: squad and enemies from the AI state (`soldierState()` in
    EnemyView.js): postures relaxed / alert / combat, idles (aiming, crouched, cover wall with
    the back to high cover), 8-way walk / run / crouch-walk (`directionBlend`) at the real
    ground speed, recoil and muzzle flash per shot, reloads after ~28 shots when quiet,
    grenade throws started just before the release (the AI's grenade is already flying), hit
    reactions (additive), deaths via `deaths.js` (the clip whose fall direction best follows
    the shot, avoiding walls; the fall ends on its last frame (`model.finish()`, even when
    throttled updates lagged), then the body freezes and stays down).
  - Stairs: the level lists its flights (`stairZones`: rectangles with the uphill direction;
    `src/world/stairs.js` `stairsAt()`; Game hangs them on `collision.stairZones`).
    `stairs.js` `stairLegs()` plays the Mixamo stair-up clip (the converter measures its
    horizontal speed and climb, takes both out, and marks when each foot is planted:
    `contacts`) over the lower body (mode `lower`) while a walker climbs a flight (in at the
    bottom, out at the top, 0.15 s fades), at the real ground speed within 0.6-1.9x the clip's
    own pace; runners keep their run. Going down, walkers keep the walk (the stair-down clip's
    hips leaned the body back and squatted it) and the foot IK places the feet. On a flight
    `CharacterModel._upright()` keeps the torso's lean while climbing (hips -> neck,
    `stairLean`: a little forward) through the spine. Views offset the drawn
    body (`model.body.position.y`) by the StairTracker (smooth climb). `CharacterModel._feet()`
    (foot IK within `feetDistance`): planted feet are pinned onto the step under them,
    swinging ones kept out of the steps, the hips drop (at most about a riser) so the lower
    foot reaches, feet stay level.
  - Cloth (`ClothSim.js`): loose clothes on cloth bones (the converter's chains, manifest
    `cloth`): a long skirt on 24 chains of two bones (waistband -> knee line -> hem), the
    lower part of a loose top (shirt, t-shirt, suit jacket) on 8 one-bone chains. Each bone's
    tail is a damped spring toward its rest direction (inertia: it lags, swings, settles;
    gravity: it hangs straight when the hips tilt), pushed out of the legs (tapered capsules
    on thigh and shin, always to the outside: a knee lifted into a skirt goes under it), never
    into the body; neighbors spread a push (a tent, not a fold). Up close (< 14 m) with
    dynamics, to 34 m only the legs push it, beyond it rests. On a flight of stairs the cloth
    calms (`cloth.calm`, from the stair clip's or the foot IK's weight: stiffer, more damped,
    a smaller swing).
    Skirted women run with shorter steps (part walk cycle). Tuning: `config.js` `cloth`.
  - `CivilianAnimator.js`: idles by kind, praying (desynchronized), walk / run (scared upper
    body while fleeing), frozen cowering, panic, nervous waiting in the shelter, talking
    (standing: the talk clip; walking: its upper body over the walk).
  - Faces: the converter's face rig (`lib/face.mjs`) gives each talking character two morph
    targets on LOD0, `mouthOpen` (the jaw turns about a hinge, the lips part in a lens shape)
    and `blink` (upper lids slide over the eyes, found by the whites of the eyes in the
    atlas), plus a mouth strip on the lip line (teeth / dark mouth tile; behind the lips when
    the mesh has a lip slit, else in front with zero height). CharacterModel drives them:
    `face.mouth` (set by the views) and random blinks; `lookTarget` turns neck + head toward a
    point (limits, smoothed). `LipSync.js` (pure): a line's text -> syllable rhythm (Hebrew:
    ~1 syllable / 2 letters, pauses at punctuation, fitted to the subtitle time), or a
    recording's loudness. Soldiers talk with the left hand (`talk_question_left`, mode
    `leftArm`, the left-hand IK released: `ikLeft`), civilians with `talk_general`.
  - Talking in the story: `Dialogue` -> StoryDirector `onLine` sets `npc.speech` (text,
    duration, recording level) on the speaker; `_updateLooks` sets `npc.lookAt` (the speaker
    at the one addressed: the line's `to`, else the player when near; people within 7 m at
    the speaker). Recorded lines: `src/assets/voice/<lineId>.ogg|mp3|wav|m4a` (see the README
    there, `story/Voice.js`): played from the speaker, the mouth follows the loudness.
  - `wardrobe.js` (pure): the civilians' looks. Men: Kotel visitors (white shirts, dark
    trousers or jeans; bare legs dressed as trousers), haredim (black suit, white shirt, black
    hat), suits, tourists' t-shirts; every man has a black hat or a kippah (black velvet,
    white, or knitted with a patterned band). Women: long skirts, long sleeves over bare arms,
    tights; worshipers mostly in a headscarf; the tour guide is a woman in bright yellow.
    `CAST` = which models play each NPC kind,
    `dressPerson(kind, neighbors)` picks a model and outfit unlike the people nearby
    (`likeness`). `outfits.js` applies an outfit (and arms squad / enemies);
    `attachments.js`: kippah, black hat, headscarf, headband, vest. Head wear is fitted to
    each model's real head: `CharacterType.headSurface(part)` = points ~5 mm apart over the
    LOD0 triangles that follow the Head bone (rest pose, Head-bone frame; a low-poly cap is a
    few big triangles, so corners alone miss it), `fitted(key, make)` caches a fit per model;
    `headFit.js` (pure): `fitRing` (quantile radius around a ring, tilted lower at the back),
    `fitCap` (quantile radii over a cap of directions), `topHeight`. The kippah lies on the
    outermost hair at the back of the crown; the hat's band on the hair; an enemy's headband
    is fitted along its top edge, middle and bottom edge and raised above anything sticking
    out in front (a cap's brim); the headscarf (tichel, hair hidden) lies on the skin where
    the model has it and on the skull ellipsoid under the hair (the converter took the scalp
    out from under it), over a layer of flattened hair and a bun, never under the skin (ears),
    with a rolled hem, creases into a knot at the nape and two tails. The vest (a plate
    carrier on Spine2) lies on `torsoSurface()` (what follows Spine1 / Spine2): `surfaceGrid`
    height fields of the chest and the back, the plates on them smoothed (bridging the spine's
    groove), straps over the shoulders, pouches on the front plate. `weapons.js` (M4 / AK
    from boxes).
  - `EnemyView.js` / `story/NpcView.js` / `ai/TruckView.js` (the gunner) build the models
    once the library is ready; until then (and in tests) the old placeholder figures.
    NpcView dresses each civilian through `dressPerson` with the civilians already built
    within 9 m.
    Hit zones: views set `agent.hitShape = model.hit`; `Enemy.raycast` / `Npc.raycast` then
    use `modelHitTest` (head sphere + body capsule from feet/hips to the neck, same radii as
    before), and other agents aim at the model's head. F1 draws the zones (magenta).
- `scripts/assets/characters.mjs` (+ `characters.config.mjs`, `lib/`): the converter. FBX via
  three's FBXLoader in Node (`lib/fbx.mjs`, embedded textures captured) -> skeleton in meters
  with duplicate bone hierarchies merged (`lib/rig.mjs`) -> meshes merged and welded ->
  hidden skin under clothes removed, garments layered (`lib/hidden.mjs` `layerUnder`: where a
  waistband or a tucked shirt touches the garment over it, it sinks 1 cm under; the skin left
  just inside a sleeve or a trouser leg sinks 8 mm) -> civilians'
  clothing parts (`lib/clothes.mjs`: bare arm / leg skin as parts, split at the borders; the
  women's long skirt: rings sized from the body, its own fabric tile, hung on cloth bones;
  a shirt under a suit is its own part) -> cloth bones (`lib/cloth.mjs`: the skirt's chains,
  hem chains for loose tops, leg colliders) -> texture atlas + recolors (olive /
  dark / "SWAT" lettering removed / painted balaclava or face wrap) (`lib/atlas.mjs`; clothing
  cut-out texels filled with the fabric around them) -> LODs with meshoptimizer (`lib/lod.mjs`:
  each LOD bounded by an error, 0.3% / 0.7% / 2% of the body, not a triangle count (a count
  target collapses limbs once the locked face leaves nothing cheap); LOD0 locks the face, LOD1
  keeps it to its own smaller error; a skirt's lining is only in LOD0) -> face rig
  (`lib/face.mjs`: lip line from an open lip slit crossing the face's middle, else the groove
  between the lips below the nose tip, or `face.lipY` set in the config when measured with
  the preview's `?lip=`) -> GLB (`lib/glb.mjs`, morph targets shared by the LOD primitives). Clips (`lib/anim.mjs`):
  sampled at 30 fps (slow idles 15 fps, long ones cut to crossfaded 8 s loops), root motion
  measured then removed for locomotion (speed in the manifest), cycles shifted so the left
  foot plants at phase 0, IK hand targets baked from the source skeleton; packed by
  `lib/animbin.mjs` (meshopt codec, quaternion / exponential filters).
- `scripts/assets/weapons.mjs` (+ `weapons.config.mjs`, `lib/model.mjs`, `lib/paint.mjs`): the
  weapon / vehicle converter. Rifle: FBX in cm -> meters, parts as pivot nodes (magazine at its
  feed lips, dust cover on its hinge, charging handle; a pivot holds the mesh node because
  quantization moves the mesh node's own transform), rear sight folded, markers in the root's
  extras (rail top, bore / muzzle, port, magwell, grip, handguard, dust cover angles), metalness
  toned down (anodized, not chrome). Arms: rest pose baked, bones without the rig's 0.1 scale,
  glove vs sleeve per vertex (distance along the forearm from the wrist), sleeves inflated off
  the skin, color + normal painted per texel from 3D (`paintTriangles`: fabric creases and
  weave, the skin texture's wrinkles kept on the gloves). Launcher: principal axes -> tube
  along -Z, grips down, origin on the rear sight, scaled to 0.95 m. Truck: a GLB read with
  glTF-Transform, real size, front toward -Z, wheels as nodes, source materials -> roles per
  triangle (`TRUCK_ROLES`; the maker's badge dropped), crease-angle normals (`creaseNormals`).
- `dev/characters.html`: the character preview (dev only, not in the build); `outfit=none`
  shows a model as converted, `cam=face` / `faces` close-ups, `lip=<y>|auto` draws a lip
  line on the face (check / measure `face.lipY`), `ruler=1` height marks.
  `window.__preview.models[i].face.mouth = 0.7` opens a mouth.
- New Game: chapter buttons (`MISSION1.chapters`) start the mission at a part (`story.startAt`).
- Weapons: 1 = rifle, 2 = launcher (once owned), or the mouse wheel (`Game._updateWeapons`: lower,
  swap the viewmodel, raise). `src/weapons/Launcher.js` (pure: one loaded, auto reload, ADS) +
  `Rockets.js` (`RocketSim` flight/impacts, `RocketView` bodies + smoke trail); tuning in
  `weapons/config.js` `LAUNCHER`. `Game._blast()` is every explosion (grenade, rocket, truck).
- Slow motion: the story's `timeScale` scales the fixed-step accumulator (`slowmo` action).
- Mission stats (time, accuracy, headshots, kills) counted in Game from the start / chosen chapter,
  shown by `StoryHud.showStats()`.
- `src/ui/StoryHud.js`: objective, waypoint with distance, subtitles, key hints, talk prompt,
  title/end cards, fade, mission-failed screen, checkpoint toast, the F2 step menu.
- Weapon modes: `rifle.mode = 'lowered'` (can't fire; R checks the magazine and fires
  `onMagCheck`) or `'ready'`. Game hides the crosshair/ammo while lowered.
- `src/player/PlayerHealth.js`: CoD-style regenerating health + hit direction records (pure).
- `src/ui/DamageOverlay.js`: red edges, hit flash, direction arcs, hit marker, death fade.
- Game loop order per fixed step: player -> camera -> rifle (shots hit enemies, then NPCs
  (friendly fire), then the world; shots are heard) -> enemies (hostiles and the squad's combat
  AI) -> story -> health. Death: fade out, `Game.restart()` after 3.2 s.
- `src/ui/`: Hebrew strings (`strings.he.js`: the menus, settings, loading lines too), HUD
  (spread-sized crosshair, ammo counter, the FPS counter (Settings), debug readout; toggle the
  readout with the backquote key, shown by default in dev while playing).
- Difficulty: `story/difficulty.js` `LEVELS` (easy / normal / hard: multipliers on the
  attackers' accuracy, damage, reaction and grenades, and the truck's gun) over the tuned
  values; `setDifficulty()`; attackers spawned after a change use it.
- `src/world/Environment.js` `setTime('HH:MM')`: the sun at another clock time on the level's
  day (the menu's sunrise, the mission's 11:40); sky, haze, fill and image light follow
  (a dawn palette near the horizon).
- `src/ui/Screenshot.js`: P saves the 3D view (with the weapon, no HUD) as a PNG, read back
  right after `post.render()`. The dev server writes it to `screenshots/game/` (the
  `/__screenshot` endpoint in `vite.config.js`); a production build downloads it.
- `tests/`: `node:test` suites for the controller, collision world, weapon logic and the Kotel
  level's walkable routes / out-of-bounds (`tests/kotel.test.js`), the mission runner and a scripted
  Mission 1 playthrough (`tests/mission.test.js`) (`tests/helpers.js` builds
  test worlds and simulates input).

## Conventions

- Units: meters, seconds, radians. +Y is up. Yaw 0 looks down -Z.
- Key bindings use `KeyboardEvent.code` (physical keys), never `event.key`,
  so controls work on a Hebrew keyboard layout.
- All player-facing text is Hebrew and RTL (`<html lang="he" dir="rtl">`), kept in
  `src/ui/strings.he.js`. Wrap numbers inside Hebrew text in LTR isolates (see `Hud.js`).
- Gameplay logic that can run without a browser (physics, AI decisions, story triggers) stays
  DOM-free and gets tests in `tests/`. Run `npm test` before committing.
- Assets: free/CC0 only (the Mixamo characters are the one exception, see Game vision).
  Record the source and license of every third-party asset in `public/assets/CREDITS.md`.
- Performance: no per-frame allocations in hot paths (reuse vectors), keep draw calls low,
  and check the FPS readout after every feature.

## Notes and gotchas

- Don't use three's `Octree` addon for collision: it drops triangles lying exactly on its cell
  borders (float rounding), so axis-aligned greybox faces vanish. `CollisionWorld` pads
  triangle bounds instead.
- three r186 removed `PCFSoftShadowMap`; use `PCFShadowMap` with `shadow.radius`.
- Dev builds expose `window.__game` for console debugging and automated checks
  (e.g. `__game.setActive(true)` plays without pointer lock).
- Headless Chromium (Playwright) renders with SwiftShader: fine for screenshots and logic checks,
  meaningless for FPS numbers. Set `__game.fixedFrame = 1 / 60` so every frame advances 1/60 s of
  game time (else long frames hit the 0.1 s cap: springs, cloth and stairs smoothing see huge
  steps; they are sub-stepped, but the scene then isn't what a player sees). At ~5 FPS the frame-time cap makes game time run slower than real
  time (with every character on screen it can drop under 1 FPS, a few tenths of a second of game
  time in 15 s: fast-forward what a shot needs, e.g. `view.update(0.1)` in a loop for the
  death falls in `character-shots.mjs`). Under pointer lock, Playwright's synthetic mouse events report bogus large movements
  (the view jumps); drive input via `__game.input.held` / `.pressed` instead.
- Two render passes per frame (world, then viewmodel), so `renderer.info.autoReset` is off and
  `Game.frame()` resets it.
- Viewmodel materials use low metalness: without an environment map, metals render black.
- Levels export `navBounds` and `enemySpawns` for the AI. Keep cover objects >= 0.75 m tall
  (the cover generator's crouched-chest height) if they should count as cover.
- CSM: every lit material must go through `csm.setupMaterial()` or it is lit once per cascade
  (far too bright). `Environment.prepare()` does that each frame for new materials and chains
  any existing `onBeforeCompile` patch (keep custom patches on `onBeforeCompile` before the
  first render, or store them in `userData.baseOnBeforeCompile`). Mark unlit/special meshes
  `userData.noCSM`.
- KTX2: three's `KTX2Loader` loads its Basis transcoder from three's own folder (Vite bundles
  it); don't set a transcoder path. Normal maps are UASTC (ETC1S artifacts
  show badly in lighting); color and ORM are ETC1S. Textures ship at 1024 px.
- A baked AO map with too much contrast reads as black speckle on the shaded wall; keep AO
  soft (`generate.mjs` `aoFromHeight`).
- Poly Haven / ambientCG may be blocked by a sandbox network policy (HTTP 403); `assets:fetch`
  then leaves the generated textures in place.
- Headless Chromium is very slow at compositing full-screen CSS overlays (damage vignette,
  death fade); game time crawls in those tests. Real GPUs are fine.
- Characters, retargeting: all Mixamo rigs share bone names and axis conventions, so clips made
  on Y Bot play by copying local rotations (plus the scaled hips track). Proportions differ,
  so rifle holds need the arm IK (the source hands' placement is baked into the clips).
  The rifle axis is the body's forward, not the hand-to-hand line (the support wrist sits
  ~30 degrees off the bore in the Pro Rifle Pack).
- Characters, converter pitfalls: FBX UVs are v-up (glTF v-down); some Fuse models bind each
  clothing mesh to its own copy of the skeleton (merge them or the clothes don't move);
  glTF-Transform's `quantize` sorts skin weights once per primitive and scrambles joints when
  primitives share accessors (the LODs do): weights are sorted/quantized in `packSkin` and
  `normalizeWeights` is off. A glTF with every clip was ~60% JSON: hence `anims.bin`.
- Characters, LODs: a meshoptimizer triangle-count target is a floor, not a budget: with the face
  and clothing borders locked it reached the count by collapsing arms into blades and feet into
  spikes (an 8% error). Bound each LOD by error instead (`lib/lod.mjs`).
- Characters, cloth: the skirt's top ring can sit above the measured trousers (under a top);
  rings with nothing measured take the size of the ring below (a radius of 0 put every
  chain's pivot at the hip center and the skirt exploded). Leg capsules start a quarter of the
  way down the thigh (at the hip joint they swallow the waistband).
- Characters, procedural bone edits: three's `PropertyMixer` only writes a bone when the
  animated value changed, so an edit made on top of the clip (head look, spine aim, IK, foot
  IK, upright) piles up frame after frame on bones whose clip value holds still (heads that
  drifted and spun). `CharacterModel` restores the clean pose of the edited bones before
  `mixer.update()` and saves it right after (`_restorePose` / `_savePose`).
- Characters, runtime: `SkinnedMesh.boundingSphere` is preset (a fixed sphere) so three never
  computes skinned bounds; three calls `skeleton.update()` on every `render()` that draws the
  mesh (the post chain renders the scene more than once), which CharacterModel skips when
  nothing changed.
