import { makeRng } from '../../../engine/rng.js';
import { classify } from './classify.js';
import { evaluate } from './evaluate.js';
import { renderRule } from './render.js';
import { only, validateCard, validatePolicy, validateTopology } from './model.js';
import { assertUniverseDomain, exactPermutation, prepareAnalysis } from './universe.js';
import { orderGoals } from '../uk.js';

export const id = 'fw-order', version = 2;
export const codes = ['order-shadowed', 'order-ok', 'order-invalid', 'order-verdict', 'order-dead', 'order-hint-question', 'order-hint-walk', 'order-hint-example', 'order-reveal-label', 'order-accepted-label'];
const clone = value => JSON.parse(JSON.stringify(value));
const seedValid = seed => typeof seed === 'string' || (typeof seed === 'number' && Number.isFinite(seed));
const unique = values => new Set(values.map(v => v?.id)).size === values.length;
const taskText = variant => `${variant.text}\n${orderGoals[variant.id]}`;

export function validateRecord(record) {
  try {
    if (!only(record, ['id', 'version', 'variants']) || record.id !== id || !Number.isInteger(record.version) || record.version < 1
      || !Array.isArray(record.variants) || !record.variants.length || !unique(record.variants)) throw new Error();
    for (const v of record.variants) {
      if (!only(v, ['id', 'title', 'text', 'topology', 'policy', 'cards']) || !['input', 'all'].includes(v.id)
        || typeof v.title !== 'string' || typeof v.text !== 'string' || validateTopology(v.topology).length
        || validatePolicy(v.policy, v.topology).length || !Array.isArray(v.cards) || !v.cards.length || !unique(v.cards)
        || v.cards.some(c => validateCard(c, v.topology).length || c.facts.state === 'unknown' || c.facts.dstNat === 'unknown')) throw new Error();
      assertUniverseDomain(v.policy, v.topology);
      if (v.policy.rules.length !== (v.id === 'input' ? 5 : 9) || (v.id === 'input' && v.policy.rules.some(r => r.chain !== 'input'))) throw new Error();
      for (const card of v.cards) classify(v.topology, card);
    }
    return [];
  } catch { return [{ code: 'invalid-record' }]; }
}

function identityFor(record, variant, seed) {
  return { formatVersion: 1, exerciseId: id, taskId: record.id, recordVersion: record.version, variantId: variant.id, seed, generatorVersion: version };
}

// Canonicalise object keys recursively: bank property order is not semantics.
const canonical = value => Array.isArray(value) ? value.map(canonical)
  : value && typeof value === 'object'
    ? Object.fromEntries(Object.keys(value).sort().map(key => [key, canonical(value[key])])) : value;
const inventoryKey = ({ id: _id, ...rule }) => JSON.stringify(canonical(rule));

function opaqueRules(variant, seed) {
  // Both public streams start from semantic inventory, never reference order.
  // Original ids and reference positions participate only in the private map.
  const inventory = [...variant.policy.rules].sort((a, b) => {
    const left = inventoryKey(a), right = inventoryKey(b);
    return left < right ? -1 : left > right ? 1 : 0;
  });
  const rng = makeRng(JSON.stringify([seed, variant.id, 'fw-order-ids-v1']));
  const pool = new Set();
  while (pool.size < variant.policy.rules.length) pool.add(`f-${rng.int(0, 0xffffffff).toString(16).padStart(8, '0')}`);
  const ids = rng.shuffle([...pool]);
  const assigned = new Map(inventory.map((r, index) => [r, { ...r, id: ids[index] }]));
  return { rules: inventory.map(r => assigned.get(r)), referenceRules: variant.policy.rules.map(r => assigned.get(r)) };
}

/** Only shuffled rules and ordinary givens cross the public-task boundary.
 * References remain in the explicitly supplied resolved record (forRecord
 * binds it for useExercise). No private properties, maps or caches on tasks.
 */
export function create(record, { variantId = record?.variants?.[0]?.id, seed = 0 } = {}) {
  if (!seedValid(seed) || validateRecord(record).length) throw new RangeError('invalid-record');
  const variant = record.variants.find(v => v.id === variantId);
  if (!variant) throw new RangeError('invalid-record');
  const { rules, referenceRules } = opaqueRules(variant, seed), policy = { id: 'home-basic', rules: referenceRules };
  const analysis = prepareAnalysis(policy, variant.topology);
  if (!analysis.analyze(referenceRules.map(r => r.id)).ok) throw new RangeError('invalid-record');
  const rng = makeRng(seed);
  let shuffled;
  for (let attempt = 0; attempt < 1024; attempt++) {
    const candidate = rng.shuffle(rules);
    if (!analysis.analyze(candidate.map(r => r.id)).ok) { shuffled = candidate; break; }
  }
  if (!shuffled) throw new RangeError('invalid-record');
  const identity = identityFor(record, variant, seed);
  return clone({ identity, instanceKey: JSON.stringify(identity), title: variant.title, text: taskText(variant), topology: variant.topology, rules: shuffled });
}

/** Prepares one instance for repeated checks/sweeps. The record is mandatory:
 * a serialised public task alone intentionally cannot disclose its reference.
 */
