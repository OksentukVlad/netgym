// Bundled by tools/test.sh into .test-bundles/harness/ip-screens.mjs. The
// step 8 IP screens rendered with react-dom/server in a test store, with or
// without the shell's navigation (NavContext), for the calculator's rows and
// commands, the walk's provenance leak gate (spec S5) and the links that
// appear only once a task is finished (S7).
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import { NavContext } from '../../src/ui/useNav.js';
import { instanceKeyOf } from '../../src/ui/useExercise.js';
import binary from '../../src/sections/ip/logic/binary.js';
import mask from '../../src/sections/ip/logic/mask.js';
import * as calc from '../../src/sections/ip/logic/calc.js';
import CalculatorScreen, { rowsOf, commandsOf, showsGateway } from '../../src/sections/ip/screens/CalculatorScreen.jsx';
import BinaryScreen, { acceptedRows } from '../../src/sections/ip/screens/BinaryScreen.jsx';
import MaskScreen, { calculatorParams } from '../../src/sections/ip/screens/MaskScreen.jsx';
import AddressRuler, { blockOn, rulerFor, rulerWith } from '../../src/sections/ip/screens/AddressRuler.jsx';
import { editText, flip, pastedBits, textOf, zeroCells } from '../../src/sections/ip/screens/BitOctet.jsx';
import { SECTION } from '../../src/sections/ip/screens/links.js';
import { hostWords } from '../../src/sections/ip/uk.js';

export {
  binary, mask, calc, instanceKeyOf, CalculatorScreen, BinaryScreen, MaskScreen, AddressRuler,
  rowsOf, commandsOf, showsGateway, acceptedRows, calculatorParams, blockOn, rulerFor, rulerWith,
  editText, flip, pastedBits, textOf, zeroCells, SECTION, hostWords,
};

/** A nav stand-in: records every go() payload; `has` answers for `sections`. */
export function testNav(sections = Object.values(SECTION)) {
  const nav = { calls: [], go: route => nav.calls.push(route), has: id => sections.includes(id) };
  return nav;
}

/** A store for tests: `render(Component, props, nav?)` renders inside it
 * (with NavContext when `nav` is given, as inside the shell). */
export function ipStore(prefs) {
  const store = { state: initialStore(prefs), actions: [] };
  store.dispatch = action => {
    store.actions.push(action);
    store.state = storeReducer(store.state, action);
  };
  store.render = (Component, props = {}, nav) => {
    const screen = <StoreContext.Provider value={{ state: store.state, dispatch: store.dispatch }}><Component {...props} /></StoreContext.Provider>;
    return renderToStaticMarkup(nav ? <NavContext.Provider value={nav}>{screen}</NavContext.Provider> : screen);
  };
  return store;
}
