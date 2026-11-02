// routing.exe: the merged routing screen on its own (Cisco or MikroTik), with
// the app store and the top bar (its title and the screen's controls) but no
// shell; it imports neither Shell.jsx nor the shell's CSS.
// The section's `bank` is the task bank its screen gets (targets choose banks),
// with RF-1's «Знайди несправність» record as `faults`.
import { createElement } from 'react';
import Standalone from '../app/Standalone.jsx';
import RoutingScreen from '../sections/routing/screens/RoutingScreen.jsx';
import { section } from '../sections/routing/uk.js';
import * as routingBank from '../banks/routing/tasks.js';
import { record as routingFaults } from '../banks/routing/faults.js';

const target = {
  id: 'routing',
  title: 'NetGym: маршрутизація',
  only: true,
  sections: [{ id: 'routing', ...section, Screen: RoutingScreen, bank: { ...routingBank, faults: routingFaults } }],
};

export default target;

export function Root() {
  return createElement(Standalone, { section: target.sections[0], title: target.title });
}
