// Mouth movement from dialogue text / loudness (src/characters/LipSync.js).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LipSync, speechSchedule } from '../src/characters/LipSync.js';

function seeded(seed) {
  let s = seed >>> 0;
  return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296);
}

test('a line becomes syllables with pauses at punctuation', () => {
  const rand = seeded(1);
  const short = speechSchedule('ברור, המפקד.', rand);
  const long = speechSchedule('אנחנו משמרת סיור. עוברים בבידוק, ברחבה, בקיר ובטרסות העליונות. שגרה.', rand);
  assert.ok(short.events.length >= 3 && short.events.length <= 8, `short: ${short.events.length}`);
  assert.ok(long.events.length > short.events.length * 3);
  for (const e of long.events) {
    assert.ok(e.dur > 0.08 && e.dur < 0.35);
    assert.ok(e.amp > 0.3 && e.amp <= 1);
  }
  // Events don't overlap and there is a longer gap after a comma than between syllables.
  let maxGap = 0;
  for (let i = 1; i < long.events.length; i++) {
    const gap = long.events[i].t - (long.events[i - 1].t + long.events[i - 1].dur);
    assert.ok(gap >= -1e-9);
    maxGap = Math.max(maxGap, gap);
  }
  assert.ok(maxGap > 0.12, `pauses: ${maxGap}`);
});

test('the mouth opens and closes with the rhythm, then stays shut', () => {
  const lip = new LipSync(seeded(2));
  lip.speak('בוקר טוב. יום שישי רגיל: הרבה מתפללים, קבוצות תיירים, קצת עומס.', 6);
  let open = 0;
  let closed = 0;
  let max = 0;
  let prev = 0;
  let dir = 0;
  let turns = 0;
  for (let t = 0; t < 8; t += 1 / 60) {
    const v = lip.update(1 / 60);
    assert.ok(v >= 0 && v <= 1);
    if (v > 0.3) open++;
    if (v < 0.08) closed++;
    const d = Math.sign(v - prev);
    if (d && dir && d !== dir) turns++;
    if (d) dir = d;
    prev = v;
    max = Math.max(max, v);
  }
  assert.ok(max > 0.5, `max ${max}`);
  assert.ok(open > 30 && closed > 30, `open ${open} closed ${closed}`);
  assert.ok(turns > 20, `moves: ${turns}`); // not held open
  assert.ok(!lip.speaking);
  assert.ok(lip.update(0.1) < 0.01, 'shut after the line');
});

test('a long line speeds up to fit its time on screen', () => {
  const lip = new LipSync(seeded(3));
  const text = 'אז בוא נסיים אותה בזמן. הנשק מאובטח ומונמך כל המשמרת, ברור? ' .repeat(3);
  lip.speak(text, 3);
  assert.ok(lip.length <= 3 * 0.92 + 1e-6, `length ${lip.length}`);
});

test('with a recording the mouth follows its loudness', () => {
  const lip = new LipSync(seeded(4));
  let level = 0;
  lip.speakLevel(() => level);
  for (let i = 0; i < 30; i++) lip.update(1 / 60);
  assert.ok(lip.open < 0.01, 'silence: closed');
  level = 0.12;
  for (let i = 0; i < 30; i++) lip.update(1 / 60);
  assert.ok(lip.open > 0.5, `loud: ${lip.open}`);
  level = 0;
  for (let i = 0; i < 30; i++) lip.update(1 / 60);
  assert.ok(lip.open < 0.05);
  lip.stop();
  assert.ok(!lip.speaking);
});
