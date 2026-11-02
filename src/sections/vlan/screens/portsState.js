// «Налаштуй порти»: the forms' state and what a check shows (VLAN-1 spec
// §3–§4, v2 W4–W6, W8). Pure: no React, DOM or clock; tested in Node.
//
// Per task instance (its key has no syntax, so one instance holds both
// syntaxes' work), `instance.view` holds:
//   forms     { cisco, routeros }   each syntax's form (below), kept apart:
//                                   the two vendors' answers are different
//                                   configurations, never converted
//   raw       { cisco, routeros }   { [fieldKey]: text } being typed, not
//                                   parsed yet (parse on blur, Enter or check)
//   verdict   { syntax, answer }    the syntax and answer (JSON) of the last
//                                   check; it is shown only in that syntax, and
//                                   a syntax switch clears it
//   switchId  the switch whose form is open
// The instance's `result` is the last check's result (useExercise).
//
// Forms:
//   Cisco     { [switchId]: { vlans, ports: { [portId]: { mode, vlan, allowed } } } }
//             mode 'access' | 'trunk' | null; `vlan` and `allowed` are both
//             kept, so switching a port's mode back and forth loses nothing.
//   RouterOS  { [switchId]: { filtering, ports: { [portId]: { pvid, frameTypes } },
//             vlans: [{ vids, tagged, untagged }] } }   (the answer's own shape)
// A number field holds a number, '' when empty, or the typed text when it
// isn't a whole number; a list holds numbers and such texts. The compilers
// reject what isn't a VLAN number (bad-vid), so a mistyped field is marked
// after a check, and the commands show what was typed.
import { initialAnswer } from '../logic/ports.js';

export const FORM_CODES = ['bad-vid', 'cisco-reserved-vid', 'invalid-config', 'mode-not-set', 'port-in-two-vlans-untagged'];

const clone = value => JSON.parse(JSON.stringify(value));

/** A blank form for a syntax (never the reference): ports.initialAnswer plus Cisco's kept values. */
export function blankForm(task, syntax) {
  const answer = initialAnswer(task, syntax);
  if (syntax !== 'cisco') return answer;
  return Object.fromEntries(Object.entries(answer).map(([id, config]) => [id, {
    vlans: config.vlans,
    ports: Object.fromEntries(Object.keys(config.ports).map(port => [port, { mode: null, vlan: '', allowed: [] }])),
  }]));
}

/** The vendor-shaped answer a form stands for (ports.check and ports.render take it). */
export function toAnswer(form, syntax) {
  if (syntax !== 'cisco') return clone(form);
  return Object.fromEntries(Object.entries(form).map(([id, config]) => [id, {
    vlans: [...config.vlans],
    ports: Object.fromEntries(Object.entries(config.ports).map(([port, p]) => [port,
      p.mode === 'access' ? { mode: 'access', vlan: p.vlan } : p.mode === 'trunk' ? { mode: 'trunk', allowed: Array.isArray(p.allowed) ? [...p.allowed] : p.allowed } : { mode: null }])),
  }]));
}

/** A whole number as typed, if it is one JavaScript holds exactly (else null). */
const wholeNumber = text => (/^\d+$/.test(text) && Number.isSafeInteger(Number(text)) ? Number(text) : null);
const inRange = n => n !== null && n >= 1 && n <= 4094;

/** One VLAN number: a number, '' when empty, else the text as typed (so a
 * number too big to hold exactly stays as typed, never a rounded one). */
export function parseVid(text) {
  const s = String(text ?? '').trim();
  if (s === '') return '';
  return wholeNumber(s) ?? s;
}

/** A VLAN list («10,20», «10 20», «10-200»; «all» where `all`): numbers, and
 * any item that isn't one as typed. A range expands only when both ends are
 * VLAN numbers (1–4094) in order; any other range stays as typed, so the
 * check marks it and nothing loops over a huge or unsafe span. */
