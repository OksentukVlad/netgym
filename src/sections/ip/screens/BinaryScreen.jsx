// «IP-адреси: у бітах» (design §3, spec S4–S6): the binary walk. Four rows,
// one check each: the address in bits, the mask in bits, the network (the
// address AND the mask) and the broadcast (device bits set to 1). Only the
// broadcast row completes the task; nothing earns before it, and there is
// no counter.
//
// Round 4 (spec R5, with its v2 contract):
//   - three levels, each a skill (logic/binary.js): 1 «Один октет» (the
//     first three octets of every row are given, read-only in both input
//     methods), 2 «/24», 3 «Будь-яка маска» (round 3's tasks). The level is
//     part of the instance; the place keeps a seed per level and the last
//     level chosen (level 1 the first time in an app run). A level shows the
//     quiet ✓ (DoneMark) once any of its tasks was solved without a reveal;
//   - one column, so the current row's 32 bits sit on one line under «Твої
//     рядки» (the rows accepted so far, with the boundary line) where the
//     screen is wide, two octets a line below that; the step list is right
//     above the row being edited;
//   - the check, the verdict, the hints and the reveal are one HelpPanel
//     under the row (no sticky bar). A check flags only the first wrong
//     octet; its verdict and the octet's own line give «зараз 64, треба
//     192», and only that octet carries data-evidence. Hints read the row
//     as it is now (not the last check). «Далі →» (a new task at this
//     level) is secondary until the task is finished.
//
// What the page may show before the reveal (S5): the givens (the address,
// the prefix and the mask in decimal, the weights; level 1's given octets),
// the student's own rows (the one being typed, and the rows accepted so far,
// read from ex.parts) and hints whose examples use other numbers. The prefix
// line appears only once the mask row is accepted; the ruler at the end
// shows the block the student found.
//
// Round 5 (spec 5b-1 §2 with v2, v2.1, v2.2): level 1 says what is given
// and what to do. Its question names octet 4 (step 1 with the address
// octet's decimal; steps 2–4 never a result), an action line right above the
// row says how, in this input mode (uk.js binaryLevel1Text), and the three
// given octets sit in one band captioned «Октети 1–3 · задано», drawn as
// given (no input border, a muted fill); octet 4 keeps the input look.
//
// State (S6) is in the store: the place holds the level, a seed per level
// and «Ввести текстом»; the instance's view holds the current step, a draft
// per step (four octets of '0' | '1' cells, all '0' at first, givens filled
// in by the logic's draft()), the open hints per step and the mark of the
// last check per step. Every row is an answer (polish-2 P1): an untouched,
// all-zero row is checked like any other.
import { useEffect, useId, useRef } from 'react';
import binary from '../logic/binary.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, useStore } from '../../../ui/useStore.js';
import { useNav, useRouteParams } from '../../../ui/useNav.js';
import ExerciseLayout from '../../../ui/components/ExerciseLayout.jsx';
import Button from '../../../ui/components/Button.jsx';
import HelpPanel from '../../../ui/components/HelpPanel.jsx';
import { SheetChoice } from '../../../ui/BarSlot.jsx';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import AddressRuler, { rulerWith } from './AddressRuler.jsx';
import BitRows, { addressOf } from './BitRows.jsx';
import BitRowInput from './BitOctet.jsx';
import { SECTION, newSeed } from './links.js';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import { binaryLevel1Text, binaryUi, t } from '../uk.js';
import './Binary.css';

const ROW_IDS = ['address', 'mask', 'network', 'broadcast'];
const STEPS = [0, 1, 2, 3];
const LEVELS = [1, 2, 3];

/** The rows the student has had accepted, in order, for BitRows. */
export function acceptedRows(parts) {
  return STEPS.filter(s => parts?.[s]?.octets).map(s => ({ id: ROW_IDS[s], label: binaryUi.rows[s], octets: parts[s].octets }));
}

