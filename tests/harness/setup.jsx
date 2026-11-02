// Bundled by tools/test.sh into .test-bundles/harness/setup.mjs. The
// «Налаштування з нуля» screen rendered with react-dom/server from a given
// app store, so a test can put any deck, seed and lifecycle state (sorting,
// sorted, recall…) in place and read the markup. The bank is NetGym's deck
// registry.
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import SetupScreen, { successTips } from '../../src/sections/setup/screens/SetupScreen.jsx';
import { linePrompts } from '../../src/sections/setup/screens/Script.jsx';
import drill from '../../src/sections/setup/logic/deck.js';
import { initialState, transition } from '../../src/sections/setup/logic/state.js';
import setupBank from '../../src/banks/setup/index.js';

export const bank = setupBank;
export const [ciscoRouter, cisco2960, mikrotikRouter] = setupBank.decks;
export { drill, initialState, transition, successTips, linePrompts };
export { tooLong } from '../../src/ui/components/Purpose.jsx';
export { helpAt } from '../../src/sections/setup/screens/ModeHelp.jsx';

/** A store on `deck` and `seed`; `setup` (a logic state) puts that instance's lifecycle in place. */
export function storeFor({ seed = 1, prefs = {}, deck = 'dr-1', setup = null, session = {} } = {}) {
  const state = initialStore(prefs);
  state.places.setup = { deck, seeds: { [deck]: seed } };
  if (setup) {
    const task = drill.create(setupBank.decks.find(d => d.id === deck), { seed });
    state.instances[task.instanceKey] = { session: { status: 'working', hintIndex: 0, revealed: false, assisted: false, attempts: 0, earned: { solved: false, assisted: false }, ...session },
      answer: null, result: null, completion: null, parts: {}, presses: 1, drafts: {}, view: { setup } };
  }
  return state;
}

/** The screen as it renders from `state` (an app store state). */
export function renderScreen(state) {
  const dispatch = () => { throw new Error('the server render does not dispatch'); };
  return renderToStaticMarkup(<StoreContext.Provider value={{ state, dispatch }}><SetupScreen bank={bank} /></StoreContext.Provider>);
}
