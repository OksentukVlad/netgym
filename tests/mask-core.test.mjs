// Original mask tests from Vlad's trainer, with only imports relocated.
import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../src/engine/rng.js'
import * as ip from '../src/engine/ip.js'
import * as mask from '../src/sections/ip/logic/mask-core.js'
const SEEDS = Array.from({ length: 60 }, (_, i) => 1000 + i * 151)
const tasks = (logic, level) => SEEDS.map((seed) => logic.generate(makeRng(seed), level))

test('mask: levels', () => {
  for (const t of tasks(mask, 1)) {
    assert.equal(t.kind, 'block')
    assert.ok(t.prefix >= 25 && t.prefix <= 27)
  }
  const kinds = new Set()
  for (const t of tasks(mask, 2)) {
    kinds.add(t.kind)
    if (t.kind === 'block') assert.ok(t.prefix >= 28 && t.prefix <= 30)
    else assert.ok(t.hosts >= 2 && t.hosts <= 120)
  }
  assert.deepEqual([...kinds].sort(), ['block', 'fit'])
  for (const t of tasks(mask, 3)) {
    assert.equal(t.kind, 'block')
    assert.ok(t.prefix >= 17 && t.prefix <= 23)
  }
})

test('mask: hints never contain the broadcast answer', () => {
  for (let level = 1; level <= 3; level++) {
    for (const t of tasks(mask, level).filter((x) => x.kind === 'block')) {
      assert.ok(!JSON.stringify(mask.hints(t)).includes(`"${mask.solution(t).broadcast}"`))
    }
  }
})

test('mask: check codes', () => {
  const block = { kind: 'block', ip: '192.168.10.77', prefix: 26 }
  assert.equal(mask.check(block, { network: '192.168.10.64', broadcast: '192.168.10.127' }).ok, true)
  const nextNet = mask.check(block, { network: '192.168.10.64', broadcast: '192.168.10.128' })
  assert.equal(nextNet.ok, false)
  assert.equal(nextNet.code, 'wrong-broadcast')
  assert.equal(nextNet.nextNetwork, true)
  assert.deepEqual(nextNet.fields, { network: true, broadcast: false })
  const wrongNet = mask.check(block, { network: '192.168.10.0', broadcast: '192.168.10.128' })
  assert.equal(wrongNet.code, 'wrong-network')
  assert.equal(mask.check(block, { network: '192.168.010.064', broadcast: '192.168.10.127' }).ok, true)
  assert.equal(mask.check(block, { network: '192.168.10', broadcast: '192.168.10.127' }).code, 'wrong-network')

  const fit = { kind: 'fit', ip: '192.168.10.77', hosts: 50 }
  assert.equal(mask.check(fit, { prefix: 26 }).ok, true)
  assert.equal(mask.check(fit, { prefix: 27 }).code, 'too-small')
  assert.equal(mask.check(fit, { prefix: 25 }).code, 'not-smallest')
  assert.equal(mask.check(fit, { prefix: '/26' }).ok, true)
  assert.equal(mask.check(fit, { prefix: '255.255.255.192' }).ok, true)
})

test('v3: mask fit covers every answer prefix and explains wrong answers', () => {
  const answers = new Set()
  for (const seed of Array.from({ length: 400 }, (_, i) => 5000 + i)) {
    const t = mask.generate(makeRng(seed), 2)
    if (t.kind === 'fit') answers.add(mask.solution(t).prefix)
  }
  assert.deepEqual([...answers].sort(), [25, 26, 27, 28, 29, 30])
  const fit = { kind: 'fit', ip: '192.168.10.77', hosts: 50 }
  assert.equal(mask.check(fit, { prefix: '' }).code, 'invalid-prefix')
  const small = mask.check(fit, { prefix: 27 })
  assert.equal(small.code, 'too-small')
  assert.equal(small.capacity, 30)
  assert.equal(small.hosts, 50)
  assert.equal(small.given, 27)
  const block = { kind: 'block', ip: '192.168.10.77', prefix: 26 }
  assert.equal(mask.check(block, { network: '192.168.10.0', broadcast: '192.168.10.255' }).usedPrefix, 24)
  assert.equal(mask.check(block, { network: '192.168.10.0', broadcast: '192.168.10.99' }).usedPrefix, null)
})

