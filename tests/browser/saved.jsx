// Bundled for the browser by tests/saved-browser.test.mjs (esbuild, in memory,
// with __NETGYM_WEB__ true): the whole NetGym target in its shell, saving, at
// http://netgym.test/netgym/, so reloads and a second tab are real. `window.
// saved.report()` says what a load would restore and what it would drop.
// With `test.fail` in localStorage the mask section throws as it renders, on
// every load: a saved state that passed its checks and still breaks a screen.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Shell from '../../src/app/Shell.jsx';
import target from '../../src/targets/netgym.js';
import mask from '../../src/sections/ip/logic/mask.js';
import { KEY, readSaved } from '../../src/app/saved.js';

window.saved = {
  /** What's stored against what a load restores: the keys and scopes it would drop. */
  report() {
    const raw = localStorage.getItem(KEY);
    if (!raw) return { raw: false, instances: 0, dropped: [], droppedPlaces: [] };
    const blob = JSON.parse(raw);
    const back = readSaved(target, localStorage);
    const stored = [...Object.keys(blob.instances), ...Object.keys(blob.done)];
    return {
      raw: true, size: raw.length, instances: stored.length,
      dropped: stored.filter(key => !(key in back.instances)),
      droppedPlaces: Object.keys(blob.places).filter(scope => !(scope in back.places)),
    };
  },
  /** The mask task on screen, from the place, and its answer. */
  maskAnswer() {
    const { places } = JSON.parse(localStorage.getItem(KEY));
    const { level, seeds } = places['ip.mask'];
    return mask.solution(mask.create(null, { seed: seeds[level], level }));
  },
};

/** The flag, where the page has a working localStorage (some tests take it away). */
const failFlag = () => { try { return localStorage.getItem('test.fail'); } catch { return null; } };
function failing(section) {
  const { Screen } = section;
  return { ...section, Screen: props => {
    if (failFlag()) throw new Error('injected render failure');
    return <Screen {...props} />;
  } };
}
const shown = { ...target, sections: target.sections.map(s => (s.id === 'ip-mask' ? failing(s) : s)) };

const root = createRoot(document.getElementById('host'));
flushSync(() => root.render(<Shell target={shown} />));
