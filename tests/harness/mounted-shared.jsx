// Bundled by tools/test.sh into .test-bundles/harness/mounted-shared.mjs.
// Round 4 stage 1 (spec A): the shared parts mounted with react-dom/client
// in tests/helpers/mini-dom.mjs (run by tests/helpers/mounted-shared.mjs, in
// its own process): HelpPanel, MoreMenu, Aside, DoneMark, and the contract
// fixtures (spec A v2 §0) for the flows the two reference screens don't
// have, so stage 2b adopts a panel whose API already covers them:
//   - RowCheckFixture: a per-row check announcing through the panel;
//   - PredictionFixture: a committed prediction (locked inputs, «Далі →»
//     primary, no check button);
//   - TabbedFormFixture: a device form in tabs, the evidence on another tab
//     (the panel's `evidence()` opens it first);
//   - RecallFixture: recall lines with their own Enter check and live
//     region, beside the panel's own check;
//   - BoardFixture: a long board (the panel's home before or after it, and
//     anchored after a late flagged row).
// Round 5 stage 5b-2: WorkedExample on a screen (ExampleScreen), beside the
// screen's first-visit folding.
import { createRoot } from 'react-dom/client';
import { act, useRef, useState } from 'react';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useStore } from '../../src/ui/useStore.js';
import HelpPanel from '../../src/ui/components/HelpPanel.jsx';
import MoreMenu from '../../src/ui/components/MoreMenu.jsx';
import Aside, { useAsideFold } from '../../src/ui/components/Aside.jsx';
import DoneMark from '../../src/ui/components/DoneMark.jsx';
import ActionLine from '../../src/ui/components/ActionLine.jsx';
import WorkedExample from '../../src/ui/components/WorkedExample.jsx';

export { act, HelpPanel, MoreMenu, Aside, DoneMark, WorkedExample };

function mountElement(element, parent = document.body) {
  const container = document.createElement('div');
  parent.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(element));
  return {
    container,
    render(next) { act(() => root.render(next)); },
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); },
  };
}

/** HelpPanel alone; `set(props)` renders it again with new props (a screen's next render). */
export function mountPanel(props, parent) {
  const m = mountElement(<div className="fixture"><input className="answer" aria-label="Відповідь" /><HelpPanel {...props} /></div>, parent);
  return { ...m, set: next => m.render(<div className="fixture"><input className="answer" aria-label="Відповідь" /><HelpPanel {...next} /></div>) };
}

/** Any element inside the app store (Aside needs it); `store` holds the latest { state, dispatch }. */
export function mountInStore(element) {
  const store = {};
  function Expose() { Object.assign(store, useStore()); return null; }
  return { store, ...mountElement(<StoreProvider><Expose />{element}</StoreProvider>) };
}

export const mount = mountElement;

// ── Contract fixtures ────────────────────────────────────────────────

const ROWS = ['10.0.0.0/24', '10.0.1.0/24', '10.0.2.0/24'];

/** Per-row checks (routing's rows): each row's own «Перевірити рядок»; its verdict goes through the panel (scope 'part'). */
export function RowCheckFixture() {
  const [values, setValues] = useState(['', '', '']);
  const [result, setResult] = useState(null); // { row, ok, stamp }
  const stamp = result?.stamp ?? 0;
  const checkRow = row => setResult({ row, ok: values[row] === ROWS[row], stamp: stamp + 1 });
  const whole = () => setResult({ row: null, ok: values.every((v, i) => v === ROWS[i]), stamp: stamp + 1 });
  const verdict = !result ? null : result.row === null
    ? { tone: result.ok ? 'ok' : 'no', scope: 'task', summary: result.ok ? 'Усі маршрути правильні.' : 'Не всі маршрути правильні.', stamp }
    : { tone: result.ok ? 'ok' : 'no', scope: 'part', summary: result.ok ? `Рядок ${result.row + 1} правильний.` : `Рядок ${result.row + 1}: мережа не та.`, stamp };
  return (
    <div className="fixture-rows">
      <ol>
        {values.map((value, i) => (
          <li key={i} className="row" {...(result && result.row === i && !result.ok ? { 'data-evidence': 'current' } : {})}>
            <input aria-label={`Рядок ${i + 1}`} value={value} onChange={e => { const next = [...values]; next[i] = e.target.value; setValues(next); }} />
            <button type="button" className="row-check" onClick={() => checkRow(i)}>Перевірити рядок</button>
          </li>
        ))}
      </ol>
      <HelpPanel taskKey="rows" check={{ label: 'Перевірити мережу', onCheck: whole }} verdict={verdict} />
    </div>
  );
}

