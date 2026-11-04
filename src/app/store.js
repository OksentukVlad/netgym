// The app store (ARCHITECTURE §6 "State"): one reducer for the whole app,
// provided by StoreProvider.jsx through React context. Pure: no React, DOM or
// storage, tested in Node like nav.js. It lives above the shell, so it
// survives leaving a section and coming back. The web version also keeps it
// on the device between visits (saved.js, wired in by Shell.jsx).
//
// State = {
//   prefs:     { syntax: 'cisco'|'routeros', theme: 'dark'|'light', inputMode: 'type'|'choose',
//                mode: 'guided'|'free' },             // routing: «З підказками» / «Самостійно»
//   instances: { [instanceKey]: Instance },   // src/ui/exercise-state.js
//   places:    { [scope]: object },           // where a screen was: task, router, level, seed…
// }
//
// Instance keys come from the exercise's identity (bank, revision, task,
// variant, generator version, seed), never from the syntax, so switching
// syntax keeps the same answers, results and marks.
import { initialInstance, instanceReducer } from '../ui/exercise-state.js';

export const defaultPrefs = Object.freeze({ syntax: 'cisco', theme: 'dark', inputMode: 'type', mode: 'guided' });
/** The values each preference can hold (saved.js checks a restored one against them). */
export const prefChoices = Object.freeze({ syntax: ['cisco', 'routeros'], theme: ['dark', 'light'], inputMode: ['type', 'choose'], mode: ['guided', 'free'] });

/** @param {Partial<typeof defaultPrefs>} [prefs] @param {object} [places] the places saved or set by a link (Shell.jsx, before the first render) @param {object} [instances] the instances saved */
export function initialStore(prefs = {}, places = {}, instances = {}) {
  return { prefs: { ...defaultPrefs, ...prefs }, instances: { ...instances }, places: { ...places } };
}

/**
 * Actions:
 *   { type: 'pref', name, value }
 *   { type: 'instance', key, action }       an exercise-state action for one instance
 *   { type: 'instances', keys, action }     the same action for several (the score's «↺»)
 *   { type: 'place', scope, patch }         shallow merge into places[scope]
 *   { type: 'hydrate', places, prefs }      a URL's location (Shell.jsx, app/url.js): each
 *                                           scope in `places` replaced by its complete place,
 *                                           `prefs` (known names only) set; instances kept
 *   { type: 'clear' }                       «Почати спочатку»: instances and places go, prefs stay
 */
export function storeReducer(state, action) {
  switch (action.type) {
    case 'pref':
      if (!(action.name in defaultPrefs)) throw new RangeError(`unknown preference: ${action.name}`);
      return state.prefs[action.name] === action.value ? state : { ...state, prefs: { ...state.prefs, [action.name]: action.value } };
    case 'instance': {
      const current = state.instances[action.key] ?? initialInstance();
      const next = instanceReducer(current, action.action);
      return next === state.instances[action.key] ? state : { ...state, instances: { ...state.instances, [action.key]: next } };
    }
    case 'instances': {
      let instances = state.instances;
      for (const key of action.keys) {
        if (!instances[key]) continue;
        const next = instanceReducer(instances[key], action.action);
        if (next !== instances[key]) instances = { ...instances, [key]: next };
      }
      return instances === state.instances ? state : { ...state, instances };
    }
    case 'place':
      return { ...state, places: { ...state.places, [action.scope]: { ...state.places[action.scope], ...action.patch } } };
    case 'hydrate': {
      const prefs = Object.entries(action.prefs ?? {}).filter(([name]) => name in defaultPrefs);
      const places = Object.keys(action.places ?? {});
      if (!prefs.length && !places.length) return state;
      return {
        ...state,
        prefs: prefs.length ? { ...state.prefs, ...Object.fromEntries(prefs) } : state.prefs,
        places: places.length ? { ...state.places, ...action.places } : state.places,
      };
    }
    case 'clear':
      return Object.keys(state.instances).length || Object.keys(state.places).length ? { ...state, instances: {}, places: {} } : state;
    default:
      throw new Error(`unknown store action: ${action.type}`);
  }
}
