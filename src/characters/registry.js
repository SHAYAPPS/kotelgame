/**
 * Where the game's views find the animated characters: `library` is the loaded
 * CharacterLibrary (null in tests, before it has loaded, or if loading failed); `camera` and
 * `frustum` are the view each frame (LOD and animation rates). Kept apart from
 * CharacterLibrary.js so the loaders stay in their own lazily loaded chunk.
 */
export const characters = { library: null, camera: null, frustum: null, frame: 0 };
