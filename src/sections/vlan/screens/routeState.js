// «Між VLAN»: the forms' state and what a check shows (VLAN-2 spec §2–§3,
// v2 X1, X3–X7). Pure: no React, DOM or clock; tested in Node.
//
// Per task instance (its key has no syntax, so one instance holds both
// syntaxes' work), `instance.view` holds, as «Налаштуй порти» does:
//   forms     { cisco, routeros }   each syntax's form, never converted
//   raw       { cisco, routeros }   { [device|field]: text } being typed
//   verdict   { syntax, answer }    the last check's syntax and answer (JSON)
//   deviceId  the device whose form is open (SW1 or R1)
//   direction 'request' | 'reply'   the trace on the diagram (null: the
//                                   failing one, else the request)
//
// Forms are the logic's answer shapes (route.initialAnswer), so the givens
// (task 1's switch, task 3's access ports and A/B router rows) are in them
// from the start and the screen shows them read-only; route.configuration
// restores them anyway. Two differences, both undone by toRouteAnswer:
//   - Cisco switch ports keep both `vlan` and `allowed` (VLAN-1's form);
//   - a number field holds a number, '' or the text typed (VLAN-1), and an
//     address holds `ip` and `prefix` as parsed, or the text typed in `ip`
//     with `prefix` null (the check marks it: missing-prefix, or invalid-address).
// The live commands show what parses (forCommands): an address being typed
// isn't a command yet.
import route from '../logic/route.js';
import { describe as describeL2 } from '../logic/describe.js';
import { parseIp, parsePrefix, prefixToMask } from '../../../engine/ip.js';
import { blankRow as blankVlanRow, formatValue, parseVid, parseVidList, readField } from './portsState.js';
import { INTERNAL, backward, followPath } from './diagram.js';
import { portFact, vlanFact } from '../logic/facts.js';
import { routeUi, t, ui } from '../uk.js';

const clone = value => JSON.parse(JSON.stringify(value));
const blank = v => v === '' || v === null || v === undefined;

// ── Tasks and devices ────────────────────────────────────────────────────

export const taskNumberOf = record => record.variants[0].task;
/** The tasks a syntax offers (Cisco: 1–3; MikroTik: 1–4), from the records' own syntaxes. */
export const recordsFor = (records, syntax) => records.filter(r => r.variants[0].syntaxes.includes(syntax));
/** The record to show: the place's task if this syntax offers it, else the
 * nearest one before it that it does (MikroTik's task 4 → 3 in Cisco). */
export function shownRecord(records, id, syntax) {
  const offered = recordsFor(records, syntax);
  const wanted = records.find(r => r.id === id);
  if (!wanted) return offered[0];
  return offered.find(r => r.id === id) ?? [...offered].reverse().find(r => taskNumberOf(r) <= taskNumberOf(wanted)) ?? offered[0];
}
/** The routers and switches, in the topology's order (the device tabs). */
export const devicesOf = task => task.topology.devices.filter(d => d.kind !== 'host');
/** The form open first: the router where the task is mostly about it (1, 4), else the switch. */
export const firstDevice = task => (task.taskNumber === 1 || task.taskNumber === 4 ? 'R1' : 'SW1');
/** The router's port toward the switch (a subinterface's parent). */
export function trunkPort(task, router = 'R1') {
  for (const link of task.topology.links) {
    if (link.a.device === router && link.b.device !== router && !task.topology.hosts.some(h => h.device === link.b.device)) return link.a.port;
    if (link.b.device === router && !task.topology.hosts.some(h => h.device === link.a.device)) return link.b.port;
  }
  return task.topology.devices.find(d => d.id === router)?.ports[0]?.id ?? null;
}
const portLabel = (task, device, port, syntax) => (port === 'bridge1' ? 'bridge1'
  : task.topology.devices.find(d => d.id === device)?.ports.find(p => p.id === port)?.label[syntax] ?? String(port ?? ''));

/** What the task gives (route.givens), as the forms show it: read-only. */
export function fixedOf(task, syntax) {
  const g = route.givens(task, syntax);
  return {
    // Task 1: the whole switch (its VLANs too); task 3: its access ports.
    switchWhole: Boolean(g.SW1 && 'vlans' in g.SW1),
    switchPorts: Object.keys(g.SW1?.ports ?? {}),
    routerUp: Object.keys(g.R1?.interfaces ?? {}),
    rows: { subifs: g.R1?.subifs?.length ?? 0, vlanIfs: g.R1?.vlanIfs?.length ?? 0, addresses: g.R1?.addresses?.length ?? 0 },
  };
}

