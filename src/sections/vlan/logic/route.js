import { flood, ping3, ping3Codes, attachmentStatus, peer } from '../../../engine/l2.js';
import { compileL3 } from '../../../engine/l3-config.js';
import { role, prefixToMask } from '../../../engine/ip.js';
import { validSeed, identity } from './model.js';
import { validRouteRecord, generateRoute, blankAnswer, routerReference, switchReference, clone, label, givens, syntaxes } from './route-model.js';
import { render as renderL2 } from './render.js';
import { describe as describeL2 } from './describe.js';
import { t, routeText } from '../uk.js';
export { givens } from './route-model.js';
export const id = 'vlan-route', version = 1;
export const codes = Object.freeze([...new Set([...ping3Codes,
  'invalid-config', 'invalid-record', 'invalid-bank', 'bad-vid', 'cisco-reserved-vid',
  'missing-encapsulation', 'duplicate-encapsulation', 'duplicate-interface', 'unknown-interface',
  'invalid-address', 'missing-prefix', 'unusable-address', 'address-collision', 'overlapping-networks',
  'router-prefix-mismatch', 'router-gateway-missing', 'management-vlan-mismatch', 'management-missing', 'must-not-reach',
  'internal-interface-down', 'reply-internal-interface-down',
  'port-in-two-vlans-untagged',
  'subif-number-differs', 'bridge-tag-implicit', 'route-hint-question', 'route-hint-evidence', 'route-hint-example',
  'route-port-location', 'route-hop', 'route-segment', 'links-up-stp-forwarding', 'connected-only', 'no-proxy-arp',
])]);

export function create(record, { variantId = 'main', seed = 0, syntax = 'cisco' } = {}) {
  if (!validRouteRecord(record) || !validSeed(seed) || !syntaxes.includes(syntax)) throw new RangeError('invalid-record');
  const v = record.variants.find(v => v.id === variantId);
  if (!v || !v.syntaxes.includes(syntax)) throw new RangeError('invalid-record');
  const ident = identity(record, v, seed, id);
  return clone({ identity: ident, instanceKey: JSON.stringify(ident), title: v.title, syntax, ...generateRoute(v, seed) });
}
export const initialAnswer = (task, syntax = task.syntax) => blankAnswer(task, syntax);
const withFixedRows = (fixed, submitted, key) => {
  const restored = new Set();
  return [...fixed, ...submitted.filter(row => {
    const k = key(row);
    if (fixed.some(f => key(f) === k) && !restored.has(k)) { restored.add(k); return false; }
    return true; // Keep extra duplicates for the device compiler to reject.
  })];
};

/** Answer drafts include fixed rows for convenient rendering. Their effective
 * values come from the public givens, so editing a serialized draft cannot
 * rewrite task 1's switch or task 3's access ports/A-B routing. */
export function configuration(task, answer, syntax = task.syntax) {
  if (!answer || typeof answer !== 'object' || Array.isArray(answer)) return answer;
  const c = clone(answer), fixed = givens(task, syntax);
  if (task.taskNumber === 1) c.SW1 = fixed.SW1;
  if (task.taskNumber === 3) {
    if (c.SW1 && typeof c.SW1 === 'object') c.SW1.ports = { ...c.SW1.ports, ...fixed.SW1.ports };
    if (c.R1 && typeof c.R1 === 'object') {
      if (syntax === 'cisco' && Array.isArray(c.R1.subifs)) {
        c.R1.interfaces = { ...c.R1.interfaces, ...fixed.R1.interfaces };
        c.R1.subifs = withFixedRows(fixed.R1.subifs, c.R1.subifs, s => `${s?.parent}:${s?.number}`);
      } else if (syntax === 'routeros' && Array.isArray(c.R1.vlanIfs) && Array.isArray(c.R1.addresses)) {
        c.R1.vlanIfs = withFixedRows(fixed.R1.vlanIfs, c.R1.vlanIfs, s => s?.name);
        c.R1.addresses = withFixedRows(fixed.R1.addresses, c.R1.addresses, s => s?.iface);
      }
    }
  }
  return c;
}
export function compile(task, answer, { syntax = task.syntax } = {}) {
  return compileL3(task.topology, configuration(task, answer, syntax), syntax, { gateways: task.networks.map(n => n.gateway) });
}
export function solution(task, syntax = task.syntax) {
  givens(task, syntax); // enforce the task 4 syntax restriction
  const c = { SW1: switchReference(task, 'SW1', syntax), R1: routerReference(task, syntax) };
  if (task.management) {
    const m = task.management, ip = m.network.replace(/\.0$/, '.50');
    if (syntax === 'cisco') Object.assign(c.SW1, { svi: { vid: m.vid, ip, prefix: m.prefix }, defaultGateway: m.gateway });
    else {
      c.SW1.vlans.find(row => row.vids.includes(m.vid)).tagged.push('bridge1');
      c.SW1.vlanIfs = [{ name: `vlan${m.vid}`, vid: m.vid, on: 'bridge1' }];
      c.SW1.addresses = [{ ip, prefix: m.prefix, iface: `vlan${m.vid}` }];
      c.SW1.routes = [{ dst: '0.0.0.0/0', gateway: m.gateway }];
    }
  }
  return c;
}

