// «Перевірки» of «Знайди несправність» (VLAN-3 spec v2 Z1): the symptom
// grid. A summary line always in view («✕ Не проходять 6 з 24.»), then the
// failing checks first: reachability as compact buttons (expected ✓ │ what is
// observed, «✓ так» or «✕ ні»), each VLAN's isolation as a row with where its
// frames got to. The passing ones fold under «ще N перевірок проходять ✓»
// (fix brief v1 item 5: a long grid kept short), every row still traceable.
// Words, never colour alone; each button's name says its row («PC1 ↔ PC3: є
// ні»; the legend says what is expected). A press draws that check's walk on
// the diagram (`onPick`): it checks nothing and counts nothing. The rows come
// from faultsState.gridRows; the screen decides which grid they are (the
// start's, the last check's, or the reveal's before and after) and says so in
// `state`.
//
// Round 4 (spec F6, A6): each row's mark is the app's one pair of words,
// «✓ проходить» / «✗ не проходить» (every check is expected to pass, so the
// expected column and its legend went); a press says whether the row fails
// (`onPick(id, failing)`: the screen opens «Ремонт» from a failing check).
import { uk } from '../../../ui/uk.js';
import { faultsUi, faultText } from '../uk.js';
import { gridCount } from './faultsState.js';

/**
 * @param {{ rows: object[], invalid?: boolean, state: string, stale?: boolean, picked?: string|null,
 *   onPick: (id: string, failing: boolean) => void, compact?: boolean, level?: 2|3, headRef?: object }} props
 *   `stale`: the form changed since this grid (it updates on «Перевірити»);
 *   `fold`: the passing checks fold under one line (the reveal shows them all);
 *   `evidence`: the first failing check is the help panel's evidence;
 *   `level`: its heading's level (3 inside the reveal's h2), its parts' one below;
 *   `action` (round 5, R1): the action line, right above the rows
 */
export default function SymptomGrid({ rows, invalid = false, state, stale = false, picked = null, onPick, compact = false, level = 2, headRef = null, fold = true, evidence = false, action = null }) {
  const H = `h${level}`, Sub = `h${level + 1}`;
  const failing = rows.filter(r => !r.ok), passing = rows.filter(r => r.ok);
  const count = gridCount(rows);
  // The help panel's evidence: the first failing check (the failing ones come first).
  const firstFailing = evidence ? (failing[0]?.id ?? null) : null;
  const row = r => (
    <li key={r.id}>
      <button type="button" className={`ng-vf-row ${r.ok ? 'is-ok' : 'is-no'}`} aria-pressed={picked === r.id} aria-label={r.label} onClick={() => onPick(r.id, !r.ok)}
        {...(r.id === firstFailing ? { 'data-evidence': 'current' } : {})}>
        <span className="ng-vf-what">{r.what}</span>
        <span className="ng-vf-result"><span className="ng-vf-observed">{r.ok ? uk.passes : uk.fails}</span></span>
        {r.detail.length > 0 && <span className="ng-vf-detail">{r.detail.join('; ')}</span>}
      </button>
    </li>
  );
  /** Reachability then isolation, each under its heading with the legend. */
  const parts = list => ['reach', 'isolation'].map(kind => {
    const own = list.filter(r => r.kind === kind);
    if (!own.length) return null;
    return (
      <div key={kind} className="ng-vf-part">
        <Sub className="ng-vf-sub">{kind === 'reach' ? faultText.reachability : faultText.isolation}</Sub>
        <ul className={`ng-vf-rows${kind === 'isolation' ? ' is-wide' : ''}`}>{own.map(row)}</ul>
      </div>
    );
  });
  return (
    <section className={`ng-vf-grid${compact ? ' is-compact' : ''}`} aria-label={faultsUi.evidence}>
      <div className="ng-vf-grid-head">
        <H ref={headRef} tabIndex={headRef ? -1 : undefined} className="ng-vl-caption">{faultsUi.evidence}</H>
        <span className={`ng-vf-state${stale ? ' is-stale' : ''}`}>{state}</span>
        {!invalid && <p className={`ng-vf-summary${count.failing ? ' is-no' : ' is-ok'}`}>{faultsUi.summary(count)}</p>}
      </div>
      {!compact && <p className="ng-vl-muted">{faultsUi.evidenceLead}</p>}
      {!invalid && action}
      {invalid ? <p className="ng-vf-invalid">{faultsUi.gridInvalid}</p> : <>
        {parts(failing)}
        {passing.length > 0 && !fold && parts(passing)}
        {passing.length > 0 && fold && (
          <details className="ng-vf-passing">
            <summary className="ng-vf-passing-head">{failing.length ? faultsUi.passing({ n: passing.length }) : faultsUi.passingAll({ n: passing.length })}</summary>
            {parts(passing)}
          </details>
        )}
      </>}
    </section>
  );
}
