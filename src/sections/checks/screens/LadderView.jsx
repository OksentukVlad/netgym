// C1 «Де зламалось» (spec v1 C1 with v2; logic/ladder.js decides every output
// and verdict). The method: check from the nearest point outward and deal with
// the first unexpected result. The task shows what must be (the LAN, its
// gateway, the trusted DNS record; at level 2 what must work) before any output.
//   - Level 1, one decision per turn: the fixed ladder (ipconfig /all, ping
//     the gateway, ping 8.8.8.8, nslookup). Each turn shows one output and asks
//     «Далі ↓» / «Стоп: тут» (the last only «Стоп: тут»). Earlier rungs fold to
//     their command and one word, never ✓/✗.
//   - Level 2, the learner chooses: a rung on the PC or the router (a rung with
//     an argument types only that argument); «Стоп: тут» at the latest output,
//     or «Усе працює» once the requirements have been checked.
//   - After «Стоп: тут», «Що перевіриш далі?»: one tap among the places. The
//     verdict names the first unexpected result and whether the stop was there.
//     A stop elsewhere locks the places and offers «Спробувати ще раз»; a place
//     the evidence doesn't point to stays marked ✗ and the learner chooses again.
// Nothing in the DOM says which output was unexpected until the verdict.
import { useEffect, useMemo, useRef, useState, useId } from 'react';
import * as ladder from '../logic/ladder.js';
import { useExercise } from '../../../ui/useExercise.js';
import { useStore } from '../../../ui/useStore.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel, { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import '../../../ui/components/AddressField.css';
import { ladder as words, modes, screen, ui } from '../uk.js';
import Options from './Options.jsx';
import Terminal from './Terminal.jsx';
import { nextSeed } from './seeds.js';

/** The exercise for useExercise (logic/ladder.js; no reference to reveal). */
export const ladderExercise = {
  id: ladder.id, version: ladder.version, generatorVersion: ladder.generatorVersion,
  create: (_, { seed, level, vendor }) => ladder.createLadder(level, vendor, seed, { otherAddresses: true }),
  check: () => ({ ok: false, complete: false }),
  solution: () => null,
};

/** The collected rows: level 1 the fixed rungs up to `index`; level 2 the learner's choices, in order. */
export function evidenceOf(task, view) {
  if (task.level === 1) return ladder.fixedRungs.slice(0, (view.index ?? 0) + 1).map(id => ladder.runRung(task, id));
  return (view.rows ?? []).reduce((rows, r) => {
    const row = ladder.runRung(task, r.id, r.arg, rows);
    return row.ok ? [...rows, row] : rows;
  }, []);
}

/** The worked example's lines (logic ladderExample): the folded ladder, the stop marked. */
export function ladderExampleRows(example) {
  return example.rows.map(r => (r.stopped ? `${r.folded} ← ${ui.stop}` : r.folded));
}

/** The level 2 rungs, grouped by where they run; a chosen rung's argument field opens right under it. */
function RungChoice({ task, pending, onRung, field }) {
  const all = ladder.rungs(task);
  const group = (place, title) => (
    <div className="ng-ck-rung-group" role="group" aria-label={title}>
      <p className="ng-ck-rung-title" aria-hidden="true">{title}</p>
      <div className="ng-ck-rungs">
        {all.filter(r => r.place === place).flatMap(r => [
          <button key={r.id} type="button" className={`ng-ck-rung${pending === r.id ? ' is-pending' : ''}`} aria-pressed={pending === r.id}
            data-rung={r.id} onClick={() => onRung(r)}>
            <code>{r.label}</code>
          </button>,
          ...(pending === r.id && field ? [<div key={`${r.id}-field`} className="ng-ck-rung-field">{field}</div>] : []),
        ])}
      </div>
    </div>
  );
  return <div className="ng-ck-rung-choice" data-rungs={all.length}>{group('pc', screen.onPc)}{group('router', screen.onRouter)}</div>;
}

/** The command around a rung's argument («ssh netadmin@» … «»; «curl -i http://» … «/»), and its verb («ssh»). */
export function commandParts(rung) {
  const verb = rung.command.split(' ')[0];
  if (rung.target === null) return { before: rung.command, after: '', verb };
  const at = rung.command.lastIndexOf(rung.target);
  return { before: rung.command.slice(0, at), after: rung.command.slice(at + rung.target.length), verb };
}