export function check(task, answer, { syntax = task.syntax } = {}) {
  const c = configuration(task, answer, syntax), compiled = compileL3(task.topology, c, syntax, { gateways: task.networks.map(n => n.gateway) });
  return evaluate(task, compiled, { answer: c, syntax });
}

/** Behaviour over topology + compiled state. Caller alone decides givens. */
export function evaluate(task, compiled, { answer: c = {}, syntax = task.syntax } = {}) {
  const { topology, tables } = compiled, findings = compiled.findings.filter(f => f.severity === 'blocks');
  const evidence = { probes: [], objectives: [] };
  const add = (code, entity, params = {}) => findings.push({ code, severity: 'blocks', entity, params });
  const finish = () => {
    const first = findings.find(f => f.severity === 'blocks');
    if (first && task.taskNumber === 2) {
      const location = verdictLocation(task, compiled, first, evidence, syntax, c);
      if (location) findings[findings.indexOf(first)] = { ...first, params: { ...first.params, location } };
    }
    return { ok: !first, complete: !first, code: first?.code ?? 'ok', findings, evidence };
  };
  if (findings.length) return finish();
  evidence.assumptions = [...task.assumptions];
  evidence.attachments = topology.attachments;
  const hosts = topology.hosts;
  const probe = (from, to, kind) => {
    const p = { id: `${kind}:${from}:${to}`, from, to, kind, ...ping3(topology, tables, from, to) };
    evidence.probes.push(p);
    if (!p.ok) add(p.code, p.id, { from, to });
  };
  for (let i = 0; i < hosts.length; i++) for (let j = i + 1; j < hosts.length; j++) probe(hosts[i].device, hosts[j].device, 'pc-pair');
  for (const h of hosts) {
    const gateway = topology.attachments.find(a => a.ip === h.gateway);
    probe(h.device, gateway?.id ?? h.gateway, 'gateway');
  }
  if (task.management) {
    const m = task.management, management = topology.attachments.find(a => a.device === 'SW1');
    if (management) probe(m.admin, management.id, 'management');
    else add('management-missing', 'SW1');
    const gateway = topology.attachments.find(a => a.device === 'R1' && a.ip === m.gateway);
    probe(m.admin, gateway?.id ?? m.gateway, 'gateway');
    const ok = !!management && topology.attachments.filter(a => a.device === 'SW1')
      .every(a => a.vid === m.vid && role(a.ip, m.network, m.prefix) === 'host');
    evidence.objectives.push({ id: 'management-separation', ok: !!ok, code: ok ? 'ok' : 'management-vlan-mismatch', attachment: management?.id ?? null });
    if (!ok) add('management-vlan-mismatch', 'SW1');
    // Forward stop remains primary. SVI/CPU activity is supplementary, after
    // the management trace, when the management VLAN is absent on the trunk.
    if (management && attachmentStatus(topology, tables, management) !== 'ok') {
      evidence.objectives.push({ id: 'management-state', ok: false, code: attachmentStatus(topology, tables, management) });
      add(attachmentStatus(topology, tables, management), management.id);
    }
  }
  for (const net of task.networks) {
    const a = topology.attachments.find(a => a.device === 'R1' && a.ip === net.gateway);
    if (!a) {
      evidence.objectives.push({ id: `coverage:${net.gateway}`, ok: false, code: 'router-gateway-missing', attachment: null });
      add('router-gateway-missing', 'R1', { gateway: net.gateway });
    } else if (a.prefix !== net.prefix) {
      evidence.objectives.push({ id: `coverage:${a.id}`, ok: false, code: 'router-prefix-mismatch', attachment: a.id });
      add('router-prefix-mismatch', a.id, { prefix: a.prefix });
    }
  }
  // Raw, tagged-inclusive L2 isolation, in both directions. Router forwarding
  // creates separate frames above and is never counted as a broadcast leak.
  const walks = Object.fromEntries(hosts.map(h => [h.device, flood(topology, tables, { from: h.device })]));
  for (let i = 0; i < hosts.length; i++) for (let j = i + 1; j < hosts.length; j++) {
    const a = hosts[i].device, b = hosts[j].device;
    if (task.goals[a] === task.goals[b]) continue;
    const pair = [walks[a], walks[b]], ok = !pair.some(w => w.arrivals.some(x => x.host === (w.from === a ? b : a)));
    evidence.objectives.push({ id: `isolation:${a}:${b}`, ok, code: ok ? 'ok' : 'must-not-reach', walks: pair });
    if (!ok) add('must-not-reach', `${a}:${b}`);
  }
  if (task.management) {
    const sources = topology.attachments.filter(a => a.device === 'SW1' || (a.device === 'R1' && a.vid === task.management.vid));
    for (const a of sources) {
      const walk = flood(topology, tables, { from: a.id }), leaked = walk.arrivals.filter(x => hosts.some(h => h.device === x.host));
      const reverseLeaks = hosts.filter(h => walks[h.device].received.has(a.id));
      const ok = !leaked.length && !reverseLeaks.length;
      evidence.objectives.push({ id: `management-isolation:${a.id}`, ok, code: ok ? 'ok' : 'must-not-reach', walk, reverseWalks: reverseLeaks.map(h => walks[h.device]) });
      if (!ok) add('must-not-reach', a.id);
    }
  }
  if (!findings.length) {
    const advice = [...compiled.findings.filter(f => f.severity === 'advice')];
    if (syntax === 'cisco') for (const s of c.R1?.subifs ?? []) if (s.number !== s.vid) advice.push({ code: 'subif-number-differs', severity: 'advice', entity: 'R1', params: { number: s.number, vid: s.vid } });
    findings.push(...advice.filter((f, i) => advice.findIndex(g => g.code === f.code) === i).slice(0, 2));
  }
  return finish();
}