/** A committed prediction (FW-1, VLAN-1): choose, commit; then the inputs lock, no check, «Далі →» primary. */
export function PredictionFixture({ onNext }) {
  const [choice, setChoice] = useState(null);
  const [committed, setCommitted] = useState(null);
  const verdict = committed && { tone: committed === 'drop' ? 'ok' : 'no', scope: 'task', summary: committed === 'drop' ? 'Так: пакет відкинуто.' : 'Ні: пакет відкинуто.', stamp: 1 };
  return (
    <div className="fixture-predict">
      <div role="radiogroup" aria-label="Доля пакета">
        {['accept', 'drop'].map(v => (
          <button key={v} type="button" role="radio" aria-checked={choice === v} disabled={Boolean(committed)} className={`choice is-${v}`} onClick={() => setChoice(v)}>{v}</button>
        ))}
      </div>
      <HelpPanel taskKey="predict" check={committed ? null : { onCheck: () => setCommitted(choice), disabled: !choice }} verdict={verdict}
        next={committed ? { onNext } : null} />
    </div>
  );
}

/** A tabbed device form (VLAN): the check flags a field on SW2 while SW1 is shown; `evidence()` opens SW2 first. */
export function TabbedFormFixture({ onEvidence }) {
  const [tab, setTab] = useState('SW1');
  const [result, setResult] = useState(null);
  const evidence = () => { onEvidence?.(); if (result?.device) setTab(result.device); };
  return (
    <div className="fixture-tabs">
      <div role="tablist">
        {['SW1', 'SW2'].map(d => <button key={d} type="button" role="tab" aria-selected={tab === d} className={`tab tab-${d}`} onClick={() => setTab(d)}>{d}</button>)}
      </div>
      <div role="tabpanel" className={`panel-${tab}`}>
        <input aria-label={`${tab}: VLAN порту`} className={`field field-${tab}`} {...(result?.device === tab ? { 'data-evidence': 'current', 'aria-invalid': 'true' } : {})} />
      </div>
      <HelpPanel taskKey="tabs" check={{ onCheck: () => setResult({ device: 'SW2', stamp: (result?.stamp ?? 0) + 1 }) }}
        verdict={result && { tone: 'no', scope: 'task', summary: 'Дивись SW2: порт fa0/7 не в тому VLAN.', stamp: result.stamp }} evidence={evidence} />
    </div>
  );
}

/** Recall lines (setup): each line's Enter checks that line only, with its own live line; the panel checks the whole. */
export function RecallFixture({ onWhole }) {
  const want = ['enable', 'configure terminal'];
  const [lines, setLines] = useState(['', '']);
  const [said, setSaid] = useState(['', '']);
  const [result, setResult] = useState(null);
  const lineKey = (i, e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    const next = [...said]; next[i] = lines[i] === want[i] ? 'Так.' : 'Ще ні.'; setSaid(next);
  };
  return (
    <div className="fixture-recall">
      {lines.map((v, i) => (
        <div key={i} className="recall-line">
          <input aria-label={`Команда ${i + 1}`} value={v} onKeyDown={e => lineKey(i, e)} onChange={e => { const n = [...lines]; n[i] = e.target.value; setLines(n); }} />
          <p className="recall-said" aria-live="polite">{said[i]}</p>
        </div>
      ))}
      <HelpPanel taskKey="recall" check={{ onCheck: () => { onWhole?.(); setResult({ ok: lines.every((l, i) => l === want[i]), stamp: (result?.stamp ?? 0) + 1 }); } }}
        verdict={result && { tone: result.ok ? 'ok' : 'no', summary: result.ok ? 'Усе згадано.' : 'Не всі рядки.', stamp: result.stamp }} />
    </div>
  );
}

/** A board of `rows` rows with the panel next to it; `flag` marks one row as
 * the verdict's evidence after a check. `lateEvidence`: the mark appears only
 * once the panel's `evidence()` ran (a tab or fold the screen must open first). */
export function BoardFixture({ rows = 10, flag = null, lateEvidence = false, edit = null, nodeEvidence = false, grow = 0, stage = null }) {
  const board = useRef(null);
  const [step, setStep] = useState(1);
  const [task, setTask] = useState(0);
  const [edited, setEdited] = useState(false);
  const [flagGone, setFlagGone] = useState(false);
  const [stamp, setStamp] = useState(0);
  const [hints, setHints] = useState(0);
  const [opened, setOpened] = useState(!lateEvidence);
  const [revealed, setRevealed] = useState(false);
  const checked = stamp > 0 && opened;
  return (
    <section className="fixture-board">
      <ol ref={board} className="board">
        {Array.from({ length: rows + (stamp > 0 ? grow : 0) + (stage && step > 1 ? stage.rows : 0) }, (_, i) => (
          <li key={i} className={`row row-${i}`}><span {...((checked && !edited && !flagGone && flag === i) || (edited && edit === i) ? { 'data-evidence': 'current' } : {})}>{`Правило ${i + 1}`}</span></li>
        ))}
      </ol>
      {edit !== null && <button type="button" className="edit" onClick={() => setEdited(true)}>Змінити</button>}
      {nodeEvidence && <button type="button" className="drop-flag" onClick={() => setFlagGone(true)}>Без рядка</button>}
      {stage && <button type="button" className="next-stage" onClick={() => setStep(n => n + 1)}>Наступний етап</button>}
      <HelpPanel taskKey={`board-${task}`} boardRef={board} {...(stage ? { [stage.as ?? 'stepKey']: step } : {})} stale={edited && stamp > 0}
        next={{ onNext: () => { setTask(t => t + 1); setStamp(0); setEdited(false); } }}
        check={{ onCheck: () => { setStamp(s => s + 1); setEdited(false); if (lateEvidence) setOpened(false); } }}
        verdict={stamp > 0 ? { tone: 'no', summary: flag === null ? 'Порядок не працює.' : `Правило ${flag + 1} ніколи не спрацює.`, stamp,
          ...(nodeEvidence ? { summaryNode: <p className="node-card" data-evidence="current">Картка пакета</p> } : {}) } : null}
        hints={{ texts: ['Перша.', 'Друга.', 'Третя.'], shown: hints, onMore: () => setHints(n => n + 1) }}
        reveal={{ revealed, onReveal: () => setRevealed(true), render: () => 'Еталон.' }}
        evidence={lateEvidence ? () => setOpened(true) : undefined} />
    </section>
  );
}

