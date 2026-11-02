/*
 * Hints: mask-block-question { prefix, mask, octet, value, step }; mask-block-size
 * { prefix, size, step, octet }; mask-block-example { ip, prefix, network,
 * broadcast } for a different block. octet is 1-based; step is within that octet.
 * Fit: mask-fit-question { hosts }; mask-fit-capacities {} (the move,
 * without a table of values); mask-fit-example { hosts, prefix }
 * for a different demand and answer prefix.
 * Results: ok, wrong-network, wrong-broadcast for block tasks include
 * fields { network, broadcast } booleans and nextNetwork (broadcast entry is
 * the next block's network), usedPrefix (0..30 matching the given pair, else null).
 * Fit results ok, invalid-prefix, too-small, not-smallest include given (parsed
 * prefix or null), capacity (usable hosts or null), hosts (task's demand).
 * Options: four distinct sorted values per field, including the answer.
 * Block distractors use next/previous/classful boundaries, then two blocks ahead
 * or the next broadcast as fallbacks; fit offers consecutive prefixes in 24..30.
 */
import * as ip from '../../../engine/ip.js'

export const id = 'mask'
export const levels = 3
export const codes = [
  'ok', 'wrong-network', 'wrong-broadcast', 'invalid-prefix', 'too-small', 'not-smallest',
  'mask-block-question', 'mask-block-size', 'mask-block-example',
  'mask-fit-question', 'mask-fit-capacities', 'mask-fit-example',
]

/** Generate a block calculation or smallest-fitting-prefix task. */
export function generate(rng, level) {
  level = Math.max(1, Math.min(levels, level))
  const address = `192.168.${rng.int(0, 255)}.${rng.int(1, 254)}`
  if (level === 2 && rng.int(0, 1) === 1) {
    const prefix = rng.int(25, 30)
    const min = Math.max(2, ip.hostCount(prefix + 1) + 1)
    return { kind: 'fit', ip: address, hosts: rng.int(min, Math.min(120, ip.hostCount(prefix))) }
  }
  const prefix = level === 1 ? rng.int(25, 27) : level === 2 ? rng.int(28, 30) : rng.int(17, 23)
  const start = ip.toInt(ip.network(address, prefix))
  return { kind: 'block', ip: ip.fromInt(start + rng.int(1, ip.blockSize(prefix) - 2)), prefix }
}

/** Check normalised address fields or prefix, returning field-specific feedback. */
export function check(task, answer) {
  const expected = solution(task)
  if (task.kind === 'fit') {
    const prefix = ip.parsePrefix(answer?.prefix)
    const capacity = ip.hostCount(prefix)
    const code = prefix === null ? 'invalid-prefix' : prefix === expected.prefix ? 'ok'
      : capacity < task.hosts ? 'too-small' : 'not-smallest'
    return { ok: code === 'ok', code, given: prefix, capacity, hosts: task.hosts }
  }
  const givenNetwork = ip.parseIp(answer?.network)
  const givenBroadcast = ip.parseIp(answer?.broadcast)
  const fields = { network: givenNetwork === expected.network, broadcast: givenBroadcast === expected.broadcast }
  const code = !fields.network ? 'wrong-network' : !fields.broadcast ? 'wrong-broadcast' : 'ok'
  const next = ip.fromInt(ip.toInt(expected.broadcast) + 1)
  let usedPrefix = null
  for (let prefix = 0; prefix <= 30; prefix++) {
    if (givenNetwork === ip.network(task.ip, prefix) && givenBroadcast === ip.broadcast(task.ip, prefix)) {
      usedPrefix = prefix
      break
    }
  }
  return { ok: code === 'ok', code, fields, nextNetwork: givenBroadcast !== null && givenBroadcast === next, usedPrefix }
}

/** Point to the ruler/demand, describe the move, then use other numbers. */
export function hints(task) {
  if (task.kind === 'fit') {
    const hosts = ip.smallestPrefixFor(task.hosts) === 28 ? 50 : 10
    return [
      { code: 'mask-fit-question', params: { hosts: task.hosts } },
      { code: 'mask-fit-capacities', params: {} },
      { code: 'mask-fit-example', params: { hosts, prefix: ip.smallestPrefixFor(hosts) } },
    ]
  }
  const octet = Math.floor(task.prefix / 8) + 1
  const size = ip.blockSize(task.prefix)
  const address = task.ip.startsWith('198.') ? '203.0.113.77' : '198.51.100.77'
  const examplePrefix = task.prefix === 26 ? 27 : 26
  return [
    { code: 'mask-block-question', params: { prefix: task.prefix, mask: ip.prefixToMask(task.prefix), octet,
      value: Number(task.ip.split('.')[octet - 1]), step: size / 256 ** (4 - octet) } },
    { code: 'mask-block-size', params: { prefix: task.prefix, size, step: size / 256 ** (4 - octet), octet } },
    { code: 'mask-block-example', params: { ip: address, prefix: examplePrefix, network: ip.network(address, examplePrefix), broadcast: ip.broadcast(address, examplePrefix) } },
  ]
}

/** Return the exact block boundaries or the smallest fitting prefix. */
export function solution(task) {
  return task.kind === 'fit' ? { prefix: ip.smallestPrefixFor(task.hosts) }
    : { network: ip.network(task.ip, task.prefix), broadcast: ip.broadcast(task.ip, task.prefix) }
}

/** Offer the answer and classic mistakes, sorted numerically per field. */
export function options(task) {
  const answer = solution(task)
  if (task.kind === 'fit') {
    const start = Math.max(24, Math.min(27, answer.prefix - 1))
    return { prefix: Array.from({ length: 4 }, (_, i) => start + i) }
  }
  const start = ip.toInt(answer.network)
  const size = ip.blockSize(task.prefix)
  const classful = task.prefix >= 25 ? 24 : 16
  const network = [answer.network, ip.fromInt(start + size), ip.fromInt(start - size),
    ip.network(task.ip, classful), ip.fromInt(start + 2 * size)]
  const broadcast = [answer.broadcast, ip.fromInt(start + size), ip.lastHost(task.ip, task.prefix),
    ip.broadcast(task.ip, classful), ip.fromInt(start + 2 * size - 1)]
  const select = (values) => [...new Set(values.filter((value) => value !== null))]
    .slice(0, 4).sort((a, b) => ip.toInt(a) - ip.toInt(b))
  return { network: select(network), broadcast: select(broadcast) }
}
