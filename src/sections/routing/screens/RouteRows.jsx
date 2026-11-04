// The selected router's routes in the work panel (round 2 step 6, design
// §1), in the mode the bar's switch chose:
//
//   - «З підказками»: the scaffold's rows, one card each: its header (names
//     from metadata), its fields in a two-column grid, «Перевірити» (the row
//     check, Enter) and its feedback, one line per reason. Under them,
//     «Інші маршрути»: routes no row takes (deletable, checked with the
//     network).
//   - «Самостійно»: the router's own list, each route its fields with «#n»
//     and «✕»; a quiet link under it, «+ ще один маршрут (якщо потрібен)»
//     (round 5 5b-2, spec C), adds an empty one. Enter runs the network check.
//
// MikroTik rows offer the «blackhole (відкидати)» box only where discard
// routes are taught (polish-2 P2): in guided mode on the scaffold's discard
// row; in free mode and «Інші маршрути» on every row of a task that teaches
// them (facts.teachesDiscard); and wherever it is ticked.
//
// Round 4 (spec R1): one check, the network check in the help panel under
// the rows. A guided row has no «Перевірити» of its own: it is checked when a
// field the learner touched loses focus (only touched fields are marked), and
// after a network check (every field). Enter in any field runs the network
// check. A right row says «✓ правильно» quietly; a wrong one lists its
// reasons under its fields. The fields' labels and example placeholders are
// the screen's words (uk.js ui.shared.fieldLabels; round 5, R4: the
// placeholders are symbols, uk.js routingPlaceholders, never an address that
// could pass this task's checker; task 15 keeps its distance example, per row
// since 5b-2: «менша, напр. 1» on the main route, «більша, напр. 5» on the
// backup; MikroTik's destination shows its shape, «мережа/префікс, напр.
// x.x.x.0/24», uk.js comprehension). The row
// the panel's verdict (or a stale verdict's edit) is about carries
// data-evidence="current" (`evidenceKey`). The first router is always
// selected, so there is no «pick a router» line.
//
// A row the network check stopped on is marked (its fields and the form
// code's words) until its text changes. A row whose other-syntax text is
// unfinished or wrong (it couldn't be converted) says so under its fields
// (useRouteAnswers.noteOf). The screen's single role="status" announcement
// is elsewhere.
import { useEffect, useRef, useState } from 'react';
import { comprehension, routingPlaceholders, t, ui } from '../uk.js';
import { rowFacts, teachesDiscard } from './facts.js';
import Rich, { plain } from './Rich.jsx';
import { routeSerialOf } from './useRouteAnswers.js';

/** Code-only feedback under a checked row, or, for a
 * verdict recorded in the other syntax that this one can't word the same
 * way, the verdict alone (useRouteAnswers.resultOf). */
export function feedbackOf(syntax, shown) {
  if (shown.ok && shown.values) return syntax.success(shown.values);
  if (shown.detail) return syntax.feedback(shown.detail, shown.reasons);
  return { ok: shown.ok, parts: [shown.ok ? ui.routeros.right : ui.shared.wrong] };
}

/** The same code-only feedback drives the screen-reader announcement. */
export function announcementOf(syntax, shown, router, index) {
  return `${ui.shared.rowName(router, index + 1)}: ${plain(feedbackOf(syntax, shown).parts)}`;
}

/** A row's header id, from its route id or slot: a tip focuses it (tabIndex -1). */
export const rowHeadId = key => `rt-head-${String(key).replace(/[^\w-]/g, '-')}`;
/** A router's rows heading id: a router tip focuses it. */
export const rowsHeadId = router => `rt-rows-${String(router).replace(/[^\w-]/g, '-')}`;

/** «#1 Маршрут до LAN-B», «#1 Маршрут за замовчуванням · основний»,
 * «#8 Discard для всього сумарного блоку». */
export function RowHeader({ facts, index, syntax, id }) {
  return (
    <h4 className="ng-rt-row-head" id={id} tabIndex={id ? -1 : undefined}>
      <span className="ng-rt-row-n">#{index + 1}</span>{' '}
      {!facts.isDefault && !facts.discard && ui.shared.routeTo}<span className="ng-rt-dest">{facts.isDefault || facts.discard ? facts.label : ui.shared.routeLabel(facts.label)}</span>
      {facts.isDefault && syntax.id === 'routeros' && <> {ui.routeros.defaultAll}</>}
      {facts.role && <span className="ng-rt-role"> · {ui.shared[facts.role]}</span>}
      {facts.suggestion && <span className="ng-rt-role"> · {ui.shared.summarySuggestion}</span>}
    </h4>
  );
}

