// Bundled by tools/test.sh into .test-bundles/harness/dhcp.mjs. «DHCP і NAT»
// rendered with react-dom/server: the section from a given app store, the
// shared drawing in its DHCP view, the shared ruler with DHCP's strip.
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import DhcpScreen, { firstPlace } from '../../src/sections/dhcp/screens/DhcpScreen.jsx';
import { RouterSvg } from '../../src/ui/topology/RouterDiagram.jsx';
import AddressRuler, { pinLabels } from '../../src/ui/components/AddressRuler.jsx';
import { drawingTopology, textSections } from '../../src/sections/dhcp/screens/drawing.js';
import { answerOf, draftOf, formOf, stripProps } from '../../src/sections/dhcp/screens/ServerView.jsx';
import { screen } from '../../src/sections/dhcp/uk.js';
import { tooLong } from '../../src/ui/components/Purpose.jsx';
import { drawnPcs, exampleRows, probeHighlight, rowValue } from '../../src/sections/dhcp/screens/FaultView.jsx';
import { dnsText, groupsOf, prefixText, prefixValue, setAt } from '../../src/sections/dhcp/screens/RepairForm.jsx';

export { initialStore, storeReducer, firstPlace, drawingTopology, textSections, answerOf, draftOf, formOf, stripProps, pinLabels, tooLong,
  drawnPcs, exampleRows, probeHighlight, rowValue, dnsText, groupsOf, prefixText, prefixValue, setAt };

/** The section as it renders from `state` (an app store state). */
export function renderSection(state) {
  const dispatch = () => { throw new Error('the server render does not dispatch'); };
  return renderToStaticMarkup(<StoreContext.Provider value={{ state, dispatch }}><DhcpScreen /></StoreContext.Provider>);
}

/** The shared drawing in its DHCP view for a DHCP topology. */
export const renderDrawing = (topology, vendor, { server = false, highlight = null, pcs = null } = {}) =>
  renderToStaticMarkup(<RouterSvg view="dhcp" words={screen.drawing} topology={drawingTopology(topology, vendor, { server, pcs })} size={{ width: 600 }} highlight={highlight} />);

/** The shared ruler with any props. */
export const renderRuler = props => renderToStaticMarkup(<AddressRuler {...props} />);
