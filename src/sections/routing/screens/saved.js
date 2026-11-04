// «Маршрутизація»'s saved state (spec save v2; app/saved.js runs these).
import { id as routingId } from '../logic/static.js';
import { generatorVersion } from '../logic/generated.js';
import faults from '../logic/faults-exercise.js';
import { generatorVersion as faultsGenerator } from '../logic/faults-frozen.js';
import { any, asides, between, bool, count, field, finite, isObject, jsonOf, listOf, mapOf, matches, nullable, oneOf, resultOf, shape, text, zoom } from '../../../ui/saved-shape.js';
import { MAX_SEED } from './url.js';

const seed = between(0, MAX_SEED);
const route = shape({
  id: text, dst: text, prefix: finite, via: text, discard: bool, distance: finite, slot: text,
}, ['dst']);
const answer = mapOf(listOf(nullable(route)));
const fieldValues = mapOf(value => field(value) || typeof value === 'boolean');
const rowDrafts = mapOf(fieldValues);
const modeDrafts = shape({
  cisco: rowDrafts, routeros: rowDrafts,
  canonical: mapOf(shape({ route: nullable(isObject), rev: count }, ['rev'])),
  revs: mapOf(mapOf(count)),
});

// What the check's evidence holds, as syntax/presentation.js and the path layers read it.
const routedProbe = shape({
  id: text, from: text, to: text, ok: bool, code: nullable(text), scenarioId: nullable(text), request: isObject, reply: nullable(isObject),
}, ['id', 'ok', 'request']);
const evidence = {
  probes: listOf(routedProbe),
  objectives: listOf(shape({ id: text, ok: bool, params: isObject }, ['id', 'params'])),
  safety: listOf(shape({ params: shape({ missing: listOf(isObject) }, ['missing']) }, ['params'])),
  advice: listOf(shape({ code: text, params: isObject }, ['params'])),
  demonstrations: listOf(shape({ id: text, request: isObject }, ['id', 'request'])),
};
const formErrors = listOf(shape({ code: text, key: text, rowId: text, routerId: text }));
const checked = resultOf({ formErrors, evidence: shape(evidence) });

const snapshot = shape({
  label: text, invalid: bool, rows: listOf(shape({ id: text, from: text, to: text, ok: bool }, ['id', 'from', 'to', 'ok'])),
}, ['rows']);
// A fix's check: the hints and words read its snapshot, so the evidence is always there.
const faultResult = resultOf({ formErrors, step: text, fixOk: bool, evidence: shape({ ...evidence, snapshot }) }, ['evidence']);
const faultAnswer = shape({ routes: mapOf(listOf(isObject)), fields: isObject, cause: nullable(text) });
const faultState = shape({
  answer: faultAnswer, step: oneOf('fix', 'cause', 'done'), result: nullable(faultResult), assisted: bool, hintRung: count,
  reveal: nullable(shape({
    routes: isObject, change: shape({ router: text }), before: shape({ snapshot }, ['snapshot']), after: shape({ snapshot }, ['snapshot']),
  }, ['before', 'after'])),
  original: snapshot, snapshot, hints: listOf(shape({ text })),
}, ['answer', 'step', 'original', 'snapshot']);

export const saved = Object.freeze({
  places: {
    routing: shape({
      taskId: text, router: nullable(text), filterLevel: count, variants: mapOf(text), seeds: mapOf(nullable(seed)),
    }, ['taskId']),
    'routing-faults': shape({ open: bool, level: between(1, 9), seed }),
    'routing.tasks': shape(asides),
  },
  exercises: {
    [routingId]: {
      identity: (id, bank) => {
        const record = bank.tasks.find(r => r.id === id.taskId);
        return Boolean(record) && matches(id, { formatVersion: 1, bankId: bank.bankId, bankRevision: bank.bankRevision })
          && record.variants.some(v => v.id === id.variantId)
          && (id.seed === null ? id.generatorVersion === null : seed(id.seed) && id.generatorVersion === generatorVersion);
      },
      view: shape({
        checks: count, checkedEdits: count, proven: jsonOf(answer), mine: bool, zoom,
        review: shape({ generation: count, edits: count, tips: listOf(any), star: bool }, ['generation', 'edits', 'tips']),
      }),
      answer: nullable(answer),
      result: nullable(checked),
      drafts: shape({ guided: modeDrafts, free: modeDrafts, cisco: rowDrafts, routeros: rowDrafts }),
      parts: mapOf(isObject),
    },
    [faults.id]: {
      identity: (id, bank) => matches(id, {
        formatVersion: 1, bankId: bank.bankId, bankRevision: bank.bankRevision,
        recordVersion: bank.faults.version, generatorVersion: faultsGenerator,
      }) && bank.tasks.some(r => r.id === id.taskId) && between(1, 9)(id.level) && seed(id.seed),
      view: shape({
        rf: faultState, rows: mapOf(listOf(shape({ id: text, route: nullable(isObject) }, ['id']))),
        drafts: mapOf(shape({ syntax: text, values: fieldValues })), router: text,
        marks: mapOf(shape({ code: text, syntax: text, values: fieldValues })),
        checks: count, verdict: nullable(shape({ tone: text, done: bool })), checkedRows: text,
        solved: bool, earned: bool, serial: count, hintSnap: text, zoom,
      }),
    },
  },
});
