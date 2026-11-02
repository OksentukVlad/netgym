import test from 'node:test';
import assert from 'node:assert/strict';
import { policies, commands, pred, rule, card } from './helpers/firewall.mjs';
import { renderRule, renderPolicy, displayCard } from '../src/sections/firewall/logic/render.js';
import { t } from '../src/sections/firewall/uk.js';

for (const policy of policies) test(`firewall command goldens: ${policy.id}`, () => {
  const rows = renderPolicy(policy);
  assert.deepEqual(rows.filter(r => r.command).map(r => r.command), commands[policy.id]);
  assert.deepEqual(rows.filter(r => r.command).map(r => r.position), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.deepEqual(rows.slice(-2), [
    { id: 'chain-end:input', chain: 'input', code: 'chain-end-row' },
    { id: 'chain-end:forward', chain: 'forward', code: 'chain-end-row' },
  ]);
  assert.equal(t(rows.at(-1).code), 'кінець списку → пропустити');
});

test('firewall render order, negation, ranges, disabled and row shape', () => {
  const r = rule({
    outInterfaceList: pred('WAN'), outInterface: pred('ether1'), inInterfaceList: { values: ['LAN'], not: true }, inInterface: pred('bridge'),
    dstPort: pred(443, { from: 1000, to: 2000 }), srcPort: pred(50000), dstAddress: pred('203.0.113.0/24'), srcAddress: pred('192.168.88.0/24'),
    protocol: pred('tcp'), connectionNatState: { values: ['dstnat'], not: true }, connectionState: pred('new', 'related'),
  }, 'drop', { enabled: false });
  const row = renderRule(r, 12);
  assert.equal(row.command, '/ip firewall filter add chain=forward action=drop connection-state=new,related connection-nat-state=!dstnat protocol=tcp src-address=192.168.88.0/24 dst-address=203.0.113.0/24 src-port=50000 dst-port=443,1000-2000 in-interface=bridge in-interface-list=!LAN out-interface=ether1 out-interface-list=WAN disabled=yes');
  assert.deepEqual({ position: row.position, chain: row.chain, action: row.action, disabled: row.disabled }, { position: 12, chain: 'forward', action: 'drop', disabled: true });
  assert.deepEqual(row.fields[0], { key: 'connection-state', value: 'new,related' });
});

test('firewall dst-NAT display always distinguishes true, false and unknown without inference', () => {
  const c = card('port-forward');
  assert.equal(t(displayCard(c).dstNat.code, displayCard(c).dstNat.params), 'прокинуто з 100.64.0.2:443');
  c.facts.dstNat = false; delete c.facts.dstNatFrom;
  assert.equal(t(displayCard(c).dstNat.code), 'ні');
  c.facts.dstNat = 'unknown'; assert.equal(t(displayCard(c).dstNat.code), 'невідомо');
  c.facts.dstNat = true; assert.equal(t(displayCard(c).dstNat.code), 'так — порт прокинуто');
});
