import { networkUi as text } from '../uk.js';
import { syntaxList } from './index.js';
import { network } from '../../../engine/ip.js';

const adapter = syntax => {
  const found = typeof syntax === 'object' ? syntax : syntaxList.find(s => s.id === syntax);
  if (!found) throw new RangeError(`Unknown syntax: ${syntax}`);
  return found;
};
const deviceName = (net, id) => net.devices.find(d => d.id === id)?.name ?? (net.devices.some(d => d.id === id) ? id : text.unknown);
const segmentName = (net, id) => net.segments.find(s => s.id === id)?.name ?? text.unknown;
const nameOf = (net, id) => {
  const endpoint = net.endpoints.find(e => e.id === id);
  // An internet endpoint may carry the name the screen gives the cloud («Знайди несправність»: «Інтернет (ISP)»).
  if (endpoint) return endpoint.kind === 'internet' ? endpoint.name ?? text.internet : segmentName(net, endpoint.segmentId);
  for (const d of net.devices) {
    const iface = d.interfaces.find(f => f.id === id || f.address?.ip === id);
    if (iface) return text.interface(deviceName(net, d.id), segmentName(net, iface.segmentId));
  }
  return deviceName(net, id);
};
const sourceName = (net, id) => {
  const owner = net.devices.find(d => d.interfaces.some(f => f.id === id || f.address?.ip === id));
  return owner ? deviceName(net, owner.id) : nameOf(net, id);
};
/** A probe's label as the check list words it («LAN1 → LAN3», «LAN3 → R1
 * (лінк R1–R2)», «LAN1 → Інтернет»): names only, never endpoint ids.
 * `internet`: another name for the internet («Знайди несправність» says
 * «Інтернет (ISP)», as its stops do; round 5 5b-2). */
export const probeLabel = (net, from, to, { internet = null } = {}) => text.label(sourceName(net, from),
  internet && net.endpoints.some(e => e.id === to && e.kind === 'internet') ? internet : nameOf(net, to));
const repairStop = (net, leg) => {
  const escapedToIsp = net.devices.some(d => d.id === leg?.stop?.deviceId && d.kind === 'isp');
  const routerId = escapedToIsp ? leg?.hops.findLast(h => net.devices.some(d => d.id === h.deviceId && d.kind === 'router'))?.deviceId : leg?.stop?.deviceId;
  return { routerId, escapedToIsp };
};
// Rotations describe the same directed cycle; reversed cycles remain distinct.
const cycleKey = cycle => {
  const ids = cycle.slice(0, -1);
  return ids.map((_, i) => JSON.stringify([...ids.slice(i), ...ids.slice(0, i)])).sort()[0];
};
const destinationNames = (net, objective) => (objective.destinations ?? []).map(p => {
  const iface = net.devices.flatMap(d => d.interfaces).find(f => f.address?.prefix === p.prefix && network(f.address.ip, f.address.prefix) === p.dst);
  return segmentName(net, iface?.segmentId);
}).join(', ');
const scenarioName = (task, id) => task.record.scenarios?.find(s => s.id === id)?.title ?? (id === 'isp1-down' ? text.down : text.normal);

// Deliberately omit next-hop addresses and interface ids from the drawing DTO.
const drawingLeg = (leg, net) => leg && ({ ok: leg.ok, hops: leg.hops.map((h, i) => ({ deviceId: h.deviceId,
  segmentId: net.devices.find(d => d.id === h.deviceId)?.interfaces.find(f => f.id === h.egressId)?.segmentId ?? null,
  nextDeviceId: leg.hops[i + 1]?.deviceId ?? leg.stop?.nextDeviceId ?? null,
})), stop: leg.stop ? { deviceId: leg.stop.deviceId, nextDeviceId: leg.stop.nextDeviceId ?? null, code: leg.stop.code } : null });

function objectiveParams(task, result, definition, probeDef, allProbesPass) {
  const net = task.network, first = result.params.missing?.find(m => !probeDef || m.probeId === probeDef.id) ?? result.params.missing?.[0];
  const repairRouter = first?.deviceId ?? result.params.repairRouter ?? definition.routerId;
  const params = { type: definition.type, router: deviceName(net, repairRouter),
    to: probeDef ? nameOf(net, first?.direction === 'reply' ? probeDef.from : probeDef.to) : destinationNames(net, definition),
    lans: destinationNames(net, definition), reason: result.params.reason, loops: result.params.loops,
    expected: deviceName(net, definition.deviceId), actual: deviceName(net, result.params.actual),
    scenario: scenarioName(task, result.scenarioId), allProbesPass,
    ...(first ? { size: first.size } : {}),
  };
  return { params, repairRouter };
}

