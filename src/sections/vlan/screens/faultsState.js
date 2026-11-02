// «Знайди несправність»: the screen's state and what it shows (VLAN-3 spec
// v2 §4 with Z1, Z2, Z7).
// Pure: no React, DOM or clock; tested in Node.
//
// The place (`vlan`) keeps, per vendor, the instance on screen: `faults`
// { cisco: { seed, level, shape }, routeros: … } and `faultsPrevious` (the
// slot «Попередні номери» goes back to). The logic's identity has the vendor
// in it, so a syntax switch opens (or returns to) that vendor's own instance,
// with its own draft and checks; nothing is translated across.
// Per instance, `instance.view` holds:
//   form      the configuration as the forms edit it (below)
//   raw       { [device|field]: text } being typed, not parsed yet
//   cause     the chosen «Причина» (an option's value; never in the DOM)
//   checked   the last submitted answer (JSON): the verdict and the grid
//             belong to it; the answer changed since → «Попередня перевірка»
//   stage     'checks' | 'repair' | 'cause' (round 4, spec F6 v2): the stage on
//             screen; «Причина» only after a passing repair of the
//             configuration on screen (stageOf)
//   edited    { device, field } the field edited last (a stale verdict's evidence)
//   repairEdited  the repair was edited since the last check: «Причина»
//             stays closed until another passing check, even after an undo
//   walk      { source, id, n } the grid row whose walk is drawn ('grid':
//             the grid on screen; 'before' / 'after': the reveal's); `n`
//             grows with every tap, so a tap replays
//   direction 'request' | 'reply' for an IP probe's walk
//   deviceId, zoom
// The instance's `result` is the last check's (useExercise).
//
// Forms are the given configuration itself, every device and row editable
// (no givens restored): Cisco ports keep both the access VLAN and the
// allowed list (VLAN-1's form) and, where the task uses one, the trunk's
// native VLAN; addresses and number fields hold what is typed until it
// parses (routeState.js). The grid on screen is the one computed at the
// start (faults.grid) or the last check's (result.evidence.grid): never the
// live draft's.
import { describe as describeL2 } from '../logic/describe.js';
import { label } from '../logic/model.js';
import { marksOf } from './portsState.js';
import { endpointName, isFormFailure, routeMarks, toRouteAnswer } from './routeState.js';
import { faultsUi, faultText, t } from '../uk.js';

export const MAX_LEVEL = 3;
const clone = value => JSON.parse(JSON.stringify(value));
const blank = v => v === '' || v === null || v === undefined;

/** An IP task (VLAN-2's shapes: a router, pings with request and reply), else VLAN-1's. */
export const isRouted = task => Boolean(task?.taskNumber);

// ── The place ────────────────────────────────────────────────────────────

/** The slot a vendor shows: { seed, level, shape }, or null when the place has none. */
export function slotOf(place, vendor) {
  const s = place?.faults?.[vendor];
  if (!s || !Number.isInteger(s.level)) return null;
  return { seed: s.seed, level: Math.max(1, Math.min(MAX_LEVEL, s.level)), shape: typeof s.shape === 'string' ? s.shape : null };
}

/** The params faults.create gets for a slot: the shape kept, so «Інші номери» is the same network. */
export const paramsOf = (vendor, slot) => ({ vendor, level: slot.level, seed: slot.seed, ...(slot.shape ? { variantId: slot.shape } : {}) });

/** «Ще одна»: one level up, to 3 and staying there. */
export const nextLevel = level => Math.min(MAX_LEVEL, level + 1);

// ── Forms and answers ────────────────────────────────────────────────────

/** Whether a configuration sets a native VLAN on a Cisco trunk (level 3): the forms then show the field. */
export const usesNative = config => Object.values(config ?? {}).some(c => Object.values(c?.ports ?? {}).some(p => p && typeof p === 'object' && 'native' in p));

/** The form a configuration is edited in. Cisco ports keep both fields (and
 * `native` where shown, '' for the default); RouterOS is the answer's own shape. */
export function toFaultForm(config, syntax, { native = false } = {}) {
  const form = clone(config ?? {});
  if (syntax !== 'cisco') return form;
  for (const c of Object.values(form)) {
    if (!c?.ports) continue;
    c.ports = Object.fromEntries(Object.entries(c.ports).map(([id, p]) => [id, {
      mode: p?.mode ?? null, vlan: p?.vlan ?? '', allowed: p?.allowed ?? [], ...(native ? { native: p?.native ?? '' } : {}),
    }]));
  }
  return form;
}

/** The configuration a form stands for (faults.check and render take it): a
 * Cisco port back to its mode's fields, `native` only when set; the router's
 * rows and the switch's SVI as «Між VLAN» submits them. */
