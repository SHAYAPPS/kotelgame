# Voice recordings

Drop recorded dialogue here, one file per line, named after the line's id in
`src/story/text.he.js` (for example `brief_1.ogg` for `LINES.brief_1`). Supported: `.ogg`,
`.mp3`, `.wav`, `.m4a`.

The build finds them automatically (`Game.js`, `import.meta.glob`). When a line with a
recording plays, the game:

- plays it from the speaker's position (radio lines through a radio filter),
- keeps the subtitle up at least as long as the recording,
- moves the speaker's mouth with the recording's loudness instead of the text
  (`src/characters/LipSync.js`, `src/story/Voice.js`).

Lines without a file keep the text-driven mouth movement.
