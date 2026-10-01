// Dev tool: the recording booth (npm run dev, then http://localhost:5173/dev/booth.html).
// Every line of the mission (src/story/text.he.js), grouped; record a take from the
// microphone, listen back, redo or delete it. Takes are saved by the dev server (vite.config.js
// `/__voice`) as src/assets/voice/<lineId>.webm, where the game finds them (story/Voice.js):
// the line then plays the recording, from the speaker, with the mouth following it.
// Also the ambient slots: the crowd's prayer (loops, layered by story/AmbientAudio.js).
import { LINES, SPEAKERS } from '../src/story/text.he.js';

const SLOTS = {
  crowd_prayer_1: { speaker: 'תפילת הקהל', text: 'לולאה של 20 עד 60 שניות: קהל ממלמל סליחות ("אשמנו, בגדנו...", "ה׳ ה׳ א־ל רחום וחנון"). כמה אנשים יחד, לא קרוב למיקרופון.' },
  crowd_prayer_2: { speaker: 'תפילת הקהל', text: 'עוד שכבה: קולות אחרים, קצב אחר (הן מתנגנות יחד, בהיסט).' },
  crowd_prayer_3: { speaker: 'תפילת הקהל', text: 'שכבה שלישית (לא חובה): קהל עונה "אמן" ו"סלחנו" מדי פעם.' },
};

// Sections by id prefix, in the mission's order.
const SECTIONS = [
  ['חלק 1: הבידוק בכניסה', (id) => id.startsWith('cp_')],
  ['חלק 1: הסיור, הקשר, ההתכנסות', (id) => /^(patrol_|radio_|gather_)/.test(id)],
  ['אנשים: ברכות בדרך', (id) => /^(greet_|collector_)/.test(id)],
  ['אנשים: שיחות קצרות (E)', (id) => id.startsWith('ex_')],
  ['אנשים מיוחדים', (id) => id.startsWith('sp_')],
  ['חלקים 2–4: האזעקה, הקרבות, הסיום', () => true],
];

const list = document.getElementById('list');
const filter = document.getElementById('filter');
const only = document.getElementById('only');
const meterBar = document.querySelector('#meter > div');
const count = document.getElementById('count');
let files = {};
let rows = [];
let selected = 0;
let rec = null; // { id, recorder, chunks, stream, row }
let audioCtx = null;

const hebrew = (s) => /[֐-׿]/.test(s);

async function refresh() {
  files = await fetch('/__voice').then((r) => r.json()).catch(() => ({}));
  for (const r of rows) r.el.classList.toggle('recorded', !!files[r.id]);
  count.textContent = `הוקלטו ${Object.keys(files).filter((id) => LINES[id] || SLOTS[id]).length} מתוך ${rows.length}`;
  applyFilter();
}

function build() {
  const entries = [...Object.entries(SLOTS).map(([id, s]) => [id, { slot: true, ...s }]), ...Object.entries(LINES)];
  const groups = new Map([['קולות רקע (לולאות)', []], ...SECTIONS.map(([name]) => [name, []])]);
  for (const [id, line] of entries) {
    if (line.slot) groups.get('קולות רקע (לולאות)').push([id, line]);
    else groups.get(SECTIONS.find(([, test]) => test(id))[0]).push([id, line]);
  }
  list.replaceChildren();
  rows = [];
  for (const [name, items] of groups) {
    if (!items.length) continue;
    const h = document.createElement('h2');
    h.textContent = name;
    list.append(h);
    for (const [id, line] of items) {
      const el = document.createElement('div');
      el.className = 'row';
      const sp = line.slot ? { name: line.speaker } : SPEAKERS[line.speaker] ?? { name: line.speaker };
      const idEl = Object.assign(document.createElement('div'), { className: 'id', textContent: id });
      const spEl = Object.assign(document.createElement('div'), { className: 'speaker', textContent: sp.name + (line.radio || sp.radio ? ' (קשר)' : '') });
      if (sp.color) spEl.style.color = sp.color;
      const text = Object.assign(document.createElement('div'), { className: 'text', textContent: line.text });
      text.dir = hebrew(line.text) ? 'rtl' : 'ltr';
      const buttons = document.createElement('div');
      const row = { id, el, h, line };
      const b = (label, cls, fn) => {
        const btn = Object.assign(document.createElement('button'), { textContent: label, className: cls ?? '' });
        btn.onclick = (e) => {
          e.stopPropagation();
          select(rows.indexOf(row));
          fn();
        };
        buttons.append(btn);
        return btn;
      };
      row.recBtn = b('● הקלטה', 'rec', () => toggle(row));
      b('▶', null, () => play(row));
      b('✕', null, () => remove(row));
      el.append(idEl, spEl, text, buttons);
      el.onclick = () => select(rows.indexOf(row));
      list.append(el);
      rows.push(row);
    }
  }
}

