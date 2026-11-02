import { test } from 'node:test'
import assert from 'node:assert/strict'
import { makeRng } from '../src/engine/rng.js'

const draw = (rng, n) => Array.from({ length: n }, () => rng.next())

test('same seed gives the same sequence', () => {
  assert.deepEqual(draw(makeRng(42), 20), draw(makeRng(42), 20))
  assert.deepEqual(draw(makeRng('R3-4821'), 20), draw(makeRng('R3-4821'), 20))
  assert.notDeepEqual(draw(makeRng(1), 20), draw(makeRng(2), 20))
})

test('next is in [0, 1) and int is inclusive', () => {
  const rng = makeRng(7)
  const seen = new Set()
  for (let i = 0; i < 300; i++) {
    const x = rng.next()
    assert.ok(x >= 0 && x < 1)
    const n = rng.int(1, 3)
    assert.ok(Number.isInteger(n) && n >= 1 && n <= 3)
    seen.add(n)
  }
  assert.deepEqual([...seen].sort(), [1, 2, 3])
})

test('pick and shuffle', () => {
  const rng = makeRng(9)
  const items = ['a', 'b', 'c', 'd', 'e']
  assert.ok(items.includes(rng.pick(items)))
  const shuffled = rng.shuffle(items)
  assert.notEqual(shuffled, items)
  assert.deepEqual([...shuffled].sort(), items)
  assert.deepEqual(items, ['a', 'b', 'c', 'd', 'e'])
})

test('golden values keep share codes stable (SPEC.md section 6)', () => {
  const r = makeRng(4821)
  assert.deepEqual([r.next(), r.next(), r.next()], [0.19585301843471825, 0.02031775563955307, 0.7633985111024231])
  const s = makeRng('R3-4821')
  assert.deepEqual([s.int(1, 100), s.int(1, 100), s.int(1, 100)], [49, 3, 78])
  const u = makeRng(1)
  assert.deepEqual(u.shuffle(['a', 'b', 'c', 'd', 'e']), ['e', 'c', 'b', 'a', 'd'])
  assert.equal(u.pick(['x', 'y', 'z']), 'z')
})