function sentence(code, params, type) {
  if (type === 'summary' && params.reason === 'too-wide') return text.objectives.summary(params);
  return (text.probe[code] ?? text.objectives[code] ?? text.objectives[type])?.(params) ?? text.formErrors;
}

/** Convert raw check evidence into the complete screen model. All rendered text
 * is names only; draw receives device/segment IDs, never IPs or interface IDs.
 * Every line has a short `state` and a full `text`. Safety lines have
 * `safety: true`, `cycle: [firstId, ..., firstId]` (null for ECMP) and
 * `trace: null`; identical directed cycles collapse within each scenario.
 * For ISP escapes the trace retains its physical stop, while `ringAt` and
 * `repairRouter` identify the last student router.
 * @param {object} task
 * @param {object} result check(task, answer)
 * @param {'cisco'|'routeros'|object} syntax
 * @returns {{ok:boolean,lines:object[],groups:object[],firstFailure:object|null,trace:object|null,repairRouter:string|null,strip:string,advice:object[],demonstrations:object[]}}
 */
export function presentCheck(task, result, syntax = 'cisco') {
  adapter(syntax);
  const net = task.network, evidence = result.evidence ?? {}, lines = [];
  const definitions = task.record.probes ?? [];
  const objectives = evidence.objectives ?? [];
  const allProbesPass = (evidence.probes ?? []).every(p => p.ok);
  for (const probe of evidence.probes ?? []) {
    const definition = definitions.find(p => p.id === probe.id);
    const attached = objectives.filter(o => o.scenarioId === probe.scenarioId && (
      o.params.probeId === probe.id || (task.variant.objectives.find(d => d.id === o.id)?.probeIds ?? []).includes(probe.id)
    )).map(o => {
      const def = task.variant.objectives.find(d => d.id === o.id);
      const { params, repairRouter } = objectiveParams(task, o, def, definition, allProbesPass);
      const missingHere = o.params.missing?.filter(m => m.probeId === probe.id);
      const ok = missingHere ? !missingHere.length : o.ok;
      return { id: o.id, ok, severity: o.severity, code: ok ? 'ok' : o.code, params, repairRouter };
    });
    const failed = attached.find(o => !o.ok && o.severity === 'blocks');
    const code = !probe.ok ? probe.code : failed?.code ?? 'ok';
    const leg = code === 'return-path-failed' ? probe.reply : probe.request;
    const stop = leg?.stop;
    const { routerId, escapedToIsp } = repairStop(net, leg);
    const repairRouter = !probe.ok ? routerId : failed?.repairRouter;
    const params = { from: nameOf(net, definition.from), to: nameOf(net, definition.to), router: deviceName(net, repairRouter), next: deviceName(net, stop?.nextDeviceId), supplied: stop?.supplied === true, escapedToIsp, scenario: scenarioName(task, probe.scenarioId), ...(probe.ok ? failed?.params ?? {} : {}) };
    const trace = { direction: code === 'return-path-failed' ? 'reply' : ['wrong-path', 'coverage-missing', 'internet-coverage-missing'].includes(code) ? 'both' : 'request', request: drawingLeg(probe.request, net), reply: drawingLeg(probe.reply, net), ...(!probe.ok ? { ringAt: repairRouter } : {}), downLinks: task.record.scenarios?.find(s => s.id === probe.scenarioId)?.downLinks ?? [] };
    const ok = probe.ok && !failed;
    let message = ok ? '' : sentence(code, params);
    if (code === 'return-path-failed') {
      const replyCode = stop?.code === 'no-route' && !escapedToIsp ? 'missing-return-route' : stop?.code;
      const replyParams = replyCode === 'missing-return-route' ? params : { ...params, from: params.to, to: params.from };
      message += ` ${sentence(replyCode, replyParams)}`;
    }
    lines.push({ id: `${probe.scenarioId ?? ''}/${probe.id}`, kind: 'probe', scenarioId: probe.scenarioId, label: probeLabel(net, definition.from, definition.to), status: ok ? 'pass' : 'fail', ok, code, params, text: message, objectives: attached, probe: { id: probe.id, ok: probe.ok, code: probe.code, request: trace.request, reply: trace.reply }, trace, repairRouter: repairRouter ?? null });
  }
  for (const objective of objectives) {
    const definition = task.variant.objectives.find(o => o.id === objective.id);
    if (['coverage', 'internet-coverage', 'path-via'].includes(definition.type)) continue;
    const { params, repairRouter } = objectiveParams(task, objective, definition, null, allProbesPass);
    const probeLine = lines.find(l => l.trace?.request?.hops.some(h => h.deviceId === repairRouter));
    lines.push({ id: objective.id, kind: 'objective', scenarioId: null, group: text.goal, label: text.objectiveLabel(definition.type, params), status: objective.ok ? 'pass' : objective.severity === 'advice' ? 'advice' : 'fail', ok: objective.ok, code: objective.code, params, text: objective.ok ? '' : sentence(objective.code, params, definition.type), objectives: [], repairRouter, trace: probeLine ? { ...probeLine.trace, direction: 'both' } : null });
  }
  const safetyFailures = new Map();
  for (const safety of evidence.safety ?? []) for (const missing of safety.params.missing) {
    const key = JSON.stringify([safety.scenarioId, missing.cycle ? cycleKey(missing.cycle) : missing.deviceId, missing.code]);
    const previous = safetyFailures.get(key);
    if (!previous || (missing.cycleCause === 'summary' && previous.missing.cycleCause !== 'summary')) safetyFailures.set(key, { safety, missing });
  }
  for (const [key, { safety, missing }] of safetyFailures) {
    const cycle = missing.cycle ? [...missing.cycle] : null;
    const repairRouter = cycle?.[0] ?? missing.deviceId;
    const code = missing.code === 'unsupported-ecmp' ? missing.code : 'unknown-space-loops';
    const params = { router: deviceName(net, repairRouter), next: deviceName(net, cycle?.[1] ?? missing.nextDeviceId),
      scenario: scenarioName(task, safety.scenarioId), cyclePath: cycle?.map(id => deviceName(net, id)).join(' → '), cycleLength: cycle ? cycle.length - 1 : 0,
      cycleCause: missing.cycleCause, summaryRouter: deviceName(net, missing.summaryRouter),
      summaryNext: deviceName(net, missing.summaryNext), supplied: missing.supplied === true };
    lines.push({ id: `safety:${key}`, kind: 'objective', safety: true, scenarioId: safety.scenarioId, label: text.unknown,
      status: 'fail', ok: false, code, params, text: sentence(code, params), cycle,
      repairRouter, trace: null, objectives: [] });
  }
  for (const finding of (result.findings ?? []).filter(f => f.code === 'invalid-distance')) {
    lines.unshift({ id: `distance:${finding.entity}`, kind: 'form', scenarioId: null,
      label: deviceName(net, finding.entity), status: 'fail', ok: false, code: finding.code,
      params: {}, text: text.invalidDistance, repairRouter: finding.entity, trace: null, objectives: [] });
  }
  const errors = result.formErrors ?? [];
  if (errors.length) lines.unshift(...errors.map((e, i) => ({ id: `form-${i}`, kind: 'form', label: deviceName(net, e.routerId), status: 'fail', ok: false, code: e.code, params: { router: deviceName(net, e.routerId) }, text: text.formErrors, repairRouter: e.routerId, trace: null, objectives: [] })));
  if (!result.ok && !lines.some(l => l.status === 'fail')) lines.push({ id: 'check-failure', kind: 'form', label: text.goal, status: 'fail', ok: false, code: result.code, params: {}, text: text.formErrors, trace: null, repairRouter: null, objectives: [] });
  for (const line of lines) {
    line.state = line.ok ? text.state.pass : line.status === 'advice' ? text.state.advice
      : line.kind === 'form' ? text.state.form
      : ['loop', 'ttl-exceeded', 'unknown-space-loops'].includes(line.code) ? text.state.loop
      : line.code === 'return-path-failed' ? text.state.reply(line.params.router)
      : line.kind === 'probe' && !line.probe.ok ? text.state.stopped(line.params.router) : text.state.objective;
  }
  const firstFailure = lines.find(l => l.status === 'fail' && l.kind === 'form')
    ?? lines.find(l => l.kind === 'probe' && !l.probe.ok)
    ?? lines.find(l => l.status === 'fail' && !l.safety)
    ?? lines.find(l => l.status === 'fail') ?? null;
  const advice = (evidence.advice ?? []).map(a => {
    const definition = task.variant.objectives.find(o => o.id === a.entity);
    const params = { router: deviceName(net, a.params.routerId), lans: definition ? destinationNames(net, definition) : '', reason: a.params.reason, loops: a.params.loops };
    return { code: a.code, params, text: sentence(a.code, params, definition?.type) };
  });
  const groups = [...new Set(lines.map(l => l.kind === 'probe' ? l.scenarioId : 'goal'))].map(id => ({ id, label: id === 'goal' ? text.goal : scenarioName(task, id), lines: lines.filter(l => (l.kind === 'probe' ? l.scenarioId : 'goal') === id) }));
  const demonstrations = result.ok ? (evidence.demonstrations ?? []).map(demo => {
    const stop = demo.request.stop, hops = demo.request.hops;
    const summaryHole = task.record.demonstrations.find(d => d.id === demo.id)?.kind === 'summary-hole';
    const escapedToIsp = summaryHole && net.devices.some(d => d.id === stop?.deviceId && d.kind === 'isp');
    const message = escapedToIsp ? text.demoSummaryEscape : stop?.code === 'discarded' ? text.demoDiscard(deviceName(net, stop.deviceId)) : stop?.code === 'loop' ? text.demoLoop(deviceName(net, stop.deviceId), deviceName(net, stop.nextDeviceId)) : demo.request.ok ? text.demoDelivered(net.endpoints.some(e => e.id === demo.to) ? nameOf(net, demo.to) : deviceName(net, hops.at(-1)?.deviceId)) : stop?.code === 'ttl-exceeded' ? text.demoLoop(deviceName(net, hops.at(-2)?.deviceId), deviceName(net, hops.at(-1)?.deviceId)) : text.demoStop(deviceName(net, stop?.deviceId));
    return { id: demo.id, label: summaryHole ? text.unused : text.unknownDemo, text: message, code: demo.request.ok ? 'ok' : stop?.code, trace: { direction: 'request', request: drawingLeg(demo.request, net), reply: null } };
  }) : [];
  return { ok: result.ok, lines, groups, firstFailure, trace: firstFailure?.trace ?? null, repairRouter: firstFailure?.repairRouter ?? null, strip: result.ok ? text.success : errors.length ? text.formErrors : text.failed(firstFailure.text), advice, demonstrations };
}

