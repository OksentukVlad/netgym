// Where you are, in the URL (round 6, spec URL v2.1): a hash route, so it works
// on GitHub Pages under any subpath and in the Windows app without server rules.
//
//   #/<section>[/main]?<key>=<value>&…
//
// The section is a nav route (screen `main`, no params); the keys are the
// section codec's (its `url`, from the target manifest: src/sections/<id>/
// screens/url.js) plus `syntax` for sections with a vendor switch. Only the
// current task's identity goes in: never answers, drafts, checks, hints,
// marks, theme, mode or input mode.
//
// Decoding is pure and bounded: the hash is at most MAX_HASH characters (a
// longer one is ignored: the start screen), at most MAX_PARAMS parameters are
// read, the first of duplicate keys wins, a parameter with malformed
// percent-encoding, an odd key or an overlong value is dropped, and each codec
// validates its own values (strict bounded integers, known ids, seeds the
// logic can build). An unknown section or screen is the start screen. Nothing
// here reads the page; Shell.jsx passes location.hash in.
import { toRoute } from './nav.js';

export const MAX_HASH = 512;
export const MAX_PARAMS = 12;
export const MAX_VALUE = 64;
export const SYNTAXES = Object.freeze(['cisco', 'routeros']);
/** The start screen's hash. An empty hash (or a bare «#») means it too. */
export const HOME_HASH = '#/';

/** True for the hashes that mean the start screen as written: '', '#', '#/'. */
export const isHomeHash = hash => hash === '' || hash === '#' || hash === HOME_HASH;

/**
 * A hash → { section, screen, params } or null (the start screen: empty,
 * overlong, or not a section route). `params` has no prototype; values are
 * decoded, non-empty strings of at most MAX_VALUE characters.
 */
export function parseHash(hash) {
  if (typeof hash !== 'string' || hash.length > MAX_HASH) return null;
  const text = hash.startsWith('#') ? hash.slice(1) : hash;
  const q = text.indexOf('?');
  const path = q < 0 ? text : text.slice(0, q);
  const match = /^\/([a-z0-9-]{1,32})(?:\/main)?\/?$/.exec(path);
  if (!match) return null;
  const params = Object.create(null);
  const parts = q < 0 || q === text.length - 1 ? [] : text.slice(q + 1).split('&').slice(0, MAX_PARAMS);
  for (const part of parts) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    let key, value;
    try {
      key = decodeURIComponent(part.slice(0, eq));
      value = decodeURIComponent(part.slice(eq + 1));
    } catch { continue; }
    if (!/^[a-z]{1,16}$/.test(key) || value === '' || value.length > MAX_VALUE) continue;
    if (!(key in params)) params[key] = value;
  }
  return { section: match[1], screen: 'main', params };
}

/** `#/<section>?k=v&…` from [key, value] pairs (values percent-encoded). */
export function formatHash(section, list = []) {
  const query = list.map(([k, v]) => `${k}=${encodeURIComponent(v)}`).join('&');
  return `#/${section}${query ? `?${query}` : ''}`;
}

const syntaxOf = value => (SYNTAXES.includes(value) ? value : 'cisco');

/**
 * One section's params → { places, prefs }: the codec's complete places for
 * the scopes it owns (over `state.places`, the remembered ones), and `syntax`
 * when the section has a vendor switch and the URL names a known vendor (a
 * link's vendor becomes the session's; otherwise the learner's own stays).
 * @param {{ url?: object, bank?: object }} section
 */
export function decodeSection(section, params, state, random = Math.random) {
  const codec = section.url;
  if (!codec) return { places: {}, prefs: {} };
  const own = Object.create(null);
  for (const key of codec.keys) if (key in params) own[key] = params[key];
  const prefs = codec.syntax && SYNTAXES.includes(params.syntax) ? { syntax: params.syntax } : {};
  const syntax = syntaxOf(prefs.syntax ?? state.prefs.syntax);
  let places = {};
  // A codec that fails leaves the remembered places (or the screen's defaults) in charge.
  try { places = codec.decode(own, { bank: section.bank, syntax, places: state.places, random }); } catch { places = {}; }
  return { places, prefs };
}

/**
 * A hash → { route, places, prefs }: the nav route (null for the start
 * screen), the section's places and its prefs patch, to dispatch before the
 * screen mounts.
 * @param {{ sections: object[] }} target
 */
export function decodeLocation(target, hash, state, random = Math.random) {
  const parsed = parseHash(hash);
  const section = parsed && target.sections.find(s => s.id === parsed.section);
  if (!section) return { route: null, places: {}, prefs: {} };
  return { route: toRoute({ section: section.id, screen: parsed.screen }), ...decodeSection(section, parsed.params, state, random) };
}

/** The canonical hash for a route and the store: the start screen's, or the
 * section's codec keys (only its own) and then `syntax` where it has one. */
export function encodeLocation(target, route, state) {
  const section = route && route.section !== null ? target.sections.find(s => s.id === route.section) : null;
  if (!section) return HOME_HASH;
  const codec = section.url;
  if (!codec) return formatHash(section.id);
  const syntax = syntaxOf(state.prefs.syntax);
  let list = [];
  // A codec that fails writes the section alone (its place stays in memory).
  try { list = codec.encode({ bank: section.bank, syntax, places: state.places }).filter(([k]) => codec.keys.includes(k)); } catch { list = []; }
  if (codec.syntax) list.push(['syntax', syntax]);
  return formatHash(section.id, list);
}
