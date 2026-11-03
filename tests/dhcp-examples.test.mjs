import test from 'node:test';
import assert from 'node:assert/strict';
import { sidesExample, serverExample, natExample, checkNatExample } from '../src/sections/dhcp/logic/examples.js';
import { cards, check as checkSides } from '../src/sections/dhcp/logic/sides.js';
import { generateScenario, check as checkServer } from '../src/sections/dhcp/logic/server.js';
import { createRound, checkCard, createL2, checkL2Command } from '../src/sections/dhcp/logic/nat.js';
import { contains, maskToPrefix, parseIp } from '../src/engine/ip.js';

const reserved = ip => contains('192.0.2.0', 24, ip) || contains('198.51.100.0', 24, ip);

test('DHCP R4 categorical exception: separate description card solves its own example and never appears in the E1 bank', () => {
  const example = sidesExample();
  assert.equal(checkSides(example.task, example.answer).ok, true);
  const bankText = JSON.stringify(cards);
  for (const text of [example.task.id, example.task.purpose, ...Object.values(example.task.native)]) {
    assert.equal(bankText.includes(text), false, 'no embedded example id or text in any bank card');
  }
  for (const card of cards) {
    assert.notEqual(card.id, example.task.id); assert.notEqual(card.purpose, example.task.purpose);
    for (const vendor of ['cisco', 'mikrotik']) assert.notEqual(card.native[vendor], example.task.native[vendor]);
  }
});

test('DHCP R4 numeric examples contain only reserved addresses/masks, return fresh state and solve their own instances', () => {
  for (const vendor of ['cisco', 'mikrotik']) for (const level of [1, 2, 3]) {
    const make = () => serverExample({ vendor, level }), e = make();
    assert.equal(checkServer(e.task, e.answer).ok, true);
    const ips = JSON.stringify(e).match(/(?:\d{1,3}\.){3}\d{1,3}/g).filter(ip => parseIp(ip));
    for (const ip of ips) assert.ok(reserved(ip) || maskToPrefix(ip) !== null, ip);
    const before = make(); e.task.router = 'edited'; e.rows[0][0] = 'edited';
    assert.deepEqual(make(), before);
    if (vendor === 'cisco' && level === 3) assert.ok(e.answer.exclusions.length);
    if (vendor === 'mikrotik' && level === 3) assert.equal(e.fields.length, 6);
  }
  for (const vendor of ['cisco', 'mikrotik']) for (const level of [1, 2]) {
    const e = natExample({ vendor, level }); assert.equal(checkNatExample(e).ok, true);
    // 0.0.0.255 is the IOS /24 wildcard, not an endpoint address.
    for (const ip of JSON.stringify(e).match(/(?:\d{1,3}\.){3}\d{1,3}/g)) assert.ok(reserved(ip) || maskToPrefix(ip) !== null || ip === '0.0.0.255', ip);
  }
});

test('DHCP R4 checker-based non-transfer for every level/vendor, renumbered tasks and NAT L2 variants', () => {
  for (let seed = 0; seed < 40; seed++) for (const otherAddresses of [false, true]) for (const vendor of ['cisco', 'mikrotik']) {
    for (const level of [1, 2, 3]) {
      const e = serverExample({ vendor, level }), task = generateScenario({ seed, level, vendor, otherAddresses });
      assert.equal(checkServer(task, e.answer).ok, false);
      assert.equal(checkServer(task, e.answer, { step: 'options' }).ok, false);
    }
    const e = natExample({ vendor });
    for (const card of createRound(seed, { vendor, otherAddresses })) assert.equal(checkCard(card, e.answer.source).ok, false);
    assert.equal(checkCard(createRound(seed, { vendor, otherAddresses })[0], e.answer.reply, { step: 'reply' }).ok, false);
    for (const twoLans of [false, true]) {
      const e2 = natExample({ vendor, level: 2 });
      assert.equal(checkL2Command(createL2(seed, { vendor, otherAddresses, twoLans }), e2.answer).ok, false);
    }
  }
});
