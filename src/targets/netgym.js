// NetGym.exe: the start screen in front of every section, in the order a
// learner needs them (round 4 spec A7): the calculator, the mask exercise,
// the binary walk; then routing; then «DHCP і NAT» (round 6: its card carries
// its blurb and advice from its uk.js); then the firewall (FW-1), then VLAN
// (VLAN-1, VLAN-2's «Між VLAN» and VLAN-3's «Знайди несправність»), then
// «Налаштування з нуля» (the setup decks: DR-1 Cisco router, DR-2 Cisco
// 2960, DR-3 MikroTik), last. The first card says «Почни тут»; nothing is
// locked. Round 5 5b-2 (spec G): the advanced cards add one advisory line,
// «радимо спершу: …» (`advice`, each section's comprehension.recommendedFirst):
// advice, still no locks.
// Each section's screen brings its own strings and shares the shell's app
// store. Round 6 (spec URL v2.1): each section's `url` is its URL codec
// (screens/url.js): which of its place goes into the address, and back. A section's `bank` is the task bank its screen gets (targets choose
// banks; routing's also carries RF-1's «Знайди несправність» record as
// `faults`). The IP screens link to each other by these section ids
// (src/sections/ip/screens/links.js).
import { createElement } from 'react';
import Shell from '../app/Shell.jsx';
import { uk } from '../app/uk.js';
import RoutingScreen from '../sections/routing/screens/RoutingScreen.jsx';
import { comprehension as routingWords, section as routingSection } from '../sections/routing/uk.js';
import * as routingBank from '../banks/routing/tasks.js';
import { record as routingFaults } from '../banks/routing/faults.js';
import CalculatorScreen from '../sections/ip/screens/CalculatorScreen.jsx';
import MaskScreen from '../sections/ip/screens/MaskScreen.jsx';
import BinaryScreen from '../sections/ip/screens/BinaryScreen.jsx';
import { sections as ip } from '../sections/ip/uk.js';
import DhcpScreen from '../sections/dhcp/screens/DhcpScreen.jsx';
import { section as dhcpSection } from '../sections/dhcp/uk.js';
import FirewallScreen from '../sections/firewall/screens/FirewallScreen.jsx';
import { comprehension as firewallWords, section as firewallSection } from '../sections/firewall/uk.js';
import * as firewallBank from '../banks/firewall/tasks.js';
import VlanScreen from '../sections/vlan/screens/VlanScreen.jsx';
import { comprehension as vlanWords, section as vlanSection } from '../sections/vlan/uk.js';
import { record as vlanPredict } from '../banks/vlan/predict.js';
import { records as vlanPorts } from '../banks/vlan/ports.js';
import { records as vlanRoute } from '../banks/vlan/route.js';
import { records as vlanFaults } from '../banks/vlan/faults.js';
import SetupScreen from '../sections/setup/screens/SetupScreen.jsx';
import { comprehension as setupWords, section as setupSection } from '../sections/setup/uk.js';
import setupBank from '../banks/setup/index.js';
import { url as routingUrl } from '../sections/routing/screens/url.js';
import { binaryUrl, calculatorUrl, maskUrl } from '../sections/ip/screens/url.js';
import { url as dhcpUrl } from '../sections/dhcp/screens/url.js';
import { url as firewallUrl } from '../sections/firewall/screens/url.js';
import { url as vlanUrl } from '../sections/vlan/screens/url.js';
import { url as setupUrl } from '../sections/setup/screens/url.js';

const target = {
  id: 'netgym',
  title: uk.appName,
  sections: [
    { id: 'ip-calculator', ...ip.calculator, Screen: CalculatorScreen, url: calculatorUrl },
    { id: 'ip-mask', ...ip.mask, Screen: MaskScreen, url: maskUrl },
    { id: 'ip-binary', ...ip.binary, Screen: BinaryScreen, url: binaryUrl },
    { id: 'routing', ...routingSection, advice: routingWords.recommendedFirst, Screen: RoutingScreen, bank: { ...routingBank, faults: routingFaults }, url: routingUrl },
    { id: 'dhcp', ...dhcpSection, Screen: DhcpScreen, url: dhcpUrl },
    { id: 'firewall', ...firewallSection, advice: firewallWords.recommendedFirst, Screen: FirewallScreen, bank: firewallBank, url: firewallUrl },
    { id: 'vlan', ...vlanSection, advice: vlanWords.recommendedFirst, Screen: VlanScreen, bank: { predict: vlanPredict, ports: vlanPorts, route: vlanRoute, faults: vlanFaults }, url: vlanUrl },
    { id: 'setup', ...setupSection, advice: setupWords.recommendedFirst, Screen: SetupScreen, bank: setupBank, url: setupUrl },
  ],
};

export default target;

export function Root() {
  return createElement(Shell, { target });
}
