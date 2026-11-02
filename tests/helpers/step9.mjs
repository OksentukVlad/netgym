import assert from 'node:assert/strict';
import { sweepSeeds } from './sweep-mode.mjs';
import { readFileSync } from 'node:fs';
import { addressMapper, mapAddresses, numberedSegments } from '../../src/engine/renumber.js';
import { create, check, checkRow, solution } from './routing.mjs';
import { rowVerdict } from '../../src/sections/routing/logic/rowReasons.js';
import { frozenFor, acceptanceIssues } from './routing.mjs';
import { network, parseIp } from '../../src/engine/ip.js';

export const goldenSeeds = [0, 42, 9999];
export const suiteSeeds = sweepSeeds([0, 1, 2, 3, 4, 5, 6, 7, 8, 9]);
export function mappedAnswers(record) {
  return record.variants.map(v => frozenFor(create(record, { variantId: v.id })).answer);
}
export function assertAccepted(original, task) {
  assert.equal(task.infeasible, undefined, JSON.stringify(task));
  const map = addressMapper(task.record.generation.units);
  const answers = mappedAnswers(original).map(answer => mapAddresses(answer, map));
  assert.deepEqual(acceptanceIssues(original, task.record, answers), [], task.variant.code);
}

/** Full replay payload, not a hash: review changes before bumping the generator. */
export function replay(task) {
  const addresses = [];
  function walk(value, path = '') {
    if (typeof value === 'string' && /\d+\.\d+\.\d+\./.test(value)) addresses.push([path, value]);
    else if (value && typeof value === 'object') for (const [key, v] of Object.entries(value)) walk(v, `${path}/${key}`);
  }
  walk(task.record.network, 'network'); walk(task.record.probes, 'probes');
  walk(task.variant.referenceRoutes, 'routes'); walk(task.variant.objectives, 'objectives');
  walk(task.record.demonstrations, 'demonstrations'); walk(frozenFor(task).answer, 'frozen');
  return { identity: task.identity, attempt: task.record.generation.attempt, units: task.record.generation.units, addresses,
    routes: task.variant.referenceRoutes, objectives: task.variant.objectives, demonstrations: task.record.demonstrations,
    texts: { record: task.record.text, topology: task.record.topology, variant: task.variant.text } };
}

const corpus = JSON.parse(readFileSync(new URL('../fixtures/routing-grading-34ee9ac.json', import.meta.url)));

/** Replay lexical grading, retaining malformed/outside-unit wrong values. */
function mapFields(fields, map) {
  return Object.fromEntries(Object.entries(fields).map(([key, raw]) => {
    if (!['net', 'dst', 'gw'].includes(key) || typeof raw !== 'string') return [key, raw];
    const value = raw.trim().replace(/\s+/g, '');
    const [ip, prefix] = value.split('/');
    if (parseIp(ip) !== ip) return [key, raw];
    try { return [key, `${map(ip)}${prefix === undefined ? '' : `/${prefix}`}`]; }
    catch (e) { if (!(e instanceof RangeError)) throw e; return [key, raw]; }
  }));
}

export function replayWrongRows(record, task, { sample = false } = {}) {
  const map = addressMapper(task.record.generation.units);
  const rows = corpus.rows.filter(r => r.task === record.id && r.variant === task.variant.id);
  let count = 0;
  for (const row of sample ? rows.filter(r => !r.verdict.ok).slice(0, 8) : rows) {
    let instance = task;
    if (row.context) {
      instance = { ...task, variant: { ...task.variant, referenceRoutes: { ...task.variant.referenceRoutes,
        ...mapAddresses(corpus[row.context].referenceRoutes, map) } } };
    }
    const expected = rowVerdict(row.verdict);
    assert.deepEqual(rowVerdict(checkRow(instance, row.router, row.index, mapFields(row.answer, map), row.syntax)), expected,
      `mapped corpus ${task.variant.code}/${task.identity.seed}/${row.syntax}/${row.router}/${row.index}: ${JSON.stringify(row.answer)}`);
    count++;
  }
  return count;
}

const verdictCodes = result => ({ ok: result.ok, code: result.code,
  findings: result.findings.map(f => `${f.code}/${f.severity}/${f.entity}/${f.params?.reason ?? ''}`).sort() });

/** Semantic wrong answers supplement the legacy row corpus: its row grader
 * cannot express too-wide summaries, whole-network loops or missing discards. */
export function replayWrongNetworks(record, task) {
  const base = create(record, { variantId: task.variant.id }), map = addressMapper(task.record.generation.units), cases = [];
  for (const objective of base.variant.objectives.filter(o => o.type === 'summary')) {
    const wrong = solution(base), mapped = solution(task);
    for (const answer of [wrong, mapped]) {
      const row = answer[objective.routerId].find(r => r.dst === (answer === wrong ? objective.dst : map(objective.dst)) && r.prefix === objective.prefix);
      assert.ok(row);
      row.prefix--; row.dst = network(row.dst, row.prefix);
    }
    cases.push(['too-wide-summary', wrong, mapped]);
  }
  if (record.displayNumber === 17) {
    const wrong = solution(base), mapped = solution(task);
    for (const answer of [wrong, mapped]) answer['R-CORE'] = answer['R-CORE'].filter(r => !r.discard);
    cases.push(['missing-discard', wrong, mapped]);
  }
  if (task.variant.code === '3b') {
    const wrong = solution(base); wrong.R2 = [{ id: 'reciprocal', dst: '0.0.0.0', prefix: 0, via: base.network.devices.find(d => d.id === 'R1').interfaces.find(f => f.segmentId === 'segment-3').address.ip }];
    cases.push(['reciprocal-default', wrong, mapAddresses(wrong, map)]);
  }
  for (const [label, before, after] of cases) {
    const expected = verdictCodes(check(base, before));
    assert.equal(expected.ok, false, label);
    assert.deepEqual(verdictCodes(check(task, after)), expected, `${task.variant.code}/${task.identity.seed}/${label}`);
  }
  return cases.map(([label]) => label);
}

export function unitPlan(record) {
  const task = create(record, { seed: 0 });
  return task.record.generation.units.map(u => ({ block: `${u.dst}/${u.prefix}`, pool: u.pool, segments: u.segments,
    holes: u.end - u.start - numberedSegments(record).filter(s => u.segments.includes(s.id)).reduce((sum, s) => sum + s.end - s.start, 0) }));
}
