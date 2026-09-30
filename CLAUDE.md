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
  **Free/CC0 assets only.**

## Working rules

- Build **one feature at a time**. Stop after each one and tell the user how to test it
  (the command to run and what to try).
- **Commit to git after every working feature.**
- Keep the code modular: `src/player`, `src/weapons`, `src/world`, `src/ai`, `src/story`, `src/ui`.
  (`src/core` holds engine plumbing: renderer, game loop, input.)
- Target a smooth **60 FPS on an average laptop**.

## Roadmap

1. [x] Movement: first-person controller, tried out on a greybox test range
2. [x] Gun: hitscan rifle with ADS, recoil, impacts, reload, procedural sound
3. [x] Greybox Kotel: 1:1 plaza layout (reference: `docs/kotel-reference.md`)
4. [x] First enemy: perception, cover AI, navmesh, hitscan + tracers; player health
5. [ ] Opening story beat  <- in progress
   - [x] Part 1: mission system + the calm shift (ends on the radio chatter, before the sirens)
   - [ ] Part 2: sirens and the attack
6. [ ] Realism pass

## Commands

- `npm install`: install dependencies (Node >= 20.19)
- `npm run dev`: dev server at http://localhost:5173 (Kotel plaza; add `?level=range` for the
  movement/gun test range)
- `npm test`: physics, collision, weapon, level-route and AI tests (Node's built-in test runner, no browser needed)
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the production build locally

## Architecture

- `src/main.js` -> `src/core/Game.js`: renderer, scene, fixed-timestep loop (physics at 120 Hz,
  rendering interpolated between steps), pause/resume tied to pointer lock.
- `src/core/Input.js`: keyboard by `event.code`, mouse deltas, pointer lock (raw mouse input when
  the browser supports it). Key presses are edges consumed by the first physics step.
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
- `src/world/CollisionWorld.js`: static triangles in a uniform XZ grid; capsule contacts and
  raycasts with no allocations. Built from meshes; `userData.noCollision` skips a mesh.
  Use `raycast()` for bullets too.
- `src/world/capsuleContact.js`: exact capsule-vs-triangle contact (closest points).
- `src/world/Environment.js`: sky dome, fog, sun + hemisphere light. Shadows are rendered once
  (static world); call `refreshShadows()` if static geometry changes.
- `src/world/greybox.js`: procedural 1 m grid texture, color palette, box/ramp geometry with UVs in meters.
- `src/world/kotel/`: the greybox Western Wall plaza (Mission 1), 1 unit = 1 m.
  - `config.js`: **every dimension** (wall, prayer area, mechitza, Wilson's Arch, bridge, terraces,
    buildings, checkpoint, backdrop, spawn, lighting) plus the plain greybox colors. Axes: +X east
    (toward the wall), +Z south; wall face at x = 0, prayer floor y = 0, men north (-Z) of the
    mechitza. Facts and estimates behind the numbers: `docs/kotel-reference.md`.
  - `KotelLevel.js`: builds floors/terraces, the wall, prayer area, Wilson's Arch; `groundY(x, z)`.
  - `kotelSurroundings.js`: plaza edges, tunnels entrance, stairs, southern checkpoint, dig,
    Mughrabi Bridge, plaza props, skyline.
  - `wallStones.js`: procedural instanced ashlar courses (bands, drafted margins, plants).
    The wall's collision is one invisible blocker just in front of the stone faces.
  - `batch.js`: StaticBatch merges static boxes per color (few draw calls); `blocker()` adds
    invisible out-of-bounds walls. `instancing.js` + `props.js`: instanced props, each with one
    simple collision box.
- `src/world/TestRange.js`: movement test course (green = step onto, amber = jump,
  red = crouch-jump, blue = crouch under, teal = walkable ramp, dark red = too steep).
- `src/weapons/`: the rifle.
  - `config.js`: all weapon tuning (fire rate, magazine, reload time, spread, recoil, ADS).
  - `WeaponState.js`: magazine / fire-rate / reload / aim logic (pure, unit-tested).
  - `Recoil.js`: view kick that springs back to the aim point (pure, unit-tested); the rifle
    writes it into `PlayerCamera.offsetPitch/offsetYaw`, plus `fovScale`/`lookScale` for ADS.
  - `Rifle.js`: ties it together; hitscan via `CollisionWorld.raycast` from the eye along
    `PlayerCamera.getAimDirection()` plus a spread cone. `rifle.onHit(hit, dir)` is the hook
    for damaging enemies later.
  - `Viewmodel.js`: placeholder rifle + hands in its own scene/camera, drawn after the world
    with a cleared depth buffer (no wall clipping). Model origin = rear sight, so the ADS pose
    puts it on the view axis. Poses: hip, ADS, sprint, reload; sway, bob, shot kick, muzzle flash.
  - `Impacts.js`: pooled bullet-hole decals (one InstancedMesh) and sparks (one Points).
  - `WeaponAudio.js`: Web Audio procedural shot / dry-fire / reload sounds; `unlock()` must be
    called from a user gesture (the start click).
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
  - `EnemyView.js`: placeholder soldier (capsule body + separate head), crouch, muzzle flash,
    death fall; `Tracers`.
  - `DebugDraw.js`: F1 overlay (navmesh points, cover points, vision cones, paths, state labels).
- `src/story/`: the mission system (pure logic except the views/audio) and Mission 1.
  - `Mission.js`: a script is a list of steps; each step runs `do` actions on entry and waits for
    its `until` trigger (`reach`, `talk`, `timer`, `enemiesDead`, `dialogueDone`, `arrived`,
    `action`, `all`/`any`). Actions: objective, hint, dialogue, npc (spawn/route/place/face/
    talkable), populate, weapon, sound, ambience, fade, title, endCard, checkpoint.
    `jumpTo(i)` replays the earlier steps' state actions in fast mode (no dialogue, NPCs placed at
    their route ends) and enters step i; checkpoints restart this way. `fail()` freezes it.
  - `mission1.js`: Mission 1's steps, squad routes, checkpoints and crowd groups
    (worshipers, crossers, tour group). `text.he.js`: **all** dialogue, speakers, objectives,
    hints and cards (placeholder Hebrew; edit text there only).
  - `Dialogue.js`: queued subtitle lines with reading-time durations.
  - `Npc.js`: NPCs on `PlayerController` bodies walking navmesh routes; a `leash` makes the
    squad wait (looking back) only when the player lags behind; tour members follow a leader;
    `NpcManager` spawns, separates bodies, finds the E talk target, ray-tests friendly fire.
  - `NpcView.js`: placeholder figures (one merged vertex-colored mesh per kind), pray/walk/idle loops.
  - `AmbientAudio.js`: generated crowd murmur, birds, radio squelch, objective chime.
  - `StoryDirector.js`: the mission context; tutorial events (move/sprint/crouch/mag check),
    E to talk, friendly fire -> fail -> restart at the last checkpoint, F2 jumps.
