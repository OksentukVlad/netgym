import { blockSize, fromInt, toInt } from '../../../engine/ip.js';
import { addressMapper, privatePools } from '../../../engine/renumber.js';
import { makeRng } from '../../../engine/rng.js';

export const generatorVersion = 1;

/** A /24 LAN unit preserves offsets and every smaller subnet within it.
 * ISP endpoints remain in TEST-NET-3 (the only task-side public example pool).
 * Reuse the engine's interval mapper instead of replacing dotted text. */
export function lanMapper(seed, otherAddresses = false) {
  const rng = makeRng(`dhcp:lan:${seed}`);
  const pool = rng.pick(privatePools);
  let mapped = otherAddresses
    ? fromInt(toInt(pool.dst) + rng.int(0, blockSize(pool.prefix) / 256 - 1) * 256)
    : '192.168.88.0';
  if (otherAddresses && mapped === '192.168.88.0') mapped = '192.168.89.0';
  return addressMapper([
    { start: toInt('192.168.88.0'), end: toInt('192.168.89.0'), mapped },
    { start: toInt('203.0.113.0'), end: toInt('203.0.114.0'), mapped: '203.0.113.0' },
  ]);
}

export function createTopology(seed = 0, { otherAddresses = false } = {}) {
  const map = lanMapper(seed, otherAddresses);
  return {
    network: map('192.168.88.0', 24), prefix: 24,
    pc: map('192.168.88.10'), router: map('192.168.88.1'), server: map('192.168.88.20'),
    wan: '203.0.113.2', wanPrefix: 30, ispGateway: '203.0.113.1', website: '203.0.113.80',
    providerDns: ['203.0.113.53', '203.0.113.54'],
    ports: { cisco: { lan: 'g0/1', wan: 'g0/0' }, mikrotik: { lan: 'bridge', wan: 'ether1' } },
  };
}
