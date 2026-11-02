// Bundled by tools/test.sh into .test-bundles/harness/mounted.mjs. Mounts
// the real routing screen (in the app store, as the targets do) with
// react-dom/client inside act(), so effects, timers and events run. Import
// it only after tests/helpers/mini-dom.mjs has installed its DOM, in its own
// process (tests/helpers/mounted-routing.mjs, run by
// tests/routing-mounted.test.mjs).
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import RoutingScreen from '../../src/sections/routing/screens/RoutingScreen.jsx';
import * as routingBank from '../../src/banks/routing/tasks.js';
import routing from '../helpers/routing.mjs';
import { syntaxes } from '../../src/sections/routing/syntax/index.js';
// RF-1 «Знайди несправність»: the very logic object the screen uses (one
// bundle), so a scenario can count its calls or force a fault through its
// tooling-only `inspect`; and the bank as the targets give it.
import faults, { eligibleVariants, inspect as inspectFault } from '../../src/sections/routing/logic/faults-exercise.js';
import * as faultsState from '../../src/sections/routing/logic/faults-state.js';
import { levelCodes } from '../../src/sections/routing/logic/faults.js';
import { record as faultsRecord } from '../../src/banks/routing/faults.js';

/** The routing bank with RF-1's record, as both targets give it to the screen. */
export const faultsBank = { ...routingBank, faults: faultsRecord };
export { act, eligibleVariants, faults, faultsState, inspectFault, levelCodes, faultsRecord, routing, routingBank, syntaxes };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

/** Mount the routing screen; `store` always holds the latest { state, dispatch }.
 * `bank`: the class bank unless a scenario needs another (step 9: a record
 * the generator can't renumber; RF-1: `faultsBank`, which offers «Знайди
 * несправність»). */
export function mountRouting({ prefs, bank = routingBank } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {};
  act(() => root.render(<StoreProvider prefs={prefs}><Expose into={store} /><RoutingScreen bank={bank} /></StoreProvider>));
  return {
    container, store,
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}
