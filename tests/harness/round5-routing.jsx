// Bundled by tools/test.sh into .test-bundles/harness/round5-routing.mjs:
// round 5 stage 5b-1 (routing and IP) for server rendering, used by
// tests/round5-routing-ip.test.mjs: the routing screen in a test store, its
// legend and placeholders, and the binary walk's level 1 row.
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import RoutingScreen, { firstSentence, ispEnd } from '../../src/sections/routing/screens/RoutingScreen.jsx';
import { FreeRow, placeholderOf, teachesDistance } from '../../src/sections/routing/screens/RouteRows.jsx';
import { syntaxes } from '../../src/sections/routing/syntax/index.js';
import { interfacesOf } from '../../src/sections/routing/screens/RouterCard.jsx';
import BitRowInput from '../../src/sections/ip/screens/BitOctet.jsx';
import * as routingBank from '../../src/banks/routing/tasks.js';

export { RoutingScreen, firstSentence, ispEnd, placeholderOf, teachesDistance, interfacesOf, routingBank };

/** A store for tests: `render(Component, props)` renders inside it. */
export function testStore(prefs) {
  const store = { state: initialStore(prefs) };
  store.dispatch = action => { store.state = storeReducer(store.state, action); };
  store.render = (Component, props = {}) => renderToStaticMarkup(
    <StoreContext.Provider value={{ state: store.state, dispatch: store.dispatch }}><Component {...props} /></StoreContext.Provider>,
  );
  return store;
}

/** The binary walk's answer row on its own. */
export const renderRow = props => renderToStaticMarkup(<BitRowInput row="Адреса" cells={Array.from({ length: 4 }, () => Array(8).fill('0'))} onChange={() => {}} onEnter={() => {}} {...props} />);

/** One route row of «Знайди несправність»'s table (FreeRow, as FaultsView renders it), blank: its inputs' placeholders. */
export function renderFaultRow(syntaxId, needDist = false) {
  const answers = { valuesOf: () => ({}), formErrorOf: () => null, noteOf: () => null, edit() {}, removeRoute() {} };
  return renderToStaticMarkup(<ol><FreeRow syntax={syntaxes[syntaxId]} answers={answers} item={{ key: 'R1.f1', n: 1, needDist, router: 'R1' }} onNetwork={() => {}} quietHead /></ol>);
}
