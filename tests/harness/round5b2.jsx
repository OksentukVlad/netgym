// Bundled by tools/test.sh into .test-bundles/harness/round5b2.mjs: round 5
// stage 5b-2 for routing, IP and the start screen (spec 5b-2 A, C, D, G),
// rendered on the server for tests/round5b2-routing-ip.test.mjs: the routing
// screen and the mask exercise in a test store, the calculator's command
// caption, the mask's ruler line, and the NetGym start screen.
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import RoutingScreen from '../../src/sections/routing/screens/RoutingScreen.jsx';
import MaskScreen, { maskRulerCaption } from '../../src/sections/ip/screens/MaskScreen.jsx';
import { commandCaptionOf } from '../../src/sections/ip/screens/CalculatorScreen.jsx';
import { rulerFor } from '../../src/sections/ip/screens/AddressRuler.jsx';
import { Root } from '../../src/targets/netgym.js';
import * as routingBank from '../../src/banks/routing/tasks.js';

export { RoutingScreen, MaskScreen, maskRulerCaption, commandCaptionOf, rulerFor, routingBank };

/** A store for tests: `render(Component, props)` renders inside it. */
export function testStore(prefs) {
  const store = { state: initialStore(prefs) };
  store.state.places.examples = { 'routing-15': true };   // a later visit: task 15's example opens by itself once only
  store.dispatch = action => { store.state = storeReducer(store.state, action); };
  store.render = (Component, props = {}) => renderToStaticMarkup(
    <StoreContext.Provider value={{ state: store.state, dispatch: store.dispatch }}><Component {...props} /></StoreContext.Provider>,
  );
  return store;
}

/** The NetGym start screen. */
export const renderStart = () => renderToStaticMarkup(<Root />);
