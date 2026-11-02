import test from 'node:test';
import assert from 'node:assert/strict';
import { describe, usable, choosePrefixes, defaultAddress } from '../src/sections/ip/logic/calc.js';
import { hostCount, firstHost, lastHost } from '../src/engine/ip.js';
import { renderAddress as cisco } from '../src/engine/vendors/cisco.js';
import { renderAddress as routeros } from '../src/engine/vendors/routeros.js';
import { t } from '../src/sections/ip/uk.js';

// Hand-written independent values; do not derive expectations with engine helpers.
const examples = [
  [0, '0.0.0.0', '255.255.255.255', '0.0.0.1', '255.255.255.254', 4294967294, '0.0.0.0'],
  [1, '128.0.0.0', '255.255.255.255', '128.0.0.1', '255.255.255.254', 2147483646, '128.0.0.0'],
  [7, '192.0.0.0', '193.255.255.255', '192.0.0.1', '193.255.255.254', 33554430, '254.0.0.0'],
  [8, '192.0.0.0', '192.255.255.255', '192.0.0.1', '192.255.255.254', 16777214, '255.0.0.0'],
  [12, '192.160.0.0', '192.175.255.255', '192.160.0.1', '192.175.255.254', 1048574, '255.240.0.0'],
  [16, '192.168.0.0', '192.168.255.255', '192.168.0.1', '192.168.255.254', 65534, '255.255.0.0'],
  [17, '192.168.0.0', '192.168.127.255', '192.168.0.1', '192.168.127.254', 32766, '255.255.128.0'],
  [23, '192.168.10.0', '192.168.11.255', '192.168.10.1', '192.168.11.254', 510, '255.255.254.0'],
  [24, '192.168.10.0', '192.168.10.255', '192.168.10.1', '192.168.10.254', 254, '255.255.255.0'],
  [25, '192.168.10.0', '192.168.10.127', '192.168.10.1', '192.168.10.126', 126, '255.255.255.128'],
  [26, '192.168.10.64', '192.168.10.127', '192.168.10.65', '192.168.10.126', 62, '255.255.255.192'],
  [27, '192.168.10.64', '192.168.10.95', '192.168.10.65', '192.168.10.94', 30, '255.255.255.224'],
  [28, '192.168.10.64', '192.168.10.79', '192.168.10.65', '192.168.10.78', 14, '255.255.255.240'],
  [29, '192.168.10.72', '192.168.10.79', '192.168.10.73', '192.168.10.78', 6, '255.255.255.248'],
  [30, '192.168.10.76', '192.168.10.79', '192.168.10.77', '192.168.10.78', 2, '255.255.255.252'],
  [31, '192.168.10.76', '192.168.10.77', '192.168.10.76', '192.168.10.77', 2, '255.255.255.254'],
  [32, '192.168.10.77', '192.168.10.77', '192.168.10.77', '192.168.10.77', 1, '255.255.255.255'],
];
for (const [prefix, network, end, first, last, count, mask] of examples) test(`calculator /${prefix}: hand-written boundaries, range, count, kind and both masks`, () => {
  const actual = describe('192.168.10.77', prefix);
  assert.deepEqual([actual.network, actual.blockLast, actual.mask, actual.maskCidr], [network, end, mask, `/${prefix}`]);
  const kind = prefix === 32 ? 'host' : prefix === 31 ? 'p2p' : 'lan';
  assert.deepEqual(actual.usable, { first, last, count, kind });
  assert.equal(actual.broadcast, prefix > 30 ? null : end);
  assert.equal(actual.displayCount, prefix === 0 ? null : count);
  assert.equal(actual.hostCount, prefix > 30 ? 0 : count);
  assert.equal(actual.firstHost, prefix > 30 ? null : first);
  assert.equal(actual.lastHost, prefix > 30 ? null : last);
});

test('calculator: every prefix /0–/32 handles both address-space edges without signed overflow', () => {
  for (let p = 0; p <= 32; p++) {
    const low = describe('0.0.0.0', p), high = describe('255.255.255.255', p);
    assert.equal(low.network, '0.0.0.0');
    assert.equal(high.blockLast, '255.255.255.255');
    assert.equal(low.usable.count, p === 32 ? 1 : p === 31 ? 2 : 2 ** (32 - p) - 2);
    assert.equal(high.usable.count, low.usable.count);
    assert.equal(low.commandAddress, null);
    assert.equal(high.commandAddress, null);
    assert.deepEqual(describe('192.168.10.77', `/${p}`), describe('192.168.10.77', p));
  }
});

