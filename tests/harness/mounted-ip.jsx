// Bundled by tools/test.sh into .test-bundles/harness/mounted-ip.mjs. Mounts
// the step 8 IP screens with react-dom/client inside act(): alone in the app
// store (the walk, the calculator), or in the real NetGym shell with the
// three IP sections, whose NavContext carries the links. Import it only
// after tests/helpers/mini-dom.mjs has installed its DOM, in its own process
// (tests/helpers/mounted-ip.mjs, run by tests/ip-mounted.test.mjs).
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import Shell from '../../src/app/Shell.jsx';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import CalculatorScreen from '../../src/sections/ip/screens/CalculatorScreen.jsx';
import MaskScreen from '../../src/sections/ip/screens/MaskScreen.jsx';
import BinaryScreen from '../../src/sections/ip/screens/BinaryScreen.jsx';
import binary from '../../src/sections/ip/logic/binary.js';
import mask from '../../src/sections/ip/logic/mask.js';
import { sections as ip } from '../../src/sections/ip/uk.js';
import { renderAddress as cisco } from '../../src/engine/vendors/cisco.js';
import { renderAddress as routeros } from '../../src/engine/vendors/routeros.js';

export { act, binary, mask, cisco, routeros };

function Expose({ into }) {
  Object.assign(into, useStore());
  return null;
}

function mount(element) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return { container, unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); } };
}

/** One screen in the app store; `store` always holds the latest { state, dispatch }. */
export function mountScreen(name, props = {}) {
  const Screen = { calculator: CalculatorScreen, mask: MaskScreen, binary: BinaryScreen }[name];
  const store = {};
  return { store, ...mount(<StoreProvider><Expose into={store} /><Screen {...props} /></StoreProvider>) };
}

/** The NetGym shell with the three IP sections, as the netgym target has them. */
export function mountShell() {
  const target = {
    id: 'netgym-ip', title: 'NetGym',
    sections: [
      { id: 'ip-calculator', ...ip.calculator, Screen: CalculatorScreen },
      { id: 'ip-mask', ...ip.mask, Screen: MaskScreen },
      { id: 'ip-binary', ...ip.binary, Screen: BinaryScreen },
    ],
  };
  return mount(<Shell target={target} />);
}