/** The label and example placeholder of a field, in the screen's words. */
export function labelOf(syntax, field) {
  return ui.shared.fieldLabels[syntax.id]?.[field.name] ?? field.label;
}
/** A field's placeholder: a symbol (round 5, R4), never the syntax
 * adapter's example; a default-route row's network the constant 0.0.0.0/0.
 * `facts.distanceExample`: the task teaches distance by its example (task 15),
 * per row (5b-2): `facts.role` 'backup' gets the larger example, any other row
 * the smaller one. MikroTik's destination shows the shape of its answer. */
export function placeholderOf(syntax, field, facts = {}) {
  const words = routingPlaceholders[syntax.id];
  // A default-route row: the one allowed constant (repair v1, Fable 2), 0.0.0.0 0.0.0.0 in Cisco's two fields.
  if (facts.isDefault && ['net', 'mask', 'dst'].includes(field.name)) return syntax.id === 'routeros' ? routingPlaceholders.defaultRoute : routingPlaceholders.defaultRoute.split('/')[0];
  if (field.name === 'gw' && facts.discard && words.gwDiscard) return words.gwDiscard;
  if (field.name === 'dist' && facts.distanceExample) return facts.role === 'backup' ? comprehension.distanceBackupPlaceholder : comprehension.distancePrimaryPlaceholder;
  if (field.name === 'dst' && syntax.id === 'routeros') return comprehension.dstPlaceholder;
  return words[field.name];
}
/** True for the task whose distance placeholder keeps its example (task 15). */
export const teachesDistance = task => task?.record?.displayNumber === 15;

/** The same fields in the other syntax: Cisco's network and mask are
 * MikroTik's destination, and back. */
const SAME_FIELD = { net: ['dst'], mask: ['dst'], dst: ['net', 'mask'], gw: ['gw'], dist: ['dist'] };
export const translatedFields = fields => [...new Set(fields.flatMap(name => [name, ...(SAME_FIELD[name] ?? [])]))];

/** A check's grading with the fields it may not mark (untouched) left out.
 * The touched fields count in either syntax (a blur in Cisco, a view in MikroTik). */
export function scopedDetail(detail, fields) {
  if (!detail || fields === 'all' || !fields) return detail;
  const allowed = translatedFields(fields);
  const keys = { net: 'netOk', mask: 'maskOk', dst: 'dstOk', gw: 'gwOk', dist: 'distOk' };
  const out = { ...detail };
  for (const [name, key] of Object.entries(keys)) if (key in out && !allowed.includes(name)) out[key] = true;
  return out;
}

/** A row's inputs: the syntax's fields, marked where a check found them
 * wrong; `describedBy`: the row's conversion note, heard on focus. A
 * MikroTik row ends with the «blackhole (відкидати)» checkbox (OPT-1 UI §1,
 * U9) where it offers one (`offerBlackhole`) or the box is ticked (a Cisco
 * Null0 converted, say), so it can be unticked. Ticking it
 * empties and disables the gateway (answers.edit clears it in the same
 * edit); Enter in it checks, as in the fields. Unticking a box the row
 * doesn't offer removes it, so focus goes to the gateway, enabled again
 * (polish-2 V6). */
