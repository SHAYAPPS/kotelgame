// The saved game: the last checkpoint reached, so Continue (main menu) picks up there after
// the game was closed. Kept in localStorage; written by Game at every checkpoint, cleared when
// the mission is completed or a new game starts over it. Pure: the storage is passed in.

export const SAVE_KEY = 'kotelgame.save';
const VERSION = 1;

/**
 * @typedef {{ mission: string, step: string, stats: { time: number, shots: number, hits: number,
 *   kills: number, headshots: number }, difficulty: string, savedAt: number }} Save
 */

/** @returns {Save | null} */
export function readSave(storage) {
  try {
    const s = JSON.parse(storage?.getItem(SAVE_KEY) ?? 'null');
    if (!s || s.version !== VERSION || typeof s.mission !== 'string' || typeof s.step !== 'string') return null;
    const stats = {};
    for (const k of ['time', 'shots', 'hits', 'kills', 'headshots']) stats[k] = Number.isFinite(s.stats?.[k]) ? Math.max(0, s.stats[k]) : 0;
    return { mission: s.mission, step: s.step, stats, difficulty: typeof s.difficulty === 'string' ? s.difficulty : 'normal', savedAt: Number(s.savedAt) || 0 };
  } catch {
    return null;
  }
}

/** @param {Omit<Save, 'savedAt'>} save */
export function writeSave(save, storage, now = Date.now()) {
  try {
    storage?.setItem(SAVE_KEY, JSON.stringify({ version: VERSION, ...save, savedAt: now }));
  } catch {
    // storage full or blocked: Continue just won't be there next time
  }
}

export function clearSave(storage) {
  try {
    storage?.removeItem(SAVE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Where a saved step falls among the mission's chapters (the start screen's list): the last
 * chapter starting at or before it, for the Continue button's label.
 * @param {{ steps: { id: string }[], chapters?: { label: string, step: string }[] }} script
 */
export function chapterOf(script, stepId) {
  const index = script.steps.findIndex((s) => s.id === stepId);
  if (index < 0) return null;
  let best = null;
  for (const c of script.chapters ?? []) {
    const at = script.steps.findIndex((s) => s.id === c.step);
    if (at >= 0 && at <= index && (!best || at >= best.at)) best = { ...c, at };
  }
  return best;
}
