import { test } from 'node:test'
import assert from 'node:assert/strict'
import * as ip from '../src/engine/ip.js'

test('toInt and fromInt', () => {
  assert.equal(ip.toInt('10.0.0.1'), 167772161)
  assert.equal(ip.toInt('0.0.0.0'), 0)
  assert.equal(ip.toInt('255.255.255.255'), 4294967295)
  assert.equal(ip.fromInt(167772161), '10.0.0.1')
  assert.equal(ip.fromInt(4294967295), '255.255.255.255')
  for (const bad of ['256.1.1.1', '1.2.3', ' 1.2.3.4x', '1.2.3.4.5', '', 'a.b.c.d', '-1.2.3.4']) {
    assert.equal(ip.toInt(bad), null, bad)
  }
})

test('parseIp normalises and rejects', () => {
  assert.equal(ip.parseIp(' 192.168.001.010 '), '192.168.1.10')
  assert.equal(ip.parseIp('10.0.0.1'), '10.0.0.1')
  assert.equal(ip.parseIp('192,168,1,1'), '192.168.1.1')
  assert.equal(ip.parseIp(' 10,0.0,1 '), '10.0.0.1')
  assert.equal(ip.toInt('192,168,1,1'), null)
  for (const bad of ['192.168.1', '', 'a.b.c.d', '1.2.3.4.5', '-1.2.3.4', '1.2.3.256', null, undefined]) {
    assert.equal(ip.parseIp(bad), null, String(bad))
  }
})

test('parsePrefix accepts /n, n and dotted masks', () => {
  assert.equal(ip.parsePrefix('/24'), 24)
  assert.equal(ip.parsePrefix('24'), 24)
  assert.equal(ip.parsePrefix('255.255.255.0'), 24)
  assert.equal(ip.parsePrefix('/0'), 0)
  assert.equal(ip.parsePrefix('0.0.0.0'), 0)
  assert.equal(ip.parsePrefix('255.255.255.255'), 32)
  for (const bad of ['255.255.255.232', '33', '-1', 'abc', '/33', '']) {
    assert.equal(ip.parsePrefix(bad), null, bad)
  }
})

test('prefix and mask conversion', () => {
  assert.equal(ip.prefixToMask(26), '255.255.255.192')
  assert.equal(ip.prefixToMask(23), '255.255.254.0')
  assert.equal(ip.prefixToMask(0), '0.0.0.0')
  assert.equal(ip.prefixToMask(32), '255.255.255.255')
  assert.equal(ip.maskToPrefix('255.255.255.192'), 26)
  assert.equal(ip.maskToPrefix('0.0.0.0'), 0)
  assert.equal(ip.maskToPrefix('255.255.255.232'), null)
  assert.equal(ip.maskToPrefix('255.0.255.0'), null)
})

test('block size and host count', () => {
  assert.equal(ip.blockSize(26), 64)
  assert.equal(ip.blockSize(24), 256)
  assert.equal(ip.blockSize(30), 4)
  assert.equal(ip.blockSize(23), 512)
  assert.equal(ip.hostCount(26), 62)
  assert.equal(ip.hostCount(30), 2)
  assert.equal(ip.hostCount(24), 254)
  assert.equal(ip.hostCount(23), 510)
  assert.equal(ip.hostCount(31), 0)
  assert.equal(ip.hostCount(32), 0)
})

test('network, broadcast and host range', () => {
  assert.equal(ip.network('192.168.10.77', 26), '192.168.10.64')
  assert.equal(ip.broadcast('192.168.10.77', 26), '192.168.10.127')
  assert.equal(ip.firstHost('192.168.10.77', 26), '192.168.10.65')
  assert.equal(ip.lastHost('192.168.10.77', 26), '192.168.10.126')
  assert.equal(ip.network('172.16.37.200', 27), '172.16.37.192')
  assert.equal(ip.broadcast('172.16.37.200', 27), '172.16.37.223')
  assert.equal(ip.network('172.16.44.201', 21), '172.16.40.0')
  assert.equal(ip.broadcast('172.16.44.201', 21), '172.16.47.255')
  assert.equal(ip.network('10.0.5.200', 23), '10.0.4.0')
  assert.equal(ip.network('8.8.8.8', 0), '0.0.0.0')
  assert.equal(ip.network('10.0.255.255', 16), '10.0.0.0')
  assert.equal(ip.broadcast('10.0.255.200', 23), '10.0.255.255')
  assert.equal(ip.firstHost('10.0.0.1', 31), null)
  assert.equal(ip.lastHost('10.0.0.1', 32), null)
})

