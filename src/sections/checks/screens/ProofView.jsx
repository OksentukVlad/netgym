// C3 «Що це доводить» (spec v1 C3 with v2, v2.1; logic/proofs.js decides).
// The router is configured; one requirement per screen, «Вимога 2 з 6». Its
// 3–4 options each carry the place, the check and the result it must show
// («з ПК: ssh netadmin@192.168.88.1 → вхід виконано»); a tap answers. A wrong
// option stays marked ✗ with the reason a check needs its successful result;
// the right one locks the card with the requirement's note and offers the
// next requirement. After the sixth: a task-scope ✓ and «Новий раунд».
import { useMemo, useRef } from 'react';
import * as proofs from '../logic/proofs.js';
import { useExercise } from '../../../ui/useExercise.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import { modes, proofs as words, screen, ui } from '../uk.js';
import Options from './Options.jsx';
import { useNewCard } from './focus.js';
import { nextSeed } from './seeds.js';

/** The exercise for useExercise: a round of the six requirements on one seed. */
export const proofExercise = {
  id: proofs.id, version: proofs.version, generatorVersion: proofs.generatorVersion,
  create: (_, { seed, vendor, scope }) => ({ seed, vendor, cards: proofs.proofSet(seed, { vendor, scope }) }),
  check: () => ({ ok: false, complete: false }),
  solution: () => null,
};

/** The worked example's rows (logic proofExample: its own network, the SSH requirement). */
export function proofExampleRows(example) {
  const option = example.task.options.find(o => o.id === example.answer);
  return [[example.task.requirement, option.label]];
}
const EXAMPLE_HEAD = ['Вимога', 'Перевірка → результат'];

/** @param {{ vendor: 'cisco'|'mikrotik', place: object, setPlace: Function }} props */
export default function ProofView({ vendor, place, setPlace }) {
  const seed = place.proof?.seed ?? 0;
  const scope = place.proof?.scope === 'access' ? 'access' : undefined;
  const ex = useExercise(proofExercise, null, { seed, vendor, ...(scope ? { scope } : {}) });
  const { task, view } = ex;
  const total = task.cards.length;
  const position = Math.min(view.position ?? 0, total - 1);
  const card = task.cards[position];
  const tries = view.tries ?? {};
  const chosen = tries[card.requirementId] ?? [];
  const last = chosen.at(-1) ?? null;
  const result = last ? proofs.checkProof(card, last) : null;
  const right = Boolean(result?.ok);
  const done = task.cards.every(c => (tries[c.requirementId] ?? []).some(id => proofs.checkProof(c, id).ok));
  const cardRef = useRef(null);
  const cardFocus = useNewCard(cardRef, position);
  const marks = Object.fromEntries(chosen.map(id => [id, proofs.checkProof(card, id).ok ? 'ok' : 'no']));
  const example = useMemo(() => proofs.proofExample({ vendor }), [vendor]);

  function choose(id) {
    if (right) return;
    const next = { ...tries, [card.requirementId]: [...chosen, id] };
    const outcome = proofs.checkProof(card, id);
    const complete = outcome.ok && task.cards.every(c => (next[c.requirementId] ?? []).some(id => proofs.checkProof(c, id).ok));
    ex.check({ tries: next }, { result: { ok: outcome.ok, complete } });
    ex.setView({ tries: next, checks: (view.checks ?? 0) + 1 });
  }
  const onNext = () => { cardFocus.current = true; ex.setView({ position: position + 1 }); };
  const newRound = () => setPlace({ proof: { seed: nextSeed(seed) } });

  const verdict = result ? {
    tone: right ? 'ok' : 'no', scope: done ? 'task' : 'part', stamp: view.checks ?? 0,
    summary: done ? screen.proofDone : result.text,
    summaryNode: done ? <p className="ng-ck-after">{result.text}</p> : null,
  } : null;

  return (
    <ExerciseLayout
      heading={modes.proof}
      question={<>
        <p className="ng-ck-task">{scope ? screen.proofTaskAccess : screen.proofTask}</p>
        <section ref={cardRef} tabIndex={-1} className="ng-ck-card" aria-label={ui.requirement(position + 1, total)}>
          <p className="ng-ck-progress">{ui.requirement(position + 1, total)}</p>
          <p className="ng-ck-requirement">{card.requirement}</p>
        </section>
      </>}
      action={right ? screen.committed : ui.proofAction}
      actionId="ng-ck-action"
      example={<WorkedExample taskKey={ex.key} context={example.context} head={EXAMPLE_HEAD} rows={proofExampleRows(example)} note={words.sshNote} />}
      answer={<Options key={card.requirementId} options={card.options.map(o => ({ id: o.id, label: o.label }))} value={last} marks={marks}
        onChoose={choose} locked={right} labelledBy="ng-ck-action" evidence={Boolean(result)} className="ng-ck-proof" />}
      help={<HelpPanel
        taskKey={`${ex.key}|${card.requirementId}`}
        check={null}
        primary={done ? 'next' : right ? 'continue' : 'none'}
        verdict={verdict}
        continueAction={right && !done ? { label: screen.nextRequirement, onClick: onNext } : null}
        next={done ? { onNext: newRound, label: screen.newRound, ready: true } : null}
      />}
    />
  );
}
