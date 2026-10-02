// The recorded sounds (public/assets/audio/, built by scripts/assets/audio.mjs): the manifest
// lists every sound's variants; all of them are fetched and decoded once the audio unlocks
// (except `stream` ones: long pieces played through <audio> elements, see AmbientAudio's PA).
// `buffer(id)` hands out a variant, never the same one twice in a row.

export class SoundBank {
  /** @param {AudioContext} ctx @param {string} base URL of the audio folder */
  constructor(ctx, base) {
    this.ctx = ctx;
    this.base = base;
    this.manifest = null;
    this.buffers = new Map(); // id -> AudioBuffer[]
    this._last = new Map();
    this.ready = false;
  }

  /** @param {(done: number, total: number) => void} [onProgress] */
  async load(onProgress) {
    const res = await fetch(`${this.base}manifest.json`);
    this.manifest = await res.json();
    const jobs = [];
    for (const [id, s] of Object.entries(this.manifest.sounds ?? {})) {
      if (s.stream) continue; // long pieces, streamed by whoever plays them (meta(id).files)
      const list = new Array(s.files.length).fill(null);
      this.buffers.set(id, list);
      s.files.forEach((f, i) => jobs.push(() => this._decode(f).then((b) => (list[i] = b))));
    }
    const total = jobs.length;
    let done = 0;
    onProgress?.(0, total);
    // A few at a time: decoding everything at once stalls the main thread.
    const next = async () => {
      while (jobs.length) {
        await jobs.shift()().catch((e) => console.warn('sound', e));
        onProgress?.(++done, total);
      }
    };
    await Promise.all([next(), next(), next(), next()]);
    this.ready = true;
  }

  async _decode(file) {
    const res = await fetch(`${this.base}${file}`);
    return this.ctx.decodeAudioData(await res.arrayBuffer());
  }

  has(id) {
    return !!this.buffers.get(id)?.some(Boolean);
  }

  meta(id) {
    return this.manifest?.sounds?.[id] ?? null;
  }

  /** A decoded variant of `id` (or `index`), avoiding an immediate repeat; null if not loaded. */
  buffer(id, index = -1) {
    const list = this.buffers.get(id);
    if (!list) return null;
    if (index >= 0) return list[index % list.length] ?? null;
    const n = list.length;
    let i = Math.floor(Math.random() * n);
    if (n > 1 && i === this._last.get(id)) i = (i + 1 + Math.floor(Math.random() * (n - 1))) % n;
    this._last.set(id, i);
    return list[i] ?? list.find(Boolean) ?? null;
  }

  count(id) {
    return this.buffers.get(id)?.length ?? 0;
  }
}
