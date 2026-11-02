// «IP-адреси: маска»: Vlad's mask exercise (logic/mask.js, generated, no bank)
// built from ExerciseLayout and the generic components, through the same
// useExercise hook and app store as routing. Find a block's network and
// broadcast address, or the smallest mask for N devices. «Ще одна» draws a
// new seed; the level switch keeps a seed per level.
//
// The stage holds Vlad's address ruler (AddressRuler.jsx), by his rules:
//   - block tasks show the strip and the address from the start, and the
//     block with its two ends once solved or revealed;
//   - fit tasks show nothing until a check, then the block of the mask the
//     student gave (their own answer), or of the answer once revealed.
//
// Step 8 (spec C5, S7): inside the NetGym shell, a finished task offers
// «Відкрити в калькуляторі» with its address and the prefix the student had
// accepted (or the revealed one); a link here with params { seed } («Потренуватися
// → Маска» in the calculator) starts that task at the current level.
//
// Round 4 (spec A1, the reference screen): the check, the verdict, the hints
// and the reveal are one HelpPanel directly under the fields (no sticky bar).
// «Перевірити» is the primary button until the task is finished; then «Далі →»
// (a new seed) is; before that it is secondary, to skip a task without
// revealing it. The fields keep the checked answer, read-only. Field
// errors stay on their fields; the verdict names one thing. «Відкрити в
// калькуляторі» is a quiet link in the success detail (and under a revealed
// answer). The fields carry data-evidence="current" while a verdict or a
// hint is about them. A revealed task's ruler says «показано» (never a
// solve's look). Block tasks show the block rule in an Aside on the first
// visit; it folds behind «?» after the first check or «Далі» (a note about
// empty or malformed input is not a check: tone `info`, nothing folds).
//
// Round 4 2b (spec R4, the merge of «введення» and «вибір»): one exercise.
// The fields are typed; a quiet card-wide «Обрати з варіантів» / «Ввести
// самому» under them switches every field to option chips and back, from the
// start. After a wrong check that same link reads «Показати варіанти»: it
// turns the fields that are empty or wrong into chips and keeps a right one
// typed (one control, so the check row keeps its three buttons). The network-
// size task's ruler has no address marker; its caption names the block size.
// The choice belongs to this task instance (its view): the next task starts
// typed, and the app-wide input preference is not touched here. Feedback
// stays per field. The level switch names each level's skill (mask-core.js
// levels) and shows the quiet ✓ once a task of that level was solved
// without a reveal.
//
// Round 5 5b-2 (spec A, D): an action line over the fields (typed or chips,
// block or fit; «завершено» in place once finished), and on block tasks the
// folded worked example right under it: another address's /26 block on its
// ruler, with its network and broadcast (logic/examples.js, display data
// only). An address task's ruler says what it shows: the octet, the label
// spacing, the block size for this prefix, and the task's address.
import { useEffect, useRef } from 'react';
import mask from '../logic/mask.js';
import { maskExample } from '../logic/examples.js';
import { blockSize, hostCount, parseIp } from '../../../engine/ip.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, useStore } from '../../../ui/useStore.js';
import { useNav, useRouteParams } from '../../../ui/useNav.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import AddressField from '../../../ui/components/AddressField.jsx';
import Button from '../../../ui/components/Button.jsx';
import HelpPanel, { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import Aside, { useAsideFold } from '../../../ui/components/Aside.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { uk as shared } from '../../../ui/uk.js';
import AddressRuler, { blockOn, rulerFor } from './AddressRuler.jsx';
import { SECTION, newSeed } from './links.js';
import { comprehension, maskOf, t, ui } from '../uk.js';
import './Mask.css';

const DRAFT = ['text', 'answer'];
/** The screen's id for its asides (store places). */
const SCREEN = 'ip.mask';

/** The calculator link's params for a finished task: its address, and the
 * prefix the student had accepted (fit tasks) or the revealed one; null while
 * working (the link would answer the task). */
export function calculatorParams(ex) {
  if (!ex.finished) return null;
  const { task } = ex;
  if (task.kind !== 'fit') return { ip: task.ip, prefix: task.prefix };
  const prefix = ex.session.revealed ? ex.solution?.prefix : ex.result?.evidence?.given ?? ex.view.rulerPrefix;
  return Number.isInteger(prefix) ? { ip: task.ip, prefix } : null;
}

/** An address task's ruler line (round 5 5b-2, spec D): the octet shown, the label spacing, the block size
 * for the task's prefix and the task's address; the block's ends once it is shown. */
export function maskRulerCaption(task, ruler) {
  const line = comprehension.maskRulerCaption({ k: ruler.octet, labelStep: Math.max(ruler.unit, 32), prefix: task.prefix, blockSize: blockSize(task.prefix), value: ruler.value });
  return ruler.block ? `${line} ${ui.rulerBlock(ruler.block)}` : line;
}

const EXAMPLE = maskExample();
/** The worked example (block tasks): another address's /26 block on its ruler, then its network and broadcast,
 * as the form's two fields. Read-only display data (logic/examples.js); never the task's or the learner's. */
function MaskExample({ taskKey }) {
  const { ruler, answer } = EXAMPLE;
  return (
    <WorkedExample taskKey={taskKey} context={EXAMPLE.context}>
      <div className="ng-mask-example-ruler">
        <AddressRuler octet={4} unit={ruler.blockSize} value={ruler.value} block={{ start: ruler.start, end: ruler.end, size: ruler.blockSize }} caption={null} />
      </div>
      {/* The rows in WorkedExample's own table look (its classes): a ruler and the rows together. */}
      <table className="ng-wex-table">
        <thead><tr><td className="ng-wex-mark" /><th scope="col">{ui.network}</th><th scope="col">{ui.broadcast}</th></tr></thead>
        <tbody><tr><td className="ng-wex-mark" aria-hidden="true">✓</td><td className="ng-wex-value">{answer.network}</td><td className="ng-wex-value">{answer.broadcast}</td></tr></tbody>
      </table>
    </WorkedExample>
  );
}

/** @param {{ route?: { params?: object } | null }} props */
export default function MaskScreen({ route = null }) {
  const [place, setPlace] = usePlace('ip.mask', () => ({ level: 1, seeds: { 1: newSeed() } }));
  const nav = useNav();
  useRouteParams(route, params => {
    if (Number.isInteger(params.seed) && params.seed >= 0) setPlace({ seeds: { ...place.seeds, [place.level]: params.seed } });
  });
  const { state } = useStore();
  const level = place.level;
  const seed = place.seeds[level] ?? 0;
  const ex = useExercise(mask, null, { seed, level });
  const { task, session, view } = ex;
  const fit = task.kind === 'fit';
  const names = fit ? ['prefix'] : ['network', 'broadcast'];
  const values = ex.drafts[DRAFT[0]]?.[DRAFT[1]] ?? {};
  const hints = ex.hints().map(h => t(`mask.${h.code}`, h.params));
  const answerBox = useRef(null);
  const focusField = useRef(false);
  const foldAsides = useAsideFold(SCREEN);
  const earned = earnedBy(state.instances, id => (id.exerciseId === mask.id ? id.level : null));
  // Which fields show option chips (this instance only; a new task starts typed).
  const choices = view.choices ?? {};
  const choosing = names.some(name => choices[name]);

  // After «Далі», the new task's first field gets focus. (Solved by
  // «Перевірити», the panel moves focus to «Далі», since that button goes.)
  useEffect(() => {
    if (!focusField.current) return;
    focusField.current = false;
    answerBox.current?.querySelector('input, [role="radio"][tabindex="0"]')?.focus();
  }, [ex.key]);

  function another() {
    focusField.current = true;
    foldAsides();
    setPlace({ seeds: { ...place.seeds, [level]: newSeed() } });
  }
  function chooseLevel(next) {
    setPlace({ level: next, seeds: place.seeds[next] === undefined ? { ...place.seeds, [next]: newSeed() } : place.seeds });
  }
  // A solved or revealed task's answer stays as it was checked.
  function edit(name, value) {
    if (ex.finished) return;
    ex.setDraft(DRAFT[0], DRAFT[1], { ...values, [name]: value });
    if (view.invalid?.[name] || view.notice) ex.setView({ invalid: { ...view.invalid, [name]: false }, notice: null });
  }

  // Vlad's check: empty or malformed input gets a note and is not an attempt.
  // `submits` counts every press, so the panel announces a repeated message.
  function submit() {
    if (ex.finished) return;
    const submits = (view.submits ?? 0) + 1;
    const text = name => String(values[name] ?? '');
    // An empty chip group asks for a choice, an empty field for an answer.
    const empty = list => (list.some(name => choices[name]) ? 'incompleteChoose' : 'incomplete');
    if (fit) {
      if (text('prefix').trim() === '') return ex.setView({ submits, notice: empty(['prefix']), invalid: { prefix: true } });
      foldAsides();
      const result = ex.check({ prefix: text('prefix') });
      // The ruler keeps the last mask that parsed, as Vlad's did.
      return ex.setView({ submits, notice: null, invalid: { prefix: !result.ok }, rulerPrefix: result.evidence.given ?? view.rulerPrefix });
    }
    const bad = names.filter(name => parseIp(text(name)) === null);
    if (bad.length) {
      return ex.setView({ submits, notice: bad.some(name => text(name).trim() !== '') ? 'bad-ip' : empty(bad), invalid: Object.fromEntries(bad.map(name => [name, true])) });
    }
    foldAsides();
    const result = ex.check({ network: text('network'), broadcast: text('broadcast') });
    const fields = result.evidence.fields;
    ex.setView({ submits, notice: null, invalid: { network: !fields.network, broadcast: fields.network && !fields.broadcast } });
  }

  /** The card-wide link: every field to chips, or every field back to typing. */
  function toggleChoices() {
    if (ex.finished) return;
    ex.setView({ choices: Object.fromEntries(names.map(name => [name, !choosing])) });
  }
  /** «Показати варіанти» after a wrong check: the empty or wrong fields
   * become chips (cleared, so the choice is fresh); a right one stays typed. */
  // Wrong: marked by the last check, or (a block task) wrong in that check
  // and unchanged since (the verdict names one field; both may be wrong).
  const wrong = name => Boolean(view.invalid?.[name]) || (Boolean(ex.result) && !ex.result.ok && ex.result.evidence?.fields?.[name] === false
    && String(values[name] ?? '') === String(ex.answer?.[name] ?? ''));
  const offerable = names.filter(name => !choices[name] && (String(values[name] ?? '').trim() === '' || wrong(name)));
  const focusChoice = useRef(null);
  function showChoices() {
    if (ex.finished || !offerable.length) return;
    const next = { ...values };
    for (const name of offerable) if (wrong(name)) next[name] = '';
    ex.setDraft(DRAFT[0], DRAFT[1], next);
    ex.setView({ choices: { ...choices, ...Object.fromEntries(offerable.map(name => [name, true])) }, invalid: { ...view.invalid, ...Object.fromEntries(offerable.map(name => [name, false])) } });
    focusChoice.current = offerable[0];
  }
  // After «Показати варіанти» focus goes to the first new chip group; the
  // chips are taller than the fields, so that group, the check row and the
  // message are brought into view together (the panel scrolls only on its
  // own events).
  useEffect(() => {
    const name = focusChoice.current;
    if (!name) return;
    focusChoice.current = null;
    const group = answerBox.current?.querySelector(`[data-field="${name}"]`);
    const screen = answerBox.current?.closest('.ng-exercise');
    bringIntoView([group, screen?.querySelector('[data-help="row"]'), screen?.querySelector('[data-help-current]')]);
    group?.querySelector('[role="radio"][tabindex="0"]')?.focus({ preventScroll: true });
  });

  // The ruler: see the rules at the top. ex.solution exists only once revealed.
  const fitPrefix = session.revealed ? ex.solution?.prefix : view.rulerPrefix;
  const blockRuler = !fit ? rulerFor(task.ip, task.prefix, ex.finished) : null;
  const ruler = blockRuler ? { ...blockRuler, caption: maskRulerCaption(task, blockRuler) }
    : fitPrefix != null ? { ...rulerFor('0.0.0.0', fitPrefix, true), subject: 'size' } : null;

  // The verdict: a note about the input, or the last check's result (a
  // reveal is the panel's own item). `submits` counts every press: its stamp.
  const calcParams = calculatorParams(ex);
  const calcLink = calcParams && nav?.has(SECTION.calculator)
    ? <Button variant="quiet" className="ng-mask-calc" onClick={() => nav.go({ section: SECTION.calculator, params: calcParams })}>{ui.openCalculator}</Button>
    : null;
  let verdict = null;
  // A note about the input isn't an attempt: plain information, no «Ще ні».
  if (view.notice) verdict = { tone: 'info', summary: ui[view.notice], stamp: view.submits ?? 0 };
  else if (ex.result) {
    const ok = ex.result.ok;
    verdict = {
      tone: ok ? 'ok' : 'no', scope: 'task', stamp: view.submits ?? 0,
      summary: t(`mask.${ex.result.code}`, { ...ex.result.evidence, ip: task.ip, givenBroadcast: parseIp(ex.answer?.broadcast ?? ''), kind: task.kind }),
      detail: ok ? calcLink : null,
    };
  }
  // Edited since that check (a read-only finished answer can't be).
  const stale = Boolean(verdict) && !ex.finished && !view.notice && names.some(name => String(values[name] ?? '') !== String(ex.answer?.[name] ?? ''));
  // What the verdict or a hint is about (data-evidence): the first field
  // still empty or wrong (the one the verdict names), else the fields.
  const about = !session.revealed && (Boolean(verdict) || session.hintIndex > 0);
  const aboutField = about ? names.find(name => view.invalid?.[name] || wrong(name) || String(values[name] ?? '').trim() === '') ?? null : null;

  const options = name => (mask.options(task, name) ?? []).map(value => ({ value: String(value), label: fit ? maskOf(value) : String(value) }));
  const field = name => (
    <div key={`${ex.key}|${name}`} data-field={name} {...(aboutField === name ? { 'data-evidence': 'current' } : {})}>
      <AddressField label={ui[name]} kind={fit ? 'prefix' : 'ip'} hint={fit ? ui.prefixHint : undefined}
        value={values[name] ?? ''} onChange={value => edit(name, value)} onEnter={submit} invalid={Boolean(view.invalid?.[name])}
        options={options(name)} mode={choices[name] ? 'choose' : 'type'} readOnly={ex.finished} />
    </div>
  );
  // The offer, after a real wrong check only (a note about the input isn't one).
  // While it stands, the quiet card-wide link under the fields is the offer (one control; the check row keeps three buttons).
  const offer = !ex.finished && verdict?.tone === 'no' && offerable.length > 0;

  // The reveal path: ex.solution exists only once revealed.
  function answerText() {
    const s = ex.solution;
    if (fit) {
      const next = s.prefix < 30 ? s.prefix + 1 : null;
      return <p>{ui.answerFit({ mask: maskOf(s.prefix), hosts: hostCount(s.prefix), next, nextHosts: next && hostCount(next) })}</p>;
    }
    const { unit, ...block } = blockOn(task.ip, task.prefix);
    return <><p>{ui.answerBlock(s)}</p><p>{ui.whyBlock({ prefix: task.prefix, step: unit, ...block })}</p></>;
  }

  return (
    <ExerciseLayout
      heading={ui.heading}
      controls={<Segmented label={ui.level} showLabel className="ng-mask-levels" value={level} onChange={chooseLevel}
        options={[1, 2, 3].map(n => ({ value: n, label: <>{ui.levels[n - 1]}<DoneMark done={earned.has(n)} /></> }))} />}
      stage={<div className="ng-mask-stage" data-revealed={session.revealed ? '' : undefined}>
        <p><b>{fit ? ui.taskFit({ hosts: task.hosts }) : ui.taskBlock({ ip: task.ip, mask: maskOf(task.prefix) })}</b></p>
        {ruler && <AddressRuler {...ruler} />}
        {session.revealed && ruler && <p className="ng-mask-shown"><span className="ng-shown-chip">{shared.help.shown}</span></p>}
        {!fit && <Aside screen={SCREEN} id="block-rule" title={ui.asideBlockTitle}><p>{ui.asideBlock}</p></Aside>}
      </div>}
      action={session.revealed ? null : ex.finished ? ui.action.done : ui.action[`${fit ? 'fit' : 'block'}${choosing ? 'Choose' : ''}`]}
      example={session.revealed || fit ? null : <MaskExample taskKey={ex.key} />}
      answer={session.revealed ? null : (
        <div ref={answerBox} className="ng-mask-answer">
          <div className="ng-mask-fields" {...(about && !aboutField ? { 'data-evidence': 'current' } : {})}>{names.map(field)}</div>
          {!ex.finished && (offer
            ? <Button variant="quiet" className="ng-mask-mode is-offer" onClick={showChoices}>{ui.showChoices}</Button>
            : <Button variant="quiet" className="ng-mask-mode" onClick={toggleChoices}>{choosing ? shared.typeInstead : shared.chooseInstead}</Button>)}
        </div>
      )}
      help={<HelpPanel
        taskKey={ex.key}
        check={ex.finished ? null : { onCheck: submit }}
        verdict={verdict}
        stale={stale}
        hints={{ texts: hints, shown: session.hintIndex, onMore: () => ex.hint(hints.length) }}
        reveal={{ revealed: session.revealed, onReveal: ex.reveal, render: () => <>{answerText()}{calcLink}</> }}
        next={{ onNext: another }}
      />}
    />
  );
}
