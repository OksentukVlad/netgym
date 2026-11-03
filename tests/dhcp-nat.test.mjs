import test from 'node:test';
import assert from 'node:assert/strict';
import * as nat from '../src/sections/dhcp/logic/nat.js';
import { createTopology } from '../src/sections/dhcp/logic/scenario.js';
import { contains } from '../src/engine/ip.js';

const website = vendor => nat.createRound(0, { vendor })[0];

test('NAT contract: TCP/UDP/ICMP translate without collisions, preserving ports/ids, remote endpoints and inputs', () => {
  for (const vendor of ['cisco', 'mikrotik']) for (const protocol of ['tcp', 'udp', 'icmp']) {
    const c = website(vendor), packet = { ...c.packet, protocol }, before = structuredClone({ packet, config: c.config });
    const { translated, entry } = nat.translate(packet, c.config);
    assert.equal(translated.src.address, '203.0.113.2'); assert.equal(translated.src.port, 51000);
    assert.deepEqual(translated.dst, packet.dst);
    assert.deepEqual(entry, { protocol, inside: packet.src, outside: translated.src, remote: packet.dst });
    const reply = nat.replyPacket(translated), restored = nat.reverse(reply, [entry]);
    assert.deepEqual(restored.src, reply.src); assert.deepEqual(restored.dst, packet.src);
    translated.src.address = '10.0.0.2'; entry.inside.address = '10.0.0.3';
    assert.deepEqual({ packet, config: c.config }, before);
  }
});

test('NAT reverse matches protocol, outside address/port and remote address/port; all wrong tuples and missing entries return null', () => {
  const c = website('cisco'), { translated, entry } = nat.translate(c.packet, c.config), reply = nat.replyPacket(translated);
  const variants = [
    { ...reply, protocol: 'udp' },
    { ...reply, dst: { ...reply.dst, port: 51001 } },
    { ...reply, dst: { ...reply.dst, address: '203.0.113.3' } },
    { ...reply, src: { ...reply.src, port: 80 } },
    { ...reply, src: { ...reply.src, address: '203.0.113.81' } },
  ];
  for (const wrong of variants) assert.equal(nat.reverse(wrong, [entry]), null);
  for (const table of [[], null, [null], [{}]]) assert.equal(nat.reverse(reply, table), null);
  const before = structuredClone({ reply, entry });
  const good = nat.reverse(reply, [null, {}, entry]);
  assert.equal(good.src.address, '203.0.113.80'); assert.equal(good.dst.address, c.packet.src.address);
  assert.deepEqual({ reply, entry }, before);
});

test('NAT only translates routed outside traffic from an inside interface AND network', () => {
  const c = website('cisco');
  assert.equal(nat.translate({ ...c.packet, egress: 'g0/1' }, c.config).reason, 'not-outside');
  assert.equal(nat.translate({ ...c.packet, ingress: 'g0/0' }, c.config).reason, 'no-match');
  assert.equal(nat.translate({ ...c.packet, src: { address: '192.168.99.10', port: 51000 } }, c.config).reason, 'no-match');
  assert.equal(nat.translate(c.packet, { ...c.config, match: { acl: [{ network: '192.168.99.0', wildcard: '0.0.0.255' }] } }).reason, 'no-match');
  assert.equal(nat.translate({}, c.config).translated, null);
});

test('bounded vendor parsers fail closed without throwing; mask-as-wildcard is parsed as legal wildcard bits', () => {
  const c = website('cisco');
  for (const text of [null, '', 'access-list 2 permit 192.168.88.0 0.0.0.255', 'access-list 1 permit 999.1.1.1 0.0.0.255', 'access-list 1 permit 192.168.88.0 0.0.0.255\ndeny any']) assert.equal(nat.parseCiscoAcl(text, c.config).ok, false);
  assert.equal(nat.parseCiscoAcl('access-list 1 permit 192.168.88.0 255.255.255.0', c.config).ok, true);
  assert.equal(nat.parseCiscoInside('g0/1', c.config).ok, false);
  const m = website('mikrotik');
  for (const text of [null, '', '/ip firewall nat add chain=dstnat action=masquerade out-interface-list=WAN', '/ip firewall nat add chain=srcnat action=masquerade in-interface-list=WAN', '/ip firewall nat add chain=srcnat action=masquerade out-interface-list=BOGUS', '/ip firewall nat add chain=srcnat chain=srcnat action=masquerade out-interface-list=WAN', '/ip firewall nat add chain=srcnat action=masquerade src-address=bad out-interface-list=WAN']) assert.equal(nat.parseMikrotikRule(text, m.config).ok, false);
  assert.equal(nat.aclMatches('192.168.88.10', { network: '192.168.88.0', wildcard: '0.0.0.255' }), true);
  assert.equal(nat.aclMatches('192.168.89.10', { network: '192.168.88.0', wildcard: '0.0.0.255' }), false);
  assert.equal(nat.aclMatches('192.168.88.10', { network: '192.168.88.0', wildcard: '255.255.255.0' }), false);
});

