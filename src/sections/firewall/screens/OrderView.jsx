// «Упорядкуй правила» (FW-2 spec v1 with its v2 must-fixes B1–B4): the
// home router's filter rules in a shuffled order; the learner puts them in
// a working order. An order passes when every packet gets the same verdict
// as the policy intends and every rule gets packets (logic/order.js).
//
// Two levels: «Лише до роутера» (the five input rules) and «Увесь фільтр»
// (all nine, input and forward in one list, as RouterOS shows them).
//
// One decision at a time:
//   - the first view: the task and its goal in a few short lines, the
//     diagram, and the list (ReorderList: ≡ and ↑ ↓, keyboard grab);
//   - «Перевірити» gives one finding: a packet whose fate changed (its card,
//     «має: … · у тебе: …», and «Показати шлях пакета», which lays FW-1's
//     walk over the learner's own rows), or one rule that never fires. Only
//     the rule(s) named get «• Ще ні». Any reorder clears the finding, the
//     marks and the walk (order-state.js);
//   - three hints (the second checks the list if it wasn't and opens a
//     packet's walk; its words follow the finding), «Показати відповідь»
//     (one correct order, marked assisted, in a separate list: the
//     learner's list stays), and after success «Чому так» and the learner's
//     own order as a RouterOS script (CopyBlock), in the verdict's detail.
//
// Round 4 (spec A1, v2 §0: the second reference screen): the check row, the
// verdict, the hints and the reveal are one HelpPanel next to the list (a
// long board: before the list when it is taller than half the viewport,
// else under it; after a flagged row when they can't all fit). The failing
// packet's card, «має · у тебе» and the walk toggle stay open with the
// verdict (summaryNode: evidence the decision needs). The rule the verdict
// names carries data-evidence="current" (hint 1, before any check: the rule
// it names). A reorder after a check keeps that verdict, dimmed («до змін»),
// and marks the edited row, so the panel anchors right after it.
// «Далі →» (a new shuffle) is the primary button once the task is solved or
// revealed; «Перевірити» stays for checking further edits; before that it is
// a quiet skip (stage-1 decision Q6).
//
// Round 4 stage 2b (spec F2): a rule that never gets its packets is said in
// words with the rule that hid it («правило 3 (ICMP) пропустило пакет
// раніше, тому правило 2 (invalid) його не побачило»), both marked «Ще ні»
// and distinct from a wrong outcome («має · у тебе»); the chains are grouped
// by a coloured edge per chain and a divider where the chain changes, inside
// the one editable list; after a reveal the learner's list is labelled
// «Твій порядок», so it reads apart from the reference. The levels carry a
// quiet ✓ (DoneMark) once earned.
//
// State: the lifecycle (order-state.js: the answer, the result, the walk,
// hints, reveal) lives in the instance's view (`view.orderState`), so
// leaving and coming back restores it; the shared session gets every check,
// hint and the reveal through useExercise; the session's hint count is the
// one counter (the transition is driven from it). `view.orderHint2` keeps the
// finding hint 2 was opened for. The place `firewall-order` keeps the level
// and each level's seed.
//
// Leaks (B4): before the reveal nothing on screen depends on the reference
// order. Rule ids are React keys only; rows show their chain, action,
// conditions and description; ReorderList numbers the learner's positions.
// The reference is read only through useExercise's reveal path.
//
// Layout by the screen's own width (order.css). The page is the one
// vertical scroller (spec A2): no inner scroll box.
//   - two columns (≥ 1160): the heading, the task and the diagram (at its
//     readable 12 px text) on the left, sticky, one screen high; on the
//     right the list with its panel, at their natural height;
//   - split (900–1159, round 5, 5b-2 B): the heading and the task (with
//     the router's addresses as a line) on the left, the list on the right,
//     the whole diagram under both; nothing sticky;
//   - one column (< 900): the same order, the diagram last.
//
// Round 5 (5b-2 A, B): the action line over the list with the folded worked
// example under it (its own two-rule policy on reserved addresses); each
// row leads with its description, the native rule under it; the task says
// that order matters within each chain and glosses ICMP where it first
// appears; hint 1 follows the last checked packet (logic hintsForState) and
// a shadowing shows its packet and walk (logic witnessFor), as a changed
// outcome does.
// The zoom bar follows spec A3 (only when the diagram doesn't fit).
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { forRecord } from '../logic/order.js';
import { hintsForState, initialState, transition } from '../logic/order-state.js';
import { orderExample } from '../logic/examples.js';
import { useExercise } from '../../../ui/useExercise.js';
import { usePlace, usePref } from '../../../ui/useStore.js';
import { BarControls, SheetChoice } from '../../../ui/BarSlot.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import HelpPanel, { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import { useReducedMotion } from '../../../ui/motion.js';
import DoneMark, { earnedBy } from '../../../ui/components/DoneMark.jsx';
import { useStore } from '../../../ui/useStore.js';
import ReorderList from '../../../ui/components/ReorderList.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';
import ActionLine from '../../../ui/components/ActionLine.jsx';
import WorkedExample from '../../../ui/components/WorkedExample.jsx';
import CopyBlock from '../../../ui/components/CopyBlock.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import DiagramExpand, { ExpandButton, useDiagramExpand, useTextOpen } from '../../../ui/topology/DiagramExpand.jsx';
import { isPhoneNow } from '../../../ui/phone.js';
import FirewallDiagram from './FirewallDiagram.jsx';
import PacketCard from './PacketCard.jsx';
import { cardLines, natRuleOf } from './walkView.js';
import { nextSeed } from './round.js';
import { TIPS, hint2Text, orderRows, orderScene, orderTextSections, quoted, taskLines, walkRows } from './orderView.js';
import { comprehension, orderText, orderUi, t, ui } from '../uk.js';
import '../../../ui/tokens.css';
import './firewall.css';
import './order.css';

