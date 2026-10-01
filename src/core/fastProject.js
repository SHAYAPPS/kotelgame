// The renderer walks the whole scene graph on every pass (the world, each shadow cascade). An
// animated character is ~90 bones and a few meshes; with a hundred people that's thousands of
// bones per pass for nothing. An object with `userData.renderables` (CharacterModel's body) is
// drawn by visiting just those (its LOD meshes and attachments). Relies on the renderer's
// internal `_projectObject` (three r186).

export function flattenRenderables(renderer) {
  const base = renderer._projectObject;
  if (typeof base !== 'function' || renderer._flattened) return;
  renderer._flattened = true;
  renderer._projectObject = function (object, camera, groupOrder, renderList, clippingContext) {
    const flat = object.userData.renderables;
    if (flat !== undefined) {
      if (object.visible === false) return;
      for (let i = 0; i < flat.length; i++) base.call(this, flat[i], camera, groupOrder, renderList, clippingContext);
      return;
    }
    base.call(this, object, camera, groupOrder, renderList, clippingContext);
  };
}

/**
 * Shadow passes draw every caster with one shared material and copy each caster's
 * `alphaTest` into it; three's setter bumps the material's version whenever alpha testing
 * turns on or off, and a new version makes every caster's draw recompute its full shader
 * cache key, every frame (characters with alpha-tested hair alternate with everything else).
 * Each caster's draw already has the right shader for its own alpha test, so the shadow-pass
 * material just keeps the value. Relies on Material's `_alphaTest` (three r186).
 */
export function steadyShadowMaterials(Material) {
  const desc = Object.getOwnPropertyDescriptor(Material.prototype, 'alphaTest');
  if (!desc?.set || Material.prototype._steadyShadows) return;
  Material.prototype._steadyShadows = true;
  Object.defineProperty(Material.prototype, 'alphaTest', {
    configurable: true,
    get: desc.get,
    set(value) {
      if (this.isShadowPassMaterial === true) this._alphaTest = value;
      else desc.set.call(this, value);
    },
  });
}