test('bad prefixes and addresses give null', () => {
  for (const p of [24.5, -1, 33, '24', null]) {
    assert.equal(ip.network('10.0.0.1', p), null, String(p))
    assert.equal(ip.broadcast('10.0.0.1', p), null, String(p))
  }
  assert.equal(ip.network('10.0.0.256', 24), null)
  assert.equal(ip.sameNetwork('10.0.0.1', 'x', 24), null)
  assert.equal(ip.role('10.0.0.1', '10.0.0.0', 40), null)
})

test('membership and roles', () => {
  assert.equal(ip.sameNetwork('10.0.5.200', '10.0.4.15', 23), true)
  assert.equal(ip.sameNetwork('192.168.1.20', '192.168.2.5', 24), false)
  assert.equal(ip.sameNetwork('192.168.8.65', '192.168.8.64', 27), true)
  assert.equal(ip.sameNetwork('192.168.8.96', '192.168.8.64', 27), false)
  assert.equal(ip.sameNetwork('8.8.8.8', '0.0.0.0', 0), true)
  assert.equal(ip.role('192.168.8.64', '192.168.8.64', 27), 'network')
  assert.equal(ip.role('192.168.8.65', '192.168.8.64', 27), 'host')
  assert.equal(ip.role('192.168.8.95', '192.168.8.64', 27), 'broadcast')
  assert.equal(ip.role('192.168.8.96', '192.168.8.64', 27), 'outside')
  assert.equal(ip.isNetworkAddress('192.168.2.0', 24), true)
  assert.equal(ip.isNetworkAddress('192.168.2.1', 24), false)
  assert.equal(ip.isNetworkAddress('10.1.0.0', 22), true)
  assert.equal(ip.isNetworkAddress('10.1.2.0', 22), false)
})

test('smallestPrefixFor', () => {
  assert.equal(ip.smallestPrefixFor(1), 30)
  assert.equal(ip.smallestPrefixFor(2), 30)
  assert.equal(ip.smallestPrefixFor(12), 28)
  assert.equal(ip.smallestPrefixFor(14), 28)
  assert.equal(ip.smallestPrefixFor(15), 27)
  assert.equal(ip.smallestPrefixFor(50), 26)
  assert.equal(ip.smallestPrefixFor(100), 25)
  assert.equal(ip.smallestPrefixFor(254), 24)
  assert.equal(ip.smallestPrefixFor(255), 23)
})

test('contains covers /0, /32 and block edges', () => {
  assert.equal(ip.contains('192.168.1.77', 26, '192.168.1.64'), true)
  assert.equal(ip.contains('192.168.1.77', 26, '192.168.1.127'), true)
  assert.equal(ip.contains('192.168.1.77', 26, '192.168.1.128'), false)
  assert.equal(ip.contains('0.0.0.0', 0, '255.255.255.255'), true)
  assert.equal(ip.contains('255.255.255.255', 32, '255.255.255.255'), true)
  assert.equal(ip.contains('255.255.255.255', 32, '255.255.255.254'), false)
  assert.equal(ip.contains('bad', 24, '10.0.0.1'), null)
  assert.equal(ip.contains('10.0.0.0', 33, '10.0.0.1'), null)
  assert.equal(ip.contains('10.0.0.0', 24, 'bad'), null)
})

test('overlaps is symmetric and checks both prefixes', () => {
  for (const [a, ap, b, bp, expected] of [
    ['10.0.0.0', 24, '10.0.0.129', 25, true],
    ['10.0.0.0', 25, '10.0.0.128', 25, false],
    ['0.0.0.0', 0, '255.255.255.255', 32, true],
    ['255.255.255.255', 32, '255.255.255.254', 32, false],
    ['10.0.0.0', 24, '10.0.1.0', 24, false],
    ['bad', 24, '10.0.0.0', 24, null],
    ['10.0.0.0', -1, '10.0.0.0', 24, null],
    ['10.0.0.0', 24, '10.0.0.0', 33, null],
  ]) {
    assert.equal(ip.overlaps(a, ap, b, bp), expected)
    assert.equal(ip.overlaps(b, bp, a, ap), expected)
  }
})

test('bits8 formats octets and rejects non-octets', () => {
  assert.equal(ip.bits8(0), '00000000')
  assert.equal(ip.bits8(1), '00000001')
  assert.equal(ip.bits8(128), '10000000')
  assert.equal(ip.bits8(255), '11111111')
  for (const bad of [-1, 256, 1.5, '1', null, undefined, NaN]) {
    assert.equal(ip.bits8(bad), null)
  }
})
