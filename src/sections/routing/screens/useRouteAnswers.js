// The routing rows' answers through the exercise instance (useExercise),
// round 2 step 6 (spec v2.1 §2).
//
// - The canonical answer is a flat list of routes per router, each with a
//   lifetime `id` (`R1.f3`) and maybe a guided `slot` binding (`R1.row1`).
//   Free mode's «+ Маршрут» adds a placeholder (`{ id }`) that becomes a
//   route once its text is checked; placeholders never reach check().
// - Two modes (a global preference): «З підказками» shows the scaffold's
//   rows through guidedView, plus «Інші маршрути» (routes no row takes);
//   «Самостійно» lists each router's routes. Unchecked text is a draft of
//   its mode and syntax, keyed by route id (fresh guided text by its slot).
// - A row check (guided only, `row-checked`) runs the form check, then the
//   frozen checkRow (rowCheck.js); it records the route and verdict, never
//   an attempt, and never decides solved. Checking a row never moves its
//   text to another slot. A check whose text doesn't parse keeps the text.
//   Round 4 (spec R1): there is no row button any more; the screen checks a
//   guided row when a field the learner touched loses focus, and records
//   which fields it may mark (`fields`). After a network check every guided
//   row whose route is the one that check bound is graded too
//   (`networkResultOf`, pure: nothing is recorded), all its fields marked.
// - The network check runs on every row with text in the active mode:
//   validateFields, then validateRoute; any form error stops it (the rows
//   are marked) before check(). Otherwise the parsed rows become the
//   canonical answer and check() decides. Either way it is one attempt.
// - The verdict a row check recorded is never changed by a syntax switch:
//   the other syntax words it its own way only where its grading of the
//   converted route agrees; otherwise it shows the verdict alone. It shows
//   only while the row holds the route it checked (equal after syntax
//   conversion): a route changed elsewhere (in free mode, say) has no
//   verdict until it is checked again. After a passing network check, row
//   ✗ marks are hidden (rows test the suggested form; the network check
//   decides).
// - Live conversion (polish spec v2 §1): text that parses (complete,
//   parseable fields; mistakes such as host bits kept as typed) is the same
//   route in the other syntax, unchecked. One resolver, `effective`, decides
//   what a row shows in the active syntax, and the same values are edited,
//   row-checked, network-checked, hinted and compared for the O1 verdict
//   rule: this syntax's own text if it is at least as new as the row's
//   canonical draft; else the canonical draft in this syntax's fields; else
//   the saved route; else nothing. Showing a converted draft is not a check:
//   no attempt, verdict or earned mark moves. Text in the other syntax that
//   is newer than the canonical draft and doesn't parse stays there, and the
//   row here gets a note (`noteOf`).
import { useMemo } from 'react';
import routing, { compactRoutes, guidedView, putRoute, slotId, slotDestination } from '../logic/static.js';
import { syntaxList, syntaxes } from '../syntax/index.js';
import { strictIp, isNull0 } from '../../../engine/vendors/fields.js';
import { fieldOfCode, formCode, hasText, rowCheck, rowCheckReasons, rowFormCode } from './rowCheck.js';

/** A route with a destination (a free-mode placeholder has none yet). */
const routable = r => Boolean(r) && typeof r.dst === 'string';

/** The canonical answer without placeholders: what check() takes. */
export function routableAnswer(answer) {
  return Object.fromEntries(Object.entries(compactRoutes(answer)).map(([router, rows]) => [router, rows.filter(routable)]));
}

/** The highest free-route number an instance has used (`R1.f3` → 3). */
export function routeSerialOf(instance) {
  const numbers = Object.values(instance?.answer ?? {}).flat().map(r => Number(r?.id?.match(/\.f(\d+)$/)?.[1] ?? 0));
  return Math.max(instance?.routeSerial ?? 0, 0, ...numbers);
}

/** What checkRow decided for a row, in terms both syntaxes share. */
function assessment(detail) {
  const dst = 'dstOk' in detail ? detail.dstOk : detail.netOk && detail.maskOk;
  return [detail.ok, dst, detail.gwOk, detail.distOk].map(Boolean).join();
}

