import { makeRng } from '../../../engine/rng.js';
import { createScenario, clientState, probe, dnsLookup } from './probes.js';
import * as out from './outputs.js';
import { claims as words, claimNotes, examples, verdicts } from '../uk.js';

export const id = 'checks-claims';
export const version = 2;
export const generatorVersion = 1;
export const templates = Object.freeze([
  { id: 'dhcp-used', level: 1 }, { id: 'gateway-dhcp', level: 1 }, { id: 'reply', level: 1 },
  { id: 'dns-from-ping', level: 1 }, { id: 'dns-answer', level: 1 }, { id: 'ssh-login', level: 1 },
  { id: 'icmp-service', level: 1 }, { id: 'binding-options', level: 2 },
  { id: 'route-choice', level: 2 }, { id: 'nat-state', level: 2 },
].map(Object.freeze));
export const verdictIds = Object.freeze(['yes', 'no', 'insufficient']);

/** 2/7 Windows and 1/3 router templates are insufficient: 3/10 overall.
 * Outcome selection is deterministic and independent of vendor. Expected
 * line IDs and verdicts are derived below from what is actually displayed;
 * no hidden scenario truth is consulted by either grading function. */
export function createClaim(level = 1, vendor = 'cisco', seed = 0, { templateId, outcome, otherAddresses = true, example = false } = {}) {
  if (![1, 2].includes(level)) throw new RangeError('invalid-checks-level');
  const rng = makeRng(`checks:claims:${level}:${seed}`), candidates = templates.filter(t => t.level === level);
  templateId ??= rng.pick(candidates).id;
  if (!candidates.some(t => t.id === templateId)) throw new RangeError('invalid-checks-claim');
  const choose = (values) => {
    if (outcome !== undefined && !values.includes(outcome)) throw new RangeError('invalid-checks-claim-outcome');
    return outcome ?? rng.pick(values);
  };
  const s = createScenario(seed, { level: 2, vendor, faultId: 'healthy', otherAddresses, example });
  let outputs, required = [], verdict, observed;
  const shown = (output, keys) => { outputs = [output]; required = out.lineIds(output, keys); };
  if (templateId === 'dhcp-used') {
    const state = choose(['bound', 'link-local']) === 'bound' ? clientState(s) : { ...clientState(s), address: '169.254.23.57', prefix: 16, dhcpServer: null, leaseObtained: null };
    shown(out.ipconfig(state), ['address', 'dhcp-enabled', ...(state.dhcpServer ? ['dhcp-server'] : [])]);
    verdict = state.dhcpServer ? 'yes' : 'no';
  } else if (templateId === 'gateway-dhcp') {
    shown(out.ipconfig(s), ['gateway', 'dhcp-enabled', 'dhcp-server']); verdict = 'insufficient';
  } else if (['reply', 'dns-from-ping'].includes(templateId)) {
    const value = choose(['reply', 'timeout', 'unreachable']); observed = value;
    const result = { ...probe(s), outcome: value, reporter: value === 'unreachable' ? s.topology.router : s.remoteIp };
    shown(out.ping(result), templateId === 'dns-from-ping' ? [] : ['result']);
    verdict = templateId === 'dns-from-ping' ? 'insufficient' : value === 'reply' ? 'yes' : 'no';
  } else if (templateId === 'dns-answer') {
    const value = choose(['answer', 'nxdomain', 'timeout', 'wrong-answer']);
    if (value === 'nxdomain') delete s.dnsRecords[s.websiteName];
    if (value === 'timeout') s.dnsMode = 'timeout';
    if (value === 'wrong-answer') s.dnsRecords[s.websiteName] = s.topology.providerDns[1];
    const result = dnsLookup(s); observed = result.outcome;
    shown(out.nslookup(result), ['name', ...(result.address ? ['answer'] : ['result'])]);
    // Even an incorrect answer is still an answer. This claim does not ask
    // whether it is the desired server: that would require a trusted record.
    verdict = result.address ? 'yes' : 'no';
  } else if (templateId === 'ssh-login') {
    s.services.ssh = choose(['authenticated', 'denied', 'refused', 'timeout', 'host-key']); observed = s.services.ssh;
    const result = probe(s, { destination: s.topology.router, protocol: 'tcp', service: 'ssh' });
    shown(out.ssh(result, 'netadmin', s.vendor), ['result']); verdict = result.outcome === 'authenticated' ? 'yes' : 'no';
  } else if (templateId === 'icmp-service') {
    const value = choose(['authenticated', 'denied']); observed = value;
    s.icmpFilters = ['R1']; s.services.ssh = value;
    const ping = out.ping(probe(s, { destination: s.topology.router }));
    const ssh = out.ssh(probe(s, { destination: s.topology.router, protocol: 'tcp', service: 'ssh' }), 'netadmin', s.vendor);
    outputs = [ping, ssh]; required = [...out.lineIds(ping, ['result']).map(id => `0.${id}`), ...out.lineIds(ssh, ['result']).map(id => `1.${id}`)];
    verdict = value === 'authenticated' ? 'yes' : 'no';
  } else if (templateId === 'binding-options') {
    shown(out.bindings(s), ['binding', ...(s.vendor !== 'cisco' ? ['status'] : [])]); verdict = 'insufficient';
  } else if (templateId === 'route-choice') {
    const value = choose(['present', 'absent']);
    if (value === 'absent') { s.config.routing.staticDefault = ''; s.config.routing.dhcpDefault = false; }
    const output = out.routes(s);
    shown(output, value === 'present' ? ['default', 'default-next'] : s.vendor === 'cisco' ? ['last-resort'] : output.lines.map(l => l.key).filter(k => k.startsWith('route-')));
    verdict = value === 'present' ? 'yes' : 'no';
  } else {
    const value = choose(['srcnat', 'empty', 'bare']);
    const entries = value === 'empty' ? [] : probe(s).natState.map(e => ({ ...e, srcnat: value !== 'bare' }));
    if (value === 'bare' && s.vendor === 'cisco') {
      // IOS translations cannot contain a non-translated connection. Its
      // equivalent displayed evidence is an empty translation table.
      shown(out.nat([], s.vendor), ['inside-columns', 'outside-columns']); verdict = 'no';
    } else {
      const output = out.nat(entries, s.vendor);
      shown(output, s.vendor === 'cisco' ? entries.length ? ['inside-global', 'inside-local'] : ['inside-columns', 'outside-columns']
        : entries.length ? ['entry', 'src', 'reply-dst'] : ['flags']);
      verdict = value === 'srcnat' ? 'yes' : 'no';
    }
  }
  // Physical wrapping and reflowed table columns remain one selectable
  // observation. The terminal renderer still enforces its physical budget.
  const lines = outputs.flatMap((output, index) => logicalLines(output).map(line => ({ ...line,
    id: outputs.length > 1 ? `${index}.${line.id}` : line.id, outputIndex: index })));
  const canonical = raw => {
    const [index, id] = outputs.length > 1 ? [Number(raw.split('.')[0]), raw.slice(raw.indexOf('.') + 1)] : [0, raw];
    return lines.find(l => l.outputIndex === index && l.physicalIds.includes(id))?.id;
  };
  required = [...new Set(required.map(canonical).filter(Boolean))];
  let evidenceGroups = required.map(id => [id]), optionalLineIds = [];
  if (templateId === 'reply') {
    // Received packets can include ICMP errors, so a positive Echo Reply
    // still needs the result. A zero-received summary also proves failure.
    evidenceGroups = [observed === 'timeout' ? ['result', 'summary', 'loss'] : ['result']];
    optionalLineIds = ['summary', 'loss'];
  }
  if (templateId === 'icmp-service') {
    evidenceGroups = [['0.result', '0.summary', '0.loss'], ['1.result', ...(observed === 'authenticated' ? ['1.clock', '1.prompt'] : [])]];
    optionalLineIds = observed === 'authenticated' ? ['1.password'] : [];
  }
  if (templateId === 'ssh-login' && observed === 'authenticated') {
    evidenceGroups = [['result', 'clock', 'prompt']]; optionalLineIds = ['password'];
  }
  if (templateId === 'ssh-login' && observed === 'host-key') evidenceGroups = [['key', 'host', 'fingerprint', 'result']];
  if (templateId === 'route-choice' && s.vendor === 'cisco' && verdict === 'yes') evidenceGroups = [['default', 'last-resort']];
  if (templateId === 'binding-options') evidenceGroups = [lines.filter(l => l.key.startsWith('binding')).map(l => l.id)];
  if (templateId === 'nat-state') {
    const entry = s.vendor === 'cisco' ? 'translation' : 'connection';
    const headerIds = lines.filter(l => ![entry].includes(l.id)).map(l => l.id);
    evidenceGroups = lines.some(l => l.id === entry) ? [[entry]] : [];
    optionalLineIds = headerIds;
    required = evidenceGroups.map(g => g[0]);
  }
  const note = claimNotes[templateId];
  return { id, version, generatorVersion, level, vendor: s.vendor, seed, templateId, claim: words[templateId], outputs, lines,
    expectedLineIds: required, evidenceGroups, optionalLineIds, verdict,
    explanation: typeof note === 'function' ? note(observed ?? verdict) : note };
}

