// The app store (ARCHITECTURE §6 "State"): one reducer for the whole app,
// provided by StoreProvider.jsx through React context. Pure: no React, DOM or
// storage, tested in Node like nav.js. It lives above the shell, so it
// survives leaving a section and coming back (within the session).
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

/** @param {Partial<typeof defaultPrefs>} [prefs] */
export function initialStore(prefs = {}) {
  return { prefs: { ...defaultPrefs, ...prefs }, instances: {}, places: {} };
}

/**
 * Actions:
 *   { type: 'pref', name, value }
 *   { type: 'instance', key, action }       an exercise-state action for one instance
 *   { type: 'instances', keys, action }     the same action for several (the score's «↺»)
 *   { type: 'place', scope, patch }         shallow merge into places[scope]
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
    default:
      throw new Error(`unknown store action: ${action.type}`);
  }
}
