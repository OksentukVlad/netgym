// C2 «Прочитай вивід» (spec v1 C2 with v2; logic/claims.js decides). One
// generated output (or two) and one claim, in two steps in place:
//   1. tap the lines that bear on the claim, or «жоден рядок», then
//      «Перевірити рядки» (several lines can be needed; the logic checks the
//      exact set, order-free);
//   2. once the lines are right they lock, and «так / ні / недостатньо
//      даних» answers at once; a wrong verdict stays marked ✗.
// Level 1: Windows outputs; level 2: the router's, in the chosen vendor's
// words. Nothing in the DOM marks the lines the logic expects.
import { useMemo } from 'react';
import * as claims from '../logic/claims.js';
import { useExercise } from '../../../ui/useExercise.js';
import { useStore } from '../../../ui/useStore.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import { modes, screen, ui, verdicts } from '../uk.js';
import Options from './Options.jsx';
import Terminal from './Terminal.jsx';
import { nextSeed } from './seeds.js';

/** The exercise for useExercise (logic/claims.js; no reference to reveal). */
export const claimsExercise = {
  id: claims.id, version: claims.version, generatorVersion: claims.generatorVersion,
  create: (_, { seed, level, vendor }) => claims.createClaim(level, vendor, seed),
  check: () => ({ ok: false, complete: false }),
  solution: () => null,
};

/** The task's outputs with their globally unique line ids (two outputs: «0.result», «1.result»). */
export const outputsOf = task => task.outputs.map((output, i) => ({ command: output.command, lines: task.lines.filter(l => l.outputIndex === i) }));

/** The worked example's rows (logic claimExample, its own network): the claim, the lines, the verdict. */
export function claimExampleRows(example) {
  const lines = example.task.lines.filter(l => example.answer.lines.includes(l.id)).map(l => l.text);
  return [example.task.claim, ...lines, `→ ${verdicts[example.answer.verdict]}`];
}

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function ClaimsView({ vendor, place, setPlace }) {
  const { state } = useStore();
  const slot = place.claims ?? { level: 1, tasks: {} };
  const level = slot.level ?? 1;
  const seed = slot.tasks?.[level]?.seed ?? 0;
  const ex = useExercise(claimsExercise, null, { seed, level, vendor });
  const { task, view } = ex;
  const example = useMemo(() => claims.claimExample({ vendor }), [vendor]);
  const earned = earnedBy(state.instances, id => (id.exerciseId === claims.id ? id.level : null));
  const selected = view.selected ?? [];
  const none = Boolean(view.none);
  const linesOk = Boolean(view.linesOk);
  const tried = view.verdicts ?? [];
  const lastVerdict = tried.at(-1) ?? null;
  const verdictResult = lastVerdict ? claims.checkVerdict(task, lastVerdict, view.checkedLines ?? []) : null;
  const done = Boolean(verdictResult?.ok);
  const outputs = outputsOf(task);

  const toggle = id => {
    if (linesOk) return;
    ex.setView({ none: false, selected: selected.includes(id) ? selected.filter(x => x !== id) : [...selected, id] });
  };
  const toggleNone = () => { if (!linesOk) ex.setView({ none: !none, selected: [] }); };
  function onCheckLines() {
    if (linesOk || (!none && !selected.length)) return;
    const ids = none ? [] : selected;
    const r = claims.checkLines(task, ids);
    ex.check({ lines: ids }, { result: { ok: false, complete: false } });
    ex.setView({ linesOk: r.ok, checkedLines: ids, linesChecks: (view.linesChecks ?? 0) + 1, checks: (view.checks ?? 0) + 1 });
  }
  function chooseVerdict(id) {
    if (done) return;
    const r = claims.checkVerdict(task, id, view.checkedLines ?? []);
    ex.check({ lines: view.checkedLines, verdict: id }, { result: { ok: r.ok, complete: r.ok } });
    ex.setView({ verdicts: [...tried, id], checks: (view.checks ?? 0) + 1 });
  }
  const another = () => setPlace({ claims: { ...slot, tasks: { ...slot.tasks, [level]: { seed: nextSeed(seed) } } } });
  const chooseLevel = next => setPlace({ claims: { ...slot, level: next } });

  let verdict = null;
  if (verdictResult) {
    verdict = { tone: done ? 'ok' : 'no', scope: done ? 'task' : 'part', stamp: view.checks ?? 0,
      summary: done ? `${screen.correct} ${verdictResult.text}` : screen.verdictWrong };
  } else if (view.linesChecks) {
    verdict = { tone: linesOk ? 'ok' : 'no', scope: 'part', stamp: view.checks ?? 0, summary: linesOk ? screen.linesOk : screen.linesWrong };
  }
  const marks = Object.fromEntries(tried.map(id => [id, claims.checkVerdict(task, id, view.checkedLines ?? []).ok ? 'ok' : 'no']));
  const action = !linesOk ? ui.lines : done ? screen.committed : screen.verdictAction;
  const levelOptions = [1, 2].map(n => ({ value: n, label: <>{screen.levelNames.claims[n - 1]}<DoneMark done={earned.has(n)} /></>, step: screen.levels[n - 1] }));

  const board = (
    // data-lines: every tappable line and «жоден рядок» (tools/shots.mjs counts them); the lines are the evidence of their own check.
    <div className="ng-ck-claim-board" data-lines={task.lines.length + 1} {...(view.linesChecks && !verdictResult ? { 'data-evidence': 'current' } : {})}>
      {outputs.map((output, i) => (
        <Terminal key={i} output={output} caption={outputs.length > 1 ? screen.outputOf(i + 1) : null}
          selected={none ? [] : (linesOk ? view.checkedLines ?? [] : selected)} onToggle={toggle} locked={linesOk} />
      ))}
      <button type="button" className={`ng-ck-line ng-ck-none${none ? ' is-on' : ''}`} aria-pressed={none} aria-disabled={linesOk || undefined} onClick={toggleNone}>
        <span className="ng-ck-line-text">{ui.none}</span>
      </button>
    </div>
  );
  return (
    <ExerciseLayout
      heading={modes.claims}
      controls={<SheetChoice stepper label={screen.level} value={level} onChange={chooseLevel} className="ng-ck-levels" options={levelOptions} />}
      question={<>
        <section className="ng-ck-card ng-ck-claim-card" aria-label={screen.claimLead}>
          <p className="ng-ck-progress">{screen.claimLead}</p>
          <p className="ng-ck-claim">{task.claim}</p>
        </section>
        {/* Step 2: the locked lines are what the verdict reads; the action line sits above the verdicts. */}
        {linesOk && board}
      </>}
      action={action}
      actionId="ng-ck-action"
      example={<WorkedExample taskKey={ex.key} context={example.context} rows={claimExampleRows(example)} note={example.task.explanation} marks={false} />}
      answer={linesOk
        ? <Options options={claims.verdictChoices().map(v => ({ id: v.id, label: v.text }))} value={lastVerdict} marks={marks}
          onChoose={chooseVerdict} locked={done} labelledBy="ng-ck-action" evidence={Boolean(verdictResult)} className="ng-ck-verdicts" />
        : board}
      help={<HelpPanel
        taskKey={ex.key}
        check={linesOk ? null : { label: screen.checkLines, onCheck: onCheckLines, disabled: !none && !selected.length }}
        primary={done ? 'next' : linesOk ? 'none' : 'check'}
        verdict={verdict}
        next={{ onNext: another }}
      />}
    />
  );
}
