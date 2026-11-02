// The network check's words and lists (round 2 step 6; round 4 spec R1).
//
// Round 4: the check row, the verdict, the hints and the reveal are the
// shared HelpPanel under the selected router's rows (RoutingScreen.jsx);
// the old bar and strip under the diagram, and the folding notes at the top
// of the work panel, are gone. What stays here:
//   - `SuccessDetail`: the success box's detail (the panel's `detail`, open
//     on success): «Що можна покращити…» (the check's advice and the review's
//     tips, each a link to its row), the demonstrations («▶ Показати на
//     схемі»), «Показати ще раз» (the lap), and two quiet links:
//     «Показати мовою MikroTik» (or Cisco: the other syntax) with the routes
//     the passing check checked, and «Показати найкоротший варіант» (free
//     mode, once earned);
//   - `ChecksList`: «Усі перевірки», every check grouped by scenario, each
//     with its short state; picking one draws it (the «⋯» menu opens it in
//     the work area);
//   - `stripOf`: the one line a check says (the leak gate reads it).
// Words come from presentCheck (names only) and uk.js.
import { useRef, useState } from 'react';
import { copyText, selectText } from '../../../ui/clipboard.js';
import { optimiserUi as o, ui } from '../uk.js';

const s = ui.shared;
export const CHECKS_ID = 'ng-rt-checks';
/** «Показати найкоротший варіант» (a shorter-known tip focuses it). */
export const BEST_ID = 'ng-rt-best';

/** Lines that pass or fail (advice is neither). */
const counted = lines => lines.filter(l => l.status === 'pass' || l.status === 'fail');

/** The strip: { tone, count, text, reserve? } for the screen's current
 * check. `reserve`: the lap's ending words before the ending starts, held
 * invisibly so the strip doesn't grow (and the diagram shrink) mid-lap. */
export function stripOf(presented, pending, shown) {
  if (!presented) return { tone: 'pending', count: null, text: s.notChecked(counted(pending?.lines ?? []).length) };
  // A form check that stopped the network check has no count: nothing was pinged.
  const lines = presented.lines.some(l => l.kind === 'form') ? [] : counted(presented.lines);
  const count = lines.length ? { passed: lines.filter(l => l.status === 'pass').length, total: lines.length } : null;
  const tone = presented.ok ? 'ok' : 'no';
  if (shown?.kind === 'lap') return { tone, count, text: shown.words ? `${presented.strip} ${shown.words}` : presented.strip, reserve: shown.words ? null : shown.ending ?? null };
  if (shown?.kind === 'demo') return { tone, count, text: `${s.demoTitle(shown.label)}. ${shown.text}` };
  if (shown?.picked) {
    const line = shown.line;
    const words = line.status === 'pass' ? line.label : line.text || line.label;
    return { tone, count, text: `${s.status[line.status] ?? ''} ${words}`.trim() };
  }
  return { tone, count, text: presented.strip };
}

/** The panel's verdict sentence for a presented network check (round 4):
 * the success (with the lap's ending words, if any), the form errors, or
 * the first failure's sentence. */
export function verdictSummary(presented, ending = null) {
  if (presented.ok) return `${s.successSummary}${ending ? ` ${ending}` : ''}`;
  if (presented.lines.some(l => l.kind === 'form')) return s.formErrorsSummary;
  return presented.firstFailure?.text || presented.strip;
}

/** A route's command in a syntax, as the student would type it (distance 1 left out). */
const commandOf = (syntax, route) => syntax.command({ dst: route.dst, prefix: route.prefix, ...(route.discard === true ? { discard: true } : { via: route.via }), ...(route.distance > 1 ? { distance: route.distance } : {}) });

/** The student's checked routes as commands of the other syntax, per router. */
export function otherSyntaxBlocks(submitted, other) {
  return Object.entries(submitted ?? {}).filter(([, routes]) => routes.length).map(([router, routes]) => ({ router, lines: routes.map(r => commandOf(other, r)) }));
}

/** What «Скопіювати команди» copies from those blocks: each router's commands under a comment line. */
export function otherSyntaxPayload(submitted, other) {
  const comment = other.id === 'cisco' ? '!' : '#';
  return otherSyntaxBlocks(submitted, other).map(b => `${comment} ${b.router}\n${b.lines.join('\n')}`).join('\n\n');
}

