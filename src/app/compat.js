// Older browsers (the web version on Pages): small polyfills for the newer
// built-in methods the app uses, so a browser that lacks them still runs it.
// Vlad found firewall, VLAN and setup blank on a Chrome older than 92
// («p.at is not a function»). Syntax is lowered by the build target
// (shell/frontend/vite.config.js); these are the runtime methods it can't
// lower. Each one is installed only when missing, non-enumerable, as the
// built-in would be. tests/compat.test.mjs keeps the list and the source in
// step: a newer method the list doesn't cover fails the test.

const define = (object, name, value) => {
  if (typeof object[name] === 'function') return;
  Object.defineProperty(object, name, { value, writable: true, configurable: true, enumerable: false });
};

// Chrome 92: Array/String/TypedArray .at()
function at(index) {
  const length = this.length >>> 0;
  let i = Math.trunc(Number(index)) || 0;
  if (i < 0) i += length;
  return i < 0 || i >= length ? undefined : this[i];
}
define(Array.prototype, 'at', at);
define(String.prototype, 'at', function stringAt(index) { return at.call(String(this), index); });
if (typeof Int8Array !== 'undefined') define(Object.getPrototypeOf(Int8Array.prototype), 'at', at);

// Chrome 93: Object.hasOwn
define(Object, 'hasOwn', (object, key) => Object.prototype.hasOwnProperty.call(Object(object), key));

// Chrome 97: Array .findLast() and .findLastIndex()
define(Array.prototype, 'findLastIndex', function findLastIndex(predicate, thisArg) {
  for (let i = (this.length >>> 0) - 1; i >= 0; i -= 1) if (predicate.call(thisArg, this[i], i, this)) return i;
  return -1;
});
define(Array.prototype, 'findLast', function findLast(predicate, thisArg) {
  for (let i = (this.length >>> 0) - 1; i >= 0; i -= 1) if (predicate.call(thisArg, this[i], i, this)) return this[i];
  return undefined;
});

// Chrome 85: String .replaceAll() with a string pattern (the app never
// passes a regular expression; a global one is handed to .replace).
define(String.prototype, 'replaceAll', function replaceAll(pattern, replacement) {
  const text = String(this);
  if (pattern instanceof RegExp) return text.replace(pattern, replacement);
  const search = String(pattern);
  if (typeof replacement !== 'function') return text.split(search).join(String(replacement));
  const parts = text.split(search);
  let out = parts[0], at = parts[0].length;
  for (let k = 1; k < parts.length; k += 1) {
    out += String(replacement(search, at, text)) + parts[k];
    at += search.length + parts[k].length;
  }
  return out;
});

// Chrome 98: structuredClone, for the plain data the app clones (objects,
// arrays, primitives, Date, Map, Set). Cycles are kept.
function cloneValue(value, seen) {
  if (value === null || typeof value !== 'object') return value;
  if (seen.has(value)) return seen.get(value);
  if (value instanceof Date) return new Date(value.getTime());
  if (value instanceof Map) {
    const copy = new Map(); seen.set(value, copy);
    value.forEach((v, k) => copy.set(cloneValue(k, seen), cloneValue(v, seen)));
    return copy;
  }
  if (value instanceof Set) {
    const copy = new Set(); seen.set(value, copy);
    value.forEach(v => copy.add(cloneValue(v, seen)));
    return copy;
  }
  const copy = Array.isArray(value) ? [] : {};
  seen.set(value, copy);
  for (const key of Object.keys(value)) copy[key] = cloneValue(value[key], seen);
  return copy;
}
if (typeof globalThis.structuredClone !== 'function') {
  define(globalThis, 'structuredClone', value => cloneValue(value, new Map()));
}
