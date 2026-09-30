// Recorded voice lines (optional). Put `<lineId>.ogg` / `.mp3` / `.wav` / `.m4a` files in
// src/assets/voice/ (e.g. brief_1.ogg for LINES.brief_1 in text.he.js): the build picks them up
// (Game.js), the line plays the recording from the speaker's position (radio lines through a
// radio filter), its subtitle stays up at least as long as the recording, and the speaker's
// mouth follows the recording's loudness instead of the text (LipSync.speakLevel).

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
    this.buffers = new Map(); // id -> AudioBuffer | Promise
  }

  has(id) {
    return !!this.files[id];
  }

  /** Decode every recording ahead of time (call once audio is unlocked). */
  preload() {
    for (const id of Object.keys(this.files)) this._load(id);
  }

  _load(id) {
    if (this.buffers.has(id) || !this.audio.ready) return this.buffers.get(id) ?? null;
    const p = fetch(this.files[id])
      .then((r) => r.arrayBuffer())
      .then((ab) => this.audio.ctx.decodeAudioData(ab))
      .then((buf) => {
        this.buffers.set(id, buf);
        return buf;
      })
      .catch((e) => {
        console.warn(`voice ${id}:`, e);
        this.buffers.set(id, null);
        return null;
      });
    this.buffers.set(id, p);
    return p;
  }

  /**
   * Play line `id` (if it has a recording and it is decoded) from `position` (world; null =
   * not positional, e.g. radio).
   * @returns {{ duration: number, level: () => number, stop: () => void } | null}
   */
  play(id, position = null, { radio = false } = {}) {
    if (!this.has(id) || !this.audio.ready) return null;
    const buf = this.buffers.get(id);
    if (!(buf instanceof AudioBuffer)) {
      this._load(id);
      return null; // not ready yet: this time the mouth follows the text
    }
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
      gain.connect(panner).connect(a.master);
      const send = ctx.createGain();
      send.gain.value = 0.18;
      gain.connect(send).connect(a.echoBus ?? a.master);
    } else gain.connect(a.master);
    src.start();
    const data = new Float32Array(analyser.fftSize);
    let playing = true;
    src.onended = () => {
      playing = false;
    };
    return {
      duration: buf.duration,
      level: () => {
        if (!playing) return 0;
        analyser.getFloatTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) sum += data[i] * data[i];
        return Math.sqrt(sum / data.length);
      },
      stop: () => {
        if (playing) src.stop();
        playing = false;
      },
    };
  }
}
