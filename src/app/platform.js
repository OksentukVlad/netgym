// Where NetGym runs. The Windows app (Wails) and the web build share one
// frontend; only the web build (tools/build-web.sh, NETGYM_WEB=1) defines
// __NETGYM_WEB__ as true (shell/frontend/vite.config.js). tools/build.sh, the
// Wails path, never sets it, and a page with the Wails runtime counts as the
// app even if it were set. Read at render time, so tests can set the global.

/** The Wails v2 runtime's globals: ipc.js's WailsInvoke, runtime.js's `wails`. */
export function inWails(win = globalThis.window) {
  return !!win && (typeof win.WailsInvoke === 'function' || (typeof win.wails === 'object' && win.wails !== null));
}

/** True only in the web build, outside the Wails app. */
export function webPreview(win = globalThis.window) {
  const web = typeof __NETGYM_WEB__ !== 'undefined' && __NETGYM_WEB__ === true;
  return web && !inWails(win);
}
