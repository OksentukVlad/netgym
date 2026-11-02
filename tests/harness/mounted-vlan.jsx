// Bundled by tools/test.sh into .test-bundles/harness/mounted-vlan.mjs.
// Mounts the real VLAN screen in the app store with react-dom/client inside
// act(), so effects and events run. Import it only after
// tests/helpers/mini-dom.mjs has installed its DOM, in its own process
// (tests/helpers/mounted-vlan.mjs). `predict`, `ports` and `route` are the
// very logic objects the screen uses (one bundle), so a scenario can count calls.
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import VlanScreen from '../../src/sections/vlan/screens/VlanScreen.jsx';
import predict from '../../src/sections/vlan/logic/predict.js';
import ports from '../../src/sections/vlan/logic/ports.js';
import route from '../../src/sections/vlan/logic/route.js';
import { reference } from '../../src/sections/vlan/logic/model.js';
import { record as predictRecord } from '../../src/banks/vlan/predict.js';
import { records as portRecords } from '../../src/banks/vlan/ports.js';
import { records as routeRecords } from '../../src/banks/vlan/route.js';
import { ui, routeUi } from '../../src/sections/vlan/uk.js';

export const bank = { predict: predictRecord, ports: portRecords, route: routeRecords };
export { act, predict, ports, route, reference, ui, routeUi };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

/** Mount the screen; `store` always holds the latest { state, dispatch }. */
export function mountVlan({ prefs, place } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {};
  act(() => root.render(<StoreProvider prefs={prefs}><Expose into={store} /><VlanScreen bank={bank} /></StoreProvider>));
  if (place) act(() => store.dispatch({ type: 'place', scope: 'vlan', patch: place }));
  return {
    container, store,
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}
