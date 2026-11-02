// Bundled by tools/test.sh into .test-bundles/harness/firewall.mjs. The
// firewall screen (FW-1 screen spec) rendered with react-dom/server from a
// given app store, so a test can put any round, card, draft, hint or commit
// in place and read the markup; plus the screen's parts on their own (the
// diagram at a scene, «Текстом», «Що означають стани» from «⋯»).
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import FirewallScreen, { CommandsPanel, StatesPanel, predictRecord } from '../../src/sections/firewall/screens/FirewallScreen.jsx';
import { tableRows } from '../../src/sections/firewall/screens/walkView.js';
import { useExercise } from '../../src/ui/useExercise.js';
import fw from '../../src/sections/firewall/logic/predict.js';
import { DiagramSvg } from '../../src/sections/firewall/screens/FirewallDiagram.jsx';
import PacketCard from '../../src/sections/firewall/screens/PacketCard.jsx';
import FactLink from '../../src/ui/components/FactLink.jsx';
import TextEquivalent from '../../src/ui/components/TextEquivalent.jsx';
import * as firewallBank from '../../src/banks/firewall/tasks.js';

export { firewallBank, fw, initialStore, predictRecord, storeReducer };
/** Level 2's hint codes (the logic's ladder; level 1 has its own). */
export const HINT_CODES = ['hint-door', 'hint-order', 'hint-example'];

/** The screen as it renders from `state` (an app store state). */
export function renderScreen(state, bank = firewallBank) {
  const dispatch = () => { throw new Error('the server render does not dispatch'); };
  return renderToStaticMarkup(<StoreContext.Provider value={{ state, dispatch }}><FirewallScreen bank={bank} /></StoreContext.Provider>);
}

/** The diagram's drawing alone at a scene (diagram.js sceneOf). */
export const renderDiagram = (scene, topology, highlight = null) => renderToStaticMarkup(<DiagramSvg scene={scene} topology={topology} size={{ width: 668 }} highlight={highlight} />);

/** The packet card from its givens alone (walkView.cardLines), as the screen draws it (round 5: «Куди» a FactLink). */
export const renderCard = (lines, n, total) => renderToStaticMarkup(<PacketCard lines={lines} n={n} total={total}
  toNode={<FactLink value={lines.to.value} onActivate={() => null} />} />);

/** «Текстом» opened, with its sections. */
export const renderText = sections => renderToStaticMarkup(<TextEquivalent id="t" title="Текстом" sections={sections} open onClose={() => {}} />);

/** «Що означають стани» («⋯»), as the screen opens it. */
export const renderRules = () => renderToStaticMarkup(<StatesPanel />);

/** «Команда RouterOS» («⋯») for a policy. */
export const renderCommands = policy => renderToStaticMarkup(<CommandsPanel rows={tableRows(policy)} />);

/** What useExercise gives the screen for an instance: its `solution` (null before a reveal). */
export function exerciseSolution(state, record, params) {
  const out = {};
  function Probe() { out.solution = useExercise(fw, record, params).solution; return null; }
  renderToStaticMarkup(<StoreContext.Provider value={{ state, dispatch: () => {} }}><Probe /></StoreContext.Provider>);
  return out.solution;
}
