// For tests/url.test.mjs: the NetGym target (its sections' URL codecs import
// their screens), the shell's first-render reader and the setup decks' seed successor.
export { default as target } from '../../src/targets/netgym.js';
export { bootOf } from '../../src/app/Shell.jsx';
export { nextSeed as setupNextSeed, firstSeed as setupFirstSeed } from '../../src/sections/setup/screens/SetupScreen.jsx';
export { MAX_SEED as setupMaxSeed } from '../../src/sections/setup/screens/url.js';