function Fields({ syntax, names, values, id, placeholderFacts, invalid, onEdit, onEnter, onBlur, needDist, inputRef, describedBy, offerBlackhole = false, readOnly = false, quietLabels = false }) {
  const fields = syntax.fields.filter(f => names.includes(f.name));
  const holed = syntax.id === 'routeros' && values.blackhole === true;
  const boxShown = syntax.id === 'routeros' && (offerBlackhole || holed);
  const enter = e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } };
  const gateway = useRef(null);
  const toGateway = useRef(false);
  useEffect(() => {
    if (!toGateway.current) return;
    toGateway.current = false;
    gateway.current?.focus();
  });
  return (
    <div className={`ng-rt-fields ng-rt-fields-${syntax.id}${needDist ? ' has-dist' : ''}`}>
      {fields.map((field, i) => {
        const bad = invalid(field);
        const off = holed && field.name === 'gw';
        return (
          <div key={field.name} className={`ng-rt-field ng-rt-f-${field.name}`}>
            <label htmlFor={`${id}-${field.name}`} className={[field.distance ? 'is-distance' : '', quietLabels ? 'ng-sr-only' : ''].filter(Boolean).join(' ') || undefined}>{labelOf(syntax, field)}</label>
            <input
              id={`${id}-${field.name}`}
              ref={i === 0 ? inputRef : field.name === 'gw' ? gateway : undefined}
              className={`ng-rt-input${bad ? ' is-invalid' : ''}${field.distance ? ' is-distance' : ''}`}
              placeholder={off ? ui.shared.noGateway : placeholderOf(syntax, field, placeholderFacts)}
              value={off ? '' : values[field.name] || ''}
              disabled={off || undefined}
              readOnly={readOnly || undefined}
              autoComplete="off"
              spellCheck={false}
              aria-invalid={bad === undefined ? undefined : bad}
              aria-describedby={describedBy}
              onChange={e => onEdit(field.name, e.target.value)}
              onKeyDown={enter}
              onBlur={onBlur ? () => onBlur(field.name) : undefined}
            />
          </div>
        );
      })}
      {boxShown && (
        <div className="ng-rt-field ng-rt-f-blackhole">
          <label className="ng-rt-check-label" htmlFor={`${id}-blackhole`}>
            <input type="checkbox" id={`${id}-blackhole`} className="ng-rt-checkbox" checked={holed} disabled={readOnly || undefined}
              aria-describedby={describedBy} onKeyDown={enter}
              onChange={e => {
                if (!e.target.checked && !offerBlackhole) toGateway.current = true;
                onEdit('blackhole', e.target.checked);
              }} />
            {ui.shared.blackhole}
          </label>
        </div>
      )}
    </div>
  );
}

/** The words of a form error the network check stopped on. Its id joins
 * the row's fields' aria-describedby, so the error is heard on focus. */
function FormMark({ id, mark }) {
  return mark ? <p id={id} className="ng-rt-form-mark">{t(`routing.static.${mark.code}`)}</p> : null;
}

/** A row's fields are described by its conversion note and its form error, if any. */
const describedByOf = (id, note, mark) => [note && `${id}-note`, mark && `${id}-mark`].filter(Boolean).join(' ') || undefined;

/** «У MikroTik цей маршрут не дописано…»: the other syntax's text didn't
 * convert. Its id is the row's fields' aria-describedby. */
function ConvertNote({ id, name }) {
  return name ? <p id={id} className="ng-rt-note ng-rt-convert-note">{ui.shared.convertNote(name)}</p> : null;
}

/** A guided row (a scaffold slot). `target`: a tip points at it (outlined);
 * `evidence`: the panel's message is about it. A touched field's blur checks
 * the row (`onBlurCheck(item, touchedFields)`); Enter runs the network check. */
export function Row({ syntax, answers, task, item, onNetwork, onBlurCheck, target = false, evidence = false }) {
  const { router, index } = item;
  const facts = rowFacts(task, router, index);
  const values = answers.valuesOf(item);
  // The latest network check grades every field and wins over a blur's scope
  // (it stands while the row is unchanged since); otherwise the blur's.
  const shown = answers.networkResultOf?.(item) ?? answers.resultOf(item) ?? null;
  const mark = answers.formErrorOf?.(item) ?? null;
  // The fields the learner has typed in (this mount): only they are marked on blur.
  const [touched, setTouched] = useState(() => new Set());
  const scope = shown?.fields ?? 'all';
  const r = scopedDetail(shown?.detail, scope);
  const feedback = shown && (shown.ok ? null : feedbackOf(syntax, { ...shown, detail: r }));
  const names = [...(syntax.id === 'cisco' ? ['net', 'mask', 'gw'] : ['dst', 'gw']), ...(item.needDist ? ['dist'] : [])];
  const state = (shown ? (shown.ok ? ' is-ok' : ' is-wrong') : mark ? ' is-marked' : '');
  const invalid = field => (mark?.fields.includes(field.name) ? true : r ? r[field.okKey] === false || undefined : undefined);
  const id = `rt-${router}-${index}`;
  const note = answers.noteOf?.(item) ?? null;
  const edit = (name, value) => {
    setTouched(t => (t.has(name) ? t : new Set([...t, name])));
    answers.edit(item, name, value);
  };
  const blur = name => {
    if (!touched.has(name) || !onBlurCheck) return;
    onBlurCheck(item, [...touched]);
  };

  return (
    <li className={`ng-rt-row${state}${target ? ' is-target' : ''}`} data-row={item.key} {...(evidence ? { 'data-evidence': 'current' } : {})}>
      <RowHeader facts={facts} index={index} syntax={syntax} id={rowHeadId(item.key)} />
      <Fields syntax={syntax} names={names} values={values} id={id} placeholderFacts={{ ...facts, distanceExample: teachesDistance(task) }} needDist={item.needDist} offerBlackhole={facts.discard}
        invalid={invalid} onEdit={edit} onEnter={onNetwork} onBlur={blur} describedBy={describedByOf(id, note, mark)} />
      <ConvertNote id={`${id}-note`} name={note} />
      <FormMark id={`${id}-mark`} mark={mark} />
      {shown?.ok && <p className="ng-rt-feedback ng-rt-row-ok"><span aria-hidden="true">✓ </span>{ui.shared.rowOk}</p>}
      {/* One error per field: the form check's words, or else the row's reasons. */}
      {feedback && !mark && <RowReasons feedback={feedback} />}
    </li>
  );
}

