// Pure per-instance state. Network checks decide completion; row checks only
// record routes and verdicts. Drafts are keyed mode → syntax → route id.
//
// Live conversion between syntaxes (polish spec v2 §1): beside each mode's
// raw text per syntax, `drafts[mode].canonical[key]` holds the route the
// row's last parseable edit meant ({ route, rev }; route null for a row
// cleared of all text), and `drafts[mode].revs[syntax][key]` when each raw
// draft was last edited, from one counter per instance (`draftRev`). They
// live in the same tree as the raw text, keyed by the same route id or slot,
// so a check, a deletion or a reset drops or keeps all three together.
import { initialSession, readSession, sessionReducer } from './session.js';

/**
 * The drafts tree (an instance's `drafts`): text not yet checked, never
 * part of the answer.
 *
 *   drafts[mode][syntaxId][key]   raw field text            FieldValues
 *   drafts[mode].canonical[key]   the last parseable edit   CanonicalDraft
 *   drafts[mode].revs[syntaxId][key]  when that raw text was last edited
 *   drafts[syntaxId][part]        legacy, no mode (step 5's `supersede`
 *                                 path, the mask screen's own drafts)
 *
 * mode: 'guided' | 'free'; syntaxId: 'cisco' | 'routeros'; key: a route id
 * ('R1.f3') or a guided slot ('R1.row1'). `canonical` and `revs` sit beside
 * the syntax ids in `drafts[mode]` (RESERVED_DRAFT_KEYS): read a syntax's
 * text as `drafts[mode][syntaxId]`, never by iterating `drafts[mode]`'s keys.
 * The one walk over the whole tree is dropRouteDrafts, schema-blind on
 * purpose: route ids and slots contain a dot (legacy parts a slash), so they
 * never equal a mode, a syntax id, a reserved key or a field name, and
 * removing such a key at every depth removes exactly that row's raw text,
 * canonical draft and revisions, in every mode and syntax.
 *
 * @typedef {Object<string, string|boolean>} FieldValues
 *   a row's text by field (net, mask, gw, dst, dist)
 * @typedef {{ route: { dst: string, prefix: number, via?: string, discard?: boolean, distance: number } | null, rev: number }} CanonicalDraft
 *   route: as typed (host bits and all), null for a cleared row
 * @typedef {{ canonical?: Object<string, CanonicalDraft>, revs?: Object<string, Object<string, number>> }
 *   & Object<string, Object<string, FieldValues>>} ModeDrafts
 */
export const RESERVED_DRAFT_KEYS = Object.freeze(['canonical', 'revs']);

/** @returns {object} a fresh instance */
export function initialInstance() {
  return { session: initialSession(), answer: null, result: null, completion: null, parts: {}, presses: 0, drafts: {}, view: {} };
}

/** Pure instance transitions. Actions:
 * checked {answer,result,routeIds?}: network check, invalidating canonical IDs' drafts.
 * row-checked {routerId,route?,routeId?,slot?,answer?,part?,partResult}: no attempt/session move.
 * route-upsert {routerId,route}: preserve id or allocate a new monotonic .f id.
 * route-deleted {routeId}: remove route and every tied draft/verdict.
 * draft {mode?,syntax,routeId?|part,value,canonical?}: with a mode, the edit
 *   gets the next revision; `canonical` (a parsed route, null for a cleared
 *   row; leave it out for unfinished text) becomes the row's canonical draft.
 * session {action}; view {patch};
 * part {part,patch}; clear-results; reset.
 * review {generation,edits,tips,star}: the post-success review of one check
 *   (OPT-1 UI U1), stored as view.review only while that check is still the
 *   instance's latest (`generation`) and its answer unedited (`edits`).
 * Prefer putRoute for topology-aware binding before passing answer to row-checked.
 *
 * Two counters identify a check's answer: `generation`, which every network
 * check and «↺» (`clear-results`) advance, and `edits`, which every edit
 * advances: typing (a draft), adding or deleting a route, and a row check
 * that changes the routes or the drafts (one that records the same routes
 * again isn't an edit). Neither goes back; `reset` starts the instance
 * afresh. A network check and «↺» drop view.review, and a review is stored
 * only for the instance's passing current check: a review belongs to one
 * check.
 */
