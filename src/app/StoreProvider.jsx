// Provides the app store (store.js) to everything below it: the shell and
// its sections, or a single-section build's screen.
import { useMemo, useReducer } from 'react';
import { initialStore, storeReducer } from './store.js';
import { StoreContext } from '../ui/useStore.js';

/** @param {{ prefs?: object, places?: object, instances?: object, children: any }} props  `places` and `instances`: what was saved and a link's (Shell.jsx), read once */
export default function StoreProvider({ prefs, places, instances, children }) {
  const [state, dispatch] = useReducer(storeReducer, null, () => initialStore(prefs, places, instances));
  const value = useMemo(() => ({ state, dispatch }), [state]);
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>;
}