/** «Показати мовою MikroTik ▾» (Cisco on MikroTik): collapsed until asked. Kind 3: only the routes the passing check checked. */
export function OtherSyntax({ submitted, other }) {
  const [open, setOpen] = useState(false);
  // null, or whether the last copy reached the clipboard (else the commands are selected for Ctrl+C).
  const [copied, setCopied] = useState(null);
  const body = useRef(null);
  const blocks = otherSyntaxBlocks(submitted, other);
  if (!blocks.length) return null;
  const payload = otherSyntaxPayload(submitted, other);
  const id = 'ng-rt-other-syntax';
  return (
    <div className="ng-rt-other">
      <button type="button" className="ng-rt-link ng-rt-other-toggle" aria-expanded={open} aria-controls={id} onClick={() => setOpen(v => !v)}>
        {s.otherSyntax(other.label)} <span aria-hidden="true">{open ? '▴' : '▾'}</span>
      </button>
      <div id={id} ref={body} className="ng-rt-other-body" hidden={!open} role="region" aria-label={s.otherSyntaxLabel(other.label)}>
        {open && <>
          {blocks.map(b => (
            <div key={b.router} className="ng-rt-other-router">
              <h4 className="ng-rt-caption">{b.router}</h4>
              <pre className="ng-rt-pre ng-rt-other-commands">{b.lines.join('\n')}</pre>
            </div>
          ))}
          <button type="button" className="ng-rt-btn ng-rt-copy" onClick={() => {
            setCopied(null);
            copyText(payload).then(() => setCopied(true), () => { selectText(body.current); setCopied(false); });
          }}>{copied ? s.copied : s.copy}</button>
          <p className="ng-rt-note" aria-live="polite">{copied === false ? s.copyFailed : ''}</p>
          <p className="ng-rt-note">{s.sameMeaning}</p>
        </>}
      </div>
    </div>
  );
}

/** «Показати найкоротший варіант» (OPT-1 UI §4, U6, U7), beside «Показати
 * мовою MikroTik», only once the exact instance is earned (useShortestReveal).
 * Its commands, the copy button and the honesty line exist only while open. */
export function BestKnown({ best, syntax }) {
  const [copied, setCopied] = useState(false);
  const blocks = best.table ? Object.entries(best.table.answer).filter(([, routes]) => routes.length)
    .map(([router, routes]) => ({ router, lines: routes.map(r => commandOf(syntax, r)) })) : [];
  const comment = syntax.id === 'cisco' ? '!' : '#';
  const payload = blocks.map(b => `${comment} ${b.router}\n${b.lines.join('\n')}`).join('\n\n');
  const toggle = () => { setCopied(false); best.toggle(); };
  const body = useRef(null);
  return (
    <div className="ng-rt-other ng-rt-best">
      <button id={BEST_ID} type="button" className="ng-rt-link ng-rt-best-toggle" aria-expanded={best.open} aria-controls={`${BEST_ID}-body`} onClick={toggle}>
        {best.open ? o.bestHide : o.bestShow} <span aria-hidden="true">{best.open ? '▴' : '▾'}</span>
      </button>
      <div id={`${BEST_ID}-body`} ref={body} className="ng-rt-other-body" hidden={!best.open} role="region" aria-label={o.bestTitle}>
        {best.open && <>
          {blocks.map(b => (
            <div key={b.router} className="ng-rt-other-router">
              <h4 className="ng-rt-caption">{b.router}</h4>
              <pre className="ng-rt-pre ng-rt-best-commands">{b.lines.join('\n')}</pre>
            </div>
          ))}
          <button type="button" className="ng-rt-btn ng-rt-copy" onClick={() => {
            setCopied(null);
            copyText(payload).then(() => setCopied(true), () => { selectText(body.current); setCopied(false); });
          }}>{copied ? s.copied : s.copy}</button>
          <p className="ng-rt-note" aria-live="polite">{copied === false ? s.copyFailed : ''}</p>
          <p className="ng-rt-note ng-rt-best-line">{o.bestLine(best.table.total)}</p>
        </>}
      </div>
    </div>
  );
}

/** One tip after a solve: a link-button that shows where it applies, or,
 * for a count with nowhere to go, its words. */