export function instanceReducer(state = initialInstance(), action) {
  const next = transition(state, action);
  if (next === state) return next;
  const edited = EDITS.has(action.type) || (action.type === 'row-checked' && changedAnswer(readInstance(state), next));
  return edited ? { ...next, edits: (state.edits ?? 0) + 1 } : next;
}

/** The actions that always edit the answer or its drafts. */
const EDITS = new Set(['draft', 'route-upsert', 'route-deleted']);
/** The routes an answer holds, per router (ids and actions; guided slot bindings left out). */
const routesKey = answer => JSON.stringify(Object.entries(answer ?? {}).sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
  .map(([router, rows]) => [router, (rows ?? []).filter(Boolean).map(r => [r.id, r.dst, r.prefix, r.discard === true ? 'discard' : r.via, r.distance ?? 1])]));
/** True when a transition changed the answer's routes or the drafts. */
const changedAnswer = (before, after) => routesKey(before.answer) !== routesKey(after.answer) || JSON.stringify(before.drafts) !== JSON.stringify(after.drafts);
/** An instance's view without a review. */
const withoutReview = view => {
  if (!view || !('review' in view)) return view;
  const { review, ...rest } = view;
  return rest;
};

function transition(state, action) {
  state = readInstance(state);
  switch (action.type) {
    case 'checked': {
      const parts = action.part === undefined ? state.parts : { ...state.parts, [action.part]: action.partResult };
      const routeIds = action.routeIds ?? Object.values(action.answer ?? {}).flat().filter(r => r?.id).map(r => r.id);
      const drafts = action.supersede && action.part !== undefined ? dropCheckedDrafts(state.drafts, action.part, action.syntax) : routeIds.reduce((d, id) => dropRouteDrafts(d, id), state.drafts);
      const completion = null;
      return {
        ...state,
        generation: (state.generation ?? 0) + 1,
        view: withoutReview(state.view),
        answer: action.answer,
        ...(action.result?.evidence?.taskId ? { taskId: action.result.evidence.taskId } : {}),
        ...(routeIds.length ? { routeSerial: Math.max(state.routeSerial ?? 0, ...routeIds.map(freeSerial)) } : {}),
        result: action.result,
        completion,
        parts,
        drafts,
        presses: state.presses + 1,
        session: sessionReducer(state.session, { type: 'check', result: action.result }),
      };
    }
    case 'row-checked': {
      const serial = nextSerial(state, action.routerId);
      const routeId = action.route?.id ?? action.routeId ?? (action.route ? `${action.routerId}.f${serial}` : null);
      let answer = action.answer ?? state.answer;
      if (!action.answer && action.route) {
        const rows = answer?.[action.routerId] ?? [];
        const route = { ...action.route, id: routeId, ...(action.slot ? { slot: action.slot } : {}) };
        answer = { ...answer, [action.routerId]: rows.some(r => r.id === routeId) ? rows.map(r => r.id === routeId ? route : r) : [...rows, route] };
      }
      // Only a check that produced a canonical route replaces drafts (spec §2.2):
      // text that didn't parse stays as typed, in every syntax.
      const produced = Boolean(action.route || action.answer);
      let drafts = produced && routeId ? dropRouteDrafts(state.drafts, routeId) : state.drafts;
      if (produced && action.part) drafts = dropRouteDrafts(drafts, action.part);
      return { ...state, routeSerial: action.route ? Math.max(serial, freeSerial(routeId)) : state.routeSerial, answer, parts: { ...state.parts, [action.part ?? routeId]: { ...action.partResult, ...(routeId ? { routeId } : {}) } }, drafts };
    }
    case 'route-upsert': {
      const rows = state.answer?.[action.routerId] ?? [];
      const serial = nextSerial(state, action.routerId);
      const id = action.route.id ?? `${action.routerId}.f${serial}`;
      const old = rows.find(r => r.id === id);
      const { slot, ...fields } = action.route;
      const route = { ...fields, id, ...(old?.slot && old.dst === fields.dst && old.prefix === fields.prefix ? { slot: old.slot } : {}) };
      const exists = rows.some(r => r.id === id);
      return { ...state, routeSerial: Math.max(serial, freeSerial(id)), answer: { ...state.answer, [action.routerId]: exists ? rows.map(r => r.id === id ? route : r) : [...rows, route] }, drafts: dropRouteDrafts(state.drafts, id) };
    }
    case 'route-deleted': {
      return { ...state, answer: Object.fromEntries(Object.entries(state.answer ?? {}).map(([router, rows]) => [router, rows.filter(r => r.id !== action.routeId)])), drafts: dropRouteDrafts(state.drafts, action.routeId), parts: Object.fromEntries(Object.entries(state.parts).filter(([id, part]) => id !== action.routeId && part.routeId !== action.routeId)) };
    }
    case 'session': {
      const session = sessionReducer(state.session, action.action);
      return session === state.session ? state : { ...state, session };
    }
    case 'draft': {
      if (!action.mode) return { ...state, drafts: { ...state.drafts, [action.syntax]: { ...state.drafts[action.syntax], [action.part]: action.value } } };
      const key = action.routeId ?? action.part, rev = (state.draftRev ?? 0) + 1;
      const own = state.drafts[action.mode] ?? {};
      const mode = {
        ...own,
        [action.syntax]: { ...own[action.syntax], [key]: action.value },
        revs: { ...own.revs, [action.syntax]: { ...own.revs?.[action.syntax], [key]: rev } },
        ...(action.canonical !== undefined ? { canonical: { ...own.canonical, [key]: { route: action.canonical, rev } } } : {}),
      };
      return { ...state, draftRev: rev, drafts: { ...state.drafts, [action.mode]: mode } };
    }
    case 'part':
      if (!state.parts[action.part]) return state;
      return { ...state, parts: { ...state.parts, [action.part]: { ...state.parts[action.part], ...action.patch } } };
    case 'view':
      return { ...state, view: { ...state.view, ...action.patch } };
    case 'clear-results':
      return { ...state, generation: (state.generation ?? 0) + 1, parts: {}, presses: 0, result: null, completion: null, view: withoutReview(state.view), session: sessionReducer(state.session, { type: 'clear' }) };
    case 'review':
      if (state.result?.ok !== true || (state.generation ?? 0) !== action.generation || (state.edits ?? 0) !== action.edits) return state;
      return { ...state, view: { ...state.view, review: { generation: action.generation, edits: action.edits, tips: action.tips, star: action.star === true } } };
    case 'reset':
      return initialInstance();
    default:
      return state;
  }
}