export function parseVidList(text, { all = false } = {}) {
  const s = String(text ?? '').trim();
  if (all && s.toLowerCase() === 'all') return 'all';
  if (s === '') return [];
  const out = [];
  for (const item of s.split(/[\s,]+/).filter(Boolean)) {
    const range = item.match(/^(\d+)-(\d+)$/);
    const from = range ? wholeNumber(range[1]) : null, to = range ? wholeNumber(range[2]) : null;
    if (wholeNumber(item) !== null) out.push(wholeNumber(item));
    else if (inRange(from) && inRange(to) && from <= to) for (let v = from; v <= to; v++) out.push(v);
    else out.push(item);
  }
  return [...new Set(out)];
}

/** A field's value as the input shows it. */
export const formatValue = value => (Array.isArray(value) ? value.join(',') : value === undefined || value === null ? '' : String(value));

/** A text field's key: the switch and the finding field it stands for. */
export const fieldKey = (switchId, field) => `${switchId}|${field}`;

/** Read a field path ('ports.a1.vlan', 'vlans.0.vids', 'vlans'; '' is the whole switch) in a switch's form. */
export function readField(form, switchId, field) {
  if (field === '') return form?.[switchId];
  return field.split('.').reduce((v, k) => (v === undefined || v === null ? undefined : v[k]), form?.[switchId]);
}

/** A copy of the form with one field set. */
export function writeField(form, switchId, field, value) {
  const next = clone(form);
  const path = field.split('.');
  let target = next[switchId];
  for (const k of path.slice(0, -1)) target = target[k];
  target[path.at(-1)] = value;
  return next;
}

/** How a field's text is parsed: lists for VLAN lists, one number otherwise. */
export function parseField(field, text) {
  if (field === 'vlans' || /\.vids$/.test(field)) return parseVidList(text);
  if (/\.allowed$/.test(field)) return parseVidList(text, { all: true });
  return parseVid(text);
}

/** Apply every pending raw text of a syntax to its form (parse on blur, Enter, check). */
export function flush(form, raw = {}) {
  let next = form;
  for (const [key, text] of Object.entries(raw)) {
    if (typeof text !== 'string') continue;
    const [switchId, field] = key.split('|');
    if (readField(next, switchId, field) === undefined) continue;
    next = writeField(next, switchId, field, parseField(field, text));
  }
  return next;
}

/** Ports in reading order: access ports by number, then trunks. */
export function portOrder(device) {
  const rank = id => (id.startsWith('t') ? 100 : 0) + Number(id.replace(/\D/g, '') || 0);
  return [...device.ports].sort((a, b) => rank(a.id) - rank(b.id));
}

/** A RouterOS VLAN row added by «+ VLAN»: empty. */
export const blankRow = () => ({ vids: [], tagged: [], untagged: [] });

/** Toggle a port's tagged or untagged membership in a RouterOS VLAN row. */
export function toggleMember(form, switchId, rowIndex, kind, port) {
  const next = clone(form);
  const row = next[switchId].vlans[rowIndex];
  row[kind] = row[kind].includes(port) ? row[kind].filter(p => p !== port) : [...row[kind], port];
  return next;
}

// ── After a check ────────────────────────────────────────────────────────

/** Form findings of a result, per switch: [{ field, code }] (the marks). */
export function marksOf(result) {
  const marks = {};
  for (const f of result?.findings ?? []) {
    if (f.severity !== 'blocks' || !FORM_CODES.includes(f.code) || !f.entity) continue;
    (marks[f.entity] ??= []).push({ field: f.field ?? '', code: f.code });
  }
  return marks;
}

/** The first mark on a field or under it ('ports.a1' covers 'ports.a1.vlan'); a switch-wide mark ('') covers all. */
export function markOn(marks, field) {
  return (marks ?? []).find(m => m.field === field || m.field.startsWith(`${field}.`) || m.field === '') ?? null;
}

const portIdOf = field => field?.match(/^ports\.([^.]+)/)?.[1] ?? null;

/**
 * What a failed check shows: its first blocking finding, the walk to draw
 * (the probe's walk that failed, or the objective's), and the words' facts.
 * `walk` null for form findings and address mismatches.
 */
