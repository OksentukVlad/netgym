// E4 «ПК без мережі» (spec E4 v1 with v2 and v2.1, frozen; logic/faults.js
// and logic/client.js decide every row, line and verdict; this file renders
// them). One planted fault in R1, found from what the PC and R1 show, fixed,
// then named. Three steps under a small stepper, in routing's and VLAN's
// order, each with its one action line:
//   - «Перевірки»: the failing PC's four rows (its address, the gateway it
//     got and its ping, «пінг 8.8.8.8», «ім’я → адреса»), each ✓ or ✗ with
//     its value. A tap explains where that check stops in one sentence
//     under the rows (the logic's `explanation`) and outlines the place on
//     the drawing; it grades nothing. Under the rows, never folded (on a
//     phone too), «Що показує R1»: the level's fixed lines (logic evidence),
//     healthy ones included;
//   - «Ремонт»: R1's configuration as one pre-filled form, the same lines for
//     every task of the level (RepairForm.jsx, logic repairFields). Only
//     «Перевірити» re-evaluates: the rows and R1's lines change then, in
//     place (under the help panel in this step and the next), and an edit
//     after a check leaves its verdict «до змін». A passing repair locks the
//     form and opens «Причина»;
//   - «Причина»: the level's whole cause list in its fixed order (4, then 7);
//     a choice answers at once (Options), a wrong one stays marked.
// A failing check is answered probe-first by the logic (checkRepair `target`): the checks that still fail,
// or the learner's own edited field, or «Перевірки проходять, але …» with the rejected field.
// The task line under it says what a repair must keep (the clients, the devices' addresses).
// «Показати відповідь» before a passing repair fills the form with the logic's reference (read only) and
// turns the rows ✓; after one it keeps the learner's repair and step, and only names the cause and its
// line (in «Ремонт» after a pass only «Причина →» is offered). «Причина» shows the rows as they were at
// the start. «Далі →» gives another task on renumbered addresses («Пропустити →» before it is solved).
// The drawing shows the PCs with the addresses the last check gave them (ПК2
// in the server's place when the pool is exhausted).
//
// Leaks: before the reveal nothing names the fault: the rows, the lines and
// the form are the logic's for the configuration on screen, the causes carry
// no value in the DOM, and the reference is built only on the reveal.
import { useEffect, useMemo, useRef, useState } from 'react';
import * as faults from '../logic/faults.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, useStore } from '../../../ui/useStore.js';
import { useNav } from '../../../ui/useNav.js';
import Button from '../../../ui/components/Button.jsx';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel, { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import Aside from '../../../ui/components/Aside.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import { ROUTER_LABEL, hostLabelId } from '../../../ui/topology/RouterDiagram.jsx';
import { uk } from '../../../ui/uk.js';
import { actions, fault as words, labels, modes, screen, verdicts } from '../uk.js';
import Options from './Options.jsx';
import Picture from './Picture.jsx';
import RepairForm from './RepairForm.jsx';
import { nextSeed } from './seeds.js';

const w = screen.fault;
export const STAGES = ['checks', 'repair', 'cause'];
/** «Уся умова» starts folded (the store's place for the aside). */
export const ASIDES = 'dhcp.fault';

/** The exercise for useExercise (logic/faults.js; the reference only on reveal). */
export const faultExercise = {
  id: faults.id, version: faults.version,
  create: (_, { seed, level, vendor, other }) => faults.createFault(level, vendor, seed, { otherAddresses: other }),
  check: () => ({ ok: false, complete: false }),
  solution: task => faults.referenceRepair(task),
};

/**
 * The drawing's highlight for a row (the logic's semantic `highlight`): the PC's
 * address label, R1's address block, the gateway's address in it, or the
 * internet (8.8.8.8 and the provider's DNS are beyond it, not drawn).
 */
export function probeHighlight(row, task) {
  const target = row?.highlight?.target;
  if (!target) return null;
  if (target === 'R1') return { kind: 'label', value: ROUTER_LABEL };
  if (target === 'address' || task.pcs.some(pc => pc.id === target)) return { kind: 'label', value: hostLabelId({ id: target === 'address' ? task.failingPc : target }) };
  if (target === 'gateway') return { kind: 'address', value: task.router };
  return { kind: 'label', value: hostLabelId({ id: 'internet' }) };
}

/** The PCs on the drawing: each with the address the configuration gives it. */
export function drawnPcs(task, config, result) {
  return task.pcs.map(pc => ({ id: pc.id, name: pc.name,
    address: (pc.id === result.clientId ? result : faults.evaluate(config, task, { clientId: pc.id })).lease.address }));
}

/** A row's value as shown (the 8.8.8.8 ping's value is in its label; the DNS row says what the value is). */
export const rowValue = row => (row.id === 'remote' ? null : row.id === 'dns' ? `DNS: ${row.value}` : row.value);

/** The four rows: a tap explains (one sentence under them) and outlines the place on the drawing. */
function Rows({ rows, picked, onPick, state, evidenceRow = null, evidence = false, link = null }) {
  const row = rows.find(r => r.id === picked) ?? null;
  return (
    <section className="ng-dh-checks" aria-labelledby="ng-dh-checks-title">
      <div className="ng-dh-checks-head">
        <h2 id="ng-dh-checks-title" className="ng-dh-block-title">{w.checksTitle}</h2>
        <span className="ng-dh-checks-state">{state}</span>
      </div>
      <ul className="ng-dh-probes" {...(evidence ? { 'data-evidence': 'current' } : {})}>
        {rows.map(r => (
          <li key={r.id}>
            <button type="button" className={`ng-dh-probe ${r.ok ? 'is-ok' : 'is-no'}`} aria-pressed={picked === r.id} data-row={r.id}
              {...(evidenceRow === r.id ? { 'data-evidence': 'current' } : {})} onClick={() => onPick(r.id)}>
              <span className="ng-dh-probe-mark" aria-hidden="true">{r.ok ? '✓' : '✗'}</span>
              <span className="ng-dh-probe-text">
                <span className="ng-dh-probe-label">{r.label}</span>
                {rowValue(r) && <span className="ng-dh-probe-value">{rowValue(r)}</span>}
              </span>
              <span className="ng-sr-only">{` — ${r.ok ? uk.passes : uk.fails}`}</span>
            </button>
          </li>
        ))}
      </ul>
      <p className="ng-dh-why" aria-live="polite">{row ? <><b>{row.label}:</b> {row.explanation}</> : null}</p>
      {link}
    </section>
  );
}

/** «Що показує R1»: the level's lines, always all of them, never folded. */
function Evidence({ lines }) {
  return (
    <section className="ng-dh-evidence" aria-labelledby="ng-dh-evidence-title">
      <h2 id="ng-dh-evidence-title" className="ng-dh-block-title">{words.evidenceTitle}</h2>
      <dl className="ng-dh-evidence-lines">
        {lines.map(line => (
          <div key={line.id} className="ng-dh-evidence-line" data-line={line.id}>
            <dt>{line.label}</dt>
            {/* A line of several settings (the NAT lines, the routes) shows one per row. */}
            <dd>{line.id === 'router' ? (line.ok ? uk.passes : uk.fails) : String(line.value).split('; ').map((part, i) => <span key={i} className="ng-dh-evidence-part">{part}</span>)}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function FaultView({ vendor, place, setPlace }) {
  const { state } = useStore();
  const nav = useNav();
  usePlace(ASIDES, () => ({ asides: { condition: false } }));
  const slot = place.fault ?? { level: 1, tasks: {} };
  const level = slot.level ?? 1;
  const { seed = 0, other = false } = slot.tasks?.[level] ?? {};
  const ex = useExercise(faultExercise, null, { seed, level, vendor, other });
  const { task, view, session } = ex;
  const revealed = session.revealed;
  const draft = view.draft ?? task.config;
  const draftKey = JSON.stringify(draft);
  // The last checked configuration (the given one before any check): the rows, R1's lines and the drawing follow it.
  // A reveal before a passing repair checks the reference in (onReveal); after one, the learner's repair stays.
  const checked = view.checked ?? null;
  const result = useMemo(() => (checked ? faults.checkRepair(task, checked) : null), [task, JSON.stringify(checked)]);
  const start = useMemo(() => faults.evaluate(task.config, task), [task]);
  const startLines = useMemo(() => faults.evidence(task, task.config, start), [task, start]);
  const passed = revealed || Boolean(view.passed);
  const stage = STAGES.includes(view.stage) && (view.stage !== 'cause' || passed) ? view.stage : 'checks';
  // «Причина» shows the rows and R1's lines as they were at the start: the cause is in the line that had to change.
  const atStart = !result || stage === 'cause';
  const shown = atStart ? start : result;
  const lines = atStart ? startLines : result.evidence;
  const fields = faults.repairFields(task, draft);
  const causes = useMemo(() => faults.causesForLevel(level), [level]);
  const picks = view.causes ?? [];
  const lastCause = picks.at(-1) ?? null;
  const causeResult = lastCause ? faults.checkCause(task, lastCause) : null;
  const solved = Boolean(causeResult?.ok);
  const done = solved || revealed;
  const stale = Boolean(result) && !result.ok && !revealed && view.checkedKey !== draftKey;
  const example = useMemo(() => faults.faultExample({ level, vendor }), [level, vendor]);
  const earned = earnedBy(state.instances, id => (id.exerciseId === faults.id ? id.level : null));
  const pcs = useMemo(() => drawnPcs(task, atStart ? task.config : checked, shown), [task, shown]);
  const picked = view.picked ?? null;
  const pickedRow = shown.rows.find(r => r.id === picked) ?? null;
  const highlight = pickedRow ? probeHighlight(pickedRow, task) : null;

  // What a failing repair check is about is the logic's `target` (probe-first): the first failing row, or a
  // field the learner changed, or (all four passing) the field capacity or safety rejects. The screen guesses none.
  const failing = result && !result.ok && !stale && !revealed ? result : null;
  const markedField = failing?.target?.field ?? null;
  const evidenceRow = failing?.target?.row ?? null;
  // A tap on the locked «Причина» says why, under the steps (no tooltip-only reason).
  const [lockedSaid, setLockedSaid] = useState(false);
  useEffect(() => setLockedSaid(false), [stage, passed, ex.key]);

  // A step opened by its button or the stepper starts at its top: the task, the steps and the action line come
  // into view (on a phone the page was scrolled down to the button) and the current step takes the focus
  // (the pressed button may be gone).
  const workRef = useRef(null);
  const moved = useRef(false);
  useEffect(() => {
    if (!moved.current) return;
    moved.current = false;
    const work = workRef.current?.closest('[data-region="work"]');
    bringIntoView([work?.querySelector('.ng-dh-task'), work?.querySelector('#ng-dh-action')].filter(Boolean));
    work?.querySelector('.ng-dh-step.is-current')?.focus({ preventScroll: true });
  }, [stage]);
  const go = next => { if (next !== stage) moved.current = true; ex.setView({ stage: next }); };
  // A tap's sentence comes into view with its row (it is under the rows, maybe below the window's edge).
  const tapped = useRef(false);
  useEffect(() => {
    if (!tapped.current) return;
    tapped.current = false;
    const work = workRef.current?.closest('[data-region="work"]');
    const why = work?.querySelector('.ng-dh-why');
    if (picked && why) bringIntoView([work.querySelector(`.ng-dh-probe[data-row="${picked}"]`), why]);
  }, [picked]);
  const pick = id => { tapped.current = true; ex.setView({ picked: id === picked ? null : id }); };
  // The step's board: the help panel lives after it, and after a failing check anchors right after the
  // line it names when they don't fit together (HelpPanel boardRef; a long repair form).
  const boardRef = useRef(null);
  const edit = config => { if (!passed) ex.setView({ draft: config }); };
  function onCheck() {
    if (passed) return;
    const r = faults.checkRepair(task, draft);
    ex.check(draft, { result: { ok: r.ok, complete: false } });
    ex.setView({ checked: draft, checkedKey: draftKey, checks: (view.checks ?? 0) + 1, passed: r.ok, picked: null });
  }
  function chooseCause(id) {
    if (done) return;
    const r = faults.checkCause(task, id);
    ex.check({ config: view.checked, cause: id }, { result: { ok: r.ok, complete: r.ok } });
    ex.setView({ causes: [...picks, id], causeChecks: (view.causeChecks ?? 0) + 1 });
  }
  // «Показати відповідь»: before a passing repair, the reference goes into the form (checked, read-only) and
  // «Ремонт» shows it; after one, the learner's repair and the step stay, and only the cause is revealed.
  function onReveal() {
    ex.reveal();
    if (view.passed) return;
    const reference = ex.solution ?? faults.referenceRepair(task);
    ex.setView({ draft: reference, checked: reference, checkedKey: JSON.stringify(reference), stage: 'repair', picked: null });
  }
  const another = () => setPlace({ fault: { ...slot, tasks: { ...slot.tasks, [level]: { seed: nextSeed(seed), other: true } } } });
  const chooseLevel = next => setPlace({ fault: { ...slot, level: next } });

  const repairVerdict = result && !revealed ? {
    tone: result.ok ? 'ok' : result.kind === 'info' ? 'info' : 'no', scope: 'part', stamp: view.checks ?? 0,
    summary: result.ok ? w.repairOk : result.text,
  } : null;
  const causeVerdict = causeResult && !revealed ? {
    tone: causeResult.ok ? 'ok' : 'no', scope: causeResult.ok ? 'task' : 'part', stamp: view.causeChecks ?? 0,
    summary: causeResult.ok ? verdicts.correct : w.wrongCause,
  } : null;
  const verdict = stage === 'repair' ? repairVerdict : stage === 'cause' ? causeVerdict : null;
  const causeMarks = revealed ? { [task.faultId]: 'ok' } : Object.fromEntries(picks.map(id => [id, faults.checkCause(task, id).ok ? 'ok' : 'no']));

  // Round 7: how these checks are made on a PC, in «Перевірка мережі» («Де зламалось»): right under the four rows,
  // in «Перевірки», when the target has the section.
  const checksLink = stage === 'checks' && nav?.has('checks')
    ? <p className="ng-dh-checks-link"><Button variant="quiet" onClick={() => nav.go({ section: 'checks', params: { ex: 'ladder' } })}>{w.checksLink}</Button></p> : null;
  // After a passing repair the rows that turned ✓ are what the verdict is about.
  const rows = <Rows rows={shown.rows} picked={picked} onPick={pick} state={atStart ? w.atStart : w.lastChecked} evidenceRow={stage === 'repair' ? evidenceRow : null}
    evidence={stage === 'repair' && Boolean(result?.ok) && !revealed} link={checksLink} />;
  const evidence = <Evidence lines={lines} />;
  const action = stage === 'checks' ? words.actions[0]
    : stage === 'repair' ? (passed ? actions.committed : words.actions[1])
      : done ? actions.committed : words.actions[2];

  const stepper = (
    <nav className="ng-dh-steps" aria-label={w.stagesLabel}>
      <ol>
        {STAGES.map((id, i) => {
          const locked = id === 'cause' && !passed;
          return (
            <li key={id}>
              <button type="button" className={`ng-dh-step${stage === id ? ' is-current' : ''}`} aria-current={stage === id ? 'step' : undefined}
                aria-disabled={locked || undefined} aria-describedby={locked && lockedSaid ? 'ng-dh-locked' : undefined}
                onClick={() => { if (locked) setLockedSaid(true); else go(id); }}>
                <span className="ng-dh-step-n" aria-hidden="true">{i + 1}</span> {w.stages[id]}
              </button>
            </li>
          );
        })}
      </ol>
      {lockedSaid && !passed && <p id="ng-dh-locked" className="ng-dh-locked" role="status">{w.causeLocked}</p>}
    </nav>
  );

  let answer;
  if (stage === 'checks') answer = <div ref={boardRef} className="ng-dh-fault-checks">{rows}{evidence}</div>;
  else if (stage === 'repair') {
    answer = (
      <div ref={boardRef} className="ng-dh-form" data-form="repair">
        <RepairForm fields={fields} config={draft} onChange={edit} onEnter={onCheck} readOnly={passed} marked={markedField} grouped={level > 1} />
      </div>
    );
  } else {
    answer = <div ref={boardRef} className="ng-dh-cause-board"><Options options={causes.map(c => ({ id: c.id, label: c.text }))} value={revealed ? task.faultId : lastCause} marks={causeMarks} onChoose={chooseCause}
      locked={done} labelledBy="ng-dh-action" evidence={Boolean(causeVerdict)} className="ng-dh-causes" /></div>;
  }

  return (
    <ExerciseLayout
      heading={modes.fault}
      controls={<SheetChoice stepper label={screen.level} value={level} onChange={chooseLevel} className="ng-dh-levels"
        options={[1, 2, 3].map(n => ({ value: n, label: <>{labels.levels[n - 1]}<DoneMark done={earned.has(n)} /></>, step: labels.levels[n - 1] }))} />}
      wide="stage"
      first="work"
      stage={<Picture topology={task.topology} vendor={vendor} pcs={pcs} highlight={highlight} viewKey={ex.key} zoom={view.zoom} onZoom={zoom => ex.setView({ zoom })} />}
      question={
        <div ref={workRef} className="ng-dh-fault-intro">
          <p className="ng-dh-task">{task.task}</p>
          <p className="ng-dh-given-line">{labels.providerDns(task.providerDns)}</p>
          {/* What a repair must keep (it is checked): the clients to serve and the devices' own addresses. */}
          <p className="ng-dh-given-line ng-dh-needs">{w.needs(task.clients, task.statics)}</p>
          <Aside screen={ASIDES} id="condition" title={w.fullCondition}><p className="ng-dh-given-line">{task.assumptions}</p></Aside>
          {revealed && <p className="ng-dh-shown"><span className="ng-shown-chip">{uk.help.shown}</span></p>}
          {stepper}
        </div>}
      action={action}
      actionId="ng-dh-action"
      example={<WorkedExample taskKey={ex.key} context={example.context} head={w.exampleHead} rows={exampleRows(example)} note={example.note} />}
      answer={answer}
      help={<HelpPanel
        taskKey={ex.key}
        stepKey={stage}
        check={stage === 'repair' && !passed ? { onCheck } : null}
        verdict={verdict}
        stale={stage === 'repair' && stale}
        reveal={stage === 'repair' && view.passed && !revealed ? null
          : { revealed, onReveal, render: () => null, applied: revealed ? w.revealApplied(words.causes[task.faultId], plantedLines(task), Boolean(view.passed)) : undefined }}
        next={{ onNext: another }}
        continueAction={stage === 'checks' ? { label: w.toRepair, onClick: () => go('repair') }
          : stage === 'repair' && passed && !revealed ? { label: w.toCause, onClick: () => go('cause') } : null}
        boardRef={boardRef}
        placement="after"
      />}
      tools={stage === 'checks' ? null : <div className="ng-dh-fault-checks">{rows}{evidence}</div>}
    />
  );
}

/** The form's lines the planted fault is in: those where the given configuration and the reference differ. */
export function plantedLines(task) {
  const reference = faults.repairFields(task, faults.referenceRepair(task));
  return faults.repairFields(task).filter((f, i) => JSON.stringify(f.value) !== JSON.stringify(reference[i].value)).map(f => f.label);
}

/** The worked example's rows (logic faultExample: its own network): the DNS option before and after, and the checks. */
export function exampleRows(example) {
  const dns = example.fields.find(f => f.id === 'dns');
  const show = value => (Array.isArray(value) ? value.join(', ') : value) || words.none;
  const passing = rows => w.passedOf(rows.filter(r => r.ok).length, rows.length);
  return [
    [dns.label, show(example.task.config.dhcp.dns), show(example.answer.dhcp.dns)],
    [w.exampleChecks, passing(example.before.rows), passing(example.after.rows)],
  ];
}
