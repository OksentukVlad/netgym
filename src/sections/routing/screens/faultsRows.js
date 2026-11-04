// «Знайди несправність» (RF-1): the editable route table and its text, pure
// (no React). The screen keeps, per instance (the store's view):
//
//   rows    { [router]: [{ id, route }] }: the table, in order. Ids are the
//           public task's neutral ones (`route-1-2`) and `new-<n>` for rows
//           the student adds; `route` is the row's last text that parsed (a
//           neutral route), null for a row with no text, or what it was for
//           unfinished text.
//   drafts  { [id]: { syntax, values } }: the row's last typed text and the
//           syntax it was typed in. Another syntax shows the row's route in
//           its own fields (the text it couldn't convert stays, with a note).
//   marks   { [id]: { code, syntax, values } }: the last check's form error
//           on that row, shown while its text is what was checked.
//
// A check submits the active syntax's text (empty rows left out) to the
// logic's free-mode `fields` answer, so its syntax and topology checks run
// on exactly what the rows show.
import { hasText } from './rowCheck.js';

/** The public task's rows as the table starts. */
export function initialRows(task) {
  const routers = task.network.devices.filter(d => d.kind === 'router').map(d => d.id);
  return Object.fromEntries(routers.map(router => [router, (task.initialRoutes[router] ?? []).map(({ id, ...route }) => ({ id, route }))]));
}

/** True when any row of the task has a distance (every row then gets the field). */
export const usesDistance = task => Object.values(task.initialRoutes).flat().some(r => r.distance !== undefined);

/** The text a row shows in `syntax`: its own draft there, else its route in this syntax's fields. */
export function rowValues(row, draft, syntax) {
  if (draft && draft.syntax === syntax.id) return draft.values;
  return row.route ? syntax.fromRoute(row.route, row.route.distance !== undefined) : {};
}

/** What an edit makes a row's route: the text's route if it parses, null
 * for no text, else what it was. */
export function routeAfterEdit(row, syntax, values) {
  const parsed = syntax.toRoute(values);
  if (parsed) return parsed;
  return hasText(values) ? row.route : null;
}

const trimmed = values => Object.fromEntries(Object.entries(values ?? {}).map(([k, v]) => [k, v === false ? '' : String(v ?? '').trim()]).filter(([, v]) => v));
/** The same text (blank fields and surrounding spaces aside). */
export const sameValues = (a, b) => JSON.stringify(Object.entries(trimmed(a)).sort()) === JSON.stringify(Object.entries(trimmed(b)).sort());

/** The logic's free-mode answer from what the rows show in `syntax`; `used`
 * is each submitted row's text, by id (for the marks). */
export function fieldsAnswer(rows, drafts, syntax) {
  const fields = {}, used = {};
  for (const [router, list] of Object.entries(rows)) {
    fields[router] = [];
    for (const row of list) {
      const values = rowValues(row, drafts[row.id], syntax);
      if (!hasText(values)) continue;
      fields[router].push({ id: row.id, values });
      used[row.id] = values;
    }
  }
  return { answer: { fields, cause: null }, used };
}

/** The last check's form errors as marks: { [rowId]: { code, syntax, values } }. */
export function marksOf(result, used, syntaxId) {
  if (result?.code !== 'form-errors') return {};
  return Object.fromEntries((result.formErrors ?? []).filter(e => e.rowId && used[e.rowId])
    .map(e => [e.rowId, { code: e.code, syntax: syntaxId, values: used[e.rowId] }]));
}

