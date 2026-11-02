// Bundled for the browser by tests/setup-browser.test.mjs (esbuild, in
// memory): the real «Налаштування з нуля» screen with its CSS, on one deck,
// for what a server render or the mini DOM can't show: how the card rows lay
// out (round 5, spec 5b-2 F) and where the mode popover opens.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import SetupScreen from '../../src/sections/setup/screens/SetupScreen.jsx';
import setupBank from '../../src/banks/setup/index.js';

let store = null;
function Expose() {
  store = useStore();
  return null;
}

window.setup = {
  /** Mount the screen in `host` on `deck` (seed 1 for every deck) in `theme`. */
  mount(host, deck, theme = 'dark') {
    const root = createRoot(host);
    flushSync(() => root.render(<StoreProvider prefs={{ theme }}><Expose /><SetupScreen bank={setupBank} /></StoreProvider>));
    flushSync(() => store.dispatch({ type: 'place', scope: 'setup', patch: { deck, seeds: Object.fromEntries(setupBank.decks.map(d => [d.id, 1])) } }));
  },
};