export function failureOf(task, result) {
  const first = result?.findings?.find(f => f.severity === 'blocks');
  if (!first) return null;
  const evidence = result.evidence ?? {};
  if (FORM_CODES.includes(first.code)) {
    const port = portIdOf(first.field);
    return { kind: 'form', code: first.code, device: first.entity ?? null, port, walk: null };
  }
  const probe = evidence.probes?.find(p => p.id === first.entity);
  const objective = evidence.objectives?.find(o => o.id === first.entity);
  if (objective) return { kind: 'objective', code: first.code, from: objective.from, to: null, walk: objective.walk, reverse: null, diagnosis: null };
  if (!probe) return { kind: 'other', code: first.code, walk: null };
  const walks = probe.walks ?? [];
  let walk = null, reverse = null;
  let leaked = null;
  if (first.code === 'must-not-reach') {
    walk = walks.find(w => w.arrivals.some(a => a.host === (w.from === probe.from ? probe.to : probe.from))) ?? walks[0] ?? null;
    // The PC whose link the frame reached although it belongs to another group.
    leaked = walk ? (walk.from === probe.from ? probe.to : probe.from) : null;
  } else if (walks.length) {
    // The direction that fails; the other is mentioned only when it differs (one-way).
    const [ab, ba] = walks;
    const abOk = ab.received.has(probe.to), baOk = ba?.received.has(probe.from);
    walk = !abOk ? ab : ba;
    if (probe.reachability === 'one-way') reverse = abOk ? 'ab' : 'ba';
  }
  return { kind: 'probe', code: first.code, from: probe.from, to: probe.to, walk, reverse, diagnosis: probe.diagnosis ?? null, leaked };
}

/** The VLAN each PC's frames were put in, as the check's walks show it: the
 * classification at the first switch (null where a switch passes frames
 * unchanged). From the submitted answer, never from the task's goals. */
export function actualVlans(evidence) {
  const out = {};
  for (const probe of evidence?.probes ?? []) for (const walk of probe.walks ?? []) {
    if (Object.hasOwn(out, walk.from)) continue;
    const ingress = walk.hops.find(h => h.inPort !== null);
    if (ingress) out[walk.from] = ingress.transparent ? null : ingress.vid ?? null;
  }
  return out;
}

/** The broadcast domains after a success, numbered as the prediction's are,
 * each with the VLAN(s) the answer actually uses («Домен 1 — VLAN 300: PC1,
 * PC3»). An equivalent renumbering passes, so the task's goals can differ. */
export function domainLegend(task, domains, evidence) {
  const order = task.topology.hosts.map(h => h.device);
  const vlans = actualVlans(evidence);
  return (domains ?? []).map(group => [...group].sort((a, b) => order.indexOf(a) - order.indexOf(b)))
    .sort((a, b) => order.indexOf(a[0]) - order.indexOf(b[0]))
    .map((hosts, i) => ({ n: i + 1, hosts, colour: i % 8, vids: [...new Set(hosts.map(h => vlans[h]).filter(v => v !== null && v !== undefined))].sort((a, b) => a - b) }));
}

/** Marks still true of the current answer: a field edited since the check
 * (its answer value changed) loses its mark, so it no longer says invalid. */
export function freshMarks(marks, checked, current) {
  const same = (sw, field) => JSON.stringify(readField(checked, sw, field)) === JSON.stringify(readField(current, sw, field));
  return Object.fromEntries(Object.entries(marks ?? {}).map(([sw, list]) => [sw, list.filter(m => same(sw, m.field))])
    .filter(([, list]) => list.length));
}

/** Advice after a success (at most two): code, switch and port id. */
export const tipsOf = result => (result?.ok ? result.findings.filter(f => f.severity === 'advice').slice(0, 2).map(f => ({ code: f.code, device: f.entity, port: portIdOf(f.field) })) : []);

/** The verdict on screen: the last result, only in the syntax it was checked in. `stale`: the form changed since. */
export function verdictOf(result, verdict, syntax, answerKey) {
  if (!result || !verdict || verdict.syntax !== syntax) return null;
  return { result, stale: verdict.answer !== answerKey };
}