/** Submitted evidence only: expose a stable port ID for the device tab and
 * its vendor label for words. Access-port VLAN is the actual ingress PVID,
 * never the reference setting. The screen appends route-port-location. */
function verdictLocation(task, compiled, finding, evidence, syntax, answer) {
  const probe = evidence.probes.find(p => p.id === finding.entity);
  const trace = probe?.request.ok ? probe.reply : probe?.request;
  const segment = trace?.segments.find(s => !s.ok);
  const stop = segment ? failureStop(task, segment, evidence.attachments) : null;
  const [field, key] = finding.field?.split('.') ?? [];
  const config = answer?.[finding.entity];
  const addressInterface = config?.addresses?.[key]?.iface;
  const fieldPort = ['ports', 'interfaces'].includes(field) ? key
    : field === 'subifs' ? config?.subifs?.[key]?.parent
      : field === 'vlanIfs' ? config?.vlanIfs?.[key]?.on
        : field === 'addresses' ? config?.vlanIfs?.find(v => v.name === addressInterface)?.on ?? addressInterface : null;
  const fallback = task.topology.hosts.find(h => h.device === probe?.from);
  const end = fallback ? peer(task.topology, fallback.device, 'nic') : null;
  const ingressVid = end && compiled.tables[end.device]?.ports[end.port]?.pvid;
  const wrongIngress = Number.isInteger(ingressVid) && ingressVid !== task.goals[fallback?.device];
  const device = wrongIngress ? end.device : stop?.device ?? (fieldPort ? finding.entity : end?.device);
  const portId = wrongIngress ? end.port : stop?.port ?? fieldPort ?? end?.port;
  if (!device || !portId) return null;
  const other = peer(task.topology, device, portId);
  const host = task.topology.hosts.find(h => h.device === other?.device)?.device ?? null;
  const vid = host ? compiled.tables[device]?.ports[portId]?.pvid ?? null : null;
  return { device, portId, port: label(task.topology, device, portId, syntax), host, vid };
}

