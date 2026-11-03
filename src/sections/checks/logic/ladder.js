import { contains, network, parseIp } from '../../../engine/ip.js';
import { createScenario, createRoutingScenario, clientState, probe, dnsLookup, httpFetch, traceRoute } from './probes.js';
import * as out from './outputs.js';
import { ladder as words, places, examples } from '../uk.js';

export const id = 'checks-ladder';
export const version = 1;
export const generatorVersion = 1;
export const fixedRungs = Object.freeze(['config', 'gateway', 'remote', 'dns']);
export const placeIds = Object.freeze(['link', 'address', 'gateway', 'exit', 'dns', 'more']);

export function createLadder(level = 1, vendor = 'cisco', seed = 0, options = {}) {
  const scenario = options.routing
    ? createRoutingScenario(options.routing.record, options.routing.routes, { seed, vendor, ...options.routing })
    : createScenario(seed, { ...options, level, vendor });
  if (level === 1 && options.routing) throw new RangeError('checks-routing-requires-level-2');
  return { id, version, generatorVersion, level, vendor: scenario.vendor, seed, scenario, task: level === 1 ? words.task : words.chosenTask };
}
export const maxName = 63;
const hostName = name => name.length <= 253 && !/^[\d.]+$/.test(name) && name.split('.').every(label =>
  /^[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?$/.test(label));
export function parseArgument(value) {
  const text = typeof value === 'string' ? value.trim() : '';
  const ip = parseIp(text);
  if (ip !== null) return { ok: true, kind: 'ip', value: ip };
  const name = text.replace(/\.$/, '').toLowerCase();
  // A valid DNS name can be 253 characters; the 40 × 10 terminal can't show
  // one that long in every output, so it gets its own controlled message.
  if (name.length > maxName && hostName(name)) return { ok: false, code: 'argument-length', text: words.argumentLong(maxName) };
  // A malformed dotted numeric address must not pass as a hostname. Names
  // are ASCII DNS host labels, no URLs, credentials, switches or shell input.
  if (hostName(name)) return { ok: true, kind: 'name', value: name };
  return { ok: false, code: 'argument', text: words.argument(String(value ?? '')) };
}
export function rungs(task) {
  const s = task.scenario, c = clientState(s), gateway = s.pc?.gateway ?? c.gateway ?? s.topology.router;
  const specs = [
    ['config', 'ipconfig /all', null], ['gateway', `ping ${gateway}`, gateway],
    ['remote', `ping ${s.remoteIp}`, s.remoteIp], ['dns', `nslookup ${s.websiteName}`, s.websiteName],
  ];
  if (task.level === 2) specs.push(['trace', `tracert -d ${s.remoteIp}`, s.remoteIp], ['ssh', `ssh netadmin@${s.pc?.gateway ?? s.topology.router}`, s.pc?.gateway ?? s.topology.router],
    ['http', `curl -i http://${s.websiteName}/`, s.websiteName], ['interfaces', s.vendor === 'cisco' ? 'show ip interface brief' : '/interface print', null],
    ...(!s.networkModel && s.vendor !== 'cisco' ? [['addresses', '/ip address print', null]] : []),
    ['routes', s.vendor === 'cisco' ? 'show ip route' : '/ip route print', null],
    ...(!s.networkModel ? [['bindings', s.vendor === 'cisco' ? 'show ip dhcp binding' : '/ip dhcp-server lease print', null],
      ['nat', s.vendor === 'cisco' ? 'show ip nat translations' : '/ip firewall connection print detail', null],
      ['routerPing', `ping ${s.remoteIp}`, s.remoteIp]] : []));
  return specs.map(([id, command, target]) => ({ id, command, target, label: `${command} — ${words.rung[id]}`, argument: target !== null, place: id === 'routerPing' ? 'router' : ['interfaces', 'addresses', 'routes', 'bindings', 'nat'].includes(id) ? 'router' : 'pc' }));
}
/** Every NAT entry the collected checks created: a probe's own, a named
 * target's DNS query, and each tracert slot that crossed the router. */
function natOf(result) {
  if (!result) return [];
  return [...(result.natState ?? []), ...(result.hops ?? []).flatMap(h => h.slots.flatMap(natOf))];
}
function collectedNat(evidence) {
  const entries = evidence.flatMap(e => natOf(e.result));
  return [...new Map(entries.map(e => [JSON.stringify([e.protocol, e.inside, e.remote]), e])).values()];
}

/** What the learner is shown before the first output, and the only thing
 * the outputs are compared with: the LAN (network, prefix, gateway), the
 * trusted DNS record, the remote address, and (L2) what must work. */
export function requirements(task) {
  const s = task.scenario;
  if (s.networkModel) {
    const f = s.networkModel.devices.flatMap(d => d.interfaces).find(i => i.address?.ip === s.pc.gateway).address;
    return { network: network(f.ip, f.prefix), prefix: f.prefix, gateway: s.pc.gateway, record: null, remote: s.remoteIp,
      checks: task.level === 2 ? ['remote'] : [] };
  }
  const t = s.topology;
  return { network: t.network, prefix: t.prefix, gateway: t.router, record: { name: s.websiteName, address: t.website },
    remote: s.remoteIp, checks: task.level === 2 ? ['remote', 'http', 'ssh'] : [] };
}
export function requirementLines(task) {
  const r = requirements(task);
  return [words.lan(`${r.network}/${r.prefix}`, r.gateway), ...(r.record ? [words.record(r.record.name, r.record.address)] : []),
    ...(r.checks.length ? [words.mustWork(r.checks.map(id => words.must[id](id === 'remote' ? r.remote : id === 'http' ? r.record.name : r.gateway)))] : [])];
}

/** Where a probe went, from its source, destination and protocol only
 * (never from the rung that produced it): the PC's own gateway, another
 * on-link address, or off-link; a router-originated probe to the LAN or out. */
function reachOf(task, result, destination) {
  const s = task.scenario, r = requirements(task);
  if (result?.source?.address && result.source.address !== clientState(s).address) {
    return contains(r.network, r.prefix, destination) ? 'router-lan' : 'router';
  }
  const c = clientState(s);
  if (destination === c.gateway) return 'gateway';
  return result?.onLink ?? contains(c.address, c.prefix ?? 32, destination) ? 'local' : 'remote';
}
function routerTableFacts(task, rungId, evidence) {
  const s = task.scenario, r = requirements(task);
  if (rungId === 'routes') {
    return { success: out.routeRows(s).some(row => contains(row.network, row.prefix, r.remote)), places: ['exit'] };
  }
  if (rungId === 'interfaces') {
    const states = out.interfaceRows(s), down = states.filter(f => f.disabled || !f.up || !f.protocol);
    return { success: !down.length, places: down.some(f => f.address === r.gateway) ? ['link', 'gateway'] : ['exit'] };
  }
  if (rungId === 'addresses') {
    const data = s.addressStates ?? [{ address: s.topology.router, prefix: s.topology.prefix }];
    return { success: data.some(f => !f.disabled && f.address === r.gateway && f.prefix === r.prefix), places: ['gateway'] };
  }
  if (rungId === 'bindings') {
    const leases = out.bindingRows(s);
    return { success: leases.some(l => l.status === 'bound' && contains(r.network, r.prefix, l.address)), places: ['address'] };
  }
  // An empty table before traffic proves little: it is unexpected only after
  // the LAN side answered and the PC sent traffic out.
  const facts = evidence.filter(e => e.ok).map(e => e.facts);
  const lanOk = facts.some(f => ['gateway', 'local', 'remote'].includes(f.scope) && f.success);
  const sentOut = facts.some(f => f.outbound);
  return { success: collectedNat(evidence).length > 0 || !(lanOk && sentOut), places: ['exit'] };
}

/** result is private probe detail; output is the entire displayed evidence.
 * facts are normalized observations compared only with requirements(task),
 * which the screen shows first; they are not diagnoses. Screens render
 * output only, and pass collected rows to grading. */
export function runRung(task, rungId, argument, evidence = []) {
  const rung = rungs(task).find(r => r.id === rungId);
  if (!rung) return { ok: false, code: 'rung', text: words.unknownRung };
  let target = rung.target;
  if (argument !== undefined && rung.argument) {
    const parsed = parseArgument(argument);
    if (!parsed.ok) return parsed;
    target = parsed.value;
  }
  const s = task.scenario, req = requirements(task);
  const command = rung.argument ? rung.command.replace(rung.target, target) : rung.command;
  let result, output, expected = true, facts = { scope: rungId };
  let destination = target, dns = null;
  if (['gateway', 'remote', 'routerPing', 'ssh', 'trace'].includes(rungId) && parseIp(target) === null) {
    dns = dnsLookup(s, target);
    if (!dns.ok) {
      output = out.terminal(command, [['result', rungId === 'ssh' ? `Could not resolve hostname ${target}` : `Unable to resolve target ${target}`]]);
      return { ok: true, id: rungId, target, command, output, result: { ...dns, outcome: 'dns-failure' },
        facts: { scope: 'dns', success: false, outcome: dns.outcome, outbound: true }, expected: false, folded: `${command} — ${words.folded['dns-failure']}` };
    }
    destination = dns.address;
  }
  const withDns = r => dns ? { ...r, natState: [...dns.natState, ...(r.natState ?? [])], dns } : r;
  if (rungId === 'config') {
    result = clientState(s); output = out.ipconfig(s);
    const addressValid = contains(req.network, req.prefix, result.address) === true && result.prefix === req.prefix;
    const gatewayValid = result.gateway === req.gateway;
    expected = s.linkUp && addressValid && gatewayValid;
    facts = { ...facts, linkUp: s.linkUp, addressValid, gatewayValid };
  } else if (['gateway', 'remote', 'routerPing', 'ssh'].includes(rungId)) {
    const service = rungId === 'ssh' ? 'ssh' : undefined;
    result = withDns(probe(s, { destination, source: rungId === 'routerPing' ? 'router' : 'pc', protocol: service ? 'tcp' : 'icmp', service }));
    output = service ? out.ssh(result) : out.ping(result, rungId === 'routerPing' ? s.vendor : 'windows');
    const reach = reachOf(task, result, destination);
    expected = result.ok;
    facts = { ...facts, scope: service ?? reach, reach, destination, success: result.ok, outcome: result.outcome,
      outbound: reach === 'remote' || !!dns };
  } else if (rungId === 'dns') {
    result = dnsLookup(s, target); output = out.nslookup(result);
    // Compared with the trusted record the learner was shown. A name without
    // one only asks whether the resolver answered (NXDOMAIN is an answer).
    const record = req.record && parseIp(target) === null && req.record.name === target ? req.record : null;
    expected = record ? result.outcome !== 'timeout' && result.address === record.address : result.outcome !== 'timeout';
    facts = { ...facts, success: expected, outcome: result.outcome, outbound: true };
  } else if (rungId === 'http') {
    result = httpFetch(s, target); output = out.http(result); expected = result.ok;
    facts = { ...facts, success: result.ok, outcome: result.outcome, outbound: true, name: target };
  } else if (rungId === 'trace') {
    result = withDns(traceRoute(s, destination)); output = out.tracert(result); expected = result.ok;
    const reach = reachOf(task, null, destination);
    facts = { ...facts, scope: reach === 'gateway' || reach === 'local' ? reach : 'remote', reach, destination, success: result.ok,
      outcome: 'trace', outbound: reach === 'remote' || !!dns };
  } else {
    result = { outcome: 'table', natState: [] };
    if (rungId === 'nat') { result.entries = collectedNat(evidence); output = out.nat(result.entries, s.vendor); }
    else output = out[rungId](s);
    const table = routerTableFacts(task, rungId, evidence);
    expected = table.success;
    facts = { ...facts, success: table.success, places: table.places };
  }
  const outcome = rungId === 'config' ? s.linkUp ? 'up' : 'down' : result.outcome;
  return { ok: true, id: rungId, target, command: output.command, output, result, facts, expected,
    folded: `${output.command} — ${words.folded[outcome] ?? words.folded.table}` };
}

/** «потрібно більше даних» is a real answer only while the evidence leaves
 * a choice: with exactly one consistent place it would always win (Fable 1).
 * With none (contradictory evidence) it stays the only way on. */
const withMore = consistent => (consistent.length === 1 ? consistent : [...consistent, 'more']);

/** Evidence-consistent investigation places. Only observed facts enter this
 * function, never task.faultId or unrun probes. The PC's failed gateway ping
 * retains both address and gateway even after plausible ipconfig settings.
 * A successful ICMP test to one remote IP does not establish UDP/DNS health.
 * The five places are deliberately broader than individual fault diagnoses. */
export function acceptedPlaces(evidence) {
  const facts = evidence.filter(e => e.ok).map(e => e.facts);
  const config = facts.find(f => f.scope === 'config');
  if (config?.linkUp === false) return withMore(['link']);
  if (config?.addressValid === false) return withMore(['address']);
  const gatewayOk = facts.some(f => f.scope === 'gateway' && f.success);
  // Any delivered PC check beyond the LAN also shows the link and gateway work.
  const pathOk = gatewayOk || facts.some(f => f.success && (f.scope === 'remote' || f.scope === 'http' || (f.reach === 'remote' && f.scope === 'ssh')));
  const failures = facts.filter(f => f.success === false);
  const observedService = facts.some(f => ['ssh', 'http'].includes(f.scope));
  let possible = new Set(['link', 'address', 'gateway', 'exit', 'dns', ...(observedService ? ['service'] : [])]);
  if (config?.linkUp || pathOk || facts.some(f => f.scope === 'local' && f.success)) possible.delete('link');
  if (config?.addressValid && config?.gatewayValid !== false && pathOk) possible.delete('address');
  if (pathOk) possible.delete('gateway');
  const sets = {
    gateway: ['link', 'address', 'gateway'], local: ['link', 'address'], remote: ['link', 'address', 'gateway', 'exit'],
    dns: ['link', 'address', 'gateway', 'exit', 'dns'], http: ['link', 'address', 'gateway', 'exit', 'dns', 'service'],
    router: ['exit'], 'router-lan': ['link', 'address'],
  };
  if (config?.gatewayValid === false) possible = new Set([...possible].filter(p => ['address', 'gateway'].includes(p)));
  if (failures.some(f => f.scope === 'gateway')) { possible.add('address'); possible.add('gateway'); }
  for (const f of failures) {
    const respondingService = (f.scope === 'ssh' && ['denied', 'refused', 'host-key'].includes(f.outcome))
      || (f.scope === 'http' && ['http-error', 'refused'].includes(f.outcome));
    const dnsAnswer = f.scope === 'dns' && ['wrong-answer', 'nxdomain'].includes(f.outcome);
    const candidates = f.places ?? (respondingService ? ['service'] : dnsAnswer ? ['dns']
      : f.scope === 'ssh' ? [...sets[f.reach === 'router' || f.reach === 'router-lan' ? 'remote' : f.reach], 'service'] : sets[f.scope]);
    if (!candidates) continue;
    possible = new Set([...possible].filter(p => candidates.includes(p)));
  }
  if (!failures.length) {
    if (facts.some(f => f.scope === 'remote' && f.success)) possible.delete('exit');
    if (facts.some(f => f.scope === 'dns' && f.success)) possible.delete('dns');
  }
  // A failed echo plus an authenticated session on the same gateway is
  // evidence about ICMP, not a broken service or proven NAT failure.
  const sshGateway = facts.filter(f => f.scope === 'ssh' && f.success).map(f => f.destination);
  if (failures.some(f => f.scope === 'gateway' && sshGateway.includes(f.destination))) possible = new Set(['gateway']);
  return withMore([...placeIds.filter(id => possible.has(id)), ...(possible.has('service') ? ['service'] : [])]);
}
export function startLadder(task) {
  return { index: 0, stopped: false, evidence: task.level === 1 ? [runRung(task, 'config')] : [] };
}
export function advance(task, state) {
  if (task.level !== 1 || state.stopped || state.index >= fixedRungs.length - 1) return state;
  const index = state.index + 1;
  return { index, stopped: false, evidence: [...state.evidence, runRung(task, fixedRungs[index], undefined, state.evidence)] };
}
export function chooseRung(task, state, rungId, argument) {
  if (task.level !== 2 || state.stopped) return { ok: false, code: 'rung', text: words.unknownRung };
  const row = runRung(task, rungId, argument, state.evidence);
  if (!row.ok) return row;
  return { ...state, index: state.evidence.length, evidence: [...state.evidence, row] };
}
export function stopLadder(state) { return { ...state, stopped: true }; }
export function canAdvance(task, state) { return task.level === 1 && !state.stopped && state.index < fixedRungs.length - 1; }
export function gradeStop(task, evidence, place) {
  const full = task.level === 1 ? fixedRungs.map(id => runRung(task, id)) : [];
  const first = task.level === 1 ? full.find(e => !e.expected) : evidence.find(e => !e.expected);
  const last = evidence.at(-1), stoppedAtEarliest = !!first && (task.level === 1 ? last?.id === first.id : last === first);
  const accepted = acceptedPlaces(evidence), placeAccepted = accepted.includes(place);
  const index = task.level === 1 ? fixedRungs.indexOf(last?.id) : -1;
  const foldedNext = task.level === 1 && last?.expected && index >= 0 && index < 3 ? full[index + 1].folded : null;
  return { ok: stoppedAtEarliest && placeAccepted, stoppedAtEarliest, placeAccepted, acceptedPlaces: accepted,
    earliest: first ? { id: first.id, command: first.command, index: task.level === 1 ? fixedRungs.indexOf(first.id) : evidence.indexOf(first) } : null,
    foldedNext,
    // A stop elsewhere is about the stop only: the place's sentence would read as half a pass (Fable 2).
    text: [first ? words.earliest(first.command) : words.noneUnexpected, first ? stoppedAtEarliest ? words.stoppedThere : words.stoppedElsewhere : '',
      first && !stoppedAtEarliest ? ''
        : place === 'more' ? (placeAccepted ? words.more : words.moreNotNeeded(places[accepted[0]]))
          : placeAccepted ? words.consistent : words.inconsistent].filter(Boolean).join(' '),
  };
}
/** «Усе працює» (L2): checks can confirm health too. Accepted when no
 * collected result was unexpected and every listed requirement has its own
 * successful observation; otherwise the text names what is missing. */
export function gradeHealthy(task, evidence) {
  const r = requirements(task), rows = evidence.filter(e => e.ok);
  const first = rows.find(e => !e.expected);
  const seen = {
    remote: rows.some(e => e.facts.scope === 'remote' && e.facts.success && e.facts.destination === r.remote),
    http: rows.some(e => e.facts.scope === 'http' && e.facts.success && e.facts.name === r.record?.name),
    ssh: rows.some(e => e.facts.scope === 'ssh' && e.facts.success && e.facts.destination === r.gateway),
  };
  const missing = r.checks.filter(id => !seen[id]);
  const ok = task.level === 2 && !first && !missing.length;
  return { ok, missing, earliest: first ? { id: first.id, command: first.command, index: evidence.indexOf(first) } : null,
    text: first ? words.healthyUnexpected(first.command)
      : missing.length ? words.healthyMissing(missing.map(id => words.must[id](id === 'remote' ? r.remote : id === 'http' ? r.record.name : r.gateway)))
        : words.healthyOk };
}
export function placeChoices(evidence, level = 1) {
  const ids = [...placeIds];
  if (level === 2 && evidence.some(e => ['ssh', 'http'].includes(e.id))) ids.splice(ids.length - 1, 0, 'service');
  return ids.map(id => ({ id, text: places[id] }));
}
export function ladderExample({ vendor = 'cisco' } = {}) {
  const task = createLadder(1, vendor, 'example', { example: true, faultId: 'dns' });
  const evidence = fixedRungs.map(id => runRung(task, id));
  return { context: examples.context, note: examples.note, task, evidence,
    rows: evidence.map(e => ({ id: e.id, folded: e.folded, output: e.output, stopped: e.id === 'dns' })),
    answer: { stop: 'dns', place: 'more' }, result: gradeStop(task, evidence, 'more') };
}
