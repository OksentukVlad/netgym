// VLAN's saved state (spec save v2; app/saved.js runs these). The instances'
// keys are kept as built: a task's own vendor is in some identities (predict,
// faults) and not in others (ports, route, one instance for both syntaxes).
import predict from '../logic/predict.js';
import ports from '../logic/ports.js';
import route from '../logic/route.js';
import faults from '../logic/faults-exercise.js';
import { any, asides, between, bool, count, field, finite, isObject, jsonOf, listOf, mapOf, matches, nullable, oneOf, resultOf, setOf, shape, text, zoom } from '../../../ui/saved-shape.js';
import { MAX_LEVEL, SHAPES } from './predictState.js';
import { MAX_LEVEL as MAX_FAULT_LEVEL, STAGES } from './faultsState.js';
import { MAX_SEED } from './url.js';

// The generator versions in the logic's identities (predict.js, model.js,
// faults-exercise.js name them inline). If one moves on and these don't, saved
// tasks are dropped, never misattached, and tests/saved.test.mjs fails.
const GENERATOR = Object.freeze({ predict: 2, ports: 1, route: 1, faults: 1 });

const seed = between(1, MAX_SEED);
const vendor = oneOf('cisco', 'routeros');
const direction = nullable(oneOf('request', 'reply'));
const faultSlot = shape({ seed, level: between(1, MAX_FAULT_LEVEL), shape: text }, ['seed', 'level']);

const place = shape({
  exercise: oneOf('predict', 'ports', 'route', 'faults'), shape: oneOf(...SHAPES),
  predict: mapOf(shape({ seed, level: between(0, MAX_LEVEL) }, ['seed'])),
  portsTask: text, portsSeeds: mapOf(seed), portsPrevious: mapOf(nullable(seed)),
  routeTask: text, routeSeeds: mapOf(seed), routePrevious: mapOf(nullable(seed)),
  faults: mapOf(nullable(faultSlot)), faultsPrevious: mapOf(nullable(faultSlot)),
  ...asides,
}, ['exercise', 'shape', 'predict', 'portsTask', 'portsSeeds']);

// What the logic's evidence holds, down to the walks the screens draw and call .has on.
const walk = shape({
  from: text, hops: listOf(isObject), received: setOf(text), arrivals: listOf(isObject), attachmentArrivals: listOf(any),
}, ['from', 'hops', 'received', 'arrivals']);
const walks = listOf(walk);
const segment = shape({ ok: bool, from: text, to: nullable(text), code: nullable(text), walks }, ['ok', 'walks']);
const trace = shape({
  ok: bool, from: text, to: nullable(text), code: nullable(text), segments: listOf(segment), hops: listOf(isObject), steps: listOf(isObject),
}, ['ok', 'segments']);
const probeFields = { id: text, from: text, to: text, ok: bool, code: nullable(text), walks, request: trace, reply: nullable(trace) };
/** A switch's probe has walks, a routed one a request and a reply; «Знайди несправність» has either. */
const probe = shape(probeFields, ['id']);
const routedProbe = shape(probeFields, ['id', 'request']);
const objective = shape({
  id: text, ok: bool, code: nullable(text), walk: nullable(walk), walks, reverseWalks: walks, attachment: nullable(text),
}, ['id']);
const evidence = (probes, extra = {}) => shape({
  probes: listOf(probes), objectives: listOf(objective), assumptions: listOf(text), attachments: listOf(isObject),
  domains: listOf(listOf(text)), ...extra,
});
const checked = (probes, extra) => nullable(resultOf({ evidence: evidence(probes, extra) }, ['code', 'findings', 'evidence']));
const grid = shape({
  reachability: listOf(shape({ id: text, expected: bool, observed: bool, stops: listOf(any), probe: nullable(probe) }, ['id', 'observed'])),
  isolation: listOf(shape({ id: text, vid: finite, expected: bool, observed: bool, unexpected: listOf(isObject), walks }, ['id', 'unexpected', 'walks'])),
  invalid: bool,
}, ['reachability', 'isolation']);

