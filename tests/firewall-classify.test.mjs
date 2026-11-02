import test from 'node:test';
import assert from 'node:assert/strict';
import { topology, clone, card, classify } from './helpers/firewall.mjs';

for (const [id, hook, ingress, egress, ingressLists, egressLists] of [
  ['wan-winbox', 'input', 'ether1', null, ['WAN'], []],
  ['wan-to-router-lan-ip', 'input', 'ether1', null, ['WAN'], []],
  ['lan-winbox', 'input', 'bridge', null, ['LAN'], []],
  ['lan-to-router-wan-ip', 'input', 'bridge', null, ['LAN'], []],
  ['lan-web-out', 'forward', 'bridge', 'ether1', ['LAN'], ['WAN']],
  ['wan-to-pc-new', 'forward', 'ether1', 'bridge', ['WAN'], ['LAN']],
  ['port-forward', 'forward', 'ether1', 'bridge', ['WAN'], ['LAN']],
]) test(`firewall classify: ${id}`, () => {
  assert.deepEqual(classify(topology, card(id)), { hook, ingress, egress, ingressLists, egressLists });
});

test('firewall classify uses longest connected prefix regardless of interface order', () => {
  const t = clone(topology);
  t.router.interfaces.unshift({ id: 'wide', address: '192.168.0.1', prefix: 16 });
  t.router.lists.LAN.push('wide');
  assert.equal(classify(t, card('port-forward')).egress, 'bridge');
  const c = card('port-forward'); c.packet.dstIp = '192.168.44.20';
  assert.equal(classify(t, c).egress, 'wide');
});

test('firewall lists are topology-owned; overlapping memberships are preserved', () => {
  const t = clone(topology); t.router.lists.TRUSTED = ['bridge'];
  assert.deepEqual(classify(t, card('lan-winbox')).ingressLists, ['LAN', 'TRUSTED']);
});

for (const [name, mutate] of [
  ['bridged same-LAN hosts', c => { c.packet.srcIp = '192.168.88.10'; c.packet.dstIp = '192.168.88.20'; c.facts.ingress = 'bridge'; }],
  ['router originated output', c => c.packet.srcIp = '100.64.0.2'],
  ['multicast destination', c => c.packet.dstIp = '224.0.0.1'],
  ['multicast source', c => c.packet.srcIp = '239.0.0.1'],
  ['limited broadcast', c => c.packet.dstIp = '255.255.255.255'],
  ['directed broadcast', c => c.packet.dstIp = '192.168.88.255'],
  ['connected network address', c => c.packet.dstIp = '192.168.88.0'],
  ['unspecified address', c => c.packet.srcIp = '0.0.0.0'],
  ['loopback', c => c.packet.dstIp = '127.0.0.1'],
  ['IPv6', c => c.packet.dstIp = '2001:db8::1'],
  ['fragment field unsupported', c => c.packet.fragment = true],
  ['missing fact', c => delete c.facts.dstNat],
  ['unknown ingress', c => c.facts.ingress = 'ether9'],
  ['wrong protocol', c => c.packet.protocol = 'gre'],
]) test(`firewall classify rejects unsupported ${name}`, () => {
  const c = card('wan-to-pc-new'); mutate(c);
  assert.throws(() => classify(topology, c), /unsupported-packet/);
});

test('firewall classify never derives connection state or dstNat', () => {
  const c = card('port-forward'); c.facts.state = 'unknown'; c.facts.dstNat = 'unknown'; delete c.facts.dstNatFrom;
  assert.equal(classify(topology, c).hook, 'forward');
  assert.equal(c.facts.state, 'unknown'); assert.equal(c.facts.dstNat, 'unknown');
});
