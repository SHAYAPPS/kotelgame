// What kind of device the game runs on.

/**
 * A touch-first device (a phone or tablet with no mouse): the game plays with on-screen
 * controls (ui/TouchControls.js). `?touch` / `?notouch` in the address force it either way.
 * A laptop with a touchscreen and a trackpad keeps the mouse and keyboard.
 */
export function isTouchDevice(search = globalThis.location?.search ?? '', matchMedia = globalThis.matchMedia) {
  const p = new URLSearchParams(search);
  if (p.has('touch')) return true;
  if (p.has('notouch')) return false;
  if (typeof matchMedia !== 'function') return false;
  return matchMedia('(pointer: coarse)').matches && !matchMedia('(any-pointer: fine)').matches;
}

/**
 * Fullscreen, turned to landscape, where the browser allows it (Android; an iPad). Must run in a
 * user gesture (a tap); quietly does nothing where it can't (an iPhone: "Add to Home Screen"
 * gives the game the whole screen instead, see public/manifest.webmanifest).
 */
export function enterFullscreen() {
  const doc = globalThis.document;
  if (!doc || doc.fullscreenElement || doc.webkitFullscreenElement) return;
  const el = doc.documentElement;
  const request = el.requestFullscreen ?? el.webkitRequestFullscreen;
  if (!request) return;
  try {
    const done = request.call(el, { navigationUI: 'hide' });
    Promise.resolve(done)
      .then(() => globalThis.screen?.orientation?.lock?.('landscape'))
      .catch(() => {});
  } catch {
    // not allowed here: the page as it is
  }
}