// ── Forms and answers ────────────────────────────────────────────────────

/** A blank form for a syntax (never the reference): route.initialAnswer with Cisco's kept port values. */
export function blankRouteForm(task, syntax) {
  const answer = route.initialAnswer(task, syntax);
  if (syntax !== 'cisco' || !answer.SW1?.ports) return answer;
  return { ...answer, SW1: { ...answer.SW1, ports: Object.fromEntries(Object.entries(answer.SW1.ports).map(([id, p]) => [id, { mode: p.mode ?? null, vlan: p.vlan ?? '', allowed: p.allowed ?? [] }])) } };
}

/** The vendor-shaped answer a form stands for (route.check and route.render take it). */
export function toRouteAnswer(form, syntax) {
  const out = clone(form);
  if (syntax !== 'cisco') return out;
  const sw = out.SW1;
  if (sw?.ports) {
    sw.ports = Object.fromEntries(Object.entries(sw.ports).map(([id, p]) => [id,
      p.mode === 'access' ? { mode: 'access', vlan: p.vlan } : p.mode === 'trunk' ? { mode: 'trunk', allowed: Array.isArray(p.allowed) ? [...p.allowed] : p.allowed } : { mode: null }]));
  }
  if (sw && 'svi' in sw) {
    sw.svi = !sw.svi || (blank(sw.svi.vid) && blank(sw.svi.ip)) ? null : { vid: blank(sw.svi.vid) ? null : sw.svi.vid, ip: sw.svi.ip ?? '', prefix: sw.svi.prefix ?? null };
  }
  if (Array.isArray(out.R1?.subifs)) {
    out.R1.subifs = out.R1.subifs.map(s => ({ parent: s.parent, number: s.number, vid: blank(s.vid) ? null : s.vid, ip: s.ip ?? '', prefix: s.prefix ?? null }));
  }
  return out;
}

/** An address the device would take: a dotted IP and a prefix. */
export const validAddress = a => Boolean(a) && typeof a.ip === 'string' && parseIp(a.ip) === a.ip && Number.isInteger(a.prefix) && a.prefix >= 0 && a.prefix <= 32;

/** The configuration as the live commands show it: rows with nothing typed
 * left out, an address only once it parses (route.render prints a mask). */
export function forCommands(config) {
  const out = clone(config ?? {});
  for (const c of Object.values(out)) {
    if (!c || typeof c !== 'object') continue;
    if (Array.isArray(c.subifs)) c.subifs = c.subifs.filter(s => !(blank(s.number) && blank(s.vid) && blank(s.ip))).map(s => (validAddress(s) ? s : { ...s, ip: '' }));
    if (c.svi && (!validAddress(c.svi) || blank(c.svi.vid))) c.svi = null;
    // A VLAN interface waits for its port (no «interface=""»).
    if (Array.isArray(c.vlanIfs)) c.vlanIfs = c.vlanIfs.filter(v => !blank(v.on));
    if (Array.isArray(c.addresses)) c.addresses = c.addresses.filter(validAddress).map(a => ({ ...a, iface: a.iface ?? '' }));
    if (Array.isArray(c.routes)) c.routes = c.routes.filter(r => !blank(r?.gateway));
  }
  return out;
}

/** «172.16.10.1/24», «172.16.10.1 255.255.255.0» (or /255.255.255.0): { ip, prefix }, or null. */
export function parseAddress(text) {
  const s = String(text ?? '').trim().replace(/,/g, '.');
  const m = s.match(/^(\d+\.\d+\.\d+\.\d+)\s*(?:\/\s*|\s+)(\S+)$/);
  if (!m) return null;
  const ip = parseIp(m[1]), prefix = parsePrefix(m[2]);
  return ip !== null && prefix !== null ? { ip, prefix } : null;
}

/** An address row as its field shows it: Cisco with a mask, MikroTik with a prefix; else the text typed. */
export function formatAddress(row, syntax) {
  if (!row) return '';
  if (typeof row.ip === 'string' && row.ip && Number.isInteger(row.prefix)) return syntax === 'cisco' ? `${row.ip} ${prefixToMask(row.prefix)}` : `${row.ip}/${row.prefix}`;
  return typeof row.ip === 'string' ? row.ip : '';
}

