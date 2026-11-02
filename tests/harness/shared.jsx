// Bundled by tools/test.sh into .test-bundles/harness/shared.mjs: the round 4
// shared parts (spec A) for server rendering and their pure decisions, used
// by tests/shared-parts.test.mjs. The mounted lifecycle is in
// tests/harness/mounted-shared.jsx.
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import HelpPanel, { helpMemory, primaryOf, isSuccess } from '../../src/ui/components/HelpPanel.jsx';
import MoreMenu from '../../src/ui/components/MoreMenu.jsx';
import Aside from '../../src/ui/components/Aside.jsx';
import DoneMark, { earnedBy } from '../../src/ui/components/DoneMark.jsx';
import ExerciseLayout from '../../src/ui/components/ExerciseLayout.jsx';
import { TextEquivalentButton } from '../../src/ui/components/TextEquivalent.jsx';
import { zoomBarState, isZoomed } from '../../src/ui/topology/useZoomBar.js';
import Shell from '../../src/app/Shell.jsx';
import netgym from '../../src/targets/netgym.js';

export { createElement, HelpPanel, MoreMenu, Aside, DoneMark, ExerciseLayout, TextEquivalentButton, helpMemory, primaryOf, isSuccess, earnedBy, zoomBarState, isZoomed, netgym };

/** Server markup of an element in a test store (`places` preset). */
export function render(element, places = {}) {
  const state = { ...initialStore(), places };
  return renderToStaticMarkup(<StoreContext.Provider value={{ state, dispatch: () => {} }}>{element}</StoreContext.Provider>);
}

export const renderPlain = element => renderToStaticMarkup(element);
export const reduce = storeReducer;
export const startScreen = () => renderToStaticMarkup(<Shell target={netgym} />);