/** The layout for the screen's width (the thresholds in order.css): two
 * columns once the diagram's column can keep its 12 px text beside the list;
 * below that (round 5, 5b-2 B: 1000 × 700) the task beside the list and the
 * diagram under both, so the list starts at the top; one column when narrower. */
export const orderLayoutFor = width => (width >= 1160 ? 'two' : width >= 900 ? 'split' : 'one');

/** The layout, and the scrolling area's height in two columns (the sticky
 * left column is one screen high: --ng-fwo-screen). */
function useLayout(ref) {
  const [layout, setLayout] = useState(() => orderLayoutFor(typeof window !== 'undefined' ? window.innerWidth : 1280));
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const screen = el.closest('.ng-screen, .ng-standalone');
    const measure = () => {
      setLayout(orderLayoutFor(el.clientWidth));
      if (screen) el.style.setProperty('--ng-fwo-screen', `${screen.clientHeight}px`);
    };
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    if (screen) observer.observe(screen);
    return () => observer.disconnect();
  }, []);
  return layout;
}

/** The worked example (round 5, 5b-2 A): one fixed policy on reserved addresses, never this task's;
 * each rule a line, its values after their names («Ланцюжок: input · Дія й умови: accept · …»). */
const EXAMPLE = orderExample();
const EXAMPLE_LINES = EXAMPLE.rows.map(row => row.map((cell, i) => `${EXAMPLE.columns[i]}: ${cell}`).join(' · '));

/** The goal line that first says «ICMP» carries its gloss (5b-2 B); the port-forward line is a given (data-nat). */
function GoalLines({ goals, nat }) {
  const glossed = goals.findIndex(line => /\bICMP\b/.test(line));
  const natText = nat ? `${nat.address}:${nat.port}` : null;
  return goals.map((line, i) => (
    <p key={line} {...(natText && line.includes(natText) ? { 'data-nat': '' } : {})}>
      {line}{i === glossed && <> <span className="ng-fwo-gloss">{`${comprehension.icmpGloss}.`}</span></>}
    </p>
  ));
}