const sameRoute = (a, b) => Boolean(a && b) && a.dst === b.dst && a.prefix === b.prefix && a.via === b.via && (a.discard === true) === (b.discard === true) && (a.distance ?? 1) === (b.distance ?? 1);
const routeText = r => `${r.dst}/${r.prefix}>${r.discard === true ? 'discard' : r.via}@${r.distance ?? 1}`;
/** One answer's routes as a set per router (order, ids and bindings left out). */
const routeSetKey = answer => JSON.stringify(Object.entries(answer ?? {})
  .map(([router, rows]) => [router, (rows ?? []).filter(routable).map(routeText).sort()])
  .filter(([, rows]) => rows.length).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)));
/** True when two answers hold the same routes on every router. */
export const sameRouteSet = (a, b) => routeSetKey(a) === routeSetKey(b);
const trimmed = values => Object.fromEntries(Object.entries(values ?? {}).map(([k, v]) => [k, v === false ? '' : String(v ?? '').trim()]).filter(([, v]) => v));
const sameValues = (a, b) => JSON.stringify(Object.entries(trimmed(a)).sort()) === JSON.stringify(Object.entries(trimmed(b)).sort());

/** What an edit makes the row's canonical draft: the route its text parses
 * to (as typed, host bits and all: parsing doesn't grade), null for a row
 * with no text left, or undefined for unfinished or invalid text (the
 * canonical draft stays as it was). */
export function canonicalOf(syntax, values) {
  const route = syntax.toRoute(values);
  if (route) return { dst: route.dst, prefix: route.prefix, ...(route.discard === true ? { discard: true } : { via: route.via }), distance: route.distance };
  return hasText(values) ? undefined : null;
}

/** The fields a form code marks: the one it names, or the empty / malformed ones. */
export function fieldsOfCode(code, syntax, values = {}) {
  // Without a row's network to compare, the address or the mask may be the wrong one.
  if (code === 'dst-not-network' && syntax.id === 'cisco') return ['net', 'mask'];
  const field = fieldOfCode(code, syntax.id);
  if (field) return [field];
  const names = syntax.fields.map(f => f.name).filter(n => n !== 'dist' && !(n === 'gw' && values.blackhole === true));
  const value = n => String(values[n] ?? '').trim();
  if (code === 'empty') return names.filter(n => !value(n));
  if (code === 'invalid-ip') return names.filter(n => n !== 'mask' && !(n === 'gw' && syntax.id === 'cisco' && isNull0(value(n))) && value(n) && !strictIp(n === 'dst' ? value(n).split('/')[0] : value(n)));
  return [];
}

/**
 * @param {object} ex     the routing instance from useExercise
 * @param {object} syntax the active syntax adapter
 * @param {'guided'|'free'} [mode]
 */