/** The reasons under a wrong row, one line each (the leading verdict word left out: the field marks say it). */
function RowReasons({ feedback }) {
  const cut = feedback.parts.indexOf('\n');
  if (cut < 0) return null;
  return <p className="ng-rt-feedback ng-rt-reasons is-wrong"><Rich parts={feedback.parts.slice(cut + 1)} /></p>;
}

/** A route of its own (free mode, and «Інші маршрути»): «#n», «✕», its
 * fields. `discard`: the task teaches discard routes (the blackhole box).
 * `readOnly`: shown, not edited (no «✕»; «Знайди несправність» once solved). */
export function FreeRow({ syntax, answers, item, onNetwork, inputRef, discard = false, target = false, evidence = false, readOnly = false, children = null, quietHead = false, quietLabels = false, distanceExample = false, onEdit = null }) {
  const values = answers.valuesOf(item);
  const mark = answers.formErrorOf?.(item) ?? null;
  const names = [...(syntax.id === 'cisco' ? ['net', 'mask', 'gw'] : ['dst', 'gw']), ...(item.needDist ? ['dist'] : [])];
  const id = `rt-${item.key.replace(/[^\w-]/g, '-')}`;
  const note = answers.noteOf?.(item) ?? null;
  return (
    <li className={`ng-rt-row ng-rt-free-row${mark ? ' is-marked' : ''}${target ? ' is-target' : ''}`} data-row={item.key} {...(evidence ? { 'data-evidence': 'current' } : {})}>
      <div className="ng-rt-free-head">
        {/* `quietHead`/`quietLabels` (the faults' compact table): for screen readers only. */}
        <h4 className={`ng-rt-row-head${quietHead ? ' ng-sr-only' : ''}`} id={rowHeadId(item.key)} tabIndex={-1}><span className="ng-rt-row-n">#{item.n}</span></h4>
        {!readOnly && !onEdit && <button type="button" className="ng-rt-icon ng-rt-delete" aria-label={ui.shared.deleteRoute(item.n)} title={ui.shared.deleteRoute(item.n)} onClick={() => answers.removeRoute(item)}>✕</button>}
      </div>
      <Fields syntax={syntax} names={names} values={values} id={id} placeholderFacts={{ isDefault: false, distanceExample, role: item.n > 1 ? 'backup' : 'primary' }} needDist={item.needDist} inputRef={inputRef} offerBlackhole={discard}
        invalid={field => (mark ? mark.fields.includes(field.name) : undefined)} onEdit={onEdit ?? ((name, value) => answers.edit(item, name, value))} onEnter={onNetwork}
        describedBy={describedByOf(id, note, mark)} readOnly={readOnly} quietLabels={quietLabels} />
      <ConvertNote id={`${id}-note`} name={note} />
      <FormMark id={`${id}-mark`} mark={mark} />
      {children}
    </li>
  );
}

/** Free mode: the router's list and the quiet «+ ще один маршрут (якщо
 * потрібен)» link under it (the new row takes focus; round 5 5b-2, spec C).
 * Round 5 (R1): an empty list shows one blank row #1 to fill (the action
 * line names it); it becomes a route of the list at its first keystroke and
 * stores nothing before that. */
