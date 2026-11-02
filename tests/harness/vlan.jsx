// Bundled by tools/test.sh into .test-bundles/harness/vlan.mjs. The VLAN
// screen (VLAN-1 spec §4) rendered with react-dom/server from a given app
// store, so a test can put any exercise, instance, draft, commit or check in
// place and read the markup; plus the diagram's drawing alone.
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import VlanScreen, { firstPlace } from '../../src/sections/vlan/screens/VlanScreen.jsx';
import { DiagramSvg } from '../../src/sections/vlan/screens/VlanDiagram.jsx';
import predict from '../../src/sections/vlan/logic/predict.js';
import ports from '../../src/sections/vlan/logic/ports.js';
import route from '../../src/sections/vlan/logic/route.js';
import { record as predictRecord } from '../../src/banks/vlan/predict.js';
import { records as portRecords } from '../../src/banks/vlan/ports.js';
import { records as routeRecords } from '../../src/banks/vlan/route.js';
import { records as faultRecords } from '../../src/banks/vlan/faults.js';
import faults from '../../src/sections/vlan/logic/faults-exercise.js';
import { initialInstance } from '../../src/ui/exercise-state.js';

export const bank = { predict: predictRecord, ports: portRecords, route: routeRecords, faults: faultRecords };
export { initialStore, storeReducer, predict, ports, route, faults, firstPlace, initialInstance };

/** The screen as it renders from `state` (an app store state). */
export function renderScreen(state, b = bank) {
  const dispatch = () => { throw new Error('the server render does not dispatch'); };
  return renderToStaticMarkup(<StoreContext.Provider value={{ state, dispatch }}><VlanScreen bank={b} /></StoreContext.Provider>);
}

/** The diagram's drawing alone. */
export const renderDiagram = props => renderToStaticMarkup(<DiagramSvg size={{ width: 600 }} {...props} />);
