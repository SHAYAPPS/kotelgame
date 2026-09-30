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
3. [ ] Greybox Kotel  <- next
4. [ ] First enemy
5. [ ] Opening story beat
6. [ ] Realism pass

## Commands

- `npm install`: install dependencies (Node >= 20.19)
- `npm run dev`: dev server at http://localhost:5173
- `npm test`: physics, collision and weapon-logic tests (Node's built-in test runner, no browser needed)
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
- `src/ui/`: Hebrew strings (`strings.he.js`), start/pause overlay (mouse sensitivity, saved in
  localStorage), HUD (spread-sized crosshair, ammo counter, debug readout; toggle the readout
  with the backquote key, shown by default in dev).
- `tests/`: `node:test` suites for the controller, collision world and weapon logic (`tests/helpers.js` builds
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
