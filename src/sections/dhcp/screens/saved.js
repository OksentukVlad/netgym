// «DHCP і NAT»'s saved state (spec save v2; app/saved.js runs these).
import * as server from '../logic/server.js';
import * as faults from '../logic/faults.js';
import { generatorVersion as natGenerator, id as natId, version as natVersion } from '../logic/nat.js';
import { id as sidesId, version as sidesVersion } from '../logic/sides.js';
import { generatorVersion as scenarioGenerator } from '../logic/scenario.js';
import { asides, between, bool, count, finite, isObject, listOf, mapOf, matches, nullable, oneOf, shape, text, zoom } from '../../../ui/saved-shape.js';
import { EXERCISES } from './DhcpScreen.jsx';
import { STAGES } from './FaultView.jsx';
import { MAX_SEED } from './seeds.js';

const seed = between(0, MAX_SEED);
const vendor = oneOf('cisco', 'mikrotik', 'routeros');
const task = shape({ seed, other: bool, n: between(0, MAX_SEED) }, ['seed']);
/** An exercise's levels: the current one has its task (the views read it without a guard). */
const levels = most => value => shape({ level: between(1, most), tasks: mapOf(task) }, ['level', 'tasks'])(value) && Object.hasOwn(value.tasks, value.level);

const place = shape({
  exercise: oneOf(...EXERCISES), sides: task, server: levels(3), nat: levels(2), fault: levels(3),
}, ['exercise', 'sides', 'server', 'nat', 'fault']);

const ids = listOf(text);
const interval = shape({ from: text, to: text });
// The server form's text (ServerView.jsx): its rows are read without a guard, and whichever
// of these the task's form uses goes to the logic and the strip as it stands.
const serverDraft = shape({ rows: listOf(interval), ranges: text, from: text, to: text, gateway: text, dns: text });
const version = (logicVersion, generatorVersion) => id => (generatorVersion === undefined ? true : matches(id, { generatorVersion }))
  && matches(id, { version: logicVersion }) && seed(id.seed) && bool(id.other);

// The configuration the repair form edits: FaultView and the logic read these
// without a guard. DNS is a list, or the text as typed (RepairForm.jsx).
const config = shape({
  dhcp: shape({ ranges: listOf(interval), exclusions: listOf(interval), dns: value => text(value) || ids(value) }, ['ranges', 'exclusions', 'dns']),
  nat: shape({ roles: isObject, acl: listOf(isObject) }, ['roles']),
  routing: isObject,
}, ['dhcp', 'nat', 'routing']);

export const saved = Object.freeze({
  places: { dhcp: place, 'dhcp.server': shape(asides), 'dhcp.fault': shape(asides) },
  exercises: {
    [sidesId]: {
      identity: version(sidesVersion, scenarioGenerator),
      view: shape({ position: count, tries: mapOf(ids), checks: count, zoom }),
    },
    [server.id]: {
      identity: id => version(server.version, server.generatorVersion)(id) && between(1, 3)(id.level) && vendor(id.vendor),
      view: shape({
        draft: serverDraft, step: oneOf('range', 'options'), passed: bool, checkedKey: text, checks: count,
        // Its own verdict: the screens here never read the instance's `result`.
        result: nullable(shape({ ok: bool, final: bool, text, field: nullable(text), address: nullable(text) }, ['ok', 'text'])),
      }),
    },
    [natId]: {
      identity: id => version(natVersion, natGenerator)(id) && vendor(id.vendor),
      view: shape({
        position: count, picks: mapOf(shape({ source: ids, reply: ids })), checks: count,
        stepping: nullable(text), stepAt: count, zoom,
      }),
    },
    [`${natId}-l2`]: {
      identity: id => version(natVersion, natGenerator)(id) && vendor(id.vendor) && bool(id.twoLans),
      view: shape({ picks: mapOf(ids), checks: count, zoom }),
    },
    [faults.id]: {
      identity: id => version(faults.version, faults.generatorVersion)(id) && between(1, 3)(id.level) && vendor(id.vendor),
      view: shape({
        draft: config, checked: nullable(config), checkedKey: text, checks: count, passed: bool, stage: oneOf(...STAGES),
        causes: ids, causeChecks: count, picked: nullable(value => text(value) || finite(value)), zoom,
      }),
    },
  },
});
