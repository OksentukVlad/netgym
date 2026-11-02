import { flood, domains, object } from '../../../engine/l2.js';
import { createCommitFlow } from '../../../ui/commit.js';
import { validRecord, validSeed, vendors, identity, compileAll, clone } from './model.js';
import { makePredict } from './predict-model.js';
import { render as renderCommands } from './render.js';
import { codes } from './codes.js';
export { orderedPorts } from './model.js';
export { codes } from './codes.js';
export { describe } from './describe.js';
import { describe } from './describe.js';
export const id = 'vlan-predict', version = 1;
export function inspect(record, { variantId = record?.variants?.[0]?.id, seed = 0, vendor = 'cisco', surprises = 0 } = {}) {
  if (!validRecord(record) || !validSeed(seed) || !vendors.includes(vendor) || ![0, 1, 2].includes(surprises)) throw new RangeError('invalid-record');
  const variant = record.variants.find(v => v.id === variantId);
  if (!variant || !['p1', 'p2', 'p3'].includes(variant.id)) throw new RangeError('invalid-record');
  const ident = identity(record, variant, seed, id, { vendor, surprises, generatorVersion: 2 });
  return clone({ identity: ident, instanceKey: JSON.stringify(ident), title: variant.title, vendor, ...makePredict(variant, seed, vendor, surprises) });
}
/** Public learner task excludes generator diagnostics. inspect() is tooling-only. */
export function create(record, options) {
  const { activeSurprises, ...task } = inspect(record, options);
  return task;
}
const selectionCode = (task, selection, roundId) => {
  const round = task.rounds.find(r => r.id === roundId);
  return !round || !Array.isArray(selection) || new Set(selection).size !== selection.length || selection.some(h => h === round.from || !task.topology.hosts.some(p => p.device === h)) ? 'invalid-selection' : null;
};
export function check(task, answer = {}) {
  const findings = [], evidence = {}, submitted = object(answer) ? answer : {};
  const add = (code, entity) => findings.push({ code, severity: 'blocks', entity });
  if (submitted !== answer) add('invalid-selection', task.identity.taskId);
  const { tables } = compileAll(task.topology, task.configurations, task.vendor);
  for (const [roundId, selection] of Object.entries(submitted)) {
    if (selectionCode(task, selection, roundId)) { add('invalid-selection', roundId); continue; }
    const round = task.rounds.find(r => r.id === roundId), walk = flood(task.topology, tables, { from: round.from });
    evidence[roundId] = { walk };
    if (selection.length !== walk.received.size || selection.some(h => !walk.received.has(h))) add('wrong-receivers', roundId);
  }
  const complete = task.rounds.every(r => Object.hasOwn(evidence, r.id));
  // Domain colours are final-round evidence only.
  if (complete) evidence.domains = domains(task.topology, tables);
  return { ok: !findings.length, complete, code: findings[0]?.code ?? 'ok', findings, evidence };
}
export function solution(task) {
  const { tables } = compileAll(task.topology, task.configurations, task.vendor);
  return Object.fromEntries(task.rounds.map(r => [r.id, [...flood(task.topology, tables, { from: r.from }).received]]));
}
export function hints() { return []; }
export function render(task) { return renderCommands(task.configurations, task.vendor, task.topology); }
export const { initialCommitState, commit } = createCommitFlow({ check, validate: selectionCode, items: task => task.rounds });
export default { id, version, codes, create, check, hints, solution, render, describe };