/** Live commands consume only the supplied answer plus explicitly fixed
 * givens when the caller uses configuration(). Filtering is always last. */
export function render(answer, syntax, topology) {
  if (!syntaxes.includes(syntax)) throw new RangeError('invalid-config');
  const output = {};
  for (const [device, c] of Object.entries(answer ?? {})) {
    const rawName = p => p === 'bridge1' ? p : topology ? label(topology, device, p, syntax) : p;
    const value = v => /^[A-Za-z0-9_.:/-]+$/.test(String(v)) ? String(v) : '"' + String(v).replace(/[\\"$]/g, c => '\\' + c) + '"';
    const name = p => syntax === 'routeros' ? value(rawName(p)) : rawName(p);
    const lines = [];
    if (syntax === 'cisco') {
      if (c.ports) lines.push(renderL2({ [device]: { vlans: c.vlans, ports: c.ports } }, syntax, topology)[device]);
      for (const [p, v] of Object.entries(c.interfaces ?? {})) {
        lines.push(`interface ${name(p)}`, v.up ? ' no shutdown' : ' shutdown');
        if (v.ip) lines.push(` ip address ${v.ip} ${prefixToMask(v.prefix)}`);
      }
      for (const v of c.subifs ?? []) {
        lines.push(`interface ${name(v.parent)}.${v.number}`);
        if (v.vid != null) lines.push(` encapsulation dot1Q ${v.vid}`);
        if (v.ip) lines.push(` ip address ${v.ip} ${prefixToMask(v.prefix)}`);
      }
      if (c.svi) lines.push(`interface vlan ${c.svi.vid}`, ` ip address ${c.svi.ip} ${prefixToMask(c.svi.prefix)}`);
      if (c.defaultGateway) lines.push(`ip default-gateway ${c.defaultGateway}`);
    } else {
      if (c.ports) {
        const bridgeLines = renderL2({ [device]: { filtering: c.filtering, ports: c.ports, vlans: c.vlans } }, syntax, topology)[device].split('\n');
        lines.push(...bridgeLines.slice(0, -1));
      }
      for (const v of c.vlanIfs ?? []) lines.push(`/interface vlan add name=${value(v.name)} vlan-id=${v.vid} interface=${name(v.on)}`);
      const addressName = iface => c.vlanIfs?.some(v => v?.name === iface) ? value(iface) : name(iface);
      for (const a of c.addresses ?? []) lines.push(`/ip address add address=${a.ip}/${a.prefix} interface=${addressName(a.iface)}`);
      for (const r of c.routes ?? []) lines.push(`/ip route add dst-address=${r.dst} gateway=${r.gateway}`);
      if (c.ports) lines.push(`/interface bridge set bridge1 vlan-filtering=${c.filtering ? 'yes' : 'no'}`);
    }
    output[device] = lines.filter(Boolean).join('\n');
  }
  return output;
}

export function hints(task, answer, { syntax = task.syntax } = {}) {
  const r = check(task, answer ?? initialAnswer(task, syntax), { syntax });
  // The first finding's own probe (the feedback's), or none when it isn't one.
  const first = r.findings.find(f => f.severity === 'blocks');
  const p = r.evidence.probes.find(p => p.id === first?.entity), trace = p?.request.ok ? p.reply : p?.request;
  const segment = trace?.segments.find(s => !s.ok);
  const stop = segment ? failureStop(task, segment, r.evidence.attachments) : null;
  return [
    { rung: 1, code: 'route-hint-question', params: {} },
    { rung: 2, code: 'route-hint-evidence', params: hintEvidence(task, syntax, p, trace, first, stop, r.evidence.attachments ?? []) },
    { rung: 3, code: 'route-hint-example', params: { syntax } },
  ];
}

/** Rung 2's facts in the student's names: an L3 interface as «R1 gi0/2.10»,
 * an internal port by its label (Vlan10, bridge1), a device only when one is
 * named (never a probe or objective id). */
function hintEvidence(task, syntax, probe, trace, finding, stop, attachments) {
  const named = id => {
    const a = attachments.find(x => x.id === id);
    return a ? `${a.device} ${a.label}` : id ?? '';
  };
  const devices = task.topology.devices.filter(d => d.kind !== 'host').map(d => d.id);
  const own = attachments.find(a => a.id === finding?.entity);
  const portName = (device, port) => port === 'bridge' ? 'bridge1'
    : port === 'svi' ? attachments.find(a => a.device === device && a.port === 'svi')?.label ?? port
    : label(task.topology, device, port, syntax);
  const internal = stop && ['svi', 'bridge'].includes(stop.port) && stop.reason === 'interface-down';
  return {
    from: named(trace?.from ?? probe?.from ?? ''), to: named(trace?.to ?? probe?.to ?? ''),
    reason: internal ? 'internal-interface-down' : stop?.reason ?? finding?.code ?? 'ok',
    device: stop?.device ?? (devices.includes(finding?.entity) ? finding.entity : own?.device ?? ''),
    port: stop ? portName(stop.device, stop.port) : own ? own.label : '',
  };
}

// The tree path excludes normal isolation drops on unrelated access ports.
// This is the same rule used by VLAN-1's hints, now resolving attachment IDs.
export function failureStop(task, segment, attachments) {
  const deviceOf = id => attachments?.find(a => a.id === id)?.device ?? id;
  const from = deviceOf(segment.from), to = deviceOf(segment.to) ?? 'R1';
  const queue = [{ device: from, path: [] }], visited = new Set();
  for (let i = 0; i < queue.length; i++) {
    const entry = queue[i];
    if (visited.has(entry.device)) continue;
    visited.add(entry.device);
    if (entry.device === to) {
      for (const step of [...entry.path, { device: to }]) for (const h of segment.walks[0].hops.filter(h => h.device === step.device)) {
        const d = h.dropped.find(d => d.port === h.inPort || d.port === step.port || ['svi', 'bridge'].includes(d.port));
        if (d) return { device: h.device, port: d.port, reason: d.code };
      }
      break;
    }
    for (const link of task.topology.links) {
      const own = link.a.device === entry.device ? link.a : link.b.device === entry.device ? link.b : null;
      if (own) {
        const next = own === link.a ? link.b : link.a;
        queue.push({ device: next.device, path: [...entry.path, { device: own.device, port: own.port }] });
      }
    }
  }
  return null;
}

export function describe(task, { syntax = task.syntax, answer, result } = {}) {
  const lines = [task.title, routeText[task.taskNumber]];
  for (const h of task.topology.hosts) lines.push(`${h.device}: ${h.ip}/${h.prefix}; VLAN ${task.goals[h.device]}; шлюз ${h.gateway}.`);
  if (task.management) lines.push(`Керування: VLAN ${task.management.vid}; ${task.management.network}/${task.management.prefix}; шлюз ${task.management.gateway}.`);
  if (answer) for (const [d, commands] of Object.entries(render(configuration(task, answer, syntax), syntax, task.topology))) if (commands) lines.push(`${d}:\n${commands}`);
  const endpoint = id => {
    const a = result?.evidence.attachments?.find(a => a.id === id);
    return a ? `${a.device} ${a.label}` : id;
  };
  if (result) for (const p of result.evidence.probes) for (const [direction, trace] of [['request', p.request], ['reply', p.reply]]) {
    if (!trace) continue;
    lines.push(`${direction === 'reply' ? 'Відповідь' : 'Запит'}: ${endpoint(trace.from)} → ${endpoint(trace.to)}: ${t(trace.code)}`);
    for (const step of trace.steps) {
      if (step.kind === 'router') {
        const h = trace.hops[step.index];
        lines.push(t('route-hop', { ...h, in: endpoint(h.in), out: endpoint(h.out) }));
      }
      else {
        const s = trace.segments[step.index]; lines.push(t('route-segment', { ...s, from: endpoint(s.from), to: endpoint(s.to), both: s.walks.length > 1 }));
        // describeL2 starts with the topology's own lines: once above is enough.
        const shared = describeL2({ topology: task.topology }, { syntax }).length;
        lines.push(...describeL2({ topology: task.topology }, { syntax, walks: s.walks.map(w => ({ ...w, from: endpoint(w.from) })) }).slice(shared));
      }
    }
  }
  return lines;
}

export default { id, version, codes, create, check, hints, solution, render, describe, initialAnswer, givens, configuration, compile };
