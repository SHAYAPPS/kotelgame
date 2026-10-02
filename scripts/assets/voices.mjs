// Imports voice-over takes (one file per line: `<lineId>.<any format ffmpeg reads>`, e.g. the
// MP3s saved from ElevenLabs) into src/assets/voice/ as Ogg Opus: the silence at both ends
// trimmed (a short breath kept), the speaker's pitch shift from voices.config.mjs (with the
// formants), loudness matched (-18 LUFS, peaks under -1.5 dBFS), mono.
//   npm run assets:voices -- <folder> [lineId ...]
// Only ids of src/story/text.he.js lines (and the crowd_prayer_* loops: not trimmed, so they still
// loop seamlessly) are taken. A line that
// already has a recording of another kind (a booth .webm) is left alone: delete it first.
import { spawnSync } from 'node:child_process';
import { readdirSync, statSync } from 'node:fs';
import { join, extname, basename } from 'node:path';
import { fileURLToPath } from 'node:url';
import { LINES } from '../../src/story/text.he.js';
import { CAST, roleOf } from './voices.config.mjs';

const OUT = fileURLToPath(new URL('../../src/assets/voice/', import.meta.url));
const TARGET = -18; // LUFS
const PEAK = -1.5; // dBFS
const AUDIO = /\.(mp3|wav|ogg|webm|m4a|flac|aac)$/i;
// Trim the start to 60 ms before the voice and the end to 200 ms after it.
const TRIM = [
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.06',
  'areverse',
  'silenceremove=start_periods=1:start_threshold=-50dB:start_silence=0.2',
  'areverse',
].join(',');

const [dir, ...only] = process.argv.slice(2);
if (!dir) {
  console.error('usage: npm run assets:voices -- <folder> [lineId ...]');
  process.exit(1);
}

function ffmpeg(args) {
  const r = spawnSync('ffmpeg', ['-hide_banner', '-nostats', ...args], { encoding: 'utf8' });
  if (r.status !== 0) throw new Error(r.stderr.split('\n').slice(-4).join('\n'));
  return r.stderr;
}

const isLoop = (id) => /^crowd_prayer_\d+$/.test(id);

/** Trim (not a loop: it must keep its length), then shift the pitch and the formants together (resampled, the length kept). */
function shaping(id) {
  if (isLoop(id)) return 'anull';
  const st = CAST[roleOf(LINES[id]?.speaker)]?.pitch ?? 0;
  if (!st) return TRIM;
  const r = Math.pow(2, st / 12);
  return `${TRIM},aresample=48000,asetrate=${Math.round(48000 * r)},aresample=48000,atempo=${(1 / r).toFixed(5)}`;
}

/** Integrated loudness (LUFS) after `chain`. */
function loudness(file, chain) {
  const log = ffmpeg(['-i', file, '-af', `${chain},ebur128`, '-f', 'null', '-']);
  const m = [...log.matchAll(/I:\s+(-?[\d.]+) LUFS/g)].pop();
  return m ? +m[1] : null;
}

const known = (id) => !!LINES[id] || /^crowd_prayer_\d+$/.test(id);
const existing = readdirSync(OUT).filter((f) => AUDIO.test(f));
const files = readdirSync(dir).filter((f) => AUDIO.test(f));
const skipped = [];
let done = 0;
for (const f of files) {
  const id = basename(f, extname(f));
  if (only.length && !only.includes(id)) continue;
  if (!known(id)) {
    skipped.push(`${f} (no such line)`);
    continue;
  }
  const other = existing.find((e) => basename(e, extname(e)) === id && e !== `${id}.ogg`);
  if (other) {
    skipped.push(`${f} (already recorded: ${other})`);
    continue;
  }
  const src = join(dir, f);
  const chain = shaping(id);
  const lufs = loudness(src, chain);
  const gain = lufs === null || !isFinite(lufs) ? 0 : Math.max(-12, Math.min(12, TARGET - lufs));
  const limit = Math.pow(10, PEAK / 20).toFixed(4);
  const out = join(OUT, `${id}.ogg`);
  ffmpeg(['-y', '-i', src, '-af', `${chain},volume=${gain.toFixed(2)}dB,alimiter=limit=${limit}:level=0`,
    '-ac', '1', '-ar', '48000', '-c:a', 'libopus', '-b:a', '48k', '-application', 'voip', out]);
  done++;
  console.log(`${id.padEnd(16)} ${String(lufs).padStart(6)} LUFS -> ${TARGET}  ${(statSync(out).size / 1024).toFixed(0).padStart(4)} KB`);
}
console.log(`${done} lines -> src/assets/voice/` + (skipped.length ? `; skipped: ${skipped.join(', ')}` : ''));