export function toFaultConfig(form, syntax) {
  if (syntax !== 'cisco') return clone(form ?? {});
  const out = toRouteAnswer(form ?? {}, syntax);
  for (const [id, c] of Object.entries(out)) {
    if (!c?.ports) continue;
    c.ports = Object.fromEntries(Object.entries(form[id].ports).map(([port, p]) => [port,
      p.mode === 'access' ? { mode: 'access', vlan: p.vlan }
        : p.mode === 'trunk' ? { mode: 'trunk', allowed: Array.isArray(p.allowed) ? [...p.allowed] : p.allowed, ...(blank(p.native) ? {} : { native: p.native }) }
          : { mode: null }]));
  }
  return out;
}

// ── After a check ────────────────────────────────────────────────────────

/** The verdicts that are only about «Причина»: the fix works (or the choice isn't one of the list). */
export const CAUSE_CODES = ['fault-cause-other', 'fault-cause-required', 'invalid-cause'];
export const isCauseVerdict = result => Boolean(result) && !result.ok && CAUSE_CODES.includes(result.code);

// ── The stages (round 4, spec F6 v2: checks → repair → cause) ────────────

export const STAGES = ['checks', 'repair', 'cause'];

/** A check whose repair works: the network passes (solved), or only the cause is left. */
export const repairWorks = result => Boolean(result) && (result.ok || isCauseVerdict(result));

/**
 * The stage on screen. «Причина» opens after a passing repair and stays open
 * while the configuration is the one that passed (the cause choice may
 * change); an edit of the repair closes it until the repair passes again.
 * @param {string|undefined} wanted  the view's stage
 * @param {{ result: object|null, checkedConfig: string|null, config: string, edited?: boolean }} now  JSON keys of
 *   the configurations; `edited`: the repair was edited since the last check (even if undone: Astra 3)
 */
export function stageOf(wanted, { result, checkedConfig, config, edited = false }) {
  const causeOpen = repairWorks(result) && checkedConfig === config && !edited;
  const stage = STAGES.includes(wanted) ? wanted : 'checks';
  return { stage: stage === 'cause' && !causeOpen ? 'repair' : stage, causeOpen };
}

/**
 * The given configuration's commands for a device, each line marked when the
 * repair changed it (struck: it is no longer in the configuration on screen).
 * @returns {Array<{ text: string, head: boolean, changed: boolean }>}
 */
export function originalLines(before = '', now = '') {
  const { removed } = commandDiff(before, now);
  const left = new Map();
  for (const x of removed) left.set(`${x.head ?? ''}\n${x.line}`, (left.get(`${x.head ?? ''}\n${x.line}`) ?? 0) + 1);
  const out = [];
  let head = null;
  for (const line of String(before).split('\n')) {
    if (!line.trim()) continue;
    const indented = /^\s/.test(line);
    if (!indented) head = line;
    const key = `${indented ? head : ''}\n${line}`;
    const n = left.get(key) ?? 0;
    if (n > 0) left.set(key, n - 1);
    out.push({ text: line, head: !indented, changed: n > 0 });
  }
  return out;
}

/** The feedback's tone: ✓, «Ще ні» for a failing fix or another cause, plain for a missing choice. */
export function toneOf(result) {
  if (!result) return null;
  if (result.ok) return 'ok';
  return result.code === 'fault-cause-required' || result.code === 'invalid-cause' ? 'info' : 'no';
}

/** The fields a check marks, per device: form findings only, read from the
 * submitted configuration itself (a faults answer has no givens to restore).
 * Never an objective's address: on the untouched configuration that would
 * point at the planted fault (fix brief v1 item 4). */
export function faultMarks(task, result, checked, syntax) {
  if (!result || result.ok || isCauseVerdict(result)) return {};
  if (!isRouted(task)) return marksOf(result);
  return isFormFailure(result) ? routeMarks(task, result, checked, syntax, checked) : {};
}

// ── The grid ─────────────────────────────────────────────────────────────

/** The grid's rows as the screen shows them (Z1): reachability (expected ✓,
 * observed ✓ or ✕), then one isolation row per VLAN with where its frames
 * got to. Words, never colour alone. */
export function gridRows(task, grid, attachments = []) {
  // A PC, an L3 interface («R1 gi0/1.10»), an address nobody has («шлюз …»);
  // a management address that doesn't exist yet is the switch's own id.
  const name = id => endpointName(task, attachments, id);
  const reach = (grid?.reachability ?? []).map(r => {
    const what = r.kind === 'pc-pair' ? faultsUi.pair({ from: r.from, to: r.to }) : faultsUi.toward({ from: name(r.from), to: name(r.to) });
    return { id: r.id, kind: 'reach', what, ok: r.observed, detail: [], label: faultsUi.rowLabel({ what, ok: r.observed }) };
  });
  const isolation = (grid?.isolation ?? []).map(r => {
    const what = faultText.isolationRow({ vid: r.vid });
    const seen = new Set();
    const detail = r.unexpected.filter(a => !seen.has(a.host) && seen.add(a.host)).map(a => faultText.unexpected({ host: name(a.host), vlan: a.vlan }));
    return { id: r.id, kind: 'isolation', what, ok: r.observed, detail, label: `${faultsUi.rowLabel({ what, ok: r.observed })}${detail.length ? `. ${detail.join('; ')}` : ''}` };
  });
  return [...reach, ...isolation];
}