/** Names-only text equivalent of a probe, leg, or complete check evidence.
 * @returns {string[]} Request and reply descriptions, in evidence order.
 */
export function describeTrace(evidence, net, syntax = 'cisco') {
  if (evidence.probes) return evidence.probes.flatMap(p => describeTrace(p, net, syntax));
  const legs = ('request' in evidence) ? [['request', evidence.request], ['reply', evidence.reply]] : [['request', evidence]];
  return legs.filter(([, leg]) => leg).map(([direction, leg]) => {
    const sourceId = direction === 'reply' ? evidence.to : evidence.from;
    const targetId = direction === 'reply' ? evidence.from : evidence.to;
    const names = leg.hops.map(h => deviceName(net, h.deviceId));
    if (sourceId) names.unshift(nameOf(net, sourceId));
    if (leg.stop?.deviceId && leg.hops.at(-1)?.deviceId !== leg.stop.deviceId) names.push(deviceName(net, leg.stop.deviceId));
    if (leg.ok && targetId) names.push(nameOf(net, targetId));
    const path = names.filter((name, i) => i === 0 || name !== names[i - 1]).join(' → ');
    const { routerId, escapedToIsp } = repairStop(net, leg);
    const params = { from: sourceId ? nameOf(net, sourceId) : names[0], to: targetId ? nameOf(net, targetId) : text.unknown, router: deviceName(net, routerId), escapedToIsp, next: deviceName(net, leg.stop?.nextDeviceId), supplied: leg.stop?.supplied };
    const description = leg.ok ? text.traceArrived(path) : text.traceStop(path, sentence(leg.stop?.code, params));
    return direction === 'reply' ? text.traceReply(description) : text.traceRequest(description);
  });
}

