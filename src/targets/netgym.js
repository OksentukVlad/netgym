// NetGym.exe: the start screen in front of every section, in the order a
// learner needs them (round 4 spec A7): the calculator, the mask exercise,
// the binary walk; then routing; then the firewall (FW-1), then VLAN
// (VLAN-1, VLAN-2's «Між VLAN» and VLAN-3's «Знайди несправність»), then
// «Налаштування з нуля» (the setup decks: DR-1 Cisco router, DR-2 Cisco
// 2960, DR-3 MikroTik), last. The first card says «Почни тут»; nothing is
// locked.
// Each section's screen brings its own strings and shares the shell's app
// store. A section's `bank` is the task bank its screen gets (targets choose
// banks; routing's also carries RF-1's «Знайди несправність» record as
// `faults`). The IP screens link to each other by these section ids
// (src/sections/ip/screens/links.js).
import { createElement } from 'react';
import Shell from '../app/Shell.jsx';
import { uk } from '../app/uk.js';
import RoutingScreen from '../sections/routing/screens/RoutingScreen.jsx';
import { section as routingSection } from '../sections/routing/uk.js';
import * as routingBank from '../banks/routing/tasks.js';
import { record as routingFaults } from '../banks/routing/faults.js';
import CalculatorScreen from '../sections/ip/screens/CalculatorScreen.jsx';
import MaskScreen from '../sections/ip/screens/MaskScreen.jsx';
import BinaryScreen from '../sections/ip/screens/BinaryScreen.jsx';
import { sections as ip } from '../sections/ip/uk.js';
import FirewallScreen from '../sections/firewall/screens/FirewallScreen.jsx';
import { section as firewallSection } from '../sections/firewall/uk.js';
import * as firewallBank from '../banks/firewall/tasks.js';
import VlanScreen from '../sections/vlan/screens/VlanScreen.jsx';
import { section as vlanSection } from '../sections/vlan/uk.js';
import { record as vlanPredict } from '../banks/vlan/predict.js';
import { records as vlanPorts } from '../banks/vlan/ports.js';
import { records as vlanRoute } from '../banks/vlan/route.js';
import { records as vlanFaults } from '../banks/vlan/faults.js';
import SetupScreen from '../sections/setup/screens/SetupScreen.jsx';
import { section as setupSection } from '../sections/setup/uk.js';
import setupBank from '../banks/setup/index.js';

const target = {
  id: 'netgym',
  title: uk.appName,
  sections: [
    { id: 'ip-calculator', ...ip.calculator, Screen: CalculatorScreen },
    { id: 'ip-mask', ...ip.mask, Screen: MaskScreen },
    { id: 'ip-binary', ...ip.binary, Screen: BinaryScreen },
    { id: 'routing', ...routingSection, Screen: RoutingScreen, bank: { ...routingBank, faults: routingFaults } },
    { id: 'firewall', ...firewallSection, Screen: FirewallScreen, bank: firewallBank },
    { id: 'vlan', ...vlanSection, Screen: VlanScreen, bank: { predict: vlanPredict, ports: vlanPorts, route: vlanRoute, faults: vlanFaults } },
    { id: 'setup', ...setupSection, Screen: SetupScreen, bank: setupBank },
  ],
};

export default target;

export function Root() {
  return createElement(Shell, { target });
}
