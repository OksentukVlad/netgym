// Review counterexamples, hand-written independently of solution()/compilers.
export function managementAnswer(syntax) {
  if (syntax === 'cisco') return {
    SW1: {
      vlans: [200, 100, 40],
      ports: {
        t: { mode: 'trunk', allowed: [200, 100, 40] },
        a1: { mode: 'access', vlan: 200 }, a2: { mode: 'access', vlan: 200 },
        a3: { mode: 'access', vlan: 100 }, a4: { mode: 'access', vlan: 100 },
      },
      svi: { vid: 40, ip: '172.16.100.50', prefix: 24 }, defaultGateway: '172.16.100.1',
    },
    R1: { interfaces: { r: { up: true } }, subifs: [
      { parent: 'r', number: 200, vid: 200, ip: '172.16.113.1', prefix: 24 },
      { parent: 'r', number: 100, vid: 100, ip: '172.16.147.1', prefix: 24 },
      { parent: 'r', number: 40, vid: 40, ip: '172.16.100.1', prefix: 24 },
    ] },
  };
  return {
    SW1: {
      filtering: true,
      ports: {
        t: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' },
        a1: { pvid: 200 }, a2: { pvid: 200 }, a3: { pvid: 100 }, a4: { pvid: 100 },
      },
      vlans: [
        { vids: [200], tagged: ['t'], untagged: ['a1', 'a2'] },
        { vids: [100], tagged: ['t'], untagged: ['a3', 'a4'] },
        { vids: [40], tagged: ['t', 'bridge1'], untagged: [] },
      ],
      vlanIfs: [{ name: 'vlan40', vid: 40, on: 'bridge1' }],
      addresses: [{ iface: 'vlan40', ip: '172.16.100.50', prefix: 24 }],
      routes: [{ dst: '0.0.0.0/0', gateway: '172.16.100.1' }],
    },
    R1: {
      vlanIfs: [
        { name: 'vlan200', vid: 200, on: 'r' }, { name: 'vlan100', vid: 100, on: 'r' },
        { name: 'vlan40', vid: 40, on: 'r' },
      ],
      addresses: [
        { iface: 'vlan200', ip: '172.16.113.1', prefix: 24 },
        { iface: 'vlan100', ip: '172.16.147.1', prefix: 24 },
        { iface: 'vlan40', ip: '172.16.100.1', prefix: 24 },
      ],
    },
  };
}

// Fable: task 4 / seed 3. Removed vlan20; its gateway is directly on ether4.
export function slaveAddressAnswer() {
  return {
    SW1: {
      filtering: true,
      ports: {
        t: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' },
        a2: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' },
        a4: { pvid: 40, frameTypes: 'admit-only-untagged-and-priority-tagged' },
      },
      vlans: [
        { vids: [20], tagged: ['t'], untagged: ['a2'] },
        { vids: [40], tagged: ['t'], untagged: ['a4'] },
      ], vlanIfs: [], addresses: [],
    },
    R1: {
      filtering: true,
      ports: {
        r: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' },
        a1: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' },
        a3: { pvid: 40, frameTypes: 'admit-only-untagged-and-priority-tagged' },
      },
      vlans: [
        { vids: [20], tagged: ['r', 'bridge1'], untagged: ['a1'] },
        { vids: [40], tagged: ['r', 'bridge1'], untagged: ['a3'] },
      ],
      vlanIfs: [{ name: 'vlan40', vid: 40, on: 'bridge1' }],
      addresses: [
        { iface: 'vlan40', ip: '172.16.48.1', prefix: 24 },
        { iface: 'a1', ip: '172.16.191.254', prefix: 24 },
      ],
    },
  };
}