function applyFilter() {
  const q = filter.value.trim().toLowerCase();
  const mode = only.value;
  for (const r of rows) {
    const sp = SPEAKERS[r.line.speaker]?.name ?? r.line.speaker ?? '';
    const match = !q || r.id.toLowerCase().includes(q) || sp.includes(q) || r.line.text.toLowerCase().includes(q);
    const done = !!files[r.id];
    r.el.hidden = !match || (mode === 'missing' && done) || (mode === 'done' && !done);
  }
}

function select(i) {
  if (i < 0 || i >= rows.length) return;
  rows[selected]?.el.style.removeProperty('outline');
  selected = i;
  rows[i].el.style.outline = '1px solid #c9b78a';
  rows[i].el.scrollIntoView({ block: 'nearest' });
}

async function toggle(row) {
  if (rec) return stop();
  const stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: false, noiseSuppression: true, autoGainControl: false } });
  const type = MediaRecorder.isTypeSupported('audio/webm;codecs=opus') ? 'audio/webm;codecs=opus' : 'audio/webm';
  const recorder = new MediaRecorder(stream, { mimeType: type, audioBitsPerSecond: 96000 });
  const chunks = [];
  recorder.ondataavailable = (e) => e.data.size && chunks.push(e.data);
  recorder.onstop = async () => {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunks, { type });
    await fetch(`/__voice?id=${encodeURIComponent(row.id)}`, { method: 'POST', body: blob });
    row.el.classList.remove('recording');
    row.recBtn.textContent = '● הקלטה';
    await refresh();
  };
  // A level meter while recording.
  audioCtx ??= new AudioContext();
  const src = audioCtx.createMediaStreamSource(stream);
  const an = audioCtx.createAnalyser();
  an.fftSize = 1024;
  src.connect(an);
  const buf = new Float32Array(an.fftSize);
  const tick = () => {
    if (!rec) return (meterBar.style.width = '0');
    an.getFloatTimeDomainData(buf);
    let peak = 0;
    for (const v of buf) peak = Math.max(peak, Math.abs(v));
    meterBar.style.width = `${Math.min(100, peak * 140)}%`;
    meterBar.style.background = peak > 0.95 ? '#ff6b5e' : '#6fcf7a';
    requestAnimationFrame(tick);
  };
  rec = { id: row.id, recorder, row };
  recorder.start();
  row.el.classList.add('recording');
  row.recBtn.textContent = '■ עצירה';
  tick();
}

function stop() {
  const r = rec;
  rec = null;
  r?.recorder.stop();
}

function play(row) {
  const f = files[row.id];
  if (!f) return;
  new Audio(`/src/assets/voice/${f}?t=${Date.now()}`).play();
}

async function remove(row) {
  if (!files[row.id] || !confirm(`למחוק את ההקלטה של ${row.id}?`)) return;
  await fetch(`/__voice?id=${encodeURIComponent(row.id)}`, { method: 'DELETE' });
  await refresh();
}

addEventListener('keydown', (e) => {
  if (e.target === filter) return;
  if (e.code === 'Space') {
    e.preventDefault();
    toggle(rows[selected]);
  } else if (e.code === 'ArrowDown' || e.code === 'ArrowUp') {
    e.preventDefault();
    let i = selected;
    do i += e.code === 'ArrowDown' ? 1 : -1;
    while (rows[i]?.el.hidden);
    select(i);
  } else if (e.code === 'Enter') play(rows[selected]);
});
filter.oninput = applyFilter;
only.onchange = applyFilter;

build();
select(0);
refresh();
