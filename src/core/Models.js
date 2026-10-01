// Shared loader for the game's GLB models (public/assets/...): meshopt geometry, KTX2 textures
// through the TextureLibrary's transcoder. Game sets `models.ktx2Loader`; each file loads once.
// Loaded lazily (dynamic imports), so tests and the first frame don't pay for it.

const cache = new Map();

export const models = {
  /** @type {import('three/addons/loaders/KTX2Loader.js').KTX2Loader | null} */
  ktx2Loader: null,
  _loader: null,

  /** Resolves to the parsed glTF ({ scene, ... }); the same promise for the same path. */
  load(path) {
    if (!cache.has(path)) cache.set(path, this._get().then((loader) => loader.loadAsync(`${import.meta.env?.BASE_URL ?? '/'}${path}`)));
    return cache.get(path);
  },

  async _get() {
    if (this._loader) return this._loader;
    const [{ GLTFLoader }, { MeshoptDecoder }] = await Promise.all([import('three/addons/loaders/GLTFLoader.js'), import('three/addons/libs/meshopt_decoder.module.js')]);
    await MeshoptDecoder.ready;
    this._loader = new GLTFLoader().setMeshoptDecoder(MeshoptDecoder);
    if (this.ktx2Loader) this._loader.setKTX2Loader(this.ktx2Loader);
    return this._loader;
  },
};