export const isAddressField = field => /(?:^|\.)address$/.test(field);
const rowOf = field => field.replace(/\.address$/, '');
const ipText = text => { const v = String(text ?? '').trim(); return parseIp(v) ?? v; };

/** A field's value as its input shows it. Fields: VLAN-1's, plus `subifs.N.number|vid|address`,
 * `svi.vid|address`, `defaultGateway`, `vlanIfs.N.name|vid`, `addresses.N.address`, `routes.0.gateway`. */
export function routeValue(form, device, field, syntax) {
  if (isAddressField(field)) return formatAddress(readField(form, device, rowOf(field)), syntax);
  if (field === 'routes.0.gateway') return form?.[device]?.routes?.[0]?.gateway ?? '';
  return formatValue(readField(form, device, field));
}

/** Set a path in a device's part of a (cloned) form; false if its parent is gone. */
function setPath(next, device, field, value) {
  const path = field.split('.');
  let target = next[device];
  for (const k of path.slice(0, -1)) {
    if (target === null || typeof target !== 'object') return false;
    target = target[k];
  }
  if (target === null || typeof target !== 'object') return false;
  target[path.at(-1)] = value;
  return true;
}

/** A copy of the form with a field's typed text parsed into it (blur, Enter, check). */
export function writeRouteText(form, device, field, text) {
  if (!form?.[device]) return form;
  const next = clone(form), c = next[device], s = String(text ?? '');
  if (isAddressField(field)) {
    const path = rowOf(field);
    if (path === 'svi' && !c.svi) c.svi = { vid: '', ip: '', prefix: null };
    const row = readField(next, device, path);
    if (!row || typeof row !== 'object') return form;
    const parsed = parseAddress(s);
    row.ip = parsed ? parsed.ip : s.trim();
    row.prefix = parsed ? parsed.prefix : null;
    return next;
  }
  if (field === 'svi.vid') {
    c.svi ??= { vid: '', ip: '', prefix: null };
    c.svi.vid = parseVid(s);
    return next;
  }
  if (field === 'defaultGateway') { c.defaultGateway = ipText(s); return next; }
  if (field === 'routes.0.gateway') {
    const gateway = ipText(s);
    c.routes = gateway ? [{ dst: '0.0.0.0/0', gateway }] : [];
    return next;
  }
  const name = field.match(/^vlanIfs\.(\d+)\.name$/);
  if (name) {
    const i = Number(name[1]), row = c.vlanIfs?.[i];
    if (!row) return form;
    const old = row.name, renamed = s.trim();
    row.name = renamed;
    // As in Winbox, an address on the interface follows its new name.
    if (old && old !== renamed && !c.vlanIfs.some((v, j) => j !== i && v.name === old)) {
      for (const a of c.addresses ?? []) if (a.iface === old) a.iface = renamed;
    }
    return next;
  }
  const value = field === 'vlans' || /\.vids$/.test(field) ? parseVidList(s)
    : /\.allowed$/.test(field) ? parseVidList(s, { all: true }) : parseVid(s);
  return setPath(next, device, field, value) ? next : form;
}

/** Apply every pending typed text of a syntax to its form. */
export function flushRoute(form, raw = {}) {
  let next = form;
  for (const [key, text] of Object.entries(raw)) {
    if (typeof text !== 'string') continue;
    const bar = key.indexOf('|');
    next = writeRouteText(next, key.slice(0, bar), key.slice(bar + 1), text);
  }
  return next;
}

/** A new row of a list, with nothing in it (X6: the router rows start blank). */
export function newRow(task, list) {
  if (list === 'subifs') return { parent: trunkPort(task), number: '', vid: '', ip: '', prefix: null };
  if (list === 'vlanIfs') return { name: '', vid: '', on: null };
  if (list === 'addresses') return { ip: '', prefix: null, iface: null };
  return blankVlanRow();
}

export function addRow(task, form, device, list) {
  const next = clone(form);
  next[device][list] = [...(next[device][list] ?? []), newRow(task, list)];
  return next;
}

/** Remove a row: the list's typed texts go into the form first (row indices then shift). */
export function removeRow(form, raw, device, list, index) {
  const prefix = `${device}|${list}.`;
  const own = Object.fromEntries(Object.entries(raw ?? {}).filter(([k]) => k.startsWith(prefix)));
  const rest = Object.fromEntries(Object.entries(raw ?? {}).filter(([k]) => !k.startsWith(prefix)));
  const next = clone(flushRoute(form, own));
  next[device][list] = next[device][list].filter((_, i) => i !== index);
  return { form: next, raw: rest };
}

