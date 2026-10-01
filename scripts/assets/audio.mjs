// Builds the game's sounds and music (public/assets/audio/) from free recordings (CC0 / public
// domain / CC-BY, listed in audio.config.mjs): decode with ffmpeg, slice, filter, pitch, fade,
// match loudness, make loops seamless, encode Ogg Opus. Writes manifest.json and CREDITS.md.
//   npm run assets:audio [id ...]      (sound ids from audio.config.mjs, or "music"; none = all)
// The raw downloads live in assets-src/sfx/<pack>/ (git-ignored) and are fetched when missing.
import { execFileSync, spawnSync } from 'node:child_process';
import { mkdir, readFile, writeFile, access } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { PACKS, SOUNDS, MUSIC } from './audio.config.mjs';
import { writeCredits } from './credits.mjs';

const SRC = new URL('../../assets-src/sfx/', import.meta.url);
const OUT = new URL('../../public/assets/audio/', import.meta.url);
const SR = 48000;
const path = (u) => fileURLToPath(u);
const exists = (u) => access(u).then(() => true, () => false);
const db = (x) => Math.pow(10, x / 20);

// ---------------------------------------------------------------------------------------------
// Sources

async function ensurePack(id) {
  const p = PACKS[id];
  if (!p) throw new Error(`unknown pack ${id}`);
  const dir = new URL(`${id}/`, SRC);
  await mkdir(dir, { recursive: true });
  for (const [name, url] of Object.entries(p.files)) {
    const file = new URL(name, dir);
    if (await exists(file)) continue;
    console.log(`  downloading ${url}`);
    const res = await fetch(url, { headers: { 'User-Agent': 'kotelgame-assets' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    await writeFile(file, Buffer.from(await res.arrayBuffer()));
    if (/\.(zip|7z)$/i.test(name)) execFileSync('bsdtar', ['-xf', path(file), '-C', path(dir)]);
    if (url.includes('wikimedia.org')) await new Promise((r) => setTimeout(r, 2000)); // their rate limit
  }
  return dir;
}

const decoded = new Map();
/** A source file as two Float32Array channels at 48 kHz. */
function decode(file) {
  if (decoded.has(file)) return decoded.get(file);
  const raw = execFileSync('ffmpeg', ['-v', 'error', '-i', file, '-ac', '2', '-ar', String(SR), '-f', 'f32le', '-'], { maxBuffer: 2 ** 31 });
  const x = new Float32Array(raw.buffer, raw.byteOffset, raw.length / 4);
  const n = x.length / 2;
  const L = new Float32Array(n);
  const R = new Float32Array(n);
  for (let i = 0; i < n; i++) {
    L[i] = x[i * 2];
    R[i] = x[i * 2 + 1];
  }
  const out = [L, R];
  decoded.set(file, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// DSP (plain arrays, per channel)

function cut(ch, from = 0, to = Infinity) {
  const a = Math.max(0, Math.round(from * SR));
  const b = Math.min(ch[0].length, Math.round(Math.min(to, ch[0].length / SR) * SR));
  return ch.map((c) => c.slice(a, b));
}

/** RBJ biquad, in place. type: lowpass | highpass. */
function biquad(c, type, f, q = 0.707) {
  const w = (2 * Math.PI * f) / SR;
  const cos = Math.cos(w);
  const alpha = Math.sin(w) / (2 * q);
  let b0, b1, b2;
  if (type === 'lowpass') [b0, b1, b2] = [(1 - cos) / 2, 1 - cos, (1 - cos) / 2];
  else [b0, b1, b2] = [(1 + cos) / 2, -(1 + cos), (1 + cos) / 2];
  const a0 = 1 + alpha;
  const a1 = -2 * cos;
  const a2 = 1 - alpha;
  let x1 = 0;
  let x2 = 0;
  let y1 = 0;
  let y2 = 0;
  for (let i = 0; i < c.length; i++) {
    const x0 = c[i];
    const y0 = (b0 * x0 + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
    x2 = x1;
    x1 = x0;
    y2 = y1;
    y1 = y0;
    c[i] = y0;
  }
}

/** Playback-rate resample (pitch and length together); from -> to: a sweep over the clip. */
function resample(c, from, to = from) {
  const out = [];
  let pos = 0;
  while (pos < c.length - 1) {
    const i = Math.floor(pos);
    const t = pos - i;
    out.push(c[i] * (1 - t) + c[i + 1] * t);
    pos += from + (to - from) * (pos / c.length);
  }
  return Float32Array.from(out);
}

function fade(c, fin, fout) {
  const a = Math.round(fin * SR);
  const b = Math.round(fout * SR);
  for (let i = 0; i < a && i < c.length; i++) c[i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / a);
  for (let i = 0; i < b && i < c.length; i++) c[c.length - 1 - i] *= 0.5 - 0.5 * Math.cos((Math.PI * i) / b);
}

/** Seamless loop: the clip's extra `x` seconds at the end are crossfaded into its start. */
function loopify(c, x) {
  const n = Math.round(x * SR);
  const len = c.length - n;
  const out = c.slice(0, len);
  for (let i = 0; i < n; i++) {
    const t = i / n;
    // Equal-power crossfade: the tail (continuing past the loop end) fades out over the head.
    out[i] = c[i] * Math.sin((t * Math.PI) / 2) + c[len + i] * Math.cos((t * Math.PI) / 2);
  }
  return out;
}

/** Loudest 50 ms RMS (one-shots) or the whole clip's RMS (beds), in dB. */
function loudness(ch, bed) {
  const n = ch[0].length;
  if (bed) {
    let s = 0;
    for (const c of ch) for (let i = 0; i < n; i++) s += c[i] * c[i];
    return 10 * Math.log10(s / (n * ch.length) + 1e-12);
  }
  const W = Math.round(0.05 * SR);
  let best = 0;
  let s = 0;
  for (let i = 0; i < n; i++) {
    for (const c of ch) s += c[i] * c[i];
    if (i >= W) for (const c of ch) s -= c[i - W] * c[i - W];
    best = Math.max(best, s / (W * ch.length));
  }
  return 10 * Math.log10(best + 1e-12);
}

function peak(ch) {
  let p = 0;
  for (const c of ch) for (let i = 0; i < c.length; i++) p = Math.max(p, Math.abs(c[i]));
  return p;
}

/** Trims leading / trailing quiet (under `floor` dB of the peak). */
function trim(ch, floorDb = -42, pad = 0.01) {
  const thr = peak(ch) * db(floorDb);
  const n = ch[0].length;
  let a = 0;
  let b = n - 1;
  const loud = (i) => ch.some((c) => Math.abs(c[i]) > thr);
  while (a < n && !loud(a)) a++;
  while (b > a && !loud(b)) b--;
  const p = Math.round(pad * SR);
  return ch.map((c) => c.slice(Math.max(0, a - p), Math.min(n, b + p)));
}

function encode(ch, file, kbps) {
  const n = ch[0].length;
  const C = ch.length;
  const inter = new Float32Array(n * C);
  for (let i = 0; i < n; i++) for (let k = 0; k < C; k++) inter[i * C + k] = ch[k][i];
  const r = spawnSync('ffmpeg', ['-v', 'error', '-y', '-f', 'f32le', '-ar', String(SR), '-ac', String(C), '-i', '-', '-c:a', 'libopus', '-b:a', `${kbps}k`, '-application', 'audio', file], {
    input: Buffer.from(inter.buffer),
    maxBuffer: 1 << 30,
  });
  if (r.status !== 0) throw new Error(`ffmpeg: ${r.stderr}`);
}

// ---------------------------------------------------------------------------------------------

/** One clip from a piece spec ({ pack, file, from, to, pitch, sweep }), stereo channels. */
async function piece(spec, base) {
  const packId = spec.pack ?? base.pack;
  const dir = await ensurePack(packId);
  const file = path(new URL(spec.file ?? base.file, dir));
  let ch = cut(decode(file), spec.from ?? 0, spec.to ?? Infinity);
  const pitch = spec.pitch ?? base.pitch;
  const sweep = spec.sweep ?? base.sweep;
  if (sweep) ch = ch.map((c) => resample(c, sweep[0], sweep[1]));
  else if (pitch && pitch !== 1) ch = ch.map((c) => resample(c, pitch));
  return { ch, packId };
}

async function buildSound(id, s) {
  // Variants: explicit list, slices of one file, a concatenation, or the file itself.
  let specs;
  if (s.hebrew) specs = await hebrewSpecs();
  else if (s.variants) specs = s.variants;
  else if (s.slices) specs = s.slices.map(([from, to]) => ({ from, to }));
  else if (s.concat) specs = [{ concat: s.concat }];
  else specs = [{ from: s.from, to: s.to }];
  const files = [];
  const durations = [];
  const packs = new Set();
  for (let v = 0; v < specs.length; v++) {
    const spec = specs[v];
    let ch;
    if (spec.concat) {
      const parts = [];
      for (const p of spec.concat) {
        if (p.gap) parts.push([new Float32Array(Math.round(p.gap * SR)), new Float32Array(Math.round(p.gap * SR))]);
        else {
          const r = await piece(p, { ...s, from: undefined, to: undefined, pitch: undefined });
          packs.add(r.packId);
          parts.push(r.ch);
        }
      }
      ch = [0, 1].map((k) => Float32Array.from(parts.flatMap((p) => Array.from(p[k]))));
    } else {
      const loopX = s.loop ?? 0;
      const r = await piece({ ...spec, to: spec.to != null && loopX ? spec.to + loopX : spec.to, file: spec.file ?? s.file }, s);
      packs.add(r.packId);
      ch = r.ch;
    }
    if (s.hebrew) ch = trim(ch);
    if (!(s.stereo ?? false)) {
      const m = new Float32Array(ch[0].length);
      for (let i = 0; i < m.length; i++) m[i] = (ch[0][i] + ch[1][i]) / 2;
      ch = [m];
    }
    for (const c of ch) {
      if (s.highpass) biquad(c, 'highpass', s.highpass);
      if (s.lowpass) biquad(c, 'lowpass', s.lowpass);
    }
    if (s.loop) ch = ch.map((c) => loopify(c, s.loop));
    else for (const c of ch) fade(c, spec.fadeIn ?? s.fadeIn ?? 0.002, spec.fadeOut ?? s.fadeOut ?? 0.01);
    // Loudness: the target level for the loudest moment (or the average for beds), then keep
    // peaks under -1 dBFS.
    const g = db((s.level ?? -10) - loudness(ch, s.bed));
    for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= g;
    const p = peak(ch);
    if (p > db(-1)) for (const c of ch) for (let i = 0; i < c.length; i++) c[i] *= db(-1) / p;
    const name = specs.length > 1 ? `${id}_${v}.ogg` : `${id}.ogg`;
    encode(ch, path(new URL(name, OUT)), s.kbps ?? (ch.length > 1 ? 80 : 48));
    files.push(name);
    durations.push(Math.round((ch[0].length / SR) * 1000) / 1000);
  }
  return { files, duration: durations, loop: !!s.loop, channels: s.stereo ? 2 : 1, packs: [...packs] };
}

/** The radio chatter words (Lingua Libre, CC0): the files listed in the hebrew pack. */
async function hebrewSpecs() {
  await ensurePack('hebrew');
  return Object.keys(PACKS.hebrew.files)
    .sort()
    .map((file) => ({ file, pack: 'hebrew' }));
}

async function buildMusic() {
  const dir = await ensurePack('music');
  const out = {};
  await mkdir(new URL('music/', OUT), { recursive: true });
  for (const [state, m] of Object.entries(MUSIC)) {
    const target = path(new URL(`music/${state}.ogg`, OUT));
    execFileSync('ffmpeg', ['-v', 'error', '-y', '-i', path(new URL(m.file, dir)), '-vn', '-af', 'loudnorm=I=-18:TP=-1.5:LRA=11', '-ar', '48000', '-c:a', 'libopus', '-b:a', '96k', '-application', 'audio', target]);
    const d = +execFileSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', target]).toString();
    out[state] = { file: `music/${state}.ogg`, title: m.title, duration: Math.round(d * 10) / 10 };
    console.log(`  music ${state}: ${m.title} (${Math.round(d)} s)`);
  }
  return out;
}

async function main() {
  await mkdir(OUT, { recursive: true });
  const want = process.argv.slice(2);
  const manifestUrl = new URL('manifest.json', OUT);
  const manifest = JSON.parse(await readFile(manifestUrl, 'utf8').catch(() => '{}'));
  manifest.sounds ??= {};
  const ids = want.length ? want.filter((w) => w !== 'music') : Object.keys(SOUNDS);
  for (const id of ids) {
    if (!SOUNDS[id]) throw new Error(`unknown sound ${id}`);
    const t0 = Date.now();
    const s = SOUNDS[id];
    const info = await buildSound(id, s);
    manifest.sounds[id] = info;
    console.log(`${id}: ${info.files.length} file(s), ${info.duration.map((d) => d.toFixed(2)).join(' ')} s (${Date.now() - t0} ms)`);
  }
  if (!want.length || want.includes('music')) manifest.music = await buildMusic();
  // Credits: the packs actually used.
  const used = new Set(Object.values(manifest.sounds).flatMap((s) => s.packs));
  if (manifest.music) used.add('music');
  manifest.credits = Object.fromEntries(
    [...used].map((id) => {
      const p = PACKS[id];
      const sounds = Object.entries(manifest.sounds)
        .filter(([, s]) => s.packs.includes(id))
        .map(([k]) => k);
      return [id, { title: p.title, author: p.author, license: p.license, licenseUrl: p.licenseUrl, page: p.page, sounds: id === 'music' ? Object.values(manifest.music ?? {}).map((m) => m.title) : sounds }];
    }),
  );
  await writeFile(manifestUrl, JSON.stringify(manifest, null, 1) + '\n');
  await writeCredits();
}

await main();
