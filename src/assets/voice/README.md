# Voice recordings

One file per line, named after the line's id in `src/story/text.he.js` (for example
`cp_brief_1.webm` for `LINES.cp_brief_1`). Supported: `.webm`, `.ogg`, `.mp3`, `.wav`, `.m4a`.

Every line is a generated take (ElevenLabs; who voices whom, with a pitch shift for some:
`scripts/assets/voices.config.mjs`, also in `public/assets/CREDITS.md`), imported with
`npm run assets:voices -- <folder> [lineId ...]` (trims the silence, shifts the pitch,
matches the loudness, encodes Ogg Opus). A booth recording of the same line replaces the
generated one. `crowd_prayer_1..4` are seamless 11 s loops (ElevenLabs Sound Effects).

The easiest way to make the others is the recording booth: `npm run dev`, then
http://localhost:5173/dev/booth.html. It lists every line by part, records a take from the
microphone (space starts / stops the selected line), plays it back and saves it here as
`<lineId>.webm`.

Ambient slots (loops) are recorded the same way:

- `crowd_prayer_1` .. `crowd_prayer_4`: the Selichot crowd praying. Each is looped and layered
  out of step (`src/story/AmbientAudio.js`, `setPrayer`); without them the game synthesizes
  the murmur.

The build finds the files automatically (`Game.js`, `import.meta.glob`). When a line with a
recording plays, the game:

- plays it from the speaker's position (radio lines through a radio filter),
- keeps the subtitle up at least as long as the recording,
- moves the speaker's mouth with the recording's loudness instead of the text
  (`src/characters/LipSync.js`, `src/story/Voice.js`).

Lines without a file keep the text-driven mouth movement.
