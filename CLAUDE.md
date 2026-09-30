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

1. [ ] Movement: first-person controller
2. [ ] Gun
3. [ ] Greybox Kotel
4. [ ] First enemy
5. [ ] Opening story beat
6. [ ] Realism pass

## Commands

- `npm install`: install dependencies (Node >= 20.19)
- `npm run dev`: dev server at http://localhost:5173
- `npm run build`: production build into `dist/`
- `npm run preview`: serve the production build locally

## Conventions

- Units: meters, seconds, radians. +Y is up. Yaw 0 looks down -Z.
- Key bindings use `KeyboardEvent.code` (physical keys), never `event.key`,
  so controls work on a Hebrew keyboard layout.
- All player-facing text is Hebrew and RTL (`<html lang="he" dir="rtl">`).
  Keep strings in one place in `src/ui` instead of scattering them through the code.
- Assets: free/CC0 only. Record the source and license of every third-party asset
  in `public/assets/CREDITS.md`.
- Performance: no per-frame allocations in hot paths (reuse vectors), keep draw calls low,
  and check the FPS readout after every feature.