// A predict commit's evidence: each round's walk by its id, and `domains`.
const roundEvidence = value => isObject(value) && Object.entries(value).every(([id, entry]) => (id === 'domains' ? listOf(listOf(text))(entry) : shape({ walk })(entry)));
const commit = shape({
  instanceKey: text, answer: isObject,
  result: resultOf({ evidence: roundEvidence }, ['findings', 'evidence']),
}, ['instanceKey', 'answer', 'result']);

const raw = mapOf(text);
const verdict = nullable(shape({ syntax: vendor, answer: jsonOf(isObject) }, ['syntax', 'answer']));
const edited = nullable(shape({ syntax: vendor, device: text, field: text }));
const pick = nullable(shape({ source: text, id: field, n: count }, ['source', 'id']));

// A switch's form: its ports by id and its VLANs, in either vendor (portsState.js).
const vlanRows = listOf(value => field(value) || isObject(value));
const switchForm = shape({ ports: mapOf(isObject), vlans: vlanRows }, ['ports', 'vlans']);
// A device's form in «Між VLAN» and «Знайди несправність»: a switch's, or a router's rows (routeState.js).
const deviceForm = shape({
  ports: mapOf(isObject), vlans: vlanRows, interfaces: mapOf(isObject), subifs: listOf(isObject), vlanIfs: listOf(isObject),
  addresses: listOf(isObject), routes: listOf(isObject), svi: nullable(isObject), defaultGateway: nullable(text), filtering: bool,
});

/** A task's identity: this bank's record and the generator's version. */
const inBank = (list, id, generatorVersion) => {
  const record = list(id);
  return Boolean(record) && matches(id, { formatVersion: 1, recordVersion: record.version, generatorVersion })
    && record.variants.some(v => v.id === id.variantId) && seed(id.seed);
};

export const saved = Object.freeze({
  places: { vlan: place },
  exercises: {
    [predict.id]: {
      identity: (id, bank) => inBank(() => (bank.predict.id === id.taskId ? bank.predict : null), id, GENERATOR.predict)
        && vendor(id.vendor) && between(0, MAX_LEVEL)(id.surprises),
      view: shape({
        drafts: mapOf(shape({ hosts: listOf(text), nobody: bool }, ['hosts'])), position: count, commit, switchId: text, zoom,
      }),
    },
    [ports.id]: {
      identity: (id, bank) => inBank(() => bank.ports.find(r => r.id === id.taskId), id, GENERATOR.ports),
      view: shape({
        forms: mapOf(mapOf(switchForm)), raw: mapOf(raw), verdict, switchId: text, edited, revealedAt: count, zoom,
      }),
      result: checked(probe),
    },
    [route.id]: {
      identity: (id, bank) => inBank(() => bank.route.find(r => r.id === id.taskId), id, GENERATOR.route),
      view: shape({
        forms: mapOf(mapOf(deviceForm)), raw: mapOf(raw), verdict, deviceId: text, direction, edited, revealedAt: count, zoom,
      }),
      result: checked(routedProbe),
    },
    [faults.id]: {
      identity: (id, bank) => {
        const record = bank.faults.find(r => r.id === id.taskId);
        return Boolean(record) && matches(id, { formatVersion: 1, recordVersion: record.version, generatorVersion: GENERATOR.faults })
          && record.variants.some(v => v.id === id.shape) && vendor(id.vendor) && between(1, MAX_FAULT_LEVEL)(id.level) && seed(id.seed);
      },
      view: shape({
        form: mapOf(deviceForm), raw, cause: nullable(text), stage: oneOf(...STAGES), edited, repairEdited: bool,
        checked: jsonOf(shape({ configuration: isObject }, ['configuration'])),
        walk: pick, direction, deviceId: text, side: oneOf('before', 'after'), revealedAt: count, zoom,
      }),
      result: checked(probe, { grid }),
    },
  },
});