export function prepareOrder(task, record) {
  if (validateRecord(record).length || !only(task, ['identity', 'instanceKey', 'title', 'text', 'topology', 'rules'])) throw new RangeError('invalid-record');
  const v = record.variants.find(v => v.id === task.identity?.variantId), seed = task.identity?.seed;
  if (!v || !seedValid(seed)) throw new RangeError('invalid-task');
  const identity = identityFor(record, v, seed), { rules, referenceRules } = opaqueRules(v, seed), ids = rules.map(r => r.id);
  if (JSON.stringify(task.identity) !== JSON.stringify(identity) || task.instanceKey !== JSON.stringify(identity)
    || task.title !== v.title || task.text !== taskText(v) || JSON.stringify(task.topology) !== JSON.stringify(v.topology)
    || !Array.isArray(task.rules) || !exactPermutation(ids, task.rules.map(r => r?.id))
    || task.rules.some(r => JSON.stringify(r) !== JSON.stringify(rules.find(x => x.id === r.id)))) throw new RangeError('invalid-task');
  const reference = { id: 'home-basic', rules: referenceRules };
  const cards = v.cards.map(({ safety, ...card }) => clone(card));
  const analysis = prepareAnalysis(reference, v.topology, cards, { preferForward: v.id === 'all' });
  const policyFor = order => {
    if (!exactPermutation(ids, order)) throw new RangeError('order-invalid');
    return { id: 'home-basic', rules: order.map(id => rules.find(r => r.id === id)) };
  };
  const walkInput = (order, card) => {
    const policy = policyFor(order), context = classify(v.topology, card);
    return clone({ topology: v.topology, policy, card, walk: evaluate(policy, card, context) });
  };
  // A rule's singleton witness is independent of the learner order. Keep
  // this private to the prepared adapter: exhaustive sweeps and repeated
  // checks need not search the same 120 representatives again.
  const shadowWitnesses = new Map();
  function check(answer) {
    const validAnswer = only(answer, ['order']) && exactPermutation(ids, answer.order);
    const outcome = validAnswer ? analysis.analyze(answer.order) : null;
    const forwardDead = v.id === 'all' && outcome?.deadRuleIds.find(id => rules.find(r => r.id === id).chain === 'forward');
    let feedback = null;
    if (!outcome) feedback = { code: 'order-invalid', ruleIds: [] };
    else if (outcome.difference && !forwardDead) {
      const { card, expected, actual, decidedBy } = outcome.difference;
      feedback = { code: 'order-verdict', card, expected, actual, ruleIds: decidedBy === 'chain-end' ? [] : [decidedBy] };
    } else if (outcome.deadRuleIds.length) {
      const ruleId = forwardDead || outcome.deadRuleIds[0], dead = rules.find(r => r.id === ruleId);
      if (!shadowWitnesses.has(ruleId)) shadowWitnesses.set(ruleId, analysis.universe.find(c =>
        evaluate({ ...reference, rules: [dead] }, c, classify(v.topology, c)).steps[0].outcome === (dead.action === 'fasttrack-connection' ? 'marked' : 'match')));
      const witness = shadowWitnesses.get(ruleId);
      const blockerId = evaluate(policyFor(answer.order), witness, classify(v.topology, witness)).decidedBy;
      const blocker = rules.find(r => r.id === blockerId);
      feedback = { code: 'order-dead', ruleId, blockerId, ruleIds: [ruleId, blockerId],
        shadow: { ruleNumber: answer.order.indexOf(ruleId) + 1, blockerNumber: answer.order.indexOf(blockerId) + 1,
          ruleDescriptionCode: dead.descriptionCode, blockerDescriptionCode: blocker.descriptionCode, action: blocker.action } };
    }
    return clone({ ok: outcome?.ok ?? false, complete: outcome?.ok ?? false, code: feedback?.code ?? 'order-ok', findings: feedback ? [feedback] : [], feedback });
  }
  const scriptFor = order => policyFor(order).rules.map((r, i) => renderRule(r, i + 1).command).join('\n');
  function acceptedScript(answer) {
    if (!check(answer).ok) return null;
    return { labelCode: 'order-accepted-label', script: scriptFor(answer.order) };
  }
  function solution() {
    const order = referenceRules.map(r => r.id);
    return { order, labelCode: 'order-reveal-label', script: scriptFor(order) };
  }
  return { check, walkInput, acceptedScript, solution, analyze: analysis.analyze, classCount: analysis.classCount };
}

export const check = (task, answer, record) => prepareOrder(task, record).check(answer);
export const solution = (task, record) => prepareOrder(task, record).solution();
export const walkInput = (task, order, card, record) => prepareOrder(task, record).walkInput(order, card);
export const acceptedScript = (task, answer, record) => prepareOrder(task, record).acceptedScript(answer);
export const initialAnswer = task => ({ order: task.rules.map(r => r.id) });
export function hints() {
  return [
    { rung: 1, code: 'order-hint-question', action: 'question', params: {} },
    { rung: 2, code: 'order-hint-walk', action: 'open-walk', params: {} },
    { rung: 3, code: 'order-hint-example', action: 'example', params: {} },
  ];
}

/** Standard useExercise adapter; hold this outside rendering with useMemo.
 * Cache is scoped to the adapter and task object, never serialised. Recreated
 * adapters and JSON-round-tripped tasks behave identically.
 */
export function forRecord(record) {
  const snapshot = clone(record), prepared = new WeakMap();
  const of = task => {
    if (!prepared.has(task)) prepared.set(task, prepareOrder(task, snapshot));
    return prepared.get(task);
  };
  return { id, version, codes, create: (_, params) => create(snapshot, params),
    check: (task, answer) => of(task).check(answer), hints,
    solution: task => of(task).solution(),
    walkInput: (task, order, card) => of(task).walkInput(order, card),
    acceptedScript: (task, answer) => of(task).acceptedScript(answer) };
}

export default { id, version, codes, create, check, hints, solution, forRecord };