test('calculator: parsing and arithmetic regressions survive retirement of the legacy UI', () => {
  for (const ip of ['192.168..1', '0xc0.168.1.1', '192.168.1.1e-1', '256.1.1.1', '192. 168.1.1', '-1.2.3.4',
    '1.2.3', '+1.2.3.4', '1.2.3.4.5', '1.2.3.4/24', '1.2.3.4\n5', '']) {
    assert.equal(describe(ip, 24), null, ip);
    assert.equal(usable(ip, 24), null, ip);
  }
  assert.equal(describe(' 192.168.001.010 ', '255.255.255.0').ip, '192.168.1.10');
  assert.equal(describe('192,168,1,10', '/24').ip, '192.168.1.10', 'shared AddressField comma normalisation');
  for (const p of [-1, 33, 24.5, '255.0.255.0', '/33', '', null]) {
    assert.equal(describe('192.168.1.10', p), null);
    assert.equal(usable('192.168.1.10', p), null);
  }
  for (let p = 8; p <= 30; p++) {
    const high = describe('255.255.255.255', p);
    assert.equal(high.usable.last, '255.255.255.254');
    assert.equal(high.usable.count, 2 ** (32 - p) - 2);
  }
});

test('calculator: defaults, choose range, gateway convention and /0 teaching line', () => {
  assert.deepEqual(defaultAddress, { ip: '192.168.1.10', prefix: 24 });
  assert.deepEqual(choosePrefixes, Array.from({ length: 23 }, (_, i) => i + 8));
  assert.equal(describe(defaultAddress.ip, 24).gateway, '192.168.1.1');
  const last = describe(defaultAddress.ip, 24, { gateway: 'last' });
  assert.equal(last.gateway, '192.168.1.254');
  assert.deepEqual(last.commandAddress, { ip: '192.168.1.254', prefix: 24 });
  assert.equal(t(describe('10.0.0.1', 0).noteCode), '/0 — так записують маршрут за замовчуванням');
  assert.match(t('calc.gateway'), /адреса інтерфейсу роутера.*лише поширена домовленість/);
  assert.equal(describe(defaultAddress.ip, 24, { gateway: 'other' }), null);
});

test('calculator: /31 is a pair with no broadcast/dedicated gateway; /32 is one address', () => {
  const pair = describe('10.0.0.1', 31), host = describe('10.0.0.1', 32);
  assert.deepEqual(pair.usable, { first: '10.0.0.0', last: '10.0.0.1', count: 2, kind: 'p2p' });
  assert.equal(pair.broadcast, null);
  assert.equal(pair.gateway, null);
  assert.equal(pair.gateways, null);
  // The entered address is the example's local end (review decision, logged for Vlad).
  assert.deepEqual(pair.commandAddress, { ip: '10.0.0.1', prefix: 31 });
  assert.deepEqual(describe('10.0.0.0', 31).commandAddress, { ip: '10.0.0.0', prefix: 31 });
  assert.deepEqual(pair.knowledge, { kind: 'general-networking', reference: 'RFC 3021' });
  assert.match(t(pair.noteCode), /окрему адресу під шлюз за замовчуванням не відводять/);
  assert.equal(t(pair.commandNoteCode, pair.commandNoteParams), 'У прикладі — введена адреса; інший кінець пари — 10.0.0.0.');
  assert.equal(t('calc.p2p-local', describe('10.0.0.0', 31).commandNoteParams), 'У прикладі — введена адреса; інший кінець пари — 10.0.0.1.');
  assert.deepEqual(host.usable, { first: '10.0.0.1', last: '10.0.0.1', count: 1, kind: 'host' });
  assert.equal(host.broadcast, null);
  assert.deepEqual(host.commandVendors, ['cisco']);
  assert.equal(t(host.noteCode), 'Одна адреса (наприклад loopback або маршрут до одного хоста).');
  for (const p of [31, 32]) {
    assert.equal(hostCount(p), 0, 'engine LAN count remains unchanged');
    assert.equal(firstHost('10.0.0.1', p), null);
    assert.equal(lastHost('10.0.0.1', p), null);
  }
});

test('calculator and vendors: command examples omitted for /0–/7 and special ranges', () => {
  for (const ip of ['0.0.0.1', '0.9.8.7', '127.0.0.1', '127.255.255.254', '169.254.1.10', '224.0.0.1', '239.255.255.254', '240.0.0.1', '255.255.255.255']) {
    for (const prefix of [8, 16, 24, 30, 31, 32]) {
      const model = describe(ip, prefix);
      assert.equal(model.commandAddress, null);
      assert.deepEqual(model.commandVendors, []);
      assert.equal(t(model.commandNoteCode), 'Для цієї адреси приклад конфігурації не показуємо.');
      assert.equal(cisco({ ip, prefix }), null);
      assert.equal(routeros({ ip, prefix }), null);
    }
  }
  for (let prefix = 0; prefix < 8; prefix++) {
    assert.equal(describe('10.0.0.1', prefix).commandAddress, null);
    assert.equal(cisco({ ip: '10.0.0.1', prefix }), null);
    assert.equal(routeros({ ip: '10.0.0.1', prefix }), null);
  }
});
