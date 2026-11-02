// Hand-written inputs AND expected outcomes. Never regenerate from an engine.
import { compileCisco, compileRouterOS } from '../../../src/engine/l2.js';
const port = id => ({ id, label: { cisco: id, routeros: id } });
export function stick() {
  return {
    topology: {
      devices: [
        { id: 'SW1', kind: 'switch', ports: ['a', 'b', 't'].map(port) },
        { id: 'R1', kind: 'router', ports: [port('r')] },
        { id: 'PC1', kind: 'host', ports: [port('nic')] },
        { id: 'PC2', kind: 'host', ports: [port('nic')] },
      ],
      links: [
        { a: { device: 'PC1', port: 'nic' }, b: { device: 'SW1', port: 'a' } },
        { a: { device: 'PC2', port: 'nic' }, b: { device: 'SW1', port: 'b' } },
        { a: { device: 'SW1', port: 't' }, b: { device: 'R1', port: 'r' } },
      ],
      hosts: [
        { device: 'PC1', ip: '10.10.10.20', prefix: 24, gateway: '10.10.10.1' },
        { device: 'PC2', ip: '10.10.20.20', prefix: 24, gateway: '10.10.20.1' },
      ],
      attachments: [
        { id: 'r10', device: 'R1', port: 'r', vid: 10, ip: '10.10.10.1', prefix: 24, up: true },
        { id: 'r20', device: 'R1', port: 'r', vid: 20, ip: '10.10.20.1', prefix: 24, up: true },
      ],
    },
    switchConfig: { vlans: [10, 20], ports: { a: { mode: 'access', vlan: 10 }, b: { mode: 'access', vlan: 20 }, t: { mode: 'trunk', allowed: [10, 20] } } },
  };
}
export const tables = f => ({ SW1: compileCisco(f.switchConfig).table, ...(f.routerTable ? { R1: f.routerTable } : {}) });
export function addPeerGateway(f, ip) {
  f.topology.devices.push({ id: 'PC3', kind: 'host', ports: [port('nic')] });
  f.topology.devices[0].ports.push(port('c'));
  f.topology.links.push({ a: { device: 'PC3', port: 'nic' }, b: { device: 'SW1', port: 'c' } });
  f.topology.hosts.push({ device: 'PC3', ip, prefix: 24 });
  f.switchConfig.ports.c = { mode: 'access', vlan: 10 };
}

// Request fixtures test the actual ping3 result, not just the code enum.
export const requestCases = [
  { code: 'ok', mutate() {} },
  { code: 'different-network', mutate(f) { f.topology.hosts[0].prefix = 16; } },
  { code: 'no-gateway', mutate(f) { delete f.topology.hosts[0].gateway; } },
  { code: 'gateway-off-link', mutate(f) { f.topology.hosts[0].gateway = '10.99.0.1'; } },
  { code: 'gateway-unreachable', mutate(f) { f.topology.links.shift(); } },
  { code: 'gateway-not-a-router', mutate(f) { addPeerGateway(f, '10.10.10.30'); f.topology.hosts[0].gateway = '10.10.10.30'; } },
  { code: 'no-l3-interface', mutate(f) { f.switchConfig.ports.a.vlan = 1; f.switchConfig.ports.t.allowed.push(1); } },
  { code: 'no-subinterface', mutate(f) { f.topology.attachments[0].vid = 30; } },
  { code: 'interface-down', mutate(f) { f.topology.attachments[0].up = false; } },
  { code: 'no-route', mutate(f) { f.topology.attachments.splice(1); } },
  { code: 'vlan-on-bridge-port', mutate(f) { f.routerTable = compileRouterOS({ filtering: true, ports: { r: { frameTypes: 'admit-only-vlan-tagged' } }, vlans: [{ vids: [10, 20], tagged: ['r'], untagged: [] }] }).table; } },
  { code: 'bridge-cpu-not-tagged', mutate(f) {
    f.topology.attachments[0].port = 'bridge';
    f.routerTable = compileRouterOS({ filtering: true,
      ports: { r: { frameTypes: 'admit-only-vlan-tagged' } },
      vlans: [{ vids: [10], tagged: ['r'], untagged: [] }],
    }, { bridge: true }).table;
  } },
];

