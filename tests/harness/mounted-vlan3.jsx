// Bundled by tools/test.sh into .test-bundles/harness/mounted-vlan3.mjs.
// Mounts the real VLAN screen, with all four exercises, in the app store
// with react-dom/client inside act(), so effects and events run. Import it
// only after tests/helpers/mini-dom.mjs has installed its DOM, in its own
// process (tests/helpers/mounted-vlan3.mjs). `faults` is the very logic
// object the screen uses (one bundle), so a scenario can count its calls or
// force a fault through its tooling-only `inspect`.
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import VlanScreen from '../../src/sections/vlan/screens/VlanScreen.jsx';
import faults from '../../src/sections/vlan/logic/faults-exercise.js';
import { catalogue } from '../../src/sections/vlan/logic/faults.js';
import { record as predictRecord } from '../../src/banks/vlan/predict.js';
import { records as portRecords } from '../../src/banks/vlan/ports.js';
import { records as routeRecords } from '../../src/banks/vlan/route.js';
import { records as faultRecords } from '../../src/banks/vlan/faults.js';
import { causeText, faultText, faultsUi, faultExample, routeUi, t, ui } from '../../src/sections/vlan/uk.js';
import { toFaultForm, usesNative } from '../../src/sections/vlan/screens/faultsState.js';

export const bank = { predict: predictRecord, ports: portRecords, route: routeRecords, faults: faultRecords };
export { act, faults, catalogue, causeText, faultText, faultsUi, faultExample, routeUi, t, ui, toFaultForm, usesNative };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

/** Mount the screen; `store` always holds the latest { state, dispatch }. */
export function mountVlan({ prefs } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {};
  act(() => root.render(<StoreProvider prefs={prefs}><Expose into={store} /><VlanScreen bank={bank} /></StoreProvider>));
  return {
    container, store,
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}
