// Keeping progress on this device (spec save v2): the adapter between the app
// store and localStorage. Web only: restoreSaved() reads and saves nothing
// outside webPreview(). The store stays pure; Shell.jsx wires this in.
//
//   netgym.v2   one JSON blob: { version, gen, prefs, places, instances, done }
//   netgym.gen  the reset generation, a number in its own key
//
// A section's `redact` runs on every instance on every write, before it is
// serialised: what a learner might type as a password never reaches storage
// (the setup section's table). An instance it can't clean isn't written.
// netgym.v1 held typed passwords in plain text: a load removes it unread.
//
// `instances` holds each exercise's instance as the reducer holds it, with
// when it was last touched ({ at, state }); `at` counts changes, not time.
// `done` holds finished instances reduced to their ✓: [at, solved, assisted,
// view], the three as 0 or 1 (view: a section's own ✓, routing faults' view.earned).
// A Set (VLAN walks carry them in `result.evidence`) is written as { $set: [] }.
//
// Reading is defensive: a blob too long, unparseable, of another version or
// older than the reset generation counts as nothing saved, and inside a good
// blob each preference, place and instance that fails its check is dropped
// alone. Change VERSION (and KEY) whenever what's saved changes meaning.
//
// Writing is debounced, flushed when the page goes away, and capped: see
// fitted(). A write that fails keeps the older snapshot and ends saving for
// the session. Across tabs the last write wins, except that a reset is final:
// a tab loaded before it can no longer write, and its memory is cleared too.
import { initialInstance } from '../ui/exercise-state.js';
import { between, bool, count, isObject, nullable, oneOf, shape, text } from '../ui/saved-shape.js';
import { webPreview } from './platform.js';
import { decodeSection } from './url.js';
import { defaultPrefs, prefChoices } from './store.js';

export const KEY = 'netgym.v2';
export const GEN_KEY = 'netgym.gen';
export const VERSION = 2;
/** Older blobs, removed at every load: v1 could hold typed passwords. */
export const OLD_KEYS = Object.freeze(['netgym.v1']);
/** The size limits, in characters of the serialised JSON. */
export const CAP = 1000000;
export const MAX_READ = 2000000;
export const MAX_DONE = 5000;
export const DEBOUNCE_MS = 500;
const MAX_KEY = 512;

const NOTHING = Object.freeze({ prefs: {}, places: {}, instances: {}, touched: {}, gen: 0 });

/** localStorage, or null where even touching it throws. */
export function browserStorage() {
  try { return globalThis.localStorage ?? null; } catch { return null; }
}

const attempt = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const readGen = storage => {
  const value = attempt(() => storage?.getItem(GEN_KEY));
  return typeof value === 'string' && /^\d{1,15}$/.test(value) ? Number(value) : 0;
};

const writeSets = (_, value) => (value instanceof Set ? { $set: [...value] } : value);
const readSets = (_, value) => (isObject(value) && Array.isArray(value.$set) ? new Set(value.$set) : value);

// ── Reading ────────────────────────────────────────────────────────────────

const session = shape({
  status: oneOf('working', 'solved', 'revealed'), hintIndex: between(0, 3), revealed: bool, assisted: bool, attempts: count,
  earned: shape({ solved: bool, assisted: bool }, ['solved', 'assisted']),
}, ['status', 'hintIndex', 'revealed', 'assisted', 'attempts', 'earned']);

const anyResult = nullable(shape({ ok: bool }, ['ok']));
/** What every instance has (ui/exercise-state.js); the section's table checks the rest. */
const instanceShape = shape({
  session, answer: value => value === null || typeof value === 'object', result: anyResult, completion: oneOf(null),
  parts: isObject, presses: count, drafts: isObject, view: isObject,
  generation: count, edits: count, draftRev: count, routeSerial: count, taskId: text,
}, ['session', 'parts', 'presses', 'drafts', 'view']);

/** A key as the app builds it: its JSON identity, unchanged, or null. */
function identityOf(key) {
  if (key.length > MAX_KEY) return null;
  const identity = attempt(() => JSON.parse(key));
  return isObject(identity) && typeof identity.exerciseId === 'string' && JSON.stringify(identity) === key ? identity : null;
}

/** The target's section tables, by exercise id and by place scope. */
function tablesOf(target) {
  const exercises = new Map(), places = new Map();
  for (const section of target.sections) {
    for (const [id, rule] of Object.entries(section.saved?.exercises ?? {})) exercises.set(id, { ...rule, bank: section.bank });
    for (const [scope, check] of Object.entries(section.saved?.places ?? {})) places.set(scope, { check, bank: section.bank });
  }
  return { exercises, places };
}

/** The target's redaction: (key, instance) → what may be written of it. */
export function redactorOf(target) {
  const { exercises } = tablesOf(target);
  return (key, instance) => {
    const redact = exercises.get(attempt(() => JSON.parse(key))?.exerciseId)?.redact;
    return redact ? redact(instance) : instance;
  };
}

const passes = (check, value, ...rest) => (check ? attempt(() => check(value, ...rest) === true, false) : true);

