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

## Controls

| Key | Action |
| --- | --- |
| W A S D | Move |
| Mouse | Look (click the start button to lock the pointer) |
| Left click | Fire (hold for full auto) |
| Right click (hold) | Aim down sights |
| R | Reload (weapon lowered: check the magazine) |
| E | Talk to the highlighted NPC |
| Space | Jump (while crouched: stand up) |
| Shift (hold) | Sprint, forward only |
| C | Crouch on / off |
| Esc | Pause |
| ` (backquote) | Toggle the performance readout |
| F1 | Dev tools: enemy states, vision cones, cover points, navmesh, FPS |
| K | Spawn another enemy |
| F2 | Dev tool: jump to any mission step, toggle the weapon between lowered and ready |