- `src/ui/StoryHud.js`: objective, waypoint with distance, subtitles, key hints, talk prompt,
  title/end cards, fade, mission-failed screen, checkpoint toast, the F2 step menu.
- Weapon modes: `rifle.mode = 'lowered'` (can't fire; R checks the magazine and fires
  `onMagCheck`) or `'ready'`. Game hides the crosshair/ammo while lowered.
- `src/player/PlayerHealth.js`: CoD-style regenerating health + hit direction records (pure).
- `src/ui/DamageOverlay.js`: red edges, hit flash, direction arcs, hit marker, death fade.
- Game loop order per fixed step: player -> camera -> rifle (shots hit enemies, then NPCs
  (friendly fire), then the world; shots are heard) -> enemies -> story -> health. Death: fade out, `Game.restart()` after 3.2 s.
- `src/ui/`: Hebrew strings (`strings.he.js`), start/pause overlay (mouse sensitivity, saved in
  localStorage), HUD (spread-sized crosshair, ammo counter, debug readout; toggle the readout
  with the backquote key, shown by default in dev).
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
- Assets: free/CC0 only. Record the source and license of every third-party asset
  in `public/assets/CREDITS.md`.
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
  meaningless for FPS numbers. At ~5 FPS the frame-time cap makes game time run slower than real
  time. Under pointer lock, Playwright's synthetic mouse events report bogus large movements
  (the view jumps); drive input via `__game.input.held` / `.pressed` instead.
- Two render passes per frame (world, then viewmodel), so `renderer.info.autoReset` is off and
  `Game.frame()` resets it.
- Viewmodel materials use low metalness: without an environment map, metals render black.
- Levels export `navBounds` and `enemySpawns` for the AI. Keep cover objects >= 0.75 m tall
  (the cover generator's crouched-chest height) if they should count as cover.
- Headless Chromium is very slow at compositing full-screen CSS overlays (damage vignette,
  death fade); game time crawls in those tests. Real GPUs are fine.