// ── After a check ────────────────────────────────────────────────────────

/** A form failure: the check stopped at the devices' own findings, before any probe (route.check). */
export const isFormFailure = result => Boolean(result) && !result.ok && !result.evidence?.probes?.length && !result.evidence?.objectives?.length;

/** The form field an L3 attachment id stands for, in a device's configuration. */
export function attachmentField(config, id, device) {
  const rest = String(id).slice(device.length + 1);
  if (rest === 'svi') return 'svi';
  const ros = rest.match(/^(.*):(\d+)$/);
  if (ros && Array.isArray(config?.addresses)) return `addresses.${ros[2]}`;
  const i = (config?.subifs ?? []).findIndex(s => `${s.parent}.${s.number}` === rest);
  if (i >= 0) return `subifs.${i}`;
  if (config?.interfaces && rest in config.interfaces) return `interfaces.${rest}`;
  return '';
}

/** The objective a blocking finding is about, from the evidence (by its id, else its code). */
export function objectiveOf(evidence, finding) {
  const failing = (evidence?.objectives ?? []).filter(o => !o.ok && o.code === finding.code);
  return failing.find(o => o.id === finding.entity || o.id.endsWith(`:${finding.entity}`) || o.attachment === finding.entity) ?? failing[0] ?? null;
}

/**
 * The fields a check marks, per device: [{ field, code, params }]. Every
 * blocking finding of a form failure that names a device (a field that is
 * an attachment id becomes its row); after the probes, an objective about
 * one of the submitted addresses (its prefix, the management address).
 * Not the SVI's inactivity: that is the trunk's lesson (X7), not a field.
 * `checked`: the answer that was checked; `config`: the configuration it
 * stands for (the givens restored; «Знайди несправність» has none to restore).
 */
export function routeMarks(task, result, checked, syntax, config = route.configuration(task, checked, syntax) ?? {}) {
  if (!result || result.ok) return {};
  const devices = devicesOf(task).map(d => d.id);
  const marks = {};
  const add = (device, field, f) => (marks[device] ??= []).push({ field, code: f.code, params: f.params ?? {} });
  const form = isFormFailure(result);
  for (const f of result.findings ?? []) {
    if (f.severity !== 'blocks') continue;
    if (form) {
      if (!devices.includes(f.entity)) continue;
      const field = f.field ?? '';
      if (field === 'ports.bridge1') {
        // bridge1 has no port row: its membership conflict marks the VLAN rows that list it.
        const rows = (config[f.entity]?.vlans ?? []).map((row, i) => ([...(row?.tagged ?? []), ...(row?.untagged ?? [])].includes('bridge1') ? i : -1)).filter(i => i >= 0);
        if (rows.length) for (const i of rows) add(f.entity, `vlans.${i}`, f); else add(f.entity, '', f);
        continue;
      }
      add(f.entity, field.startsWith(`${f.entity}:`) ? attachmentField(config[f.entity], field, f.entity) : field, f);
      continue;
    }
    // Repair v1: SW1 has no management address at all: its management block is what the verdict is about.
    if (f.code === 'management-missing' && devices.includes(f.entity)) { add(f.entity, syntax === 'cisco' ? 'svi' : 'vlanIfs', f); continue; }
    const o = objectiveOf(result.evidence, f);
    const a = o?.attachment && o.id !== 'management-state' ? result.evidence.attachments?.find(x => x.id === o.attachment) : null;
    if (a && devices.includes(a.device)) add(a.device, attachmentField(config[a.device], a.id, a.device), f);
  }
  return marks;
}

/**
 * What a failed check shows: its first blocking finding (never the last),
 * as a form finding, a probe (with the direction that failed), an objective
 * or a device's state; and, when the management address's interface is
 * also down, that as a second line after the trunk's stop (X7).
 */
export function routeFailure(result) {
  const first = result?.findings?.find(f => f.severity === 'blocks');
  if (!first) return null;
  const base = { code: first.code, params: first.params ?? {}, entity: first.entity ?? null };
  if (isFormFailure(result)) return { ...base, kind: 'form', device: first.entity ?? null, field: first.field ?? '' };
  const ev = result.evidence;
  const state = (ev.objectives ?? []).find(o => o.id === 'management-state' && !o.ok);
  const stateFinding = state ? result.findings.find(f => f.severity === 'blocks' && f.code === state.code && ev.attachments?.some(a => a.id === f.entity)) : null;
  const also = stateFinding && stateFinding !== first ? { code: stateFinding.code, params: stateFinding.params ?? {}, entity: stateFinding.entity } : null;
  const probe = ev.probes?.find(p => p.id === first.entity);
  if (probe) return { ...base, kind: 'probe', probe, direction: probe.request.ok ? 'reply' : 'request', also };
  const objective = objectiveOf(ev, first);
  if (objective) return { ...base, kind: 'objective', objective, also: objective === state ? null : also };
  return { ...base, kind: 'other', also };
}