function FreeList({ syntax, answers, router, onNetwork, discard, distanceExample, targetKey, evidenceKey, serial }) {
  const list = answers.freeItems(router);
  const lastInput = useRef(null);
  const added = useRef(null);
  useEffect(() => {
    if (added.current !== null && list.length > added.current) {
      lastInput.current?.focus();
      added.current = null;
    }
  });
  function add() {
    added.current = list.length;
    answers.addRoute(router);
  }
  // The blank row: the id the next «+ Маршрут» would take, so the row keeps its element (and focus) once it is a route.
  const blank = list.length === 0 ? { kind: 'route', router, n: 1, key: `${router}.f${serial + 1}`, route: null, needDist: answers.anyDist } : null;
  const fill = (name, value) => {
    answers.addRoute(router, blank.key);
    answers.edit(blank, name, value);
  };
  const shown = blank ? [blank] : list;
  return (
    <>
      <ol className="ng-rt-rowlist">
        {shown.map((item, i) => <FreeRow key={item.key} syntax={syntax} answers={answers} item={item} onNetwork={onNetwork} inputRef={i === shown.length - 1 ? lastInput : undefined} discard={discard}
          distanceExample={distanceExample} target={item.key === targetKey} evidence={item.key === evidenceKey} onEdit={item === blank ? fill : null} />)}
      </ol>
      <button type="button" className="ng-rt-link ng-rt-add is-quiet" onClick={add}>{comprehension.addRoute}</button>
    </>
  );
}

/**
 * @param {{ ex: object, answers: object, syntax: object, router: string, onNetwork: Function, onBlurCheck?: Function,
 *   target?: null|{ kind: 'row', key: string }|{ kind: 'router', router: string },
 *   evidenceKey?: string|null, headEvidence?: boolean, boardRef?: object, head?: any }} props
 * `target`: what a tip after a solve points at, outlined (OPT-1 UI U5).
 * `evidenceKey`: the row the panel's message is about; `headEvidence`: the
 * message is about this router's rows as a whole (its heading carries the
 * mark). `boardRef`: the rows' list, for the panel's placement. `head`: more
 * controls in the heading row («Відповідь» / «Моя відповідь»).
 */
export default function RouteRows({ ex, answers, syntax, router, onNetwork, onBlurCheck, target = null, evidenceKey = null, headEvidence = false, boardRef = null, head = null }) {
  const free = answers.mode === 'free';
  const rows = answers.rows[router] ?? [];
  const extras = free ? [] : answers.extraItems(router);
  const targetKey = target?.kind === 'row' ? target.key : null;
  const discard = teachesDiscard(ex.task);
  const distanceExample = teachesDistance(ex.task);
  return (
    <section ref={boardRef} className={`ng-rt-rows${target?.kind === 'router' && target.router === router ? ' is-target' : ''}`} aria-label={ui.shared.rowsCaption(router)}>
      <div className="ng-rt-rows-head" {...(headEvidence ? { 'data-evidence': 'current' } : {})}>
        <h3 className="ng-rt-caption" id={rowsHeadId(router)} tabIndex={-1}>{ui.shared.rowsCaption(router)}</h3>
        {head}
      </div>
      {free
        ? <FreeList syntax={syntax} answers={answers} router={router} onNetwork={onNetwork} discard={discard} distanceExample={distanceExample} targetKey={targetKey} evidenceKey={evidenceKey} serial={routeSerialOf(ex)} />
        : rows.length === 0
          ? <p className="ng-rt-note">{ui.shared.noRoutes}</p>
          : (
            <ol className="ng-rt-rowlist">
              {rows.map((row, index) => {
                const item = answers.slotItem(router, index);
                return <Row key={`${ex.key}|${router}|${index}`} syntax={syntax} answers={answers} task={ex.task} item={item} onNetwork={onNetwork}
                  onBlurCheck={onBlurCheck} target={item.key === targetKey} evidence={item.key === evidenceKey} />;
              })}
            </ol>
          )}
      {extras.length > 0 && (
        <section className="ng-rt-extras" aria-label={ui.shared.otherRoutes}>
          <h4 className="ng-rt-caption ng-rt-extras-head">{ui.shared.otherRoutes}</h4>
          <ol className="ng-rt-rowlist">
            {extras.map(item => <FreeRow key={item.key} syntax={syntax} answers={answers} item={item} onNetwork={onNetwork} discard={discard} distanceExample={distanceExample} target={item.key === targetKey} evidence={item.key === evidenceKey} />)}
          </ol>
        </section>
      )}
    </section>
  );
}
