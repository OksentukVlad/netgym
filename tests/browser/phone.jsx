// Bundled for the browser by tests/phone-browser.test.mjs (esbuild, in
// memory): the whole NetGym target in its shell, mounted in a real page, for
// what a server render or the mini DOM can't show of the phone layer (round
// 6): who scrolls, the «⋯» sheet, crossing 640 px, the full-screen diagram
// and its zoom, the port cards and the reorder rows.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Shell from '../../src/app/Shell.jsx';
import target from '../../src/targets/netgym.js';

window.phone = {
  mount(host) {
    let seed = 600;
    Math.random = () => ((seed = (Math.imul(1664525, seed) + 1013904223) >>> 0) / 4294967296);
    const root = createRoot(host);
    flushSync(() => root.render(<Shell target={target} />));
    return true;
  },
};