/** The probe the diagram draws: the failing one; after a success, one that
 * shows the lesson (the management address in task 3, else two PCs of
 * different VLANs). From the evidence, never from a fixed list. */
export function shownProbe(task, result, failure) {
  if (failure?.kind === 'probe') return failure.probe;
  if (!result?.ok) return null;
  const probes = result.evidence?.probes ?? [], attachments = result.evidence?.attachments ?? [];
  const m = task.management;
  return (m && probes.find(p => p.kind === 'management' && attachments.find(a => a.id === p.to)?.device === m.device))
    ?? probes.find(p => p.kind === 'pc-pair' && task.goals[p.from] !== task.goals[p.to])
    ?? probes[0] ?? null;
}

/** A trace endpoint in words: a PC, «R1 gi0/2.10» for an L3 interface, «шлюз …» for an address nobody has. */
export function endpointName(task, attachments, id) {
  if (id === null || id === undefined) return '';
  if (task.topology.hosts.some(h => h.device === id)) return id;
  const a = attachments?.find(x => x.id === id);
  if (a) return `${a.device} ${a.label}`;
  if (parseIp(id) === id) return routeUi.gatewayLine({ ip: id });
  return String(id);
}

/** A code's words; an inactive SVI or bridge VLAN interface says why (no
 * port of its VLAN in the table), not the router-port wording. */
export function codeWords(code, params = {}, internal = false) {
  return t(internal && /^(?:reply-)?interface-down$/.test(code) ? code.replace('interface-down', 'internal-interface-down') : code, params);
}

/** Whether a trace failed at an internal interface (an SVI or bridge VLAN interface) that is inactive. */
export function internalDown(trace, attachments = []) {
  const seg = trace?.segments?.find(s => !s.ok);
  return seg?.code === 'interface-down' && [seg.from, seg.to].some(id => INTERNAL.includes(attachments.find(a => a.id === id)?.port));
}

/** A port in words, internal interfaces included (an SVI by its label, the bridge as bridge1). */
function portName(task, attachments, device, port, syntax, vid = null) {
  if (port === 'bridge') return 'bridge1';
  if (port === 'svi') return attachments?.find(a => a.device === device && a.port === 'svi' && (vid === null || a.vid === vid))?.label ?? 'svi';
  return portLabel(task, device, port, syntax);
}

/** One segment's walk along its path, in words: the frame's source, each
 * device it crosses on the path, and where it arrives or stops. */
function pathLines(task, syntax, walk, fromId, toId, attachments) {
  const isHost = id => task.topology.hosts.some(h => h.device === id);
  const deviceOf = id => (isHost(id) ? id : attachments.find(a => a.id === id)?.device ?? null);
  const router = task.topology.devices.find(d => d.kind === 'router')?.id ?? null;
  const from = deviceOf(fromId), to = toId ? deviceOf(toId) : (from !== router ? router : null);
  const f = followPath(task.topology, walk, from, to, toId);
  const name = id => endpointName(task, attachments, id);
  const port = (device, p, vid) => portName(task, attachments, device, p, syntax, vid);
  const lines = [];
  const wire = f.crossed[0]?.out ?? { tagged: walk.hops[0]?.tagged, vid: walk.hops[0]?.vid };
  lines.push(t('frame-source', { host: name(fromId), tagged: wire.tagged, vid: wire.vid }));
  for (const { step, hop, out } of f.crossed) {
    if (hop.inPort === null) continue;
    lines.push(t(hop.transparent ? 'frame-transparent' : 'frame-ingress', { device: hop.device, port: port(hop.device, hop.inPort), vid: hop.vid }));
    const toHost = isHost(step.to.device);
    lines.push(t(out.tagged ? 'frame-tagged-out' : !hop.transparent && toHost ? 'frame-access-out' : 'frame-untagged-out', { device: hop.device, port: port(hop.device, step.from.port), vid: out.vid }));
  }
  const at = f.stop ?? null;
  const arriving = f.end && f.end.inPort !== null && !isHost(f.end.device) ? f.end : null;
  if (arriving && (!at || at.device === arriving.device)) {
    // As VLAN-1 says it: a frame its bridge classified «входить … VLAN N»; else it only arrives.
    const unclassified = arriving.transparent === undefined || arriving.dropped.some(d => d.port === arriving.inPort);
    lines.push(t(unclassified ? 'frame-arrival' : arriving.transparent ? 'frame-transparent' : 'frame-ingress', { device: arriving.device, port: port(arriving.device, arriving.inPort), vid: arriving.vid }));
  }
  if (f.reached) lines.push(routeUi.reached({ name: name(toId) }));
  else if (at) lines.push(`${at.device} ${port(at.device, at.port, at.vid)}: ${codeWords(at.code, {}, INTERNAL.includes(at.port))}`);
  else if (toId) lines.push(routeUi.notReached({ name: name(toId) }));
  return { lines, f };
}

