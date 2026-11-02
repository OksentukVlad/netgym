import test from 'node:test';
import assert from 'node:assert/strict';
import { render } from '../src/sections/vlan/logic/render.js';
import * as predict from '../src/sections/vlan/logic/predict.js';
import { record } from '../src/banks/vlan/predict.js';

test('F6/F7/W3: exact RouterOS reference command order, explicit members, filtering last', () => {
  const config = { SW1: { filtering: true, ports: {
    ether1: { pvid: 1, frameTypes: 'admit-only-vlan-tagged' },
    ether2: { pvid: 20, frameTypes: 'admit-only-untagged-and-priority-tagged' },
  }, vlans: [{ vids: [20], tagged: ['ether1'], untagged: ['ether2'] }] } };
  assert.equal(render(config, 'routeros').SW1, [
    '/interface bridge add name=bridge1 frame-types=admit-only-vlan-tagged vlan-filtering=no',
    '/interface bridge port add bridge=bridge1 interface=ether1 pvid=1 frame-types=admit-only-vlan-tagged',
    '/interface bridge port add bridge=bridge1 interface=ether2 pvid=20 frame-types=admit-only-untagged-and-priority-tagged',
    '/interface bridge vlan add bridge=bridge1 vlan-ids=20 tagged=ether1 untagged=ether2',
    '/interface bridge set bridge1 vlan-filtering=yes',
  ].join('\n'));
});

test('F10/W2: exact Cisco explicit mode, nonegotiate and allowed-list commands', () => {
  assert.equal(render({ SW1: { vlans: [10, 20], ports: {
    'fa0/3': { mode: 'access', vlan: 10 }, 'gi0/1': { mode: 'trunk', allowed: [10, 20] },
  } } }, 'cisco').SW1, [
    'vlan 10', 'vlan 20', 'interface fa0/3', ' switchport mode access', ' switchport access vlan 10',
    'interface gi0/1', ' switchport mode trunk', ' switchport nonegotiate', ' switchport trunk allowed vlan 10,20',
  ].join('\n'));
});

test('renderer respects empty/all allowed lists, incomplete modes and filtering off', () => {
  assert.match(render({ S: { ports: { t: { mode: 'trunk', allowed: [] } } } }, 'cisco').S, /allowed vlan none$/);
  assert.match(render({ S: { ports: { t: { mode: 'trunk', allowed: 'all' } } } }, 'cisco').S, /allowed vlan all$/);
  // A port with no mode has nothing to configure: no bare interface stanza (fix brief 6).
  assert.equal(render({ S: { ports: { a: { mode: null } } } }, 'cisco').S, '');
  assert.equal(render({ S: { vlans: [10], ports: { a: { mode: null }, b: { mode: 'access', vlan: 10 } } } }, 'cisco').S, 'vlan 10\ninterface b\n switchport mode access\n switchport access vlan 10');
  assert.match(render({ S: { filtering: false, ports: {}, vlans: [] } }, 'routeros').S, /set bridge1 vlan-filtering=no$/);
  assert.throws(() => render({}, 'other'), /invalid-config/);
});
for (const vendor of ['cisco', 'routeros']) test(`predict renderer uses given ${vendor} configurations with syntax labels`, () => {
  const task = predict.create(record, { variantId: 'p2', vendor });
  const commands = predict.render(task);
  assert.deepEqual(Object.keys(commands), ['SW1', 'SW2']);
  assert.doesNotMatch(commands.SW1, /interface=a\d|interface a\d|interface=t1|interface t1/);
  assert.match(commands.SW1, vendor === 'cisco' ? /interface gi0\/1/ : /interface=ether1/);
});