// Request is local L2 by PC1's /16; PC2's /24 requires a gateway for its
// reply. Both PCs are deliberately on the same VLAN. This lets independent
// reply failures occur without sabotaging the request's bidirectional L2.
export function asymmetric() {
  const f = stick();
  f.topology.hosts[0].prefix = 16;
  f.switchConfig.ports.b.vlan = 10;
  f.topology.attachments[1].vid = 10;
  return f;
}
export const replyCases = [
  { code: 'ok', mutate() {} },
  { code: 'different-network', separateVlans: true, mutate(f) { f.topology.hosts[1].prefix = 16; } },
  { code: 'no-gateway', mutate(f) { delete f.topology.hosts[1].gateway; } },
  { code: 'gateway-off-link', mutate(f) { f.topology.hosts[1].gateway = '10.99.0.1'; } },
  { code: 'gateway-unreachable', mutate(f) { f.topology.hosts[1].gateway = '10.10.20.99'; } },
  { code: 'gateway-not-a-router', mutate(f) { addPeerGateway(f, '10.10.20.30'); f.topology.hosts[1].gateway = '10.10.20.30'; } },
  { code: 'no-l3-interface', mutate(f) { f.switchConfig.ports.a.vlan = 1; f.switchConfig.ports.b.vlan = 1; f.switchConfig.ports.t.allowed.push(1); } },
  { code: 'no-subinterface', mutate(f) { f.topology.attachments.forEach(a => a.vid = 30); } },
  { code: 'interface-down', mutate(f) { f.topology.attachments.forEach(a => a.up = false); } },
  { code: 'no-route', mutate(f) { f.topology.attachments.shift(); } },
  { code: 'vlan-on-bridge-port', mutate(f) { f.routerTable = compileRouterOS({ filtering: true, ports: { r: { frameTypes: 'admit-only-vlan-tagged' } }, vlans: [{ vids: [10], tagged: ['r'], untagged: [] }] }).table; } },
  { code: 'bridge-cpu-not-tagged', mutate(f) {
    f.topology.attachments.forEach(a => { a.port = 'bridge'; });
    f.routerTable = compileRouterOS({ filtering: true,
      ports: { r: { frameTypes: 'admit-only-vlan-tagged' } },
      vlans: [{ vids: [10], tagged: ['r'], untagged: [] }],
    }, { bridge: true }).table;
  } },
];

export const expectedWalk = {
  request: { segments: [['PC1', 'r10'], ['r20', 'PC2']], hops: [{ router: 'R1', in: 'r10', out: 'r20' }] },
  reply: { segments: [['PC2', 'r20'], ['r10', 'PC1']], hops: [{ router: 'R1', in: 'r20', out: 'r10' }] },
  requestFirstWire: { device: 'SW1', port: 't', tagged: true, vid: 10 },
  requestSecondWire: { device: 'R1', port: 'r', tagged: true, vid: 20 },
};
export const factMap = {
  G1: 'parent down; request interface-down',
  G2: 'native/main interface and request/reply no-l3-interface',
  G3: 'renamed subinterfaces pass with advice',
  G4: 'SVI database plus member, no up field; allowed-only fails',
  G5: 'Cisco management return requires default gateway',
  G6: 'plain RouterOS physical VLAN attachment',
  G7: 'bridge slave receives nothing, both directions',
  G8: 'explicit/dynamic/absent/untagged CPU membership and injection',
  G9: 'RouterOS management return requires default route',
};

export function management(vendor) {
  const f = stick();
  f.topology.attachments.push({ id: 'r99', device: 'R1', port: 'r', vid: 99, ip: '10.99.0.1', prefix: 24, up: true });
  f.topology.attachments.push({ id: 'management', device: 'SW1', port: vendor === 'cisco' ? 'svi' : 'bridge', vid: 99, ip: '10.99.0.50', prefix: 24, gateway: '10.99.0.1' });
  f.switchConfig.vlans.push(99); f.switchConfig.ports.t.allowed.push(99);
  f.managementTable = vendor === 'cisco' ? compileCisco(f.switchConfig).table : compileRouterOS({
    filtering: true,
    ports: { a: { pvid: 10 }, b: { pvid: 20 }, t: { frameTypes: 'admit-only-vlan-tagged' } },
    vlans: [
      { vids: [10], tagged: ['t'], untagged: ['a'] },
      { vids: [20], tagged: ['t'], untagged: ['b'] },
      { vids: [99], tagged: ['t', 'bridge1'], untagged: [] },
    ],
  }, { bridge: true }).table;
  return f;
}

// G3: literal Cisco rows deliberately use numbers unrelated to the VLAN IDs.
export function numberConvention() {
  const f = stick();
  return {
    task: {
      syntax: 'cisco', taskNumber: 2, topology: f.topology,
      goals: { PC1: 10, PC2: 20 }, management: null,
      assumptions: ['links-up-stp-forwarding', 'connected-only', 'no-proxy-arp'],
      networks: [
        { vid: 10, network: '10.10.10.0', prefix: 24, gateway: '10.10.10.1' },
        { vid: 20, network: '10.10.20.0', prefix: 24, gateway: '10.10.20.1' },
      ],
    },
    answer: {
      SW1: f.switchConfig,
      R1: {
        interfaces: { r: { up: true } },
        subifs: [
          { parent: 'r', number: 777, vid: 10, ip: '10.10.10.1', prefix: 24 },
          { parent: 'r', number: 888, vid: 20, ip: '10.10.20.1', prefix: 24 },
        ],
      },
    },
    expected: { code: 'ok', advice: ['subif-number-differs'], parentDown: 'interface-down' },
  };
}