/** Score earned tasks (any earned variant counts once). Supply {taskId, ...instance}
 * or instances with identity.taskId; anonymous consumers count per instance.
 * total defaults to the routing bank's sixteen tasks; presses are network checks.
 */
export function scoreOf(instances, total = 16) {
  const earned = new Set();
  let presses = 0;
  for (const [i, instance] of instances.entries()) {
    if (!instance) continue;
    if (instance.session?.earned?.solved) earned.add(instance.taskId ?? instance.identity?.taskId ?? instance.result?.evidence?.taskId ?? i);
    presses += instance.presses ?? 0;
  }
  return { correct: earned.size, total, presses };
}

/** Canonical state read: compact legacy null routes and ignore completion. */
export function readInstance(state = initialInstance()) {
  const session = readSession(state.session);
  const dirty = Object.values(state.answer ?? {}).some(rows => Array.isArray(rows) && rows.some(r => !r));
  if (session === state.session && !dirty && state.completion == null) return state;
  return { ...state, session, completion: null, answer: dirty ? Object.fromEntries(Object.entries(state.answer).map(([router, rows]) => [router, rows.filter(Boolean)])) : state.answer };
}

/** Remove a route's (or slot's) drafts in every mode and syntax, including
 * legacy syntax keys, with its canonical draft and revisions. */
function dropRouteDrafts(drafts, id) {
  return Object.fromEntries(Object.entries(drafts).filter(([key]) => key !== id).map(([key, value]) => [key,
    value && typeof value === 'object' && !Array.isArray(value) ? dropRouteDrafts(value, id) : value]));
}

function nextSerial(state, router) {
  return Math.max(state.routeSerial ?? 0, ...(state.answer?.[router] ?? []).map(r => Number(r?.id?.match(/\.f(\d+)$/)?.[1] ?? 0))) + 1;
}

// Compatibility for the step-5 hook until the screen switches to row-checked.
function dropCheckedDrafts(drafts, id, syntax) {
  const next = dropRouteDrafts(drafts, id);
  if (syntax && drafts[syntax]?.[id]) next[syntax] = { ...next[syntax], [id]: drafts[syntax][id] };
  return next;
}

const freeSerial = id => Number(id?.match(/\.f(\d+)$/)?.[1] ?? 0);