/** Aside on a screen: «Перевірити» (any first check) folds it, as screens do with useAsideFold. */
export function AsideScreen({ screen = 'demo' }) {
  const fold = useAsideFold(screen);
  return (
    <div className="aside-screen">
      <Aside screen={screen} id="keys" title="Як читати схему"><p>Стрілки — шлях пакета.</p></Aside>
      <button type="button" className="screen-check" onClick={fold}>Перевірити</button>
    </div>
  );
}

const FIXTURES = { rows: RowCheckFixture, predict: PredictionFixture, tabs: TabbedFormFixture, recall: RecallFixture, board: BoardFixture };

/** A contract fixture by name, optionally inside `parent` (a scroller). */
export function mountFixture(name, props = {}, parent) {
  const Fixture = FIXTURES[name];
  return mountElement(<Fixture {...props} />, parent);
}

/** The Aside screen in the app store; `remount()` is leaving and coming back (same store). */
export function mountAside(screen = 'demo') {
  const store = {};
  function Expose() { Object.assign(store, useStore()); return null; }
  let show = true;
  const tree = () => <StoreProvider><Expose />{show && <AsideScreen screen={screen} />}</StoreProvider>;
  const m = mountElement(tree());
  return { ...m, store, remount() { show = false; m.render(tree()); show = true; m.render(tree()); } };
}

/** A screen with a WorkedExample under its action line (spec 5b-2 A); «Перевірити» folds the screen's asides. */
export function ExampleScreen({ taskKey, kind = 'table', screen = 'demo' }) {
  const fold = useAsideFold(screen);
  const context = 'R1 → LAN-C 192.0.2.0/24, сусід 198.51.100.2';
  const example = kind === 'lines'
    ? <WorkedExample taskKey={taskKey} context="Роутер Cisco, режим за запрошенням." rows={['show running-config → R1#']} note="Перегляд налаштувань — у привілейованому режимі." />
    : kind === 'drawing'
      ? <WorkedExample taskKey={taskKey} context="198.51.100.77/26"><svg className="ruler" aria-hidden="true"><text>64 · 128</text></svg><p className="ruler-words">Блок 198.51.100.64–127.</p></WorkedExample>
      : <WorkedExample taskKey={taskKey} context={context} head={['Мережа', 'Маска', 'Наступний перехід']} rows={[['192.0.2.0', '255.255.255.0', '198.51.100.2']]} />;
  return (
    <div className="example-screen">
      <ActionLine id="example-act">Заповни перший рядок.</ActionLine>
      {example}
      <input className="answer" aria-label="Мережа" />
      <button type="button" className="screen-check" onClick={fold}>Перевірити</button>
    </div>
  );
}

/** ExampleScreen in the app store; `set(props)` is the screen's next render, `remount()` leaving and coming back. */
export function mountExample(props) {
  const store = {};
  function Expose() { Object.assign(store, useStore()); return null; }
  let show = true, current = props;
  const tree = () => <StoreProvider><Expose />{show && <ExampleScreen {...current} />}</StoreProvider>;
  const m = mountElement(tree());
  return { ...m, store, set(next) { current = next; m.render(tree()); }, remount() { show = false; m.render(tree()); show = true; m.render(tree()); } };
}

/** «⋯» with a button outside it (for outside clicks and Tab). */
export function mountMenu(props) {
  return mountElement(<div className="menu-fixture"><button type="button" className="before">до меню</button><MoreMenu {...props} /><button type="button" className="outside">поза меню</button></div>);
}

/** DoneMark inside a button, as task lists use it. */
export function mountDone(done) {
  return mountElement(<button type="button" className="task">Задача 1<DoneMark done={done} /></button>);
}

/** «⋯» in a header, its disclosures opening in the work area (`disclosureHost`). */
export function mountMenuWithHost(props) {
  function Screen() {
    const host = useRef(null);
    return <div className="screen"><header className="head"><MoreMenu {...props} disclosureHost={host} /></header><main className="work"><div ref={host} className="host" /></main></div>;
  }
  return mountElement(<Screen />);
}
