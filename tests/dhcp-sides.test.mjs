import test from 'node:test';
import assert from 'node:assert/strict';
import { cards, cardBank, createRound, check } from '../src/sections/dhcp/logic/sides.js';
import { createTopology } from '../src/sections/dhcp/logic/scenario.js';
import { natNotes, sideCards, wizard } from '../src/sections/dhcp/uk.js';

test('E1: every card has one side, both native lines and correct-side feedback even on a wrong answer', () => {
  const expected = { 'wan-client': 'WAN', 'wan-route': 'WAN', 'wan-dns': 'WAN', 'lan-address': 'LAN', 'lan-server': 'LAN', 'lan-range': 'LAN', 'lan-gateway': 'LAN', 'lan-dns': 'LAN' };
  assert.equal(cards.length, 8);
  for (const card of cards) {
    assert.equal(card.side, expected[card.id]);
    assert.ok(card.native.cisco && card.native.mikrotik && card.why);
    assert.ok(card.purpose.length <= 48);
    assert.equal(check(card, card.side).ok, true);
    const wrong = check(card, card.side === 'WAN' ? 'LAN' : 'WAN');
    assert.equal(wrong.ok, false);
    assert.equal(wrong.highlight.value, card.side === 'WAN' ? 'ether1' : 'bridge');
  }
  assert.match(cards.find(c => c.id === 'wan-dns').detail, /203\.0\.113\.53.*WAN/);
  assert.match(sideCards['wan-route'].ciscoNote, /254/);
  assert.match(cards.find(c => c.id === 'wan-route').native.cisco, /опція router/);
  assert.equal(check(cards[0], '').kind, 'info');
});

test('E1: six-card rounds always have all WAN cards, both DNS cards and two other LAN cards', () => {
  const combinations = new Set(), orders = new Set(), before = structuredClone(cards);
  for (let seed = 0; seed < 200; seed++) {
    const round = createRound(seed);
    assert.deepEqual(round, createRound(seed));
    assert.equal(round.length, 6);
    assert.equal(new Set(round.map(c => c.id)).size, 6);
    assert.equal(round.filter(c => c.side === 'WAN').length, 3);
    assert.ok(round.some(c => c.id === 'lan-dns'));
    combinations.add(round.filter(c => c.side === 'LAN' && c.id !== 'lan-dns').map(c => c.id).sort().join());
    orders.add(round.map(c => c.id).join());
  }
  assert.equal(combinations.size, 6);
  assert.ok(orders.size > 100);
  assert.deepEqual(cards, before);
  const changed = cardBank(createTopology(37, { otherAddresses: true }));
  assert.doesNotMatch(changed.find(c => c.id === 'lan-address').native.cisco, /192\.168\.88/);
});

test('DHCP purpose lines fit the shared 48-character contract', () => {
  for (const text of [...Object.values(wizard), ...Object.values(natNotes.purposes)]) assert.ok(text.length <= 48, text);
});
