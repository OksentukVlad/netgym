import test from 'node:test';
import assert from 'node:assert/strict';
import { resolveOrderRecord } from '../src/banks/firewall/order.js';
import { create, prepareOrder } from '../src/sections/firewall/logic/order.js';
import { prepareAnalysis } from '../src/sections/firewall/logic/universe.js';
import { full, sweepSeeds } from './helpers/sweep-mode.mjs';
import { permutations, interleavings } from './helpers/firewall-order.mjs';

const record = resolveOrderRecord(), variant = record.variants[1];

test('FW-2 independent exhaustive input expectation: 8 / 120, with bank feedback for every verdict failure', () => {
  const task = create(record, { variantId: 'input' }), p = prepareOrder(task, record);
  let total = 0, passed = 0;
  for (const order of permutations(task.rules.map(r => r.id))) {
    const r = p.check({ order }); total++; passed += r.ok;
    assert.equal(r.findings.length, r.ok ? 0 : 1);
    if (!r.ok) {
      assert.equal(r.feedback.code, 'order-verdict');
      assert.ok(variant.cards.some(c => c.id === r.feedback.card.id), 'no universe-only fallback');
    }
  }
  assert.deepEqual({ passed, total }, { passed: 8, total: 120 });
});

test('FW-2 independent exhaustive forward expectation: 12 / 24; all verdicts equal, 12 dead FastTrack only', () => {
  const policy = { ...variant.policy, rules: variant.policy.rules.filter(r => r.chain === 'forward') };
  const p = prepareAnalysis(policy, variant.topology);
  let total = 0, passed = 0, deadOnly = 0;
  for (const order of permutations(policy.rules.map(r => r.id))) {
    const r = p.analyze(order); total++; passed += r.ok;
    assert.equal(r.sameVerdicts, true);
    if (!r.ok) { deadOnly++; assert.deepEqual(r.deadRuleIds, ['r6']); }
  }
  assert.deepEqual({ passed, total, deadOnly }, { passed: 12, total: 24, deadOnly: 12 });
});

test(`FW-2 combined ${full ? 'exhaustive 9!' : 'deterministic sample'}: independent 12,096 / 362,880 and interleaving proof`, () => {
  const task = create(record, { variantId: 'all' }), p = prepareOrder(task, record);
  const input = task.rules.filter(r => r.chain === 'input').map(r => r.id), forward = task.rules.filter(r => r.chain === 'forward').map(r => r.id);
  const inputOrders = [...permutations(input)], forwardOrders = [...permutations(forward)];
  const interleaveCount = [...interleavings(input, forward)].length;
  assert.equal(interleaveCount, 126, 'choose 5 of 9 positions');
  // Disjoint chains: filtering any combined list preserves its two local
  // orders. No rule of the other hook can match/mark/stop a packet. Thus each
  // pair has exactly C(9,5)=126 equally classified interleavings.
  assert.equal(8 * 12 * interleaveCount, 12096);
  assert.equal(120 * 24 * interleaveCount, 362880);
  let total = 0, passed = 0, verdictFailures = 0, deadOnly = 0;
  const passingInput = p.solution().order.filter(id => input.includes(id));
  const sampledInputs = full ? inputOrders : sweepSeeds(inputOrders, [inputOrders[0], inputOrders.at(-1), passingInput]);
  // Keep every forward order even in fast mode (all 24).
  for (const a of sampledInputs) for (const b of forwardOrders) {
    const mixed = [...interleavings(a, b)];
    for (const order of full ? mixed : sweepSeeds(mixed, [mixed[0], mixed[62], mixed.at(-1)])) {
      const r = p.check({ order }); total++; passed += r.ok;
      assert.equal(r.findings.length, r.ok ? 0 : 1);
      if (r.feedback?.code === 'order-verdict') {
        verdictFailures++;
        assert.ok(variant.cards.some(c => c.id === r.feedback.card.id), `missing bank witness: ${r.feedback.card.id}`);
        assert.notEqual(r.feedback.expected, r.feedback.actual);
      } else if (r.feedback?.code === 'order-dead') {
        deadOnly++;
        assert.equal(task.rules.find(x => x.id === r.feedback.ruleId).action, 'fasttrack-connection');
        assert.equal(task.rules.find(x => x.id === r.feedback.blockerId).action, 'accept');
      } else assert.equal(r.ok, true);
    }
  }
  // Forward-first reporting: 12 bad forward orders × 120 input orders × 126 interleavings.
  // Remaining failures: 12 good forward orders × 112 bad input orders × 126.
  if (full) assert.deepEqual({ passed, total, verdictFailures, deadOnly }, { passed: 12096, total: 362880, verdictFailures: 169344, deadOnly: 181440 });
  else { assert.ok(total >= 288); assert.ok(passed > 0 && verdictFailures > 0 && deadOnly > 0); assert.equal(total, passed + verdictFailures + deadOnly); }
  console.log(`FW-2 sweep: ${JSON.stringify({ mode: full ? 'full' : 'fast', passed, total, verdictFailures, deadOnly, exactByReduction: '12096/362880' })}`);
});
