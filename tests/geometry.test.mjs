import test from 'node:test';
import assert from 'node:assert/strict';
import { diagramGeometry, layoutRouters, DIAGRAM_FONT, DIAGRAM_R, mixHex } from '../src/ui/topology/geometry.js';

test('shared geometry uses caller topology and leaves its inputs unchanged', () => {
  const task = { routers: { R1: {}, R2: {} } };
  const a = { router: 'R1', name: 'port-A', ip: '10.0.0.1/30' };
  const b = { router: 'R2', name: 'port-B', ip: '10.0.0.2/30' };
  const topology = {
    links: [{ from: 'R1', to: 'R2', network: '10.0.0.0/30', a, b }],
    endpoints: [{ router: 'R1', name: 'local-port', ip: '192.168.1.1/24', type: 'lan', note: 'Test LAN' }],
  };
  const before = structuredClone({ task, topology });
  const freeze = value => {
    Object.values(value).forEach(child => { if (child && typeof child === 'object') freeze(child); });
    return Object.freeze(value);
  };
  freeze(task); freeze(topology);
  assert.deepEqual(layoutRouters(task, topology.links), {
    mode: 'chain', pos: { R1: { x: 14, y: 40 }, R2: { x: 86, y: 40 } },
  });
  const geo = diagramGeometry(task, topology);
  assert.equal(geo.mode, 'chain');
  assert.deepEqual(geo.clashes, []);
  assert.equal(geo.links[0].label.lines[1].text, 'port-A.1↔port-B.2');
  assert.equal(geo.links[0].label.lines[0].size, DIAGRAM_FONT.net);
  assert.equal(geo.routers[0].r, DIAGRAM_R.router);
  assert.equal(geo.endpoints[0].label, 'Test LAN');
  assert.equal(geo.endpoints[0].port.text, 'local-port');
  assert.deepEqual(diagramGeometry(task, topology), geo);
  assert.deepEqual({ task, topology }, before);
});

test('shared geometry accepts the app parser for provider labels', () => {
  const task = { routers: { R1: {} } };
  const topology = { links: [], endpoints: [
    { router: 'R1', name: 'wan-port', ip: 'provider-address/30', type: 'internet', note: 'ISP 2' },
  ] };
  const geo = diagramGeometry(task, topology, address => {
    assert.equal(address, 'provider-address');
    return 0x01010101;
  });
  assert.equal(geo.endpoints[0].label, 'ISP2');
  assert.equal(geo.endpoints[0].lines[1].text, '1.1.1.0');
  assert.equal(geo.endpoints[0].port, null);
});

test('shared mixHex keeps opaque theme blending', () => {
  assert.equal(mixHex('#a78bfa', '#050a14', 0.2), '#252442');
  assert.equal(mixHex('#00d4ff', '#f7fafd', 0.2), '#c6f2fd');
  assert.equal(mixHex('#123456', '#abcdef', 0), '#abcdef');
  assert.equal(mixHex('#123456', '#abcdef', 1), '#123456');
});

// Round 4 (spec R1, v2 M3): the routing diagram's own labels go through the
// caller (screens/diagramTopology.js); without them, the output is unchanged
// (the first test above pins the round 1 «port.octet» label).
test('shared geometry, round 4: a caller\'s box text, port text and full link ends', () => {
  const task = { routers: { R1: {}, R2: {} } };
  const a = { router: 'R1', name: 'g0/1', ip: '10.0.0.1/30' };
  const b = { router: 'R2', name: 'g0/0', ip: '10.0.0.2/30' };
  const topology = {
    links: [{ from: 'R1', to: 'R2', network: '10.0.0.0/30', a, b, full: true }],
    endpoints: [{ router: 'R1', name: 'g0/0', ip: '192.168.1.1/24', type: 'lan', note: 'LAN-A', shown: '192.168.1.0', portLines: ['g0/0', '.1'] }],
  };
  const geo = diagramGeometry(task, topology);
  assert.deepEqual(geo.clashes, []);
  assert.equal(geo.links[0].label.lines[1].text, '10.0.0.1 ↔ 10.0.0.2', 'both ends in full, the left router\'s first');
  assert.deepEqual(geo.links[0].label.ends, [{ router: 'R1', ip: '10.0.0.1' }, { router: 'R2', ip: '10.0.0.2' }]);
  assert.equal(geo.endpoints[0].lines[1].text, '192.168.1.0', 'the box shows the caller\'s text (the network)');
  assert.equal(geo.endpoints[0].lines[2].text, '/24');
  assert.deepEqual([geo.endpoints[0].port.text, geo.endpoints[0].port.lines], ['g0/0 .1', ['g0/0', '.1']], 'the port label: name over the port\'s own address');
  // Reversed: the left router is still first.
  const back = diagramGeometry(task, { ...topology, links: [{ from: 'R2', to: 'R1', network: '10.0.0.0/30', a: b, b: a, full: true }] });
  assert.equal(back.links[0].label.lines[1].text.split(' ↔ ').length, 2);
  assert.ok(['10.0.0.1 ↔ 10.0.0.2', '10.0.0.2 ↔ 10.0.0.1'].includes(back.links[0].label.lines[1].text));
  const left = back.routers.reduce((l, r) => (r.x < l.x ? r : l));
  assert.equal(back.links[0].label.ends[0].router, left.name, 'the first address is the left router\'s');
});

test('routing diagram labels (diagramTopology): every bank task, both syntaxes, no clash, networks and gateways', async () => {
  const { diagramTopology } = await import('../src/sections/routing/screens/diagramTopology.js');
  const routing = (await import('../src/sections/routing/logic/static.js')).default;
  const bank = await import('../src/banks/routing/tasks.js');
  const { NETGYM_DIAGRAM_FONT } = await import('../src/ui/topology/geometry.js');
  const { network } = await import('../src/engine/ip.js');
  for (const record of bank.tasks) for (const variant of record.variants) for (const syntax of ['cisco', 'routeros']) {
    const task = routing.create(record, { variantId: variant.id, bank, bankId: bank.bankId, bankRevision: bank.bankRevision });
    const topo = diagramTopology(task.network, syntax);
    const geo = diagramGeometry(topo, topo, undefined, NETGYM_DIAGRAM_FONT);
    assert.deepEqual(geo.clashes, [], `${variant.code} ${syntax}`);
    for (const e of geo.endpoints.filter(x => x.type !== 'internet' && String(x.ep.ip).includes('/'))) {
      const [ip, prefix] = e.ep.ip.split('/');
      assert.equal(e.lines[1].text, network(ip, Number(prefix)), `${variant.code}: a LAN shows its network`);
      assert.deepEqual(e.port.lines, [e.ep.name, `.${ip.split('.').pop()}`]);
    }
    for (const e of geo.endpoints.filter(x => x.type === 'internet' && String(x.ep.ip).includes('/'))) {
      const isp = task.network.devices.find(d => d.kind !== 'router' && d.interfaces.some(f => f.address && network(f.address.ip, f.address.prefix) === network(...e.ep.ip.split('/').map((v, i) => (i ? Number(v) : v)))));
      if (isp) assert.ok(e.lines[1].text.startsWith('шлюз ') && e.lines[1].text.endsWith(isp.interfaces[0].address.ip), `${variant.code}: the ISP's gateway`);
    }
    for (const l of geo.links) assert.match(l.label.lines[1].text, /^\d+\.\d+\.\d+\.\d+ ↔ \d+\.\d+\.\d+\.\d+$/);
  }
});
