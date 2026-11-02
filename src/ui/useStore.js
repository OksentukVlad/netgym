// Access to the app store from screens and generic components. The context
// is defined here (ui) and provided by src/app/StoreProvider.jsx, so screens
// and ui never import app.
import { createContext, useContext, useEffect, useRef } from 'react';

/** @type {import('react').Context<{ state: object, dispatch: (action: object) => void } | null>} */
export const StoreContext = createContext(null);

export function useStore() {
  const store = useContext(StoreContext);
  if (!store) throw new Error('NetGym store missing: render the screen inside StoreProvider');
  return store;
}

/** An app-wide preference (syntax, theme, input mode) and its setter. */
export function usePref(name) {
  const { state, dispatch } = useStore();
  return [state.prefs[name], value => dispatch({ type: 'pref', name, value })];
}

/**
 * Where a screen was (task, router, level, seed…), kept in the store so it
 * survives leaving the section. `defaults` may be a function; it is called
 * once and its result stored, so random defaults (a first seed) stay put.
 */
export function usePlace(scope, defaults) {
  const { state, dispatch } = useStore();
  const stored = state.places[scope];
  const first = useRef(null);
  if (!stored && !first.current) first.current = typeof defaults === 'function' ? defaults() : defaults;
  useEffect(() => {
    if (!stored && first.current) dispatch({ type: 'place', scope, patch: first.current });
  }, [stored, scope]);
  const place = stored ?? first.current;
  return [place, patch => dispatch({ type: 'place', scope, patch: stored ? patch : { ...first.current, ...patch } })];
}