const HINTS = 3;

/** A rule's chain as a pill: input and forward differ in colour and word. */
function Chain({ chain }) {
  return <span className={`ng-fwo-chain is-${chain}`}>{chain}</span>;
}

/** One row's content (between ReorderList's handle and its ↑ ↓), in two
 * lines (round 5, 5b-2 B): first the chain, the rule's description (its
 * purpose: R2; FW-2 keeps the full description, which also names the rule
 * in its feedback, the one exemption from the one-line cap), «• Ще ні» when
 * the finding names this rule and, with the walk open, this packet's
 * outcome after it (on its own line when the row is marked too; never in
 * its place); then the native rule, its action
 * and conditions (FW-1's chips), monospace and smaller. */
function RuleBody({ row, marked, outcome, current }) {
  return (
    <div className="ng-fwo-rule" data-term="" {...(current ? { 'data-evidence': 'current' } : {})}>
      <span className="ng-fwo-line">
        <Chain chain={row.chain} />
        <Purpose className="ng-fwo-desc">{row.description}</Purpose>
        {marked && <> <span className="ng-fwo-mark">{typeof marked === 'string' ? marked : orderUi.mark}</span></>}
        {outcome && !marked && <> <span className="ng-fwo-out">{outcome.text}</span></>}
      </span>
      {/* A marked row's outcome on a line of its own: two statements, never run together (repair v1, Fable 2). */}
      {outcome && marked && <span className="ng-fwo-line"><span className="ng-fwo-out">{outcome.text}</span></span>}
      <span className="ng-fwo-native">
        <span className="ng-fw-action">{row.action}</span>
        <span className="ng-fw-conds">
          {row.chips.map((chip, i) => <span key={i} className="ng-fw-cond" title={chip.title}>{chip.text}</span>)}
        </span>
      </span>
    </div>
  );
}

