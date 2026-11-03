// Bundled for the browser by tests/url-browser.test.mjs (esbuild, in memory):
// the whole NetGym target in its shell, mounted as the page loads (so a
// reload boots it again from the URL), at http://netgym.test/netgym/. Seeds
// stay random (a reload draws new ones, so a task kept across it comes from the
// URL, not a repeated sequence); `window.randomCalls` counts the draws, so a
// test can see a hash applied once.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import Shell from '../../src/app/Shell.jsx';
import target from '../../src/targets/netgym.js';

const random = Math.random;
window.randomCalls = 0;
Math.random = () => { window.randomCalls += 1; return random(); };
const root = createRoot(document.getElementById('host'));
flushSync(() => root.render(<Shell target={target} />));
