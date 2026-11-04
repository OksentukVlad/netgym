// «Перевірка мережі»'s saved state (spec save v2; app/saved.js runs these).
import * as proofs from '../logic/proofs.js';
import * as ladder from '../logic/ladder.js';
import * as claims from '../logic/claims.js';
import { any, between, bool, count, listOf, mapOf, matches, oneOf, shape, text } from '../../../ui/saved-shape.js';
import { EXERCISES } from './ChecksScreen.jsx';
import { MAX_SEED } from './seeds.js';

const seed = between(0, MAX_SEED);
const task = shape({ seed }, ['seed']);
const levels = value => shape({ level: between(1, 2), tasks: mapOf(task) }, ['level', 'tasks'])(value) && Object.hasOwn(value.tasks, value.level);
const proofPlace = shape({ seed, scope: oneOf('access') }, ['seed']);
const place = shape({ exercise: oneOf(...EXERCISES), proof: proofPlace, ladder: levels, claims: levels }, ['exercise', 'proof', 'ladder', 'claims']);
const vendor = oneOf('cisco', 'mikrotik', 'routeros');
const ids = listOf(text);
const versions = logic => id => matches(id, { version: logic.version, generatorVersion: logic.generatorVersion }) && seed(id.seed) && vendor(id.vendor);
const leveled = logic => id => versions(logic)(id) && between(1, 2)(id.level);

export const saved = Object.freeze({
  places: { checks: place },
  exercises: {
    [proofs.id]: { identity: versions(proofs), view: shape({ position: count, tries: mapOf(ids), checks: count }) },
    [ladder.id]: {
      identity: leveled(ladder),
      view: shape({
        index: count, rows: listOf(shape({ id: text, arg: any, trustHostKey: bool }, ['id'])), stopped: bool, places: ids,
        healthy: count, checks: count, attempt: count,
      }),
    },
    [claims.id]: {
      identity: leveled(claims),
      view: shape({
        selected: ids, none: bool, linesOk: bool, checkedLines: ids, linesChecks: count, verdicts: ids, checks: count,
      }),
    },
  },
});