/** @param {{ bank: { orderRecords: object[], resolveOrderRecord: Function } }} props */
export default function OrderView({ bank }) {
  const record = useMemo(() => bank.resolveOrderRecord(bank.orderRecords[0]), [bank]);
  // The record-bound adapter (logic/order.js forRecord), held outside rendering.
  const logic = useMemo(() => forRecord(record), [record]);
  const [themeName] = usePref('theme');
  const [place, setPlace] = usePlace('firewall-order', () => ({
    variantId: record.variants[0].id,
    seeds: Object.fromEntries(record.variants.map(v => [v.id, nextSeed()])),
  }));
  const variant = record.variants.find(v => v.id === place.variantId) ?? record.variants[0];
  const seed = place.seeds?.[variant.id] ?? 1;
  const ex = useExercise(logic, record, { variantId: variant.id, seed });
  const { task, session } = ex;
  const { state: store } = useStore();
  const earned = earnedBy(store.instances, identity => (identity.exerciseId === logic.id ? identity.variantId : null));
  const stored = ex.view.orderState;
  const state = stored?.instanceKey === task.instanceKey ? stored : initialState(task);

  const root = useRef(null);
  const layout = useLayout(root);
  const listHeading = useRef(null);
  const listRef = useRef(null);
  const textButton = useRef(null);
  const freshList = useRef(false);
  // Round 6 (P2): «Текстом» starts open on a phone; the full-screen diagram has a zoom of its own.
  const [textOpen, setTextOpen] = useTextOpen();
  const expand = useDiagramExpand({ zoom: ex.view.zoom, onZoom: zoom => ex.setView({ zoom }) });

  const rows = useMemo(() => orderRows(task, state.answer.order), [task, state.answer.order]);
  // A reveal sets aside the check before it: no row mark, «Ще ні» or packet
  // from it stays beside the answer; a check after the reveal shows as usual.
  const revealedAt = ex.view.orderRevealedAt?.instanceKey === task.instanceKey ? ex.view.orderRevealedAt.presses : null;
  const fresh = presses => !session.revealed || (revealedAt !== null && presses > revealedAt);
  const result = fresh(ex.presses) ? state.result : null;
  // A reorder clears the result (order-state.js); the verdict it gave stays, dimmed («до змін»).
  const storedStale = ex.view.orderStale?.instanceKey === task.instanceKey ? ex.view.orderStale : null;
  const staleView = storedStale && fresh(storedStale.presses ?? 0) ? storedStale : null;
  const stale = !result && Boolean(staleView);
  const finding = result?.feedback ?? null;
  const solved = Boolean(result?.ok);
  // The verdict for the panel: the current result, or the one an edit made stale.
  const shown = result ?? staleView?.result ?? null;
  const shownFinding = shown?.feedback ?? null;
  // The finding's packet (round 5, 5b-2 B): a changed outcome's card, or the
  // packet a hidden rule never gets (a shadowing). Logic's witnessFor walks
  // it through the order that was checked (an edit's stale verdict keeps its
  // own), so a walk never lies on rows that changed since.
  const shownOrder = result ? state.answer.order : staleView?.order ?? null;
  const shownWitness = useMemo(() => (shownFinding && shownOrder && ['order-verdict', 'order-dead'].includes(shownFinding.code)
    ? logic.witnessFor(task, shownOrder, shownFinding) : null), [logic, task, shownFinding, shownOrder]);
  const witness = result ? shownWitness : null;
  const walkIn = witness && state.walkOpen ? witness : null;
  const walk = useMemo(() => (walkIn ? walkRows(walkIn) : null), [walkIn]);
  const marked = new Set(finding?.ruleIds ?? []);
  /** A rule's mark: a shadowing names both roles (the earlier one caught the packet, the later one never gets it), else «• Ще ні». */
  const markOf = id => (!marked.has(id) ? false
    : finding?.code === 'order-dead' ? (id === finding.blockerId ? orderUi.markBlocker : orderUi.markHidden) : true);
  const nat = useMemo(() => (variant.id === 'all' ? natRuleOf(task.topology, variant.cards) : null), [task, variant]);
  const card = witness?.card ?? null;
  const scene = useMemo(() => orderScene({ topology: task.topology, nat, card, walkIn }), [task, nat, card, walkIn]);
  const sections = useMemo(() => orderTextSections({ topology: task.topology, nat, card, walkIn }), [task, nat, card, walkIn]);
  // The working order's script; after an edit, the order that was checked (under «до змін», folded).
  const scriptOrder = solved ? state.answer.order : staleView?.result?.ok ? staleView.order ?? null : null;
  const script = useMemo(() => (scriptOrder ? logic.acceptedScript(task, { order: scriptOrder }) : null), [scriptOrder, logic, task]);
  const { sentence, goals } = taskLines(task);
  const descriptionOf = id => quoted(rows.find(r => r.id === id)?.description ?? '');
  /** A rule that never gets its packets, in words with the rule that hid it (spec F2). */
  const deadText = finding => (finding.shadow
    ? orderText('order-shadowed', { ...finding.shadow, rule: quoted(t(finding.shadow.ruleDescriptionCode)), blocker: quoted(t(finding.shadow.blockerDescriptionCode)) })
    : orderText('order-dead', { rule: descriptionOf(finding.ruleId), blocker: descriptionOf(finding.blockerId) }));
  // The hints (round 5, 5b-2 B): hint 1 follows the last checked packet
  // («Пакет … зупинився на правилі N»; before any check it asks for one;
  // after a reorder it stays with the order that was checked). A solved
  // list needs no new hint (the panel hides the button); the hints already
  // opened stay readable, rung 1 in words true for a list that passed.
  const ladder = useMemo(() => hintsForState(task, state), [task, state]);
  const hintTexts = (ladder.length ? ladder : ex.hints()).map(h => (h.rung === 1 ? (ladder.length ? h.text : orderUi.hintDone)
    : h.rung === 2 ? hint2Text(ex.view.orderHint2) : orderText(h.code)));
  const hintWitness = ladder[0]?.witness ?? null;
  // The rule the current message is about: the finding's (a rule that never
  // fires, or the one that decided the packet), else the rule hint 1's
  // packet stopped at (none before a check).
  const evidenceId = solved ? null
    : stale ? staleView.moved ?? null
    : finding?.code === 'order-dead' ? finding.ruleId
      : finding ? finding.ruleIds?.[0] ?? null
        : session.hintIndex > 0 && !session.revealed && hintWitness && hintWitness.walk.decidedBy !== 'chain-end' ? hintWitness.walk.decidedBy : null;

  const save = (next, extra = {}) => { if (next !== state || Object.keys(extra).length) ex.setView({ orderState: next, ...extra }); };
  /** The rule a reorder moved (ReorderList says; else a guess from the orders: the one that left or arrived first). */
  const movedOf = (before, after) => {
    const i = before.findIndex((id, k) => id !== after[k]);
    return i < 0 ? null : after[i] === before[i + 1] ? before[i] : after[i];
  };
  const onReorder = (order, movedId) => {
    const next = transition(logic, task, state, { type: 'order', order });
    if (next === state) return;
    const moved = movedId ?? movedOf(state.answer.order, order);
    // The verdict goes stale; the edited row is its evidence (the panel anchors after it).
    if (result) save(next, { orderStale: { instanceKey: task.instanceKey, result, presses: ex.presses, order: [...state.answer.order], moved } });
    else if (staleView) save(next, { orderStale: { ...staleView, moved } });
    else save(next);
  };
  function onCheck() {
    const next = transition(logic, task, state, { type: 'check' });
    ex.check(next.answer, { result: next.result });
    save(next, { orderStale: null });
  }
  /** «Показати шлях пакета»: the walk's outcomes make the rows above the panel taller; its toggle and words stay in view. */
  const walkToggled = useRef(false);
  const reduced = useReducedMotion();
  const onWalk = () => { walkToggled.current = true; save(transition(logic, task, state, { type: 'walk' })); };
  useEffect(() => {
    if (!walkToggled.current) return;
    walkToggled.current = false;
    const current = root.current?.querySelector('[data-help-current]');
    // Round 6 repair: on a phone with several rules marked the list stays whole (HelpPanel), so the walk is
    // shown where it is drawn: on the rows, from the first marked one.
    const marked = root.current?.querySelectorAll('.ng-fwo-list .is-marked') ?? [];
    if (isPhoneNow() && marked.length > 1) bringIntoView([marked[0]], reduced ? 'auto' : 'smooth');
    else if (current) bringIntoView([current], reduced ? 'auto' : 'smooth');
  }, [state.walkOpen]);
  /** A hint, counted by the session (the one counter, which drives the
   * transition); the second checks the list first if it wasn't, opens that
   * packet's walk, and keeps which finding its words are about. */
  function onHint() {
    if (session.hintIndex >= HINTS) return;
    const rung = session.hintIndex + 1;
    ex.hint(HINTS);
    const next = transition(logic, task, { ...state, hintIndex: session.hintIndex }, { type: 'hint' });
    const checked = !state.result && next.result;
    if (checked) ex.check(next.answer, { result: next.result });
    save(next, {
      ...(rung === 2 ? { orderHint2: next.result?.feedback?.code ?? (next.result?.ok ? 'order-ok' : null) } : {}),
      ...(checked ? { orderStale: null } : {}),
    });
  }
  function onReveal() {
    ex.reveal();
    save(transition(logic, task, state, { type: 'reveal' }), { orderRevealedAt: { instanceKey: task.instanceKey, presses: ex.presses } });
  }
  /** «Далі →»: a new shuffle of this level; the list's heading takes the focus. */
  function onAnother() {
    freshList.current = true;
    setTextOpen(isPhoneNow());   // a new list: «Текстом» as it starts (open on a phone)
    setPlace({ seeds: { ...place.seeds, [variant.id]: nextSeed(seed) } });
  }
  const chooseLevel = id => { setTextOpen(isPhoneNow()); setPlace({ variantId: id }); };
  function closeText() {
    setTextOpen(false);
    textButton.current?.focus();
  }

  useEffect(() => {
    if (!freshList.current) return;
    freshList.current = false;
    listHeading.current?.focus();
  }, [task.instanceKey]);

  const shownVerdict = shownFinding?.code === 'order-verdict' ? shownFinding : null;
  const panelVerdict = !shown ? null : {
    tone: shown.ok ? 'ok' : 'no',
    scope: 'task',
    stamp: ex.presses,
    summary: shown.ok ? orderText('order-ok')
      : shownFinding?.code === 'order-dead' ? deadText(shownFinding)
        : orderText(shownFinding?.code ?? 'order-invalid'),
    // The failing packet, its fate and its walk: evidence the decision needs, open beside the summary.
    summaryNode: shownWitness ? (
      <div className="ng-fwo-finding" {...(!stale && shownVerdict && !shownVerdict.ruleIds?.length ? { 'data-evidence': 'current' } : {})}>
        <PacketCard lines={cardLines(task, shownWitness.card)} label={orderUi.packet} />
        {shownVerdict && <p className="ng-fwo-fate">{orderUi.fate({ expected: shownVerdict.expected, actual: shownVerdict.actual })}</p>}
        {!stale && (
          <button type="button" className="ng-fw-btn ng-fwo-walk" aria-expanded={state.walkOpen} aria-controls="ng-fwo-list" onClick={onWalk}>
            {state.walkOpen ? orderUi.walkHide : orderUi.walkShow} <span aria-hidden="true">{state.walkOpen ? '▲' : '▼'}</span>
          </button>
        )}
      </div>
    ) : null,
    // After success, open (spec A1): why, and the learner's own order as a
    // script. After an edit both stay (the order that was checked), folded
    // behind «Детальніше» under the dimmed «до змін» verdict.
    detail: shown.ok ? (
      <section className="ng-fwo-result" aria-label={orderUi.resultLabel}>
        <h2 className="ng-fw-caption">{orderUi.tipsHeading}</h2>
        <ul className="ng-fwo-tips">
          {TIPS[variant.id].map(key => <li key={key}>{orderUi.tips[key]}</li>)}
        </ul>
        {script && <>
          <h2 className="ng-fw-caption">{orderText(script.labelCode)}</h2>
          <CopyBlock text={script.script} what={orderUi.copyWhat} />
        </>}
      </section>
    ) : null,
  };

  const stage = (
    <section className="ng-fwo-stage" aria-label={ui.diagramLabel}>
      <DiagramExpand expand={expand}>
      <FirewallDiagram scene={scene} topology={task.topology} zoom={expand.zoom} onZoom={expand.onZoom} viewKey={ex.key}
        covered={expand.covered(textOpen)}
        tools={<><TextEquivalentButton buttonRef={textButton} id="ng-fwo-text" label={ui.textButton} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(sections)} /><ExpandButton expand={expand} /></>}
        overlays={<TextEquivalent id="ng-fwo-text" title={orderUi.textTitle} sections={sections} open={expand.covered(textOpen)} onClose={closeText} />} />
      </DiagramExpand>
    </section>
  );

  // The chains grouped inside the one list: an edge per chain, a divider where it changes.
  const rowClass = (row, index) => {
    const outcome = walk?.byId[row.id];
    const change = index > 0 && rows[index - 1]?.chain !== row.chain;
    return [`is-chain-${row.chain}`, change && 'is-chain-change', marked.has(row.id) && 'is-marked', outcome && `is-walk is-walk-${outcome.state}`].filter(Boolean).join(' ');
  };

  return (
    <div ref={root} className={`ng-fw ng-fwo${solved ? ' is-solved' : ''}`} data-theme={themeName} data-layout={layout}>
      <BarControls>
        <div className="ng-fw-controls">
          <span className="ng-fw-syntax">{ui.syntaxLabel}</span>
        </div>
      </BarControls>

      <div className="ng-fwo-side">
        <header className="ng-fw-head">
          <h1 className="ng-fw-h1">{ui.heading}</h1>
          <SheetChoice stepper label={orderUi.level} value={variant.id} onChange={chooseLevel} className="ng-fw-variants"
            options={record.variants.map(v => ({ value: v.id, label: <>{v.title}<DoneMark done={earned.has(v.id)} /></>, step: v.title }))} />
        </header>
        <div className="ng-fw-intro ng-fwo-intro">
          <p className="ng-fwo-task">{sentence}</p>
          <div className="ng-fwo-goal"><GoalLines goals={goals} nat={nat} /></div>
          {/* Where the list holds both chains: the order matters within each one only. */}
          {new Set(task.rules.map(r => r.chain)).size > 1 && <p className="ng-fwo-ordering">{comprehension.ordering}</p>}
          {/* Below two columns (round 5, 5b-2 B): the diagram is after the list, so the router's own addresses are a line here. */}
          {layout !== 'two' && (
            <p className="ng-fwo-strip">{`${ui.routerAddresses}: `}{task.topology.router.interfaces.map((i, k) => (
              // A line breaks only between the pairs (repair v1, Fable 3).
              <Fragment key={i.id}>{k > 0 && ' · '}<span className="ng-fwo-pair">{`${i.id} ${i.address}`}</span></Fragment>
            ))}</p>
          )}
        </div>
        {layout === 'two' && stage}
      </div>

      <section className="ng-fwo-work" aria-label={orderUi.list}>
        <div id="ng-fwo-list" ref={listRef} className="ng-fwo-list">
          {/* A passing list says so in the same place (repair v1, Fable 3); an edit brings the action back. */}
          <ActionLine id="ng-fwo-action">{solved ? orderUi.actionDone : orderUi.action}</ActionLine>
          <WorkedExample taskKey={task.instanceKey} context={EXAMPLE.context} rows={EXAMPLE_LINES} />
          <h2 id="ng-fwo-policy" ref={listHeading} tabIndex={-1} className="ng-fwo-policy">{session.revealed ? orderUi.yours : quoted(orderUi.policy)}</h2>
          <ReorderList items={rows} label={orderUi.list} name={row => quoted(row.description)} onReorder={onReorder}
            rowClassName={rowClass} showHelp={false}>
            {row => <RuleBody row={row} marked={markOf(row.id)} outcome={walk?.byId[row.id] ?? null} current={row.id === evidenceId} />}
          </ReorderList>
          {walk?.end && <p className="ng-fwo-end">{ui.chainEnd(walk.end.chain)} — {walk.end.text}</p>}
          {walk?.assumptions.map(line => <p key={line} className="ng-fw-note">{line}</p>)}
        </div>
        <HelpPanel
          taskKey={task.instanceKey}
          boardRef={listRef}
          placement="after"
          check={{ label: orderUi.check, onCheck }}
          verdict={panelVerdict}
          stale={stale}
          hints={{ texts: hintTexts, shown: session.hintIndex, onMore: onHint }}
          reveal={{
            revealed: session.revealed, onReveal, label: orderUi.revealButton, heading: orderText('order-reveal-label'),
            render: () => ex.solution && (
              <ol className="ng-fwo-answer">
                {orderRows(task, ex.solution.order).map(row => (
                  <li key={row.id}><Chain chain={row.chain} /> <span className="ng-fw-action">{row.action}</span> {row.description}</li>
                ))}
              </ol>
            ),
          }}
          next={{ onNext: onAnother }}
        />
      </section>

      {layout !== 'two' && stage}
    </div>
  );
}