test('v4: mask options for choose mode', () => {
  const block = { kind: 'block', ip: '192.168.10.77', prefix: 26 }
  assert.deepEqual(mask.options(block), {
    network: ['192.168.10.0', '192.168.10.64', '192.168.10.128', '192.168.10.192'],
    broadcast: ['192.168.10.126', '192.168.10.127', '192.168.10.128', '192.168.10.255'],
  })
  assert.deepEqual(mask.options({ kind: 'fit', ip: '192.168.10.77', hosts: 50 }), { prefix: [25, 26, 27, 28] })
  assert.deepEqual(mask.options({ kind: 'fit', ip: '192.168.10.77', hosts: 2 }), { prefix: [27, 28, 29, 30] })
  const sorted = (list) => list.every((v, i) => i === 0 || ip.toInt(list[i - 1]) < ip.toInt(v))
  for (let level = 1; level <= 3; level++) {
    for (const t of tasks(mask, level)) {
      const opts = mask.options(t)
      assert.deepEqual(mask.options(t), opts)
      const answer = mask.solution(t)
      for (const [field, list] of Object.entries(opts)) {
        assert.equal(list.length, 4)
        assert.equal(new Set(list).size, 4)
        assert.ok(list.includes(answer[field]), `${field} options include the answer`)
        if (field === 'prefix') assert.deepEqual([...list].sort((a, b) => a - b), list)
        else assert.ok(sorted(list) && list.every((v) => ip.parseIp(v) === v))
      }
    }
  }
})

// Original shared tests, restricted to the copied mask exercise.
test('every exercise follows the contract', () => {
  for (const [name, logic] of Object.entries({ mask })) {
    assert.equal(logic.id, name)
    assert.ok(Number.isInteger(logic.levels) && logic.levels >= 1)
    assert.ok(Array.isArray(logic.codes) && logic.codes.includes('ok'))
    for (let level = 1; level <= logic.levels; level++) {
      for (const seed of SEEDS) {
        const task = logic.generate(makeRng(seed), level)
        assert.deepEqual(logic.generate(makeRng(seed), level), task, `${name} L${level} deterministic`)
        assert.deepEqual(JSON.parse(JSON.stringify(task)), task, `${name} L${level} JSON-safe`)
        const hints = logic.hints(task)
        assert.equal(hints.length, 3)
        for (const h of hints) assert.ok(logic.codes.includes(h.code), `${name} hint ${h.code} missing from codes`)
        const results = [logic.check(task, logic.solution(task))]
        for (const result of results) {
          assert.equal(result.ok, true, `${name} L${level} seed ${seed}`)
          assert.ok(logic.codes.includes(result.code), `${name} result ${result.code} missing from codes`)
        }
      }
    }
  }
})

test('v3: out-of-range levels are clamped', () => {
  for (const logic of [mask]) {
    assert.deepEqual(logic.generate(makeRng(77), 99), logic.generate(makeRng(77), logic.levels))
    assert.deepEqual(logic.generate(makeRng(77), 0), logic.generate(makeRng(77), 1))
  }
})

test('v3: hints follow the documented ladder', () => {
  const ladder = {
    mask: { block: ['mask-block-question', 'mask-block-size', 'mask-block-example'], fit: ['mask-fit-question', 'mask-fit-capacities', 'mask-fit-example'] },
  }
  for (const [name, logic] of Object.entries({ mask })) {
    for (let level = 1; level <= logic.levels; level++) {
      for (const t of tasks(logic, level).slice(0, 10)) {
        const want = name === 'mask' ? ladder.mask[t.kind] : ladder[name]
        assert.deepEqual(logic.hints(t).map((h) => h.code), want, `${name} L${level}`)
      }
    }
  }
})
