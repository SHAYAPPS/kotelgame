# kotelgame

A browser-based 3D first-person story shooter built with Three.js and Vite (no game engine).
See [CLAUDE.md](CLAUDE.md) for the vision, working rules, roadmap and architecture.

## Quick start

Requires Node.js 20.19 or newer.

```bash
npm install
npm run dev     # then open http://localhost:5173
npm test        # physics / collision / weapon / AI / mission tests
```

The start screen lists the mission's parts: click one to start there instead of from the
beginning. Difficulty (wave sizes, spawn timing, enemy accuracy, grenade frequency, ammo)
is tuned in `src/story/difficulty.js`.

## Graphics

The start/pause screen has a graphics setting (low / medium / high; saved in the browser).
Medium is the default and aims at 60 FPS on an average laptop; low drops ambient occlusion,
bloom, MSAA and shadow cascades; high adds full-resolution AO, 3 shadow cascades, 4x MSAA
and a 2x pixel ratio on high-DPI screens.

Textures are KTX2 in `public/assets/textures/`. The shipped stone sets are generated
(`npm run assets:generate`); `npm run assets:fetch` swaps in CC0 photoscans from Poly Haven /
ambientCG and a 2k sky HDRI. Every asset is listed in
[`public/assets/CREDITS.md`](public/assets/CREDITS.md).

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the start button to lock the pointer) |
| Left click | Fire (hold for full auto) |
| Right click (hold) | Aim down sights |
| R | Reload (weapon lowered: check the magazine) |
| G (hold, release) | Frag grenade: hold to aim (the arc shows), release to throw |
| 1 / 2 or mouse wheel | Switch weapon (rifle / rocket launcher, once you have it) |
| E | Talk to the highlighted NPC / send a frozen civilian to shelter / take ammo at a crate |
| Space | Jump (while crouched: stand up) |
| Shift (hold) | Sprint, forward only |
| C | Crouch on / off |
| Esc | Pause |
| ` (backquote) | Toggle the performance readout |
| F1 | Dev tools: enemy states, vision cones, cover points, navmesh, FPS |
| K | Spawn another enemy |
| F2 | Dev tool: jump to any mission step, toggle the weapon between lowered and ready |