/**
 * One trace (a ping3 request or reply) in words, in its steps' order: per
 * segment a sub-heading (its next hop; «перевірка в обидва боки» only when
 * the way back is shown too) over its walk on the path, per router hop a
 * sub-heading of its own, then the outcome.
 * @returns {{ groups: Array<{kind: 'segment'|'hop', heading: string, lines: string[]}>, outcome: string }}
 */
export function traceSteps(task, syntax, trace, attachments = []) {
  const name = id => endpointName(task, attachments, id);
  const groups = [];
  for (const step of trace.steps) {
    if (step.kind === 'router') {
      const h = trace.hops[step.index];
      groups.push({ kind: 'hop', heading: t('route-hop', { router: h.router, in: name(h.in), out: name(h.out) }), lines: [] });
      continue;
    }
    const seg = trace.segments[step.index];
    const forward = pathLines(task, syntax, seg.walks[0], seg.from, seg.to, attachments);
    const back = seg.to !== null && backward(seg, forward.f) ? pathLines(task, syntax, seg.walks[1], seg.to, seg.from, attachments) : null;
    const lines = [...forward.lines];
    if (seg.to === null) lines.push(routeUi.nobody({ ip: seg.nextHopIp }));
    else if (back) lines.push(routeUi.back({ from: name(seg.to), to: name(seg.from) }), ...back.lines);
    groups.push({ kind: 'segment', heading: t('route-segment', { from: name(seg.from), to: seg.to ? name(seg.to) : null, nextHopIp: seg.nextHopIp, both: Boolean(back) }), lines });
  }
  // The outcome; when the stop above already says why, only that it stops.
  const why = codeWords(trace.code, {}, internalDown(trace, attachments));
  const said = groups.some(g => g.lines.some(line => line.endsWith(why)));
  return { groups, outcome: trace.ok ? routeUi.arrived({ to: name(trace.to) }) : said ? routeUi.stops : routeUi.result({ text: why }) };
}

/** The same in one list (for «Текстом»): each sub-heading, its lines, the outcome. */
export function traceLines(task, syntax, trace, attachments = []) {
  const { groups, outcome } = traceSteps(task, syntax, trace, attachments);
  return [...groups.flatMap(g => [g.heading, ...g.lines]), outcome];
}

/** A topology whose devices also have their internal interfaces (SVI, bridge) as labelled ports, for the L2 words. */
function withInternal(topology, attachments) {
  return {
    ...topology,
    devices: topology.devices.map(d => {
      const extra = [];
      const svi = attachments?.find(a => a.device === d.id && a.port === 'svi');
      if (svi) extra.push({ id: 'svi', label: { cisco: svi.label, routeros: svi.label } });
      if (attachments?.some(a => a.device === d.id && a.port === 'bridge')) extra.push({ id: 'bridge', label: { cisco: 'bridge1', routeros: 'bridge1' } });
      return extra.length ? { ...d, ports: [...d.ports, ...extra] } : d;
    }),
  };
}