/** Hint 3's main and backup default routes: the same values as the worked example (logic/examples.js, task 15). */
const DISTANCE_EXAMPLE = Object.freeze([{ dst: '0.0.0.0', prefix: 0, via: '192.0.2.1', distance: 1 }, { dst: '0.0.0.0', prefix: 0, via: '192.0.2.5', distance: 5 }]);

/** Build a three-rung ladder from the current parsed answer's first failure.
 * Called by logic.hints; unparseable/null rows have already been discarded.
 * Rung 3 alone is designated example content; commands use documentation ranges.
 */
export function hintLadder(task, result, syntax = 'cisco') {
  const view = presentCheck(task, result, syntax), failure = view.firstFailure;
  const params = failure?.params ?? {}, type = params.type;
  const code = failure?.code ?? 'ok';
  const key = ['objective-not-met', 'distance-order'].includes(code) ? (type === 'summary' && params.reason === 'too-wide' ? 'summary-too-wide' : type) : code === 'internet-coverage-missing' || (code === 'no-route' && params.to === text.internet) ? 'internet' : code;
  // Rung 1 says where to look (the router's table and the row to find), not
  // the verdict again (round 4 2b repair, Fable): the check names the stop.
  const toward = code === 'return-path-failed' ? params.from : params.to;
  // A stop on a router (no route there, no way back); loops and objectives keep their own words (they name the cycle).
  const stop = ['no-route', 'return-path-failed', 'missing-return-route'].includes(code) && params.router;
  const evidence = result.ok ? text.success : stop ? text.hintLook({ router: params.router, toward }) : failure.text;
  let move = result.ok ? text.hintsReady : (text.hint2[key] ?? text.hintsMove)(params);
  const distanceTask = task.record.id === 'routing.task-15';
  if (distanceTask) move += ` ${text.distanceMove}`;
  let kind = params.supplied ? 'specific' : code === 'return-path-failed' ? 'reply' : ['loop', 'ttl-exceeded', 'unknown-space-loops'].includes(code) ? 'loop' : code === 'coverage-missing' ? 'coverage' : ['wrong-path', 'unsupported-ecmp', 'distance-order', 'invalid-distance'].includes(code) ? 'distance' : key === 'internet' || type === 'default-on' ? 'default' : type === 'summary' ? 'summary' : 'specific';
  if (distanceTask) kind = 'distance';
  const objective = task.variant.objectives.find(o => o.id === failure?.id);
  if (kind === 'summary' && objective?.destinations.length === 4) kind = 'summaryFour';
  if (code === 'unknown-space-loops' && params.cycleCause === 'summary'
    && task.record.demonstrations?.some(d => d.kind === 'summary-hole')) kind = 'discard';
  // Round 5 5b-2 (repair v1, Fable 3): the distance example uses the worked example's values (main 192.0.2.1 at 1, backup 192.0.2.5 at 5).
  const route = kind === 'distance' ? DISTANCE_EXAMPLE[0]
    : { dst: kind === 'reply' || kind.startsWith('summary') ? '192.0.2.0' : kind === 'default' ? '0.0.0.0' : '198.51.100.0', prefix: kind === 'default' ? 0 : 24, via: kind === 'specific' ? '203.0.113.2' : '203.0.113.1' };
  const commands = ['loop', 'coverage'].includes(kind) ? [] : [adapter(syntax).command(kind === 'discard' ? { dst: '192.0.2.0', prefix: 24, discard: true } : route)];
  if (kind === 'distance') commands.push(adapter(syntax).command(DISTANCE_EXAMPLE[1]));
  // Task 15 teaches distance in both command languages, even when its first
  // failure is a missing route rather than a distance-order finding.
  const commandsBySyntax = distanceTask ? Object.fromEntries(syntaxList.map(s => [s.id, DISTANCE_EXAMPLE.map(r => s.command(r))])) : null;
  const exampleText = commandsBySyntax ? text.distanceExample(commandsBySyntax) : text.exampleLabel(text.examples[kind](commands.join('\n')));
  return [
    { code: 'hint-question', params: { text: evidence }, rung: 1, provenance: 'evidence' },
    { code: 'hint-evidence', params: { text: move }, rung: 2, provenance: 'rule' },
    { code: 'hint-example', params: { text: exampleText, commands, kind, ...(commandsBySyntax ? { commandsBySyntax } : {}) }, rung: 3, provenance: 'example' },
  ];
}