/** How many rows fail, of how many (the grid's summary line). */
export const gridCount = rows => ({ failing: rows.filter(r => !r.ok).length, total: rows.length });

/** The grid in words (for «Текстом»). */
export const gridLines = rows => rows.map(r => faultsUi.rowWords({ what: r.what, ok: r.ok, detail: r.detail }));

/** The PCs a walk reached that are in another VLAN than its source (by the task's goals). */
const strangers = (task, walk) => [...walk.received].filter(h => task.goals[h] !== undefined && task.goals[h] !== task.goals[walk.from]);

/**
 * What a grid row draws on the diagram:
 *   - a flood (VLAN-1's broadcast walk: a PC pair's failing direction, or an
 *     isolation row's source whose frames got out of their VLAN), with the PCs
 *     it must not reach and, for an IP task, the interfaces it got to;
 *   - an IP probe (request and reply; `direction`: the failing one, null when both work);
 *   - nothing to draw (a management address that doesn't exist yet), with its code.
 */
export function rowEvidence(task, grid, id) {
  const r = grid?.reachability?.find(x => x.id === id);
  if (r) {
    if (!r.probe) return { kind: 'none', id, code: [r.stops].flat(Infinity).find(Boolean)?.code ?? null };
    if (r.probe.walks) {
      const [ab, ba] = r.probe.walks;
      const walk = !r.observed && ab && !ab.received.has(r.to) ? ab : !r.observed && ba ? ba : ab;
      return { kind: 'flood', id, walk, leaked: strangers(task, walk), ifaces: {} };
    }
    return { kind: 'trace', id, probe: r.probe, direction: r.observed ? null : r.probe.request?.ok ? 'reply' : 'request' };
  }
  const row = grid?.isolation?.find(x => x.id === id);
  if (!row) return null;
  const from = row.unexpected[0]?.from;
  const walk = row.walks.find(w => w.from === from) ?? row.walks[0] ?? null;
  if (!walk) return { kind: 'none', id, code: null };
  const reached = row.unexpected.filter(a => a.from === walk.from).map(a => a.host);
  const hosts = new Set(task.topology.hosts.map(h => h.device));
  const ifaces = Object.fromEntries(reached.filter(h => !hosts.has(h)).map(h => [h, 'leaked']));
  if (!hosts.has(walk.from)) ifaces[walk.from] = 'source';
  return { kind: 'flood', id, walk, leaked: [...new Set(reached.filter(h => hosts.has(h)))], ifaces, isolation: true };
}

/** A VLAN-1 walk in words: describe() after the givens it repeats (the reachability note apart). */
export function floodLines(task, syntax, walk) {
  if (!walk) return { note: null, steps: [] };
  const givens = describeL2(task, { syntax }).length;
  const lines = describeL2(task, { syntax, walks: [walk] }).slice(givens);
  const note = lines[0] === t('reachability-abstraction') ? lines[0] : null;
  return { note, steps: note ? lines.slice(1) : lines };
}

// ── The reveal ───────────────────────────────────────────────────────────

/** A changed place in words: the device and the port's label (bridge1, an interface's name as is). */
export function changeWhere(task, change, syntax) {
  if (!change) return '';
  const port = change.port === 'bridge' ? 'bridge1' : change.port ? label(task.topology, change.device, change.port, syntax) : null;
  return faultsUi.where({ device: change.device, port });
}

/**
 * The command lines a change removes and adds (the change's «Було» and
 * «Стало»), as multisets, each with its block: an indented Cisco line keeps
 * the «interface …» above it, so it reads where it belongs.
 * @returns {{ removed: Array<{ head: string|null, line: string }>, added: Array<{ head: string|null, line: string }> }}
 */
export function commandDiff(before = '', after = '') {
  const lines = text => {
    const out = [];
    let head = null;
    for (const line of String(text).split('\n')) {
      if (!line.trim()) continue;
      const indented = /^\s/.test(line);
      if (!indented) head = line;
      out.push({ head: indented ? head : null, line });
    }
    return out;
  };
  const key = x => `${x.head ?? ''}\n${x.line}`;
  const minus = (list, other) => {
    const left = new Map();
    for (const x of other) left.set(key(x), (left.get(key(x)) ?? 0) + 1);
    return list.filter(x => {
      const n = left.get(key(x)) ?? 0;
      if (n > 0) { left.set(key(x), n - 1); return false; }
      return true;
    });
  };
  const a = lines(before), b = lines(after);
  return { removed: minus(a, b), added: minus(b, a) };
}

/** A diff's side as display lines: each block's head once, then its lines. */
export function diffLines(entries) {
  const out = [];
  let last = null;
  for (const { head, line } of entries) {
    if (head && head !== last) out.push({ text: head, head: true });
    last = head;
    out.push({ text: line, head: false });
  }
  return out;
}
