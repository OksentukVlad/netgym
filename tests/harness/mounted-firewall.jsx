// Bundled by tools/test.sh into .test-bundles/harness/mounted-firewall.mjs.
// Mounts the real firewall screen (both exercises) in the app store with react-dom/client
// inside act(), so effects, timers and events run. The screen can be taken
// away and put back under the same store (leaving the section and coming
// back). A probe reads what useExercise gives the screen (its `solution`).
// Import it only after tests/helpers/mini-dom.mjs has installed its DOM, in
// its own process (tests/helpers/mounted-firewall.mjs).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import { useExercise } from '../../src/ui/useExercise.js';
import FirewallScreen, { predictRecord } from '../../src/sections/firewall/screens/FirewallScreen.jsx';
import * as firewallBank from '../../src/banks/firewall/tasks.js';
import fw from '../../src/sections/firewall/logic/predict.js';
import { create as orderCreate, prepareOrder } from '../../src/sections/firewall/logic/order.js';
import { initialState as orderInitialState } from '../../src/sections/firewall/logic/order-state.js';

export { act, firewallBank, fw };

const record = firewallBank.resolveRecord(firewallBank.records[0]);
/** The record the screen uses (round 4): level 1's chain variant, then level 2's rule sets. */
const combined = predictRecord(firewallBank);
export { record, combined };

// «Упорядкуй правила» (FW-2): the record the screen resolves from the same
// bank, and the logic the scenarios use to know a task's reference (tests
// only; the screen reads it through useExercise's reveal path).
export const orderRecord = firewallBank.resolveOrderRecord(firewallBank.orderRecords[0]);
export { orderCreate, prepareOrder, orderInitialState };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

/** useExercise for the instance on screen, as the screen calls it. */
function Probe({ into }) {
  const { state } = useStore();
  const place = state.places.firewall ?? { level: 2, variantId: 'basic', seeds: { basic: 0 } };
  const level = place.level === 1 ? 1 : 2, variantId = level === 1 ? 'chain' : place.variantId;
  const ex = useExercise(fw, combined, { variantId, seed: place.seeds?.[variantId] ?? 0, level });
  into.solution = ex.solution;
  into.key = ex.key;
  return null;
}

function Frame({ store, probe, control }) {
  const [shown, setShown] = useState(true);
  control.setShown = setShown;
  return (
    <>
      <Expose into={store} />
      <Probe into={probe} />
      {shown && <FirewallScreen bank={firewallBank} />}
    </>
  );
}

/** Mount the screen; `store` always holds the latest { state, dispatch }. */
export function mountFirewall({ prefs } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {}, probe = {}, control = {};
  act(() => root.render(<StoreProvider prefs={prefs}><Frame store={store} probe={probe} control={control} /></StoreProvider>));
  return {
    container, store, probe,
    /** Take the screen away and put it back, under the same store. */
    remount() { act(() => control.setShown(false)); act(() => control.setShown(true)); },
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}