/** Cells ([4][8] of '0' | '1') → four eight-bit strings, and back. */
export const stringsOf = cells => cells.map(octet => octet.map(c => (c === '1' ? '1' : '0')).join(''));
export const cellsOf = strings => strings.map(bits => [...bits]);

/** The place's default: level 1, a seed for it, toggles. An older place
 * (one seed, no level) keeps its seed for level 3, whose tasks it made. */
const defaults = () => ({ level: 1, seeds: { 1: newSeed() }, text: false });

/** @param {{ route?: { params?: object } | null }} props */
export default function BinaryScreen({ route = null }) {
  const { state } = useStore();
  const [place, setPlace] = usePlace('ip.binary', defaults);
  const nav = useNav();
  const level = LEVELS.includes(place.level) ? place.level : 1;
  const seeds = place.seeds ?? (Number.isInteger(place.seed) ? { 3: place.seed } : {});
  useRouteParams(route, params => {
    if (Number.isInteger(params.seed) && params.seed >= 0) setPlace({ seeds: { ...seeds, [level]: params.seed } });
  });
  const seed = seeds[level] ?? 0;
  const ex = useExercise(binary, null, { seed, level });
  const { task, session, view } = ex;
  const accepted = STEPS.map(s => ex.parts[s]?.octets ?? null);
  const step = Math.min(Math.max(view.step ?? 0, 0), 3);
  const drafts = view.drafts ?? {};
  // The row being typed, through the logic's draft(): given octets are the
  // task's, whatever a draft says.
  const given = binary.row(task, step).octets.map(o => o.provenance === 'given');
  // Level 1, steps 2–4: the given octets keep their numbers («Октет 1 · 255»), never octet 4's (repair v1, Fable 4).
  const givenDecimals = binary.row(task, step).octets.map(o => (o.provenance === 'given' ? parseInt(o.bits, 2) : undefined));
  const current = binary.draft(task, { step, octets: drafts[step] ? stringsOf(drafts[step]) : [] });
  const cells = cellsOf(current.octets);
  const hintCounts = view.hintCounts ?? {};
  const shown = hintCounts[step] ?? 0;
  // Hints read the row as it is now (rung 1 names its first wrong octet).
  const hintTexts = binary.hints(task, current, { step }).map(h => t(`binary.${h.code}`, h.params));
  const marks = view.marks?.[step] ?? [];
  const maskDone = Boolean(accepted[1]);
  const done = Boolean(accepted[3]);
  const focusRow = useRef(null);
  const focusPending = useRef(false);
  const helpId = useId();
  const earned = earnedBy(state.instances, id => (id.exerciseId === binary.id ? id.level : null));

  // A new row (after an accepted step) or a new task: its first open cell gets focus.
  useEffect(() => {
    if (!focusPending.current) return;
    focusPending.current = false;
    focusRow.current?.();
  }, [step, ex.key]);

  function another() {
    focusPending.current = true;
    setPlace({ level, seeds: { ...seeds, [level]: newSeed() } });
  }
  function chooseLevel(next) {
    setPlace({ level: next, seeds: seeds[next] === undefined ? { ...seeds, [next]: newSeed() } : seeds });
  }

  function edit(next) {
    if (ex.finished) return;
    const normalised = binary.draft(task, { step, octets: stringsOf(next) }).octets;
    // An edited octet loses its mark from the last check.
    const stepMarks = marks.map((mark, o) => (normalised[o] === current.octets[o] ? mark : null));
    ex.setView({ drafts: { ...drafts, [step]: cellsOf(normalised) }, notice: null, marks: { ...view.marks, [step]: stepMarks } });
  }

  function notice(code) {
    ex.setView({ notice: code, submits: (view.submits ?? 0) + 1 });
  }

  // Every row is checked (an attempt; nothing on screen counts them).
  // Accepted rows are stored, as the logic normalised them, as the part of
  // their step; only then does the walk move on.
  function submit() {
    if (ex.finished) return;
    const submits = (view.submits ?? 0) + 1;
    const answer = { step, octets: [...current.octets] };
    const result = binary.check(task, answer);
    ex.check(answer, { result, ...(result.ok ? { part: step, partResult: { octets: [...answer.octets] } } : {}) });
    const finding = result.ok ? null : result.findings[0] ?? null;
    const stepMarks = STEPS.map(o => (finding?.field === 'octet' && finding.entity === o ? { current: finding.params?.current ?? null, target: finding.params?.target ?? null } : null));
    if (result.ok && step < 3) focusPending.current = true;
    ex.setView({ submits, notice: null, marks: { ...view.marks, [step]: stepMarks }, ...(result.ok && step < 3 ? { step: step + 1 } : {}) });
  }

  function moreHints() {
    if (shown >= hintTexts.length) return;
    ex.setView({ hintCounts: { ...hintCounts, [step]: shown + 1 } });
    ex.hint();
  }

  const calcLink = ex.finished && nav?.has(SECTION.calculator)
    ? <Button variant="quiet" className="ng-bin-calc" onClick={() => nav.go({ section: SECTION.calculator, params: { ip: task.ip, prefix: task.prefix } })}>{binaryUi.openCalculator}</Button>
    : null;

  // The verdict: a note about pasted text (not an attempt), or the last check.
  let verdict = null;
  const stamp = view.submits ?? 0;
  if (view.notice === 'paste') verdict = { tone: 'info', summary: binaryUi.paste, stamp };
  else if (ex.result) {
    const checked = ex.answer?.step ?? 0;
    if (!ex.result.ok) verdict = { tone: 'no', summary: t(`binary.${ex.result.code}`, ex.result.findings[0]?.params), stamp };
    else if (checked === 3 && done) {
      // The addresses themselves are in the result above (the learner's own rows, data-provenance="accepted").
      verdict = { tone: 'ok', scope: 'task', stamp, detail: calcLink, summary: binaryUi.finished };
    } else verdict = { tone: 'ok', scope: 'part', summary: binaryUi.accepted[checked]({}), stamp };
  }
  // Edited since that check (about this step's row).
  const stale = Boolean(verdict) && verdict.tone === 'no' && (ex.answer?.step ?? 0) === step
    && stringsOf(cells).join('') !== (ex.answer?.octets ?? []).join('');

  // What the current message is about (data-evidence): the flagged octet;
  // with a hint open and no flag, the octet rung 1 names (or the row); a
  // part success, its step (✓) in the step list, right above the next row;
  // the finished walk, its result.
  const marked = marks.findIndex(Boolean);
  const hinted = shown > 0 ? binary.check(task, current).findings[0] : null;
  const evidenceOctet = ex.finished ? null : marked >= 0 ? marked : hinted?.field === 'octet' ? hinted.entity : null;
  const rowEvidence = !ex.finished && evidenceOctet === null && shown > 0;
  const stepEvidence = !ex.finished && evidenceOctet === null && !rowEvidence && verdict?.tone === 'ok' && verdict.scope === 'part' ? ex.answer?.step ?? null : null;

  // The reveal path: ex.solution exists only once revealed.
  function answerText() {
    const rows = ex.solution.steps.map(({ step: s, octets }) => ({ id: ROW_IDS[s], label: binaryUi.rows[s], octets }));
    return <>
      <BitRows rows={rows} prefix={task.prefix} label={binaryUi.sheet} provenance="reference" />
      <p>{binaryUi.result({ network: addressOf(rows[2].octets), broadcast: addressOf(rows[3].octets) })}</p>
      {calcLink}
    </>;
  }

  const sheet = acceptedRows(ex.parts);
  // Level 1's own words for this step and input mode; other levels keep theirs.
  const l1 = level === 1 ? binaryLevel1Text(task, { step, mode: place.text ? 'text' : 'toggles' }) : null;
  const levelOptions = LEVELS.map((n, i) => ({ value: n, label: <>{binaryUi.levels[i]}<DoneMark done={earned.has(n)} /></>, step: binaryUi.levels[i] }));
  return (
    <ExerciseLayout
      heading={binaryUi.heading}
      controls={<SheetChoice stepper label={binaryUi.level} showLabel options={levelOptions} value={level} onChange={chooseLevel} className="ng-bin-levels" />}
      question={<div className="ng-bin-walk ng-bin-task">
        <p data-provenance="given">{binaryUi.task({ ip: task.ip, prefix: task.prefix, mask: task.mask })}</p>
        <p className="ng-bin-goal">{binaryUi.goal}</p>
      </div>}
      answer={<>
        {sheet.length > 0 && (
          <section className="ng-bin-sheet" aria-label={binaryUi.sheet}>
            <h2 className="ng-caption">{binaryUi.sheet}</h2>
            <BitRows rows={sheet} prefix={maskDone ? task.prefix : null} label={binaryUi.sheet} provenance="accepted" />
          </section>
        )}
        {done && <div className="ng-bin-result" data-provenance="accepted" {...(ex.result?.ok ? { 'data-evidence': 'current' } : {})}>
          <AddressRuler {...rulerWith(task.ip, task.prefix, addressOf(accepted[2]), addressOf(accepted[3]))} />
          <p><b>{binaryUi.result({ network: addressOf(accepted[2]), broadcast: addressOf(accepted[3]) })}</b></p>
        </div>}
        <ol className="ng-bin-steps" aria-label={binaryUi.stepsLabel}>
          {binaryUi.steps.map((name, s) => {
            const now = s === step && !ex.finished && !accepted[s];
            return (
              <li key={s} className={accepted[s] ? 'is-done' : now ? 'is-current' : undefined} aria-current={now ? 'step' : undefined}
                {...(stepEvidence === s ? { 'data-evidence': 'current' } : {})}>
                <span className="ng-bin-step-mark" aria-hidden="true">{accepted[s] ? '✓' : s + 1}</span>
                <span>{name}</span>
                {accepted[s] && <span className="ng-sr-only"> — {binaryUi.stepDone}</span>}
              </li>
            );
          })}
        </ol>
        {!ex.finished && <div className="ng-bin-now">
          <p className="ng-bin-question">{l1 ? l1.question : binaryUi.questions[step]({ prefix: task.prefix })}</p>
          {/* How the row is entered, in this mode: plain text, describing each octet's toggles or each field (V4); level 1: the action line. */}
          {l1 ? <ActionLine id={helpId}>{l1.action}</ActionLine> : <p className="ng-bin-help" id={helpId}>{place.text ? binaryUi.helpText : binaryUi.helpToggle}</p>}
          <div {...(rowEvidence ? { 'data-evidence': 'current' } : {})}>
            <BitRowInput
              key={`${ex.key}|${step}`}
              row={binaryUi.rows[step]} cells={cells} onChange={edit} onEnter={submit} onNotice={notice}
              marks={marks.map(mark => (mark ? 'wrong' : null))}
              messages={marks.map(mark => (mark && mark.target !== null && mark.target !== undefined ? binaryUi.wrongOctet(mark) : null))}
              given={given} band={l1?.givenBand ?? null} evidence={evidenceOctet}
              line={maskDone ? task.prefix : null} decimals={step === 0 ? task.ip.split('.').map(Number) : level === 1 ? givenDecimals : null}
              text={place.text} describedBy={helpId} focusRef={focusRow}
            />
          </div>
          <button type="button" className="ng-bin-mode" onClick={() => setPlace({ text: !place.text })}>
            {place.text ? binaryUi.toggleMode : binaryUi.textMode}
          </button>
        </div>}
      </>}
      help={<HelpPanel
        taskKey={ex.key}
        stepKey={step}
        check={ex.finished ? null : { onCheck: submit }}
        verdict={verdict}
        stale={stale}
        hints={{ texts: hintTexts, shown, onMore: moreHints }}
        reveal={{ revealed: session.revealed, onReveal: ex.reveal, render: answerText }}
        next={{ onNext: another }}
      />}
    />
  );
}
