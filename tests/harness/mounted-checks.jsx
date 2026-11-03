// Bundled by tools/test.sh into .test-bundles/harness/mounted-checks.mjs.
// Mounts the real «Перевірка мережі» screen in the app store with
// react-dom/client inside act(), so effects and events run. The scenarios
// (tests/helpers/mounted-checks.mjs) read the store and use the logic only to
// know a task's facts. Import it only after tests/helpers/mini-dom.mjs has
// installed its DOM, in its own process.
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import { NavContext } from '../../src/ui/useNav.js';
import ChecksScreen from '../../src/sections/checks/screens/ChecksScreen.jsx';
import DhcpScreen from '../../src/sections/dhcp/screens/DhcpScreen.jsx';
import * as proofs from '../../src/sections/checks/logic/proofs.js';
import * as ladder from '../../src/sections/checks/logic/ladder.js';
import * as claims from '../../src/sections/checks/logic/claims.js';
import * as words from '../../src/sections/checks/uk.js';
import { url } from '../../src/sections/checks/screens/url.js';

export { act, proofs, ladder, claims, words, url };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

/** The section in the app store; `store` always holds the latest { state, dispatch }. `route`: a link's route. */
export function mountChecks({ route = null } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {};
  act(() => root.render(<StoreProvider><Expose into={store} /><ChecksScreen route={route} /></StoreProvider>));
  return { store, container, unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); } };
}

/** DHCP's screen inside a navigation that records where its links go (`went`). */
export function mountDhcpWithNav() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {}, went = [];
  const nav = { go: route => went.push(route), has: id => id === 'checks' };
  act(() => root.render(<StoreProvider><NavContext.Provider value={nav}><Expose into={store} /><DhcpScreen /></NavContext.Provider></StoreProvider>));
  return { store, container, went, unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); } };
}