/** The argument of the rung chosen at level 2: only the argument is typed, the rest of the command around it. */
function ArgumentField({ rung, value, error, onChange, onRun }) {
  const id = useId();
  const { before, after, verb } = commandParts(rung);
  // A refused argument: its field and the reason under it come into view together.
  const row = useRef(null), said = useRef(null);
  useEffect(() => { if (error) bringIntoView([row.current, said.current].filter(Boolean)); }, [error]);
  return (
    <div className={`ng-field ng-ck-argument${error ? ' is-invalid' : ''}`}>
      <div className="ng-field-head"><label className="ng-field-label" htmlFor={id}>{screen.argument(verb)}</label></div>
      <div ref={row} className="ng-ck-argument-row">
        <code className="ng-ck-verb" aria-hidden="true">{before.trimEnd()}</code>
        <input id={id} className="ng-field-input" type="text" inputMode="url" autoComplete="off" autoCapitalize="off" spellCheck={false}
          aria-invalid={Boolean(error)} aria-describedby={error ? `${id}-error` : undefined} value={value}
          onChange={event => onChange(event.target.value)}
          onKeyDown={event => { if (event.key === 'Enter') { event.preventDefault(); onRun(); } }} />
        {after && <code className="ng-ck-verb" aria-hidden="true">{after}</code>}
        <button type="button" className="ng-ck-run" onClick={onRun}>{screen.run}</button>
      </div>
      {error && <p ref={said} id={`${id}-error`} className="ng-ck-argument-error" role="status">{error}</p>}
    </div>
  );
}

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function LadderView({ vendor, place, setPlace }) {
  const { state } = useStore();
  const slot = place.ladder ?? { level: 1, tasks: {} };
  const level = slot.level ?? 1;
  const seed = slot.tasks?.[level]?.seed ?? 0;
  const ex = useExercise(ladderExercise, null, { seed, level, vendor });
  const { task, view } = ex;
  const evidence = useMemo(() => evidenceOf(task, view), [task, view.index, view.rows]);
  const requirementLines = useMemo(() => ladder.requirementLines(task), [task]);
  const example = useMemo(() => ladder.ladderExample({ vendor }), [vendor]);
  const earned = earnedBy(state.instances, id => (id.exerciseId === ladder.id ? id.level : null));
  const stopped = Boolean(view.stopped);
  const placesTried = view.places ?? [];
  const lastPlace = placesTried.at(-1) ?? null;
  const grade = stopped && lastPlace ? ladder.gradeStop(task, evidence, lastPlace) : null;
  const healthy = !stopped && view.healthy ? ladder.gradeHealthy(task, evidence) : null;
  const done = Boolean(grade?.ok || healthy?.ok);
  const stoppedElsewhere = Boolean(grade && !grade.stoppedAtEarliest);
  const placesLocked = done || stoppedElsewhere;
  const [pendingId, setPending] = useState(null);
  const [draft, setDraft] = useState('');
  const [argError, setArgError] = useState(null);
  const rungList = useMemo(() => ladder.rungs(task), [task]);
  const pending = rungList.find(r => r.id === pendingId) ?? null;
  const latest = evidence.at(-1) ?? null;
  const folded = evidence.slice(0, -1);

  // The session moves on the logic's verdicts (a pass earns the level's ✓).
  const record = ok => ex.check({ level, rows: view.rows ?? null, index: view.index ?? 0, places: placesTried }, { result: { ok, complete: ok } });
  // Level 1: «Далі ↓» runs the next rung; «Стоп: тут» opens the places.
  const advance = () => ex.setView({ index: Math.min((view.index ?? 0) + 1, ladder.fixedRungs.length - 1) });
  const stop = () => ex.setView({ stopped: true, places: [] });
  // Level 2: a rung without an argument runs at once; with one, its field opens.
  function run(rung, arg) {
    // The whole command typed: say that only the argument goes in the field (Fable s2).
    const verb = commandParts(rung).verb;
    if (arg !== undefined && new RegExp(`^\\s*${verb}(\\s|$)`, 'i').test(arg)) { setArgError(screen.withoutVerb(verb)); return; }
    const parsed = arg === undefined ? null : ladder.parseArgument(arg);
    if (parsed && !parsed.ok) { setArgError(parsed.text); return; }
    const row = ladder.runRung(task, rung.id, parsed ? parsed.value : undefined, evidence);
    if (!row.ok) { setArgError(row.text); return; }
    setPending(null); setDraft(''); setArgError(null);
    ex.setView({ rows: [...(view.rows ?? []), { id: rung.id, ...(parsed ? { arg: parsed.value } : {}) }], healthy: 0 });
  }
  const onRung = rung => {
    if (rung.argument) { setPending(rung.id === pendingId ? null : rung.id); setDraft(''); setArgError(null); } else run(rung);
  };
  function choosePlace(id) {
    if (placesLocked) return;
    const r = ladder.gradeStop(task, evidence, id);
    record(r.ok);
    ex.setView({ places: [...placesTried, id], checks: (view.checks ?? 0) + 1 });
  }
  function confirmHealthy() {
    const r = ladder.gradeHealthy(task, evidence);
    record(r.ok);
    ex.setView({ healthy: (view.healthy ?? 0) + 1, checks: (view.checks ?? 0) + 1 });
  }
  const again = () => { setPending(null); setDraft(''); setArgError(null); ex.setView({ index: 0, rows: [], stopped: false, places: [], healthy: 0, attempt: (view.attempt ?? 0) + 1 }); };
  const another = () => setPlace({ ladder: { ...slot, tasks: { ...slot.tasks, [level]: { seed: nextSeed(seed) } } } });
  const chooseLevel = next => setPlace({ ladder: { ...slot, level: next } });

  // A place is marked by whether the evidence points there; the stop itself is the verdict's.
  // Only a stop at the first unexpected result marks its places: after a stop elsewhere no ✓ sits beside «Ще ні» (Fable 2).
  const placeMarks = grade?.stoppedAtEarliest ? Object.fromEntries(placesTried.map(id => [id, ladder.gradeStop(task, evidence, id).placeAccepted ? 'ok' : 'no'])) : {};
  let verdict = null;
  if (grade) {
    verdict = { tone: grade.ok ? 'ok' : 'no', scope: grade.ok ? 'task' : 'part', stamp: view.checks ?? 0,
      summary: grade.ok ? `${screen.correct} ${grade.text}` : grade.text,
      summaryNode: grade.foldedNext ? <p className="ng-ck-next-folded"><code>{grade.foldedNext}</code></p> : null };
  } else if (healthy) {
    verdict = { tone: healthy.ok ? 'ok' : 'no', scope: healthy.ok ? 'task' : 'part', stamp: view.checks ?? 0, summary: healthy.text };
  }

  const canNext = task.level === 1 && ladder.canAdvance(task, { index: view.index ?? 0, stopped });
  let action, answer;
  if (stopped) {
    action = placesLocked ? screen.committed : ui.nextPlace;
    answer = (
      <div className="ng-ck-stop">
        <Options options={ladder.placeChoices(evidence, level).map(p => ({ id: p.id, label: p.text }))} value={lastPlace} marks={placeMarks}
          onChoose={choosePlace} locked={placesLocked} labelledBy="ng-ck-action" evidence={Boolean(grade)} className="ng-ck-places" />
      </div>
    );
  } else if (level === 1) {
    action = canNext ? screen.turn : screen.turnLast;
    answer = (
      <div className="ng-ck-turn" role="group" aria-labelledby="ng-ck-action">
        {canNext && <button type="button" className="ng-ck-decide is-next" onClick={advance}>{ui.next}</button>}
        <button type="button" className="ng-ck-decide is-stop" aria-describedby="ng-ck-stop-meaning" onClick={stop}>{ui.stop}</button>
        {/* What «Стоп: тут» means, as its caption on every turn (Fable s3). */}
        <p id="ng-ck-stop-meaning" className="ng-ck-stop-meaning">{ui.stopMeaning}</p>
      </div>
    );
  } else {
    action = done ? screen.committed : latest ? screen.chooseMore : screen.chooseRung;
    answer = (
      <div className="ng-ck-choose">
        {latest && !done && (
          <div className="ng-ck-turn" role="group" aria-label={screen.decide}>
            <button type="button" className="ng-ck-decide is-stop" aria-describedby="ng-ck-stop-meaning" onClick={stop}>{ui.stop}</button>
            <button type="button" className="ng-ck-decide is-healthy" onClick={confirmHealthy}>{words.healthy}</button>
            <p id="ng-ck-stop-meaning" className="ng-ck-stop-meaning">{ui.stopMeaning}</p>
          </div>
        )}
        {!done && <RungChoice task={task} pending={pendingId} onRung={onRung}
          field={pending && <ArgumentField key={pending.id} rung={pending} value={draft} error={argError} onChange={value => { setDraft(value); setArgError(null); }}
            onRun={() => run(pending, draft)} />} />}
      </div>
    );
  }

  const levelOptions = [1, 2].map(n => ({ value: n, label: <>{screen.levelNames.ladder[n - 1]}<DoneMark done={earned.has(n)} /></>, step: screen.levels[n - 1] }));
  return (
    <ExerciseLayout
      heading={modes.ladder}
      controls={<SheetChoice stepper label={screen.level} value={level} onChange={chooseLevel} className="ng-ck-levels" options={levelOptions} />}
      question={<>
        <p className="ng-ck-task">{task.task}</p>
        <section className="ng-ck-given" aria-label={screen.given}>
          <p className="ng-ck-given-title">{screen.given}</p>
          <ul className="ng-ck-given-lines" data-lines={requirementLines.length}>{requirementLines.map(line => <li key={line}>{line}</li>)}</ul>
        </section>
        {(folded.length > 0 || latest) && (
          <section className="ng-ck-collected" aria-label={screen.collected}>
            {folded.length > 0 && <ol className="ng-ck-folded">{folded.map((row, i) => <li key={`${row.id}-${i}`}><code>{row.folded}</code></li>)}</ol>}
            {latest && <Terminal output={latest.output} caption={screen.latest} className="ng-ck-latest" />}
          </section>
        )}
      </>}
      action={action}
      actionId="ng-ck-action"
      example={<WorkedExample taskKey={ex.key} context={example.context} rows={ladderExampleRows(example)} note={example.note} marks={false} numbered />}
      answer={answer}
      help={<HelpPanel
        taskKey={`${ex.key}|${view.attempt ?? 0}`}
        check={null}
        primary={done ? 'next' : stoppedElsewhere ? 'continue' : 'none'}
        verdict={verdict}
        continueAction={stoppedElsewhere ? { label: screen.again, onClick: again } : null}
        next={{ onNext: another }}
      />}
    />
  );
}