function validInstance(rule, identity, instance) {
  return passes(instanceShape, instance) && passes(rule.identity, identity, rule.bank) && passes(rule.view, instance.view, identity)
    && passes(rule.answer, instance.answer ?? null) && passes(rule.result, instance.result ?? null)
    && passes(rule.drafts, instance.drafts) && passes(rule.parts, instance.parts);
}

/** A finished instance as its ✓ alone (at most 5,000 of these share the cap), and back. */
const doneEntry = (at, { session: { earned }, view }) => [at, Number(earned.solved), Number(earned.assisted), Number(view.earned === true)];
const flag = oneOf(0, 1);
const validDone = entry => Array.isArray(entry) && entry.length === 4 && count(entry[0]) && entry.slice(1).every(flag);
function doneInstance([, solved, assisted, viewEarned]) {
  const instance = initialInstance();
  const earned = { solved: solved === 1, assisted: assisted === 1 };
  return { ...instance, session: { ...instance.session, assisted: earned.assisted, earned }, view: viewEarned ? { earned: true } : {} };
}
const isFinished = instance => instance.session.earned.solved || instance.view.earned === true;

function restoreInstances(blob, exercises) {
  const instances = {}, touched = {};
  const entries = (source, keep) => {
    for (const [key, entry] of Object.entries(isObject(source) ? source : {})) {
      const identity = identityOf(key);
      const rule = identity && exercises.get(identity.exerciseId);
      if (rule && !Object.hasOwn(instances, key)) keep(key, entry, rule, identity);
    }
  };
  entries(blob.instances, (key, entry, rule, identity) => {
    if (!isObject(entry) || !count(entry.at) || !validInstance(rule, identity, entry.state)) return;
    instances[key] = { ...initialInstance(), ...entry.state };
    touched[key] = entry.at;
  });
  entries(blob.done, (key, entry, rule, identity) => {
    if (!validDone(entry) || !passes(rule.identity, identity, rule.bank)) return;
    instances[key] = doneInstance(entry);
    [touched[key]] = entry;
  });
  return { instances, touched };
}

function restorePrefs(saved) {
  if (!isObject(saved)) return {};
  return Object.fromEntries(Object.keys(defaultPrefs).filter(name => prefChoices[name].includes(saved[name])).map(name => [name, saved[name]]));
}

/**
 * Each place through its section's shape check, then through the same codec
 * and defaults as a URL: encoded and decoded again, so what the URL would
 * reject (a task gone from the bank, a seed the logic can't build) falls back
 * as a bad link does.
 */
function restorePlaces(target, saved, prefs, tables, random) {
  const places = {};
  for (const [scope, value] of Object.entries(isObject(saved) ? saved : {})) {
    const rule = tables.get(scope);
    if (rule && passes(rule.check, value, rule.bank)) places[scope] = value;
  }
  const syntax = prefs.syntax ?? defaultPrefs.syntax;
  for (const section of target.sections) {
    const codec = section.url;
    if (!codec?.scopes.some(scope => Object.hasOwn(places, scope))) continue;
    const pairs = attempt(() => codec.encode({ bank: section.bank, syntax, places }));
    if (!pairs) { for (const scope of codec.scopes) delete places[scope]; continue; }
    Object.assign(places, decodeSection(section, Object.fromEntries(pairs), { prefs: { syntax }, places }, random).places);
  }
  return places;
}

/** The storage's text → what can be restored: { prefs, places, instances, touched, gen }. */
export function readSaved(target, storage, random = Math.random) {
  const stored = readGen(storage);
  const nothing = { ...NOTHING, gen: stored };
  const raw = attempt(() => storage?.getItem(KEY));
  if (typeof raw !== 'string' || raw.length > MAX_READ) return nothing;
  const blob = attempt(() => JSON.parse(raw, readSets));
  if (!isObject(blob) || blob.version !== VERSION || !count(blob.gen) || blob.gen < stored) return nothing;
  const tables = tablesOf(target);
  const prefs = restorePrefs(blob.prefs);
  return { prefs, places: restorePlaces(target, blob.places, prefs, tables.places, random), ...restoreInstances(blob, tables.exercises), gen: blob.gen };
}

// ── Writing ────────────────────────────────────────────────────────────────

/** The length an entry adds to the blob (at least: a comma may come on top). */
const lengthOf = (key, value) => JSON.stringify(key).length + 1 + JSON.stringify(value, writeSets).length;

/**
 * The blob as text, within CAP and MAX_DONE, or null if even its places and
 * prefs won't fit. Over the cap, in this order: the least recently touched
 * unfinished instances go, all but the newest (the task in hand: with finished
 * tasks filling the cap it would otherwise go first, on every write); then
 * finished instances shrink to their ✓, oldest first; then the task in hand
 * goes; then the oldest ✓. The store keeps everything until the page closes;
 * this only decides what the next visit finds.
 */