export function useRouteAnswers(ex, syntax, mode = 'guided') {
  const { task } = ex;
  const rows = useMemo(() => routing.scaffold(task, syntax.id), [task, syntax.id]);
  const answer = useMemo(() => compactRoutes(ex.answer ?? {}), [ex.answer]);
  const view = useMemo(() => guidedView(task, answer), [task, answer]);
  const routers = useMemo(() => task.network.devices.filter(d => d.kind === 'router').map(d => d.id), [task]);
  // Free rows (and «Інші маршрути») show a distance field where any row of the task has one (task 15).
  const anyDist = useMemo(() => Object.values(rows).flat().some(r => r.needDist), [rows]);
  const modeDrafts = ex.drafts?.[mode] ?? {};
  const drafts = modeDrafts[syntax.id] ?? {};
  const other = syntaxList.find(s => s.id !== syntax.id);
  const passed = ex.result?.ok === true;

  /** Guided row `index` of `router`: its slot and the route shown there. */
  function slotItem(router, index) {
    const slot = slotId(router, index);
    const route = view[router]?.slots[index]?.route ?? null;
    return { kind: 'slot', router, index, slot, key: route?.id ?? slot, route, needDist: Boolean(rows[router]?.[index]?.needDist) };
  }
  /** «Інші маршрути»: routes no guided row takes, numbered after the rows. */
  function extraItems(router) {
    const extras = view[router] ? view[router].extras : answer[router] ?? [];
    const first = rows[router]?.length ?? 0;
    return extras.filter(routable).map((route, i) => ({ kind: 'route', router, n: first + i + 1, key: route.id, route, needDist: anyDist }));
  }
  /** Free mode: every route of the router, in order, placeholders included. */
  function freeItems(router) {
    return (answer[router] ?? []).map((route, i) => ({ kind: 'route', router, n: i + 1, key: route.id, route: routable(route) ? route : null, needDist: anyDist }));
  }
  /** Every row the active mode shows, router by router. */
  function items() {
    if (mode === 'free') return routers.flatMap(freeItems);
    return routers.flatMap(r => [...(rows[r] ?? []).map((_, i) => slotItem(r, i)), ...extraItems(r)]);
  }
  const asItem = (a, b) => (typeof a === 'object' ? a : slotItem(a, b));

  /** The one resolver: what a row shows in the active syntax, and where it
   * comes from ('raw' this syntax's own text, 'canonical' the other
   * syntax's parsed text converted, 'route' the saved route, 'empty'). */
  function effective(item) {
    const own = drafts[item.key];
    const canonical = modeDrafts.canonical?.[item.key];
    const rev = modeDrafts.revs?.[syntax.id]?.[item.key] ?? 0;
    if (own && (!canonical || rev >= canonical.rev)) return { values: own, source: 'raw' };
    if (canonical) return { values: canonical.route ? syntax.fromRoute(canonical.route, item.needDist) : {}, source: 'canonical' };
    if (item.route) return { values: syntax.fromRoute(item.route, item.needDist), source: 'route' };
    return { values: {}, source: 'empty' };
  }

  /** The text in a row's fields (the resolver's values). */
  function valuesOf(a, b) {
    return effective(asItem(a, b)).values;
  }

  /** The other syntax's name when it holds text for this row that is newer
   * than the row's canonical draft and doesn't parse (it stays there, as
   * typed); else null. */
  function noteOf(a, b) {
    const item = asItem(a, b);
    const theirs = modeDrafts[other.id]?.[item.key];
    if (!theirs || !hasText(theirs)) return null;
    const canonical = modeDrafts.canonical?.[item.key];
    if (canonical && (modeDrafts.revs?.[other.id]?.[item.key] ?? 0) <= canonical.rev) return null;
    return other.toRoute(theirs) ? null : other.label;
  }

  /** Typing keeps a draft (and the canonical draft, when the text parses)
   * and hides the row's last verdict. `edit(item, name, value)` or, for a
   * guided row, `edit(router, index, name, value)`. */
  function edit(...args) {
    const [item, name, value] = typeof args[0] === 'object' ? args : [slotItem(args[0], args[1]), args[2], args[3]];
    const values = { ...valuesOf(item), [name]: name === 'blackhole' ? value === true : syntax.filterInput(value),
      ...(name === 'blackhole' && value === true ? { gw: '' } : {}) };
    ex.act({ type: 'draft', mode, syntax: syntax.id, routeId: item.key, value: values, canonical: canonicalOf(syntax, values) });
    if (item.kind === 'slot') ex.act({ type: 'part', part: item.slot, patch: { visible: false } });
  }

  function diagnosed(item, detail, values, override) {
    return { ok: detail.ok, detail, values, reasons: rowCheckReasons(task, item.router, item.index, values, syntax, detail, override) };
  }

  /**
   * The visible verdict of a guided row in the active syntax, or null:
   *   { ok, detail, values, reasons }  checked in this syntax, or in the other
   *                                    one and graded the same way here;
   *   { ok, detail: null, values }     checked in the other syntax, but its
   *                                    text didn't convert, or this syntax
   *                                    would grade it otherwise: the verdict alone.
   * A row shows nothing once the route its fields resolve to (effective())
   * is no longer the one checked (O1), or, for text that didn't parse, once
   * the text changed or this syntax has text of its own.
   */
  function resultOf(a, b) {
    const item = asItem(a, b);
    const last = ex.parts?.[item.slot];
    if (!last || !last.visible) return null;
    if (last.routeId && last.routeId !== item.route?.id) return null;
    // The route the row shows now against the one checked, in neutral form.
    const shown = effective(item);
    const now = syntax.toRoute(shown.values);
    const checked = (syntaxes[last.syntax] ?? syntax).toRoute(last.values ?? {});
    if (now || checked) {
      if (!sameRoute(now, checked)) return null;
    } else if (last.syntax === syntax.id ? !sameValues(shown.values, last.values) : shown.source === 'raw') {
      return null; // text that didn't parse: only that same text keeps its verdict
    }
    if (passed && !last.ok) return null;
    const scope = { fields: last.fields ?? 'all' };
    if (last.syntax === syntax.id) return { ...diagnosed(item, last.detail, last.values, last.override), ...scope };
    if (!now) return { ok: last.ok, detail: null, values: null, ...scope };
    // Checked in the other syntax: this syntax grades the same route in its own words.
    const values = shown.values;
    const { detail, override } = rowCheck(task, item.router, item.index, values, syntax);
    const same = last.detail ? assessment(detail) === assessment(last.detail) : detail.ok === last.ok;
    return { ...(same ? diagnosed(item, detail, values, override) : { ok: last.ok, detail: null, values }), ...scope };
  }

  /** Round 4: a guided row's grading after the last network check, while it
   * shows the route that check bound to it (all its fields may be marked).
   * Pure: it records nothing. null before a check, after a form-error check
   * or a passing one, or once the row was edited. A row left blank is graded
   * (every field empty) only on the router the check was pressed on: another
   * router the check opened has not been touched yet (Олена). */
  function networkResultOf(a, b) {
    const item = asItem(a, b);
    if (item.kind !== 'slot' || !ex.result || passed || ex.result.code === 'form-errors') return null;
    const values = valuesOf(item);
    if (!hasText(values) && ex.view.checkedOn !== item.router) return null;
    // An entirely blank row is graded too: a failing check marks its fields.
    if (hasText(values) && (!item.route || !sameRoute(syntax.toRoute(values), item.route))) return null;
    const { detail, override } = rowCheck(task, item.router, item.index, values, syntax);
    return { ...diagnosed(item, detail, values, override), fields: 'all', network: true };
  }

  /** A guided row's check (round 4: on blur). `fields`: the fields its
   * marks may show ('all', or the names the learner touched): `check(item,
   * { fields })` or `check(router, index, { fields })`. Returns the row's verdict. */
  function check(a, b, c) {
    const item = asItem(a, b);
    const { fields = 'all' } = (typeof a === 'object' ? b : c) ?? {};
    const values = valuesOf(item);
    const { detail, override } = rowCheck(task, item.router, item.index, values, syntax);
    const partResult = { ok: detail.ok, syntax: syntax.id, detail, values, visible: true, fields, ...(override ? { override } : {}) };
    const parsed = syntax.toRoute(values);
    const row = task.variant.scaffold[item.router]?.[item.index];
    const destination = row ? slotDestination(task, row) : null;
    // Discard slots cannot bind the other action (or a different block). Keep
    // a wrong row's draft and verdict in place until it is edited or submitted.
    const discardMismatch = parsed && (row?.discard === true || parsed.discard === true)
      && ((row?.discard === true) !== (parsed.discard === true) || destination?.dst !== parsed.dst || destination?.prefix !== parsed.prefix);
    if (parsed && !discardMismatch) {
      const id = item.route?.id ?? `${item.router}.f${routeSerialOf(ex) + 1}`;
      const route = { ...parsed, id, slot: item.slot };
      ex.act({ type: 'row-checked', routerId: item.router, route, answer: putRoute(task, answer, item.router, route, { id, slot: item.slot }), part: item.slot, partResult });
    } else {
      if (discardMismatch) ex.act({ type: 'draft', mode, syntax: syntax.id, routeId: item.key, value: values, canonical: canonicalOf(syntax, values) });
      ex.act({ type: 'row-checked', routerId: item.router, part: item.slot, partResult });
    }
    return diagnosed(item, detail, values, override);
  }

  /** «Перевірити мережу»: the form check of every row with text, then check().
   * Returns the result and the routes it checked (null when the form check stopped it). */
  function checkNetwork() {
    const all = items();
    const formErrors = all.flatMap(item => {
      const values = valuesOf(item);
      const code = !hasText(values) ? null : item.kind === 'slot' ? rowFormCode(task, item.router, item.index, values, syntax) : formCode(syntax, task.network, item.router, values);
      return code ? [{ routerId: item.router, code, key: item.key, values: trimmed(values) }] : [];
    });
    if (formErrors.length) {
      const result = { ok: false, complete: false, code: 'form-errors', findings: [], formErrors, evidence: { taskId: task.identity.taskId } };
      ex.act({ type: 'checked', answer: ex.answer ?? null, result, routeIds: [] });
      return { result, answer: null };
    }
    let next = answer, serial = routeSerialOf(ex);
    const consumed = [];
    for (const item of all) {
      const values = valuesOf(item);
      if (!hasText(values)) {
        // A route whose text was cleared: gone from a guided row; an empty row in free mode.
        if (item.route) next = { ...next, [item.router]: (next[item.router] ?? []).flatMap(r => (r.id !== item.route.id ? [r] : mode === 'free' ? [{ id: r.id }] : [])) };
        continue;
      }
      const parsed = syntax.toRoute(values);
      // An unedited route stays as it is (a free row keeps its guided binding
      // unless its text changed); a guided row binds what it shows to its slot.
      if (item.kind === 'route' && sameRoute(item.route, parsed)) continue;
      const id = item.route?.id ?? (item.kind === 'route' ? item.key : `${item.router}.f${++serial}`);
      if (id !== item.key) consumed.push(item.key);
      next = putRoute(task, next, item.router, { ...parsed, id }, item.kind === 'slot' ? { id, slot: item.slot } : { id });
    }
    // A guided row that now holds a route (one this check made, or a free
    // route it binds by destination) is consumed too: text left under its
    // slot can't outlive it and come back over a newer route.
    const filled = Object.entries(guidedView(task, next)).flatMap(([router, v]) => v.slots.flatMap((s, i) => (s.route ? [slotId(router, i)] : [])));
    const checked = routableAnswer(next);
    const result = routing.check(task, checked);
    ex.act({ type: 'checked', answer: next, result, routeIds: [...Object.values(next).flat().map(r => r.id), ...consumed, ...filled] });
    return { result, answer: checked };
  }

  /** A row's mark from the last network check's form errors, while its text is unchanged. */
  function formErrorOf(item) {
    const error = ex.result?.formErrors?.find(e => e.key === item.key);
    if (!error) return null;
    const values = valuesOf(item);
    return sameValues(values, error.values) ? { code: error.code, fields: fieldsOfCode(error.code, syntax, values) } : null;
  }

  /** The current rows of the active mode, parsed (unparseable rows left out): what hints() takes. */
  function currentAnswer() {
    const out = {};
    for (const item of items()) {
      const route = syntax.toRoute(valuesOf(item));
      if (route) (out[item.router] ??= []).push({ ...route, id: item.key });
    }
    return out;
  }

  // `id`: the route's id where the screen already shows it (free mode's blank row #1).
  const addRoute = (router, id = null) => ex.act({ type: 'route-upsert', routerId: router, route: id ? { id } : {} });
  const removeRoute = item => ex.act({ type: 'route-deleted', routeId: item.key });

  return { rows, mode, routers, anyDist, passed, slotItem, extraItems, freeItems, effective, valuesOf, noteOf, edit, resultOf, networkResultOf, check, checkNetwork, formErrorOf, currentAnswer, addRoute, removeRoute };
}
