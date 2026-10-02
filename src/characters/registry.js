/**
 * Where the game's views find the animated characters: `library` is the loaded
 * CharacterLibrary (null in tests, before it has loaded, or if loading failed); `camera` and
 * `frustum` are the view each frame (LOD and animation rates). Kept apart from
 * CharacterLibrary.js so the loaders stay in their own lazily loaded chunk.
 */
// sceneWalk: Game's per-frame scene matrix update is running (characters out of view skip their bones).
export const characters = { library: null, camera: null, frustum: null, frame: 0, shadowBudget: Infinity, casters: [], sceneWalk: false };

/**
 * Per frame, after every character's update: of those close enough to cast a shadow
 * (`casters`, filled by CharacterModel.update), only the nearest `shadowBudget` do. Each shadow
 * cascade draws every caster again; a dense crowd would otherwise cost more than the scene.
 */
export function assignCharacterShadows() {
  const list = characters.casters;
  const n = characters.shadowBudget;
  if (list.length > n) list.sort(byDistance);
  for (let i = 0; i < list.length; i++) list[i].setCastShadow(i < n);
  list.length = 0;
}
const byDistance = (a, b) => a.distance - b.distance;