export function fitted(state, touched, gen, redact = (_, instance) => instance) {
  const instances = {}, done = {};
  const at = key => touched[key] ?? 0;
  for (const [key, instance] of Object.entries(state.instances)) {
    const clean = attempt(() => redact(key, instance));
    if (clean) instances[key] = { at: at(key), state: clean };
  }
  const blob = { version: VERSION, gen, prefs: state.prefs, places: state.places, instances, done };
  const serialised = () => JSON.stringify(blob, writeSets);
  const whole = serialised();
  if (whole.length <= CAP) return whole;
  let over = whole.length - CAP;
  const drop = (entries, key) => { over -= lengthOf(key, entries[key]); delete entries[key]; };
  const oldestFirst = keys => [...keys].sort((a, b) => at(a) - at(b));
  const finished = key => isFinished(state.instances[key]);
  const keys = oldestFirst(Object.keys(instances));
  const unfinished = keys.filter(key => !finished(key));
  const inHand = unfinished.pop();
  for (const key of unfinished) if (over > 0) drop(instances, key);
  for (const key of keys.filter(finished)) {
    if (over <= 0) break;
    const compact = doneEntry(at(key), state.instances[key]);
    over += lengthOf(key, compact);
    drop(instances, key);
    done[key] = compact;
  }
  if (over > 0 && inHand !== undefined) drop(instances, inHand);
  const marks = oldestFirst(Object.keys(done));
  marks.forEach((key, i) => { if (over > 0 || marks.length - i > MAX_DONE) drop(done, key); });
  const text = serialised();
  return text.length <= CAP ? text : null;
}

const isBlank = state => !Object.keys(state.instances).length && !Object.keys(state.places).length
  && Object.keys(defaultPrefs).every(name => state.prefs[name] === defaultPrefs[name]);

/**
 * The saving side, for one page load.
 *   note(state)    a store change: remembers it and schedules a write
 *   flush()        writes what's pending, now
 *   clear(prefs)   «Почати спочатку»: cancels what's pending, starts a new
 *                  generation, removes the saved blob (the prefs stay)
 *   attach(getState, onReset)  listens to the page; onReset: another tab cleared
 * @param {Storage|null} storage
 * @param {{ gen?: number, touched?: object, redact?: Function }} from what readSaved found, and the target's redaction
 */
export function createSaver(storage, { gen: firstGen = 0, touched: firstTouched = {}, redact } = {}) {
  let gen = firstGen;
  let touched = { ...firstTouched };
  let clock = Math.max(0, ...Object.values(touched));
  let latest = null, dirty = false, timer = null;
  let stopped = !storage;
  let lastText = null;
  let reset = () => {};

  const cancel = () => { if (timer !== null) { clearTimeout(timer); timer = null; } dirty = false; };
  /** A newer generation: this tab's work belongs to before the reset. */
  function adopt(next) {
    cancel();
    gen = next;
    touched = {};
    clock = 0;
    latest = null;
    lastText = null;
    reset();
  }
  function write() {
    const state = latest;
    cancel();
    if (stopped || !state) return;
    const stored = readGen(storage);
    if (stored > gen) { adopt(stored); return; }
    if (isBlank(state)) {
      lastText = null;
      attempt(() => storage.removeItem(KEY));
      return;
    }
    const next = fitted(state, touched, gen, redact);
    if (next === null || next === lastText) return;
    try { storage.setItem(KEY, next); lastText = next; } catch { stopped = true; }
  }
  function note(state) {
    if (state === latest) return;
    if (latest) {
      for (const key of Object.keys(state.instances)) if (state.instances[key] !== latest.instances[key]) touched[key] = (clock += 1);
      dirty = true;
      if (timer !== null) clearTimeout(timer);
      if (!stopped) timer = setTimeout(write, DEBOUNCE_MS);
    }
    latest = state;
  }
  function flush() { if (dirty) write(); }
  function clear(prefs) {
    cancel();
    gen = Math.max(gen, readGen(storage)) + 1;
    touched = {};
    clock = 0;
    lastText = null;
    attempt(() => storage?.removeItem(KEY));
    attempt(() => storage?.setItem(GEN_KEY, String(gen)));
    latest = { prefs, instances: {}, places: {} };
    write();
  }
  function attach(getState, onReset) {
    reset = onReset;
    const now = () => { note(getState()); flush(); };
    const onVisibility = () => { if (document.visibilityState === 'hidden') now(); };
    const onStorage = event => {
      if (event.key !== GEN_KEY) return;
      const next = /^\d{1,15}$/.test(event.newValue ?? '') ? Number(event.newValue) : 0;
      if (next > gen) adopt(next);
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('pagehide', now);
    window.addEventListener('storage', onStorage);
    return () => {
      now();
      reset = () => {};
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('pagehide', now);
      window.removeEventListener('storage', onStorage);
    };
  }
  return { note, flush, clear, attach };
}

/** What a page load starts from: what's saved and its saver, or (not the web
 * version) nothing and no saver. Read before the first render (Shell.jsx). */
export function restoreSaved(target, { storage = browserStorage(), web = webPreview(), random = Math.random } = {}) {
  if (!web) return { ...NOTHING, saver: null };
  for (const key of OLD_KEYS) attempt(() => storage?.removeItem(key));
  const saved = readSaved(target, storage, random);
  return { ...saved, saver: createSaver(storage, { ...saved, redact: redactorOf(target) }) };
}
