// Bundled by tools/test.sh into .test-bundles/harness/mounted-setup.mjs.
// Mounts the real «Налаштування з нуля» screen in the app store with
// react-dom/client inside act(), so effects and events run. The screen can
// be taken away and put back under the same store (leaving the section and
// coming back). Import it only after tests/helpers/mini-dom.mjs has
// installed its DOM, in its own process (tests/helpers/mounted-setup.mjs).
// `drill` is the very logic object the screen uses (one bundle), so a
// scenario can count its solution() calls (the screen never makes one: its
// scripts come from scriptForState). The bank is NetGym's: the deck
// registry (DR-1, DR-2, DR-3), as src/targets/netgym.js passes it.
import { NavContext } from '../../src/ui/useNav.js';
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import SetupScreen, { successTips } from '../../src/sections/setup/screens/SetupScreen.jsx';
import { lineSummary } from '../../src/sections/setup/screens/Recall.jsx';
import CopyBlock from '../../src/ui/components/CopyBlock.jsx';
import drill from '../../src/sections/setup/logic/deck.js';
import setupBank from '../../src/banks/setup/index.js';
import { cardText, recallRows, render, scriptForState } from '../../src/sections/setup/logic/render.js';
import { check } from '../../src/sections/setup/logic/rules.js';
import { explanation, hints, tips } from '../../src/sections/setup/logic/hints.js';
import { capabilities } from '../../src/sections/setup/logic/model.js';
import { initialState, transition } from '../../src/sections/setup/logic/state.js';
import { comprehension, deckUi, text, ui } from '../../src/sections/setup/uk.js';
import { setupExample } from '../../src/sections/setup/logic/examples.js';
import { uk as shared } from '../../src/ui/uk.js';

export const bank = setupBank;
export const [ciscoRouter, cisco2960, mikrotikRouter] = setupBank.decks;
export { act, drill, cardText, recallRows, render, scriptForState, check, explanation, hints, tips, capabilities, initialState, transition, successTips, lineSummary, deckUi, text, ui, shared, comprehension, setupExample };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

function Frame({ store, control }) {
  const [shown, setShown] = useState(true);
  control.setShown = setShown;
  return <><Expose into={store} />{shown && <SetupScreen bank={bank} />}</>;
}

/** Mount the screen on `deck` with `seed` for every deck (the same seed: their
 * instances must still be apart); `store` always holds the latest { state, dispatch }. */
export function mountSetup({ prefs, seed = 1, deck = 'dr-1', nav = null, firstVisit = false } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {}, control = {};
  const frame = <Frame store={store} control={control} />;
  // A later visit unless asked: the example opens by itself once only (round 9, B3).
  act(() => root.render(<StoreProvider prefs={prefs} places={firstVisit ? { setup: { deck, seeds: Object.fromEntries(setupBank.decks.map(d => [d.id, seed])) } } : { examples: { setup: true } }}>{nav ? <NavContext.Provider value={nav}>{frame}</NavContext.Provider> : frame}</StoreProvider>));
  act(() => store.dispatch({ type: 'place', scope: 'setup', patch: { deck, seeds: Object.fromEntries(setupBank.decks.map(d => [d.id, seed])) } }));
  return {
    container, store,
    /** Take the screen away and put it back, under the same store. */
    remount() { act(() => control.setShown(false)); act(() => control.setShown(true)); },
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}

function CopyFrame({ control, initial, onCopy }) {
  const [text, setText] = useState(initial);
  control.setText = setText;
  return <CopyBlock text={text} what="скрипт" onCopy={onCopy} />;
}

/** The shared CopyBlock alone, its text changeable (a script that changes while a copy is pending). */
export function mountCopy({ text, onCopy }) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const control = {};
  act(() => root.render(<CopyFrame control={control} initial={text} onCopy={onCopy} />));
  return {
    container,
    setText(value) { act(() => control.setText(value)); },
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}