function Tip({ tip, onTip }) {
  if (tip.kind === 'text') return <li className="ng-rt-tip">{tip.plain}</li>;
  return <li className="ng-rt-tip"><button type="button" className="ng-rt-tip-link" onClick={() => onTip(tip)}>{tip.plain}</button></li>;
}

/**
 * The success box's detail (the panel's `detail`): advice and tips, the
 * demonstrations, «Показати ще раз», and the quiet links to the other
 * syntax and the shortest known table.
 * @param {{ presented: object, submitted: object|null, other: object, onDemo: Function, onReplay?: Function|null,
 *   tips?: object[], onTip?: Function, best?: null|object, syntax: object }} props
 */
export function SuccessDetail({ presented, submitted, other, onDemo, onReplay = null, tips = [], onTip = () => {}, best = null, syntax }) {
  const improve = presented.advice.length > 0 || tips.length > 0;
  return (
    <div className="ng-rt-success">
      {improve && (
        <section className="ng-rt-improve" aria-labelledby="ng-rt-improve-head">
          <h4 id="ng-rt-improve-head" className="ng-rt-improve-head">{s.improveTitle}</h4>
          <ul className="ng-rt-advice">
            {presented.advice.map((a, i) => <li key={`advice-${i}`}>{a.text}</li>)}
            {tips.map(tip => <Tip key={tip.id} tip={tip} onTip={onTip} />)}
          </ul>
        </section>
      )}
      {presented.demonstrations.map(demo => (
        <div key={demo.id} className="ng-rt-demo">
          <p className="ng-rt-demo-text"><b>{s.demoTitle(demo.label)}.</b> {demo.text}</p>
          <button type="button" className="ng-rt-btn ng-rt-demo-show" onClick={() => onDemo(demo.id)}>{s.demoShow}</button>
        </div>
      ))}
      <div className="ng-rt-success-links">
        {onReplay && <button type="button" className="ng-rt-link ng-rt-replay" onClick={onReplay}>{s.replay}</button>}
        {submitted && <OtherSyntax submitted={submitted} other={other} />}
        {best?.available && <BestKnown best={best} syntax={syntax} />}
      </div>
    </div>
  );
}

/** One check in the list: its label and short state («✗ зупинився на R2»);
 * the picked one also its sentence. A button where picking it shows
 * something (its path, its cycle, a ring, its sentence). */
export function CheckLine({ line, status, pickable, shownId, onPick }) {
  const picked = shownId === line.id;
  const state = status === 'pending' ? s.status.pending : line.state ?? s.status[status];
  const body = <>
    <span className="ng-sr-only">{s.statusWords[status]}: </span>
    <span className="ng-rt-checkline-label">{line.label}</span>
    <span className="ng-rt-checkline-state">{state}</span>
    {picked && line.text && <span className="ng-rt-checkline-text">{line.text}</span>}
  </>;
  return (
    <li className={`ng-rt-checkline is-${status}${picked ? ' is-shown' : ''}`}>
      {pickable
        ? <button type="button" className="ng-rt-checkline-body" aria-pressed={picked} onClick={() => onPick(line.id)}>{body}</button>
        : <div className="ng-rt-checkline-body">{body}</div>}
    </li>
  );
}

/**
 * «Усі перевірки»: every check in bank order, grouped by scenario (and
 * «Мета»), each with its short state. Before the first check every line is
 * «—». Picking a line draws it on the diagram and opens its sentence.
 * @param {{ presented: object|null, pending: object|null, shownId: string|null, onPick: Function, pickable: (line: object) => boolean }} props
 */
export function ChecksList({ presented, pending, shownId, onPick, pickable }) {
  const source = presented ?? pending;
  const groups = source?.groups ?? [];
  return (
    <div id={CHECKS_ID} className="ng-rt-checks-panel">
      {groups.map(group => (
        <div key={String(group.id)} className="ng-rt-checks-group">
          {groups.length > 1 && <h4 className="ng-rt-checks-heading">{group.label}</h4>}
          <ul className="ng-rt-checks-list">
            {group.lines.map(line => {
              const status = presented ? line.status : 'pending';
              return <CheckLine key={line.id} line={line} status={status} pickable={Boolean(presented) && pickable(line)} shownId={shownId} onPick={onPick} />;
            })}
          </ul>
        </div>
      ))}
    </div>
  );
}