/** An isolation objective's walk to draw, the PCs it must not have reached, and an interface it must not have reached. */
export function objectiveWalk(task, objective) {
  if (!objective) return null;
  const goal = id => task.goals[id];
  if (Array.isArray(objective.walks)) {
    const leaks = w => w.arrivals.filter(x => x.host !== w.from && goal(x.host) !== goal(w.from)).map(x => x.host);
    const walk = objective.walks.find(w => leaks(w).length) ?? objective.walks[0];
    return walk ? { walk, leaked: [...new Set(leaks(walk))], iface: null } : null;
  }
  if (objective.walk) {
    const own = objective.id.replace(/^management-isolation:/, '');
    const hosts = objective.walk.arrivals.filter(x => task.topology.hosts.some(h => h.device === x.host)).map(x => x.host);
    if (hosts.length || !objective.reverseWalks?.length) return { walk: objective.walk, leaked: [...new Set(hosts)], iface: { id: own, status: 'source' } };
    return { walk: objective.reverseWalks[0], leaked: [], iface: { id: own, status: 'leaked' } };
  }
  return null;
}

/** An L2 walk of an objective in words: VLAN-1's description, after the givens it repeats. */
export function objectiveLines(task, syntax, walk, attachments = []) {
  const shaped = { ...task, topology: withInternal(task.topology, attachments) };
  const givens = describeL2(shaped, { syntax }).length;
  // VLAN-1's reachability note is about two PCs' ping; an isolation walk isn't one.
  return describeL2(shaped, { syntax, walks: [{ ...walk, from: endpointName(task, attachments, walk.from) }] }).slice(givens)
    .filter(line => line !== t('reachability-abstraction'));
}

/** Where a form finding is: its device and the row or port it names. */
export function formWhere(task, config, device, field, syntax) {
  if (!device) return '';
  const c = config?.[device];
  const f = String(field ?? '').startsWith(`${device}:`) ? attachmentField(c, field, device) : String(field ?? '');
  const [list, index] = f.split('.');
  const row = c?.[list]?.[Number(index)];
  let item = '';
  if (list === 'subifs' && row) item = `${portLabel(task, device, row.parent, syntax)}.${blank(row.number) ? '' : row.number}`;
  else if (list === 'vlanIfs' && row) item = row.name || `${routeUi.vlanIfs} ${Number(index) + 1}`;
  else if (list === 'addresses' && row) item = row.ip || `${routeUi.addresses} ${Number(index) + 1}`;
  else if ((list === 'ports' || list === 'interfaces') && index) item = portLabel(task, device, index, syntax);
  else if (list === 'svi') item = routeUi.sviVlan;
  else if (list === 'defaultGateway') item = routeUi.defaultGateway;
  else if (list === 'routes') item = routeUi.routes;
  return item ? ui.at({ device, port: item }) : device;
}

/** The words of a failure: one sentence with its where, and the X7 second line. */
export function routeFailureWords(task, failure, { syntax, attachments = [], config = null } = {}) {
  if (!failure) return [];
  const name = id => endpointName(task, attachments, id);
  const goal = host => `${host} (${ui.goal(task.goals[host])})`;
  const failing = failure.kind === 'probe' ? failure.probe[failure.direction] : null;
  const text = codeWords(failure.code, failure.params, internalDown(failing, attachments));
  const lines = [];
  if (failure.kind === 'form') lines.push(ui.line({ where: formWhere(task, config, failure.device, failure.field, syntax), text }));
  else if (failure.kind === 'probe') lines.push(ui.line({ where: routeUi.probe({ from: name(failure.probe.from), to: name(failure.probe.to) }), text }));
  else if (failure.kind === 'objective') {
    const o = failure.objective;
    const pair = Array.isArray(o.walks) ? String(failure.entity ?? '').split(':') : null;
    const where = pair?.length === 2 && pair.every(h => task.goals[h] !== undefined) ? ui.pair({ from: goal(pair[0]), to: goal(pair[1]) })
      : o.attachment ? name(o.attachment)
      : failure.entity ? name(failure.entity) : '';
    lines.push(where ? ui.line({ where, text }) : text);
  } else {
    const device = devicesOf(task).some(d => d.id === failure.entity) ? failure.entity : null;
    const where = device ?? (failure.entity ? name(failure.entity) : '');
    lines.push(where ? ui.line({ where, text }) : text);
  }
  // Task 2 (round 4, spec F5): the device and port to look at, from the checker's evidence.
  if (failure.params?.location) lines.push(t('route-port-location', failure.params.location));
  if (failure.also) {
    const internal = INTERNAL.includes(attachments.find(a => a.id === failure.also.entity)?.port);
    lines.push(routeUi.also({ where: name(failure.also.entity), text: codeWords(failure.also.code, failure.also.params, internal) }));
  }
  return lines;
}

