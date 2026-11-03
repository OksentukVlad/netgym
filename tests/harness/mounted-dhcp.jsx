// Bundled by tools/test.sh into .test-bundles/harness/mounted-dhcp.mjs.
// Mounts the real «DHCP і NAT» screen in the app store with react-dom/client
// inside act(), so effects and events run. The scenarios
// (tests/helpers/mounted-dhcp.mjs) read the store and use the logic only to
// know a task's facts. Import it only after tests/helpers/mini-dom.mjs has
// installed its DOM, in its own process.
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import DhcpScreen from '../../src/sections/dhcp/screens/DhcpScreen.jsx';
import * as sides from '../../src/sections/dhcp/logic/sides.js';
import * as server from '../../src/sections/dhcp/logic/server.js';
import * as nat from '../../src/sections/dhcp/logic/nat.js';
import * as faults from '../../src/sections/dhcp/logic/faults.js';
import { createTopology } from '../../src/sections/dhcp/logic/scenario.js';
import * as words from '../../src/sections/dhcp/uk.js';
import { answerOf, draftOf } from '../../src/sections/dhcp/screens/ServerView.jsx';

export { act, sides, server, nat, faults, createTopology, words, answerOf, draftOf };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

/** The section in the app store; `store` always holds the latest { state, dispatch }. */
export function mountDhcp() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const store = {};
  act(() => root.render(<StoreProvider><Expose into={store} /><DhcpScreen /></StoreProvider>));
  return { store, container, unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); } };
}
