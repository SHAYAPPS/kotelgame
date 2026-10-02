// Recorded voice lines (optional). Put `<lineId>.ogg` / `.mp3` / `.wav` / `.m4a` / `.webm` files
// in src/assets/voice/ (e.g. brief_1.ogg for LINES.brief_1 in text.he.js): the build picks them
// up (Game.js), the line plays the recording from the speaker's position (radio lines through a
// radio filter), its subtitle stays up at least as long as the recording, and the speaker's
// mouth follows the recording's loudness instead of the text (LipSync.speakLevel).
//
// Memory: every recording is fetched up front, compressed (a few MB), but decoded only when
// it's needed, into a cache of about CACHE_SECONDS of audio (the least recently used dropped
// first): the whole mission's lines decoded would take ~170 MB. `warm(id)` decodes ahead (the
// story warms each line as it's queued); `play()` of a line that isn't decoded yet starts it as
// soon as it is (a few tens of ms) and reports its length through `onReady`.

const CACHE_SECONDS = 90;

/** `import.meta.glob` result -> { lineId: url } */
export function voiceFiles(glob) {
  const out = {};
  for (const [path, url] of Object.entries(glob ?? {})) {
    const id = path.split('/').pop().replace(/\.[^.]+$/, '');
    out[id] = url;
  }
  return out;
}

export class VoicePlayer {
  /**
   * @param {import('../weapons/WeaponAudio.js').WeaponAudio} audio shared context / master / echo
   * @param {Record<string, string>} files lineId -> url
   */
  constructor(audio, files = {}) {
    this.audio = audio;
    this.files = files;
    this.bytes = new Map(); // id -> ArrayBuffer (compressed) | Promise | null (failed)
    this.buffers = new Map(); // id -> AudioBuffer, least recently used first
    this.decoding = new Map(); // id -> Promise<AudioBuffer | null>
    this.pinned = new Set(); // never dropped (the crowd's prayer loops)
    this.playing = new Map(); // id -> plays in progress (never dropped while playing)
  }

  has(id) {
    return !!this.files[id];
  }

  /** Fetch every recording (compressed; decoded on demand). */
  preload() {
    for (const id of Object.keys(this.files)) this._fetch(id);
  }

  /** Decode `id` ahead of its line. */
  warm(id) {
    if (this.has(id)) this._load(id);
  }

  _fetch(id) {
    if (!this.bytes.has(id)) {
      const p = fetch(this.files[id])
        .then((r) => r.arrayBuffer())
        .then((ab) => {
          this.bytes.set(id, ab);
          return ab;
        })
        .catch((e) => {
          console.warn(`voice ${id}:`, e);
          this.bytes.set(id, null);
          return null;
        });
      this.bytes.set(id, p);
    }
    return this.bytes.get(id);
  }

  /**
   * The decoded recording (`pin`: keep it decoded for good).
   * @returns {Promise<AudioBuffer | null>}
   */
  _load(id, pin = false) {
    if (pin) this.pinned.add(id);
    const buf = this.buffers.get(id);
    if (buf) {
      // Most recently used goes last.
      this.buffers.delete(id);
      this.buffers.set(id, buf);
      return Promise.resolve(buf);
    }
    if (!this.has(id) || !this.audio.ready) return Promise.resolve(null);
    let p = this.decoding.get(id);
    if (p) return p;
    p = Promise.resolve(this._fetch(id))
      // decodeAudioData takes the bytes over: decode a copy, keep the original for later.
      .then((ab) => (ab ? this.audio.ctx.decodeAudioData(ab.slice(0)) : null))
      .then((b) => {
        this.decoding.delete(id);
        if (b) {
          this.buffers.set(id, b);
          this._trim();
        }
        return b;
      })
      .catch((e) => {
        console.warn(`voice ${id}:`, e);
        this.decoding.delete(id);
        return null;
      });
    this.decoding.set(id, p);
    return p;
  }

  /** Drop the least recently used recordings beyond the cache's length. */
  _trim() {
    let total = 0;
    for (const b of this.buffers.values()) total += b.duration;
    for (const [id, b] of this.buffers) {
      if (total <= CACHE_SECONDS) break;
      if (this.pinned.has(id) || this.playing.get(id)) continue;
      this.buffers.delete(id);
      total -= b.duration;
    }
  }

  /**
   * Play line `id` (if it has a recording) from `position` (world; null = not positional, e.g.
   * radio). A recording not decoded yet starts as soon as it is: `ready` is false until then,
   * and `onReady(duration)` is called when it starts.
   * @returns {{ duration: number, ready: boolean, onReady: ((duration: number) => void) | null, level: () => number, stop: () => void } | null}
   */
  play(id, position = null, { radio = false } = {}) {
    if (!this.has(id) || !this.audio.ready) return null;
    let level = null;
    let stop = null;
    const handle = {
      duration: 0,
      ready: false,
      onReady: null,
      cancelled: false,
      level: () => (level ? level() : 0),
      stop: () => {
        handle.cancelled = true;
        stop?.();
      },
    };
    const start = (buf) => {
      const a = this.audio;
      const ctx = a.ctx;
      const src = ctx.createBufferSource();
      src.buffer = buf;
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 512;
      src.connect(analyser);
      let out = src;
      if (radio) {
        const band = ctx.createBiquadFilter();
        band.type = 'bandpass';
        band.frequency.value = 1400;
        band.Q.value = 0.9;
        out = out.connect(band);
      }
      const gain = ctx.createGain();
      gain.gain.value = radio ? 0.8 : 1.1;
      out.connect(gain);
      if (position && !radio) {
        const panner = a._panner(position, 3);
        gain.connect(panner).connect(a.voiceBus);
        const send = ctx.createGain();
        send.gain.value = 0.18;
        gain.connect(send).connect(a.echoBus);
      } else gain.connect(a.voiceBus);
      src.start();
      this.playing.set(id, (this.playing.get(id) ?? 0) + 1);
      const data = new Float32Array(analyser.fftSize);
      let playing = true;
      src.onended = () => {
        playing = false;
        this.playing.set(id, Math.max(0, (this.playing.get(id) ?? 1) - 1));
      };
      level = () => {
        if (!playing) return 0;
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        return Math.sqrt(sum / data.length);
      };
      stop = () => {
        if (playing) src.stop();
        playing = false;
      };
      handle.duration = buf.duration;
      handle.ready = true;
    };
    const buf = this.buffers.get(id);
    if (buf) {
      this._load(id); // most recently used
      start(buf);
      return handle;
    }
    this._load(id).then((b) => {
      if (!b || handle.cancelled) return;
      start(b);
      handle.onReady?.(b.duration);
    });
    return handle;
  }
}