/** Advice after a success (at most two), with the device they're about. */
export const routeTips = result => (result?.ok ? result.findings.filter(f => f.severity === 'advice').slice(0, 2).map(f => ({ code: f.code, params: f.params ?? {}, device: f.entity ?? '' })) : []);

/** The hints' words. The logic names everything (route.hints); an address
 * nobody has is said as the gateway it should be («шлюз …»). */
export function routeHintTexts(task, hints, attachments = []) {
  return hints.map(h => {
    const p = { ...h.params };
    for (const k of ['from', 'to']) if (p[k]) p[k] = endpointName(task, attachments, p[k]);
    return t(h.code, p);
  });
}

// ── The diagram's interface lines ────────────────────────────────────────

/**
 * Each router's and switch's interface lines, from a configuration (the
 * submitted one with the givens, route.configuration): the Cisco router's
 * physical interface and subinterfaces, MikroTik VLAN interfaces, the
 * switch's management interface and gateway, with their addresses. `ids`:
 * the L3 attachments a line stands for (route.compile's ids), so a trace can
 * mark it. Nothing comes from the reference: a blank router has no lines
 * but its physical interface's state.
 * Round 5 (R3): each line names its highlight facts ({ kind, value }): a
 * port device-qualified as the diagram writes it, the VLAN, the address.
 */
export function deviceLines(task, config, syntax) {
  const r = routeUi, out = {};
  const shown = v => (blank(v) ? r.none : v);
  const vids = v => (blank(v) ? [] : [vlanFact(v)]);
  const ip = v => (blank(v) ? [] : [{ kind: 'address', value: String(v).trim() }]);
  for (const d of devicesOf(task)) {
    const c = config?.[d.id];
    if (!c || typeof c !== 'object') continue;
    const lines = [];
    const address = (a, ids) => { if (validAddress(a)) lines.push({ text: r.addressLine(a), ids, kind: 'address', facts: ip(a.ip) }); };
    if (syntax === 'cisco') {
      if (d.kind === 'router') {
        for (const [p, v] of Object.entries(c.interfaces ?? {})) {
          const port = portLabel(task, d.id, p, syntax);
          lines.push({ text: r.physicalLine({ port, on: v?.up === true }), kind: v?.up === true ? 'on' : 'off', ids: [`${d.id}:${p}`], facts: [portFact(d.id, port)] });
        }
        for (const s of c.subifs ?? []) {
          if (blank(s.number) && blank(s.vid) && blank(s.ip)) continue;
          const id = `${d.id}:${s.parent}.${s.number}`;
          const name = `${portLabel(task, d.id, s.parent, syntax)}.${blank(s.number) ? '' : s.number}`;
          lines.push({ text: r.subifLine({ name, vid: shown(s.vid) }), ids: [id], facts: [portFact(d.id, name), ...vids(s.vid)] });
          address(s, [id]);
        }
      } else if (c.svi && !(blank(c.svi.vid) && blank(c.svi.ip))) {
        lines.push({ text: `Vlan${blank(c.svi.vid) ? '' : c.svi.vid}`, ids: [`${d.id}:svi`], facts: vids(c.svi.vid) });
        address(c.svi, [`${d.id}:svi`]);
      }
      if (!blank(c.defaultGateway)) lines.push({ text: r.gatewayLine({ ip: c.defaultGateway }), kind: 'gateway', ids: [], facts: ip(c.defaultGateway) });
    } else {
      const addresses = c.addresses ?? [];
      for (const v of c.vlanIfs ?? []) {
        if (blank(v.name) && blank(v.vid) && blank(v.on)) continue;
        const own = blank(v.name) ? [] : addresses.map((a, i) => ({ a, id: `${d.id}:${a.iface}:${i}` })).filter(({ a }) => a.iface === v.name);
        const on = blank(v.on) ? null : portLabel(task, d.id, v.on, syntax);
        lines.push({ text: r.vlanIfLine({ name: shown(v.name), vid: shown(v.vid) }), ids: own.map(x => x.id), facts: vids(v.vid) });
        lines.push({ text: r.onLine({ on: on ?? r.none }), ids: own.map(x => x.id), kind: 'on-port', facts: on ? [portFact(d.id, on)] : [] });
        for (const { a, id } of own) address(a, [id]);
      }
      const gateway = c.routes?.[0]?.gateway;
      if (!blank(gateway)) lines.push({ text: r.gatewayLine({ ip: gateway }), kind: 'gateway', ids: [], facts: ip(gateway) });
    }
    if (lines.length) out[d.id] = lines;
  }
  return out;
}
