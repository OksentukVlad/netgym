// Provides the app store (store.js) to everything below it: the shell and
// its sections, or a single-section build's screen.
import { useMemo, useReducer } from 'react';
import { initialStore, storeReducer } from './store.js';
import { StoreContext } from '../ui/useStore.js';

/** @param {{ prefs?: object, places?: object, children: any }} props  `places`: a link's (Shell.jsx), read once */
export default function StoreProvider({ prefs, places, children }) {
  const [state, dispatch] = useReducer(storeReducer, null, () => initialStore(prefs, places));
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