/** One button per logical observation, including every wrapped continuation
 * and every part of a split table entry. Text keeps its physical newlines. */
export function logicalLines(output) {
  const keyOf = key => {
    if (output.command === 'show ip nat translations') return key.endsWith('columns') ? 'columns' : 'translation';
    if (output.command === '/ip firewall connection print detail' && key !== 'flags') return 'connection';
    if (/^(binding|lease|status)(-\d+)?$/.test(key)) return key.replace(/^(lease|status)/, 'binding');
    if (key === 'default-next') return 'default';
    if (key.startsWith('next-')) return key.replace('next-', 'route-');
    return key;
  };
  const lines = new Map();
  for (const line of output.lines) {
    const key = keyOf(line.key);
    const previous = lines.get(key);
    if (previous) { previous.text += `\n${line.text}`; previous.physicalIds.push(line.id); }
    else lines.set(key, { id: key, key, text: line.text, physicalIds: [line.id] });
  }
  return [...lines.values()];
}

/** Each required evidence group needs any one of its observations. Extra
 * relevant observations are welcome; unrelated/unknown/duplicate IDs fail.
 * [] explicitly means no evidence lines, valid e.g. for an empty table. */
export function checkLines(task, selectedLineIds) {
  const ids = Array.isArray(selectedLineIds) ? selectedLineIds : null;
  const groups = task.evidenceGroups;
  const relevant = new Set([...groups.flat(), ...task.optionalLineIds]);
  const ok = !!ids && new Set(ids).size === ids.length
    && groups.every(group => group.some(id => ids.includes(id)))
    && ids.every(id => relevant.has(id) && task.lines.some(l => l.id === id));
  return { ok, code: ok ? 'lines' : 'evidence-lines' };
}
export function checkVerdict(task, verdict, selectedLineIds) {
  const lines = checkLines(task, selectedLineIds);
  return { ok: lines.ok && verdictIds.includes(verdict) && verdict === task.verdict, linesOk: lines.ok, code: !lines.ok ? 'evidence-lines' : 'verdict', text: task.explanation };
}
export function verdictChoices() { return verdictIds.map(id => ({ id, text: verdicts[id] })); }
export function claimExample({ vendor = 'cisco' } = {}) {
  const task = createClaim(1, vendor, 'example', { templateId: 'gateway-dhcp', example: true });
  return { context: examples.claimsContext, task, answer: { lines: [...task.expectedLineIds], verdict: task.verdict }, result: checkVerdict(task, task.verdict, task.expectedLineIds) };
}