test('E3 L1 has three cards with website first, server only on its card; every choice is evaluated', () => {
  for (let seed = 0; seed < 20; seed++) for (const vendor of ['cisco', 'mikrotik']) for (const otherAddresses of [false, true]) {
    const round = nat.createRound(seed, { vendor, otherAddresses });
    assert.deepEqual(round, nat.createRound(seed, { vendor, otherAddresses }));
    assert.equal(round.length, 3); assert.equal(round[0].id, 'website');
    for (const card of round) {
      assert.equal(card.topology.showServer, card.id === 'server');
      assert.match(card.task, /NAT увімкнено лише на R1; провайдер адрес не перекладає/);
      assert.equal(card.choices.length, 3);
      for (const choice of card.choices) assert.equal(nat.checkCard(card, choice.id).ok, choice.id === (card.id === 'website' ? 'wan' : 'pc'));
      if (card.id === 'website') {
        for (const choice of card.replyChoices) assert.equal(nat.checkCard(card, choice.id, { step: 'reply' }).ok, choice.id === 'pc');
        const replay = nat.replay(card);
        assert.equal(replay.steps.length, 4);
        assert.equal(replay.steps[3].packet.src.address, card.topology.website);
        assert.equal(replay.steps[3].packet.dst.address, card.topology.pc);
        assert.match(replay.steps[3].caption, new RegExp(card.topology.website.replaceAll('.', '\\.')));
        assert.deepEqual(replay.steps.map(s => s.highlight.value), [card.topology.pc, card.topology.wan, card.topology.website, card.topology.pc]);
      } else { assert.equal(card.replyChoices.length, 0); assert.equal(nat.replay(card), null); }
    }
  }
});

test('E3 L2 every option passes its parser and is evaluated through the model, with one correct per task', () => {
  for (let seed = 0; seed < 60; seed++) for (const vendor of ['cisco', 'mikrotik']) for (const otherAddresses of [false, true]) for (const twoLans of [false, true]) {
    const args = { vendor, otherAddresses, twoLans }, task = nat.createL2(seed, args), before = structuredClone(task);
    assert.deepEqual(task, nat.createL2(seed, args));
    assert.equal(task.options.length, 3);
    const outcomes = task.options.map(option => {
      assert.ok(option.purpose.length <= 48);
      const parsed = vendor === 'cisco' ? nat.parseCiscoAcl(option.command, task.config) : nat.parseMikrotikRule(option.command, task.config);
      assert.equal(parsed.ok, true, option.command);
      const checked = nat.checkL2(task, option.id);
      assert.equal(checked.outcomes.length, task.packets.length);
      assert.deepEqual(checked.outcomes, task.packets.map(packet => nat.translate(packet, parsed.config)));
      return checked.ok;
    });
    assert.equal(outcomes.filter(Boolean).length, 1);
    assert.equal(nat.checkL2(task, vendor === 'cisco' ? 'exact' : 'wan').ok, true);
    if (vendor === 'cisco') {
      assert.match(task.given, /ip nat inside source list 1 interface g0\/0 overload/);
      for (const option of task.insideOptions) assert.equal(nat.checkL2(task, option.id, { step: 'inside' }).ok, option.id === 'lan');
      if (twoLans) {
        assert.equal(task.options.find(o => o.id === 'exact').command.split('\n').length, 2);
        const missing = nat.checkL2(task, 'other');
        assert.notEqual(missing.outcomes[0].translated, null); assert.equal(missing.outcomes[1].reason, 'no-match');
      }
    }
    assert.deepEqual(task, before);
  }
});

test('E3 exact selection rejects broader/narrower/different wildcard sets even when the sample PC matches', () => {
  const task = nat.createL2(0), broad = 'access-list 1 permit 192.168.88.0 0.0.1.255';
  const result = nat.checkL2Command(task, broad);
  assert.notEqual(result.outcomes[0].translated, null); assert.equal(result.ok, false);
  assert.equal(nat.checkL2Command(task, 'access-list 1 permit 192.168.88.0 0.0.0.127').ok, false);
});

test('DHCP topology has the documented WAN /30 and remote DNS/site via the ISP gateway', () => {
  const t = createTopology();
  assert.equal(t.wan, '203.0.113.2'); assert.equal(t.wanPrefix, 30);
  assert.equal(contains(t.wan, t.wanPrefix, t.ispGateway), true);
  for (const address of [t.website, ...t.providerDns]) assert.equal(contains(t.wan, t.wanPrefix, address), false);
});
