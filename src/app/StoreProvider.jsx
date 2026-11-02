// Provides the app store (store.js) to everything below it: the shell and
// its sections, or a single-section build's screen.
import { useMemo, useReducer } from 'react';
import { initialStore, storeReducer } from './store.js';
import { StoreContext } from '../ui/useStore.js';

/** @param {{ prefs?: object, children: any }} props */
export default function StoreProvider({ prefs, children }) {
  const [state, dispatch] = useReducer(storeReducer, prefs, initialStore);
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
