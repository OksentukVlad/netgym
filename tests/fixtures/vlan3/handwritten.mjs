// Hand-written configurations and expectations. No generator or snapshots.
import { numberConvention } from '../vlan2/handwritten.mjs';
const port = id => ({ id, label: { cisco: id, routeros: id } });
const access = vlan => ({ mode: 'access', vlan });
const trunk = () => ({ mode: 'trunk', allowed: [10, 20] });
const host = (device, ip) => ({ device, ip, prefix: 24 });
const link = (a, ap, b, bp) => ({ a: { device: a, port: ap }, b: { device: b, port: bp } });
const device = (id, kind, ports) => ({ id, kind, ports: ports.map(port), dynamicBridgeTagged: false });
export function two(vendor = 'cisco') {
  const task = { vendor, syntax: vendor, level: 3, vids: [10, 20], objective: null,
    goals: { PC1: 10, PC2: 20, PC3: 10, PC4: 20 },
    topology: { devices: [device('SW1', 'switch', ['a', 'b', 't']), device('SW2', 'switch', ['a', 'b', 't']),
      ...['PC1', 'PC2', 'PC3', 'PC4'].map(id => device(id, 'host', ['nic']))],
    links: [link('PC1', 'nic', 'SW1', 'a'), link('PC2', 'nic', 'SW1', 'b'), link('SW1', 't', 'SW2', 't'), link('PC3', 'nic', 'SW2', 'a'), link('PC4', 'nic', 'SW2', 'b')],
    hosts: [host('PC1', '10.0.10.11'), host('PC2', '10.0.20.12'), host('PC3', '10.0.10.13'), host('PC4', '10.0.20.14')] } };
  const c = vendor === 'cisco' ? { vlans: [10, 20], ports: { a: access(10), b: access(20), t: trunk() } } : {
    filtering: true,
    ports: { a: { pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' }, b: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' }, t: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' } },
    vlans: [{ vids: [10], tagged: ['t'], untagged: ['a'] }, { vids: [20], tagged: ['t'], untagged: ['b'] }],
  };
  return { task, baseline: { SW1: structuredClone(c), SW2: structuredClone(c) } };
}
export function transit() {
  const f = two();
  f.task.topology.links.find(l => l.a.device === 'SW1' && l.b.device === 'SW2').b = { device: 'MID', port: 'left' };
  f.task.topology.links.push(link('MID', 'right', 'SW2', 't'));
  f.task.topology.devices.push(device('MID', 'switch', ['left', 'right']));
  f.baseline.MID = { vlans: [10, 20], ports: { left: trunk(), right: trunk() } };
  return f;
}
export function stick(vendor = 'cisco', bridge = false) {
  const f = numberConvention();
  f.task.vendor = vendor; f.task.syntax = vendor; f.task.level = 3; f.task.vids = [10, 20];
  f.task.topology.devices.filter(d => d.kind !== 'host').forEach(d => { d.dynamicBridgeTagged = false; });
  if (vendor === 'cisco') return { task: f.task, baseline: f.answer };
  const baseline = {
    SW1: { filtering: true,
      ports: { a: { pvid: 10, frameTypes: 'admit-only-untagged-and-priority-tagged' }, b: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' }, t: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' } },
      vlans: [{ vids: [10], tagged: ['t'], untagged: ['a'] }, { vids: [20], tagged: ['t'], untagged: ['b'] }], vlanIfs: [], addresses: [] },
    R1: { vlanIfs: [{ name: 'ten', vid: 10, on: bridge ? 'bridge1' : 'r' }, { name: 'twenty', vid: 20, on: bridge ? 'bridge1' : 'r' }],
      addresses: [{ ip: '10.10.10.1', prefix: 24, iface: 'ten' }, { ip: '10.10.20.1', prefix: 24, iface: 'twenty' }] },
  };
  if (bridge) Object.assign(baseline.R1, { filtering: true, ports: { r: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' } },
    vlans: [{ vids: [10], tagged: ['r', 'bridge1'], untagged: [] }, { vids: [20], tagged: ['r', 'bridge1'], untagged: [] }] });
  return { task: f.task, baseline };
}

// Directional expectations are written independently of plant() and flood().
export const cases = [
  { code: 'trunk-missing-vlan', fixture: () => two(), site: { device: 'SW2', port: 't', vid: 10 },
    expected(c) { c.SW2.ports.t.allowed = [20]; }, pair: ['PC1', 'PC3'], stops: [['SW2', 't', 'not-member'], ['SW2', 't', 'not-allowed-out']] },
  { code: 'trunk-missing-vlan', vendor: 'routeros', fixture: () => two('routeros'), site: { device: 'SW2', port: 't', vid: 10 },
    expected(c) { c.SW2.vlans[0].tagged = []; }, pair: ['PC1', 'PC3'], stops: [['SW2', 't', 'not-member'], ['SW2', 't', 'not-allowed-out']] },
  { code: 'access-is-trunk', fixture: () => two(), site: { device: 'SW1', port: 'a' },
    expected(c) { c.SW1.ports.a = { mode: 'trunk', allowed: [10, 20] }; },
    pair: ['PC1', 'PC3'], stops: [['SW1', 'a', 'not-member'], ['PC1', 'nic', 'host-got-tagged']] },
  { code: 'access-wrong-vlan', fixture: () => two(), site: { device: 'SW1', port: 'a', vid: 10, changed: 20 },
    expected(c) { c.SW1.ports.a.vlan = 20; }, pair: ['PC1', 'PC3'], stops: [['SW2', 'a', 'not-allowed-out'], ['SW1', 'a', 'not-allowed-out']] },
  { code: 'access-wrong-vlan', vendor: 'routeros', fixture: () => two('routeros'), site: { device: 'SW1', port: 'a', vid: 10, changed: 1 },
    expected(c) { c.SW1.ports.a.pvid = 1; c.SW1.vlans[0].untagged = []; },
    pair: ['PC1', 'PC3'], stops: [['SW1', 't', 'not-allowed-out'], ['SW1', 'a', 'not-allowed-out']] },
  { code: 'transit-vlan-missing', fixture: transit, site: { device: 'MID', port: 'database', vid: 10 },
    expected(c) { c.MID.vlans = [20]; }, pair: ['PC1', 'PC3'], stops: [['MID', 'left', 'vlan-not-on-switch'], ['MID', 'right', 'vlan-not-on-switch']] },
  { code: 'filtering-off', vendor: 'routeros', fixture: () => two('routeros'), site: { device: 'SW1', port: 'bridge' },
    expected(c) { c.SW1.filtering = false; }, pair: ['PC1', 'PC3'], stops: [['SW2', 't', 'untagged-not-admitted'], ['PC1', 'nic', 'host-got-tagged']], leak: ['PC1', 'PC2'] },
  { code: 'trunk-frame-types', vendor: 'routeros', fixture: () => two('routeros'), site: { device: 'SW2', port: 't' },
    expected(c) { c.SW2.ports.t.frameTypes = 'admit-only-untagged-and-priority-tagged'; }, pair: ['PC1', 'PC3'], stops: [['SW2', 't', 'tagged-not-admitted'], null] },
  { code: 'trunk-is-access', fixture: () => two(), site: { device: 'SW2', port: 't', changed: 1 },
    expected(c) { c.SW2.ports.t = { mode: 'access', vlan: 1 }; }, pair: ['PC1', 'PC3'], stops: [['SW2', 't', 'tagged-not-admitted'], ['SW2', 't', 'not-allowed-out']] },
  { code: 'access-frame-types', vendor: 'routeros', fixture: () => two('routeros'), site: { device: 'SW1', port: 'a' },
    expected(c) { c.SW1.ports.a.frameTypes = 'admit-only-vlan-tagged'; }, pair: ['PC1', 'PC3'], stops: [['SW1', 'a', 'untagged-not-admitted'], null] },
  { code: 'native-mismatch', fixture: () => { const f = two(); f.baseline.SW1.ports.t.native = 10; f.baseline.SW2.ports.t.native = 10; return f; },
    site: { device: 'SW2', port: 't', changed: 20 }, expected(c) { c.SW2.ports.t.native = 20; },
    pair: ['PC1', 'PC3'], stops: [['SW2', 'a', 'not-allowed-out'], null], leak: ['PC1', 'PC4'] },
  { code: 'parent-shutdown', fixture: () => stick(), site: { device: 'R1', port: 'r' }, expected(c) { c.R1.interfaces.r.up = false; },
    pair: ['PC1', 'PC2'], stops: [['R1', 'r', 'interface-down'], ['R1', 'r', 'interface-down']] },
  { code: 'wrong-encapsulation', fixture: () => stick(), site: { device: 'R1', port: 'r', index: 0, changed: 30 }, expected(c) { c.R1.subifs[0].vid = 30; },
    pair: ['PC1', 'PC2'], stops: [['R1', 'r', 'no-subinterface'], ['SW1', 't', 'not-member']] },
  { code: 'wrong-encapsulation', vendor: 'routeros', fixture: () => stick('routeros'), site: { device: 'R1', port: 'r', index: 0, changed: 30 }, expected(c) { c.R1.vlanIfs[0].vid = 30; },
    pair: ['PC1', 'PC2'], stops: [['R1', 'r', 'no-subinterface'], ['SW1', 't', 'not-member']] },
  { code: 'router-address-wrong-network', fixture: () => stick(), site: { device: 'R1', port: 'r', index: 0, changed: '10.10.30.1' }, expected(c) { c.R1.subifs[0].ip = '10.10.30.1'; },
    pair: ['PC1', 'PC2'], stops: [null, ['R1', 'r', 'no-route']] },
  { code: 'router-address-wrong-network', vendor: 'routeros', fixture: () => stick('routeros'), site: { device: 'R1', port: 'ten', index: 0, changed: '10.10.30.1' }, expected(c) { c.R1.addresses[0].ip = '10.10.30.1'; },
    pair: ['PC1', 'PC2'], stops: [null, ['R1', 'r', 'no-route']] },
  { code: 'vlan-if-on-bridge-port', vendor: 'routeros', fixture: () => stick('routeros', true), site: { device: 'R1', port: 'r', index: 0 }, expected(c) { c.R1.vlanIfs[0].on = 'r'; },
    pair: ['PC1', 'PC2'], stops: [['R1', 'r', 'vlan-on-bridge-port'], ['R1', 'r', 'vlan-on-bridge-port']] },
  { code: 'bridge-not-tagged', vendor: 'routeros', fixture: () => stick('routeros', true), site: { device: 'R1', port: 'bridge1', index: 0, vid: 10 }, expected(c) { c.R1.vlans[0].tagged = ['r']; },
    pair: ['PC1', 'PC2'], stops: [['R1', 'bridge', 'bridge-cpu-not-tagged'], ['R1', 'bridge', 'bridge-cpu-not-tagged']] },
];

// Filtering off need not break any expected ping: the middle switch's two
// PCs are in a local-only VLAN, while VLANs 10/20 transit it with tags intact.
export function transparentTransit() {
  const f = two('routeros');
  f.task.vids = [10, 20, 30];
  Object.assign(f.task.goals, { PC5: 30, PC6: 30 });
  f.task.topology.devices.push(device('MID', 'switch', ['left', 'right', 'a', 'b']), device('PC5', 'host', ['nic']), device('PC6', 'host', ['nic']));
  f.task.topology.hosts.push(host('PC5', '10.0.30.15'), host('PC6', '10.0.30.16'));
  f.task.topology.links.find(l => l.a.device === 'SW1' && l.b.device === 'SW2').b = { device: 'MID', port: 'left' };
  f.task.topology.links.push(link('MID', 'right', 'SW2', 't'), link('PC5', 'nic', 'MID', 'a'), link('PC6', 'nic', 'MID', 'b'));
  f.baseline.MID = { filtering: true,
    ports: {
      left: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' }, right: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' },
      a: { pvid: 30, frameTypes: 'admit-only-untagged-and-priority-tagged' }, b: { pvid: 30, frameTypes: 'admit-only-untagged-and-priority-tagged' },
    }, vlans: [
      { vids: [10], tagged: ['left', 'right'], untagged: [] }, { vids: [20], tagged: ['left', 'right'], untagged: [] },
      { vids: [30], tagged: [], untagged: ['a', 'b'] },
    ],
  };
  return f;
}
