// «Фаєрвол»'s saved state (spec save v2; app/saved.js runs these).
import fw from '../logic/predict.js';
import order from '../logic/order.js';
import { asides, between, bool, count, isObject, listOf, mapOf, matches, nullable, oneOf, resultOf, shape, text, zoom } from '../../../ui/saved-shape.js';
import { MAX_SEED, recordsOf } from './url.js';

const seed = between(1, MAX_SEED);
const ids = listOf(text);
const said = shape({ code: text, n: count }, ['code']);
const stamped = shape({ instanceKey: text, presses: count }, ['instanceKey']);
// A checked order: its feedback packet and walk are drawn from `feedback` (orderView.js).
const orderResult = resultOf({
  findings: listOf(isObject),
  feedback: nullable(shape({
    code: text, card: shape({ id: text, packet: isObject, facts: isObject }, ['id', 'packet', 'facts']),
    expected: text, actual: text, ruleIds: ids,
  }, ['code'])),
});

const commit = shape({
  instanceKey: text, answer: isObject,
  result: resultOf({ evidence: mapOf(isObject) }, ['findings', 'evidence']),
}, ['instanceKey', 'answer', 'result']);

// A committed card's walk: level 1 is the chain alone; level 2 walks the rules (walkView.js).
const chainWalk = shape({ hook: text }, ['hook']);
const ruleWalk = shape({ hook: text, verdict: text, decidedBy: nullable(text), code: text, steps: listOf(isObject), assumptions: listOf(value => text(value) || isObject(value)) }, ['hook', 'verdict', 'steps']);
const walksFit = (saved, level) => saved === undefined
  || Object.keys(saved.answer).every(id => (level === 1 ? chainWalk : ruleWalk)(saved.result.evidence[id]));

const orderState = shape({
  instanceKey: text, answer: shape({ order: ids }, ['order']), result: nullable(orderResult),
  lastCheck: nullable(shape({ order: ids, result: orderResult }, ['order', 'result'])),
  walkOpen: bool, hintIndex: count, assisted: bool, revealed: bool,
}, ['instanceKey', 'answer']);

export const saved = Object.freeze({
  places: {
    'firewall-tab': shape({ exercise: oneOf('predict', 'order') }),
    firewall: shape({ level: between(1, 2), variantId: text, seeds: mapOf(seed), ...asides }, ['level', 'variantId', 'seeds']),
    'firewall-order': shape({ variantId: text, seeds: mapOf(seed) }, ['variantId', 'seeds']),
  },
  exercises: {
    [fw.id]: {
      identity: (id, bank) => {
        const { predict } = recordsOf(bank);
        return matches(id, { formatVersion: 1, taskId: predict.id, recordVersion: predict.version, generatorVersion: fw.generatorVersion })
          && predict.variants.some(v => v.id === id.variantId) && between(1, 2)(id.level) && seed(id.seed);
      },
      view: (view, id) => shape({
        drafts: mapOf(shape({ hook: text, decidedBy: text, said, retry: said })), position: count, commit,
        revealed: ids, played: ids, hookChecks: count, zoom,
      })(view) && walksFit(view.commit, id.level),
    },
    [order.id]: {
      identity: (id, bank) => {
        const { order: record } = recordsOf(bank);
        return Boolean(record) && matches(id, { formatVersion: 1, taskId: record.id, recordVersion: record.version, generatorVersion: order.version })
          && record.variants.some(v => v.id === id.variantId) && seed(id.seed);
      },
      view: shape({
        orderState, orderRevealedAt: stamped, orderHint2: nullable(text), zoom,
        orderStale: shape({ instanceKey: text, result: orderResult, presses: count, order: ids }, ['instanceKey', 'result']),
      }),
    },
  },
});
