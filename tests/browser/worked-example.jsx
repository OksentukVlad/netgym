// Bundled for the browser by tests/worked-example.test.mjs (esbuild, in
// memory): WorkedExample on a first view in a real page, with the real CSS,
// for what a server render or the mini DOM can't show: the folded row under
// the action line with the first view's R5 essentials still passing, the
// opened card's look in both themes, and the Tab order skipping its content.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import ExerciseLayout from '../../src/ui/components/ExerciseLayout.jsx';
import ActionLine from '../../src/ui/components/ActionLine.jsx';
import WorkedExample from '../../src/ui/components/WorkedExample.jsx';
import '../../src/ui/tokens.css';

// A made-up example on the reserved documentation ranges (Sol's examples.js holds the real ones).
const route = {
  context: 'R1 → LAN-C 192.0.2.0/24, сусід 198.51.100.2',
  head: ['Мережа', 'Маска', 'Наступний перехід'],
  rows: [['192.0.2.0', '255.255.255.0', '198.51.100.2']],
};

let root = null;
const render = (element, host) => {
  if (!root) root = createRoot(host);
  flushSync(() => root.render(element));
};

/**
 * A first view. `layout`: 'exercise' (ExerciseLayout's example slot) or
 * 'custom' (a work column with ActionLine, as routing, setup and VLAN
 * render). Options make the negative fixtures: `example: false` (none),
 * `twice`, `misplaced` (after the first control), `overlap` (pulled up
 * over the action line), `control` (an input in its children).
 */
function firstView(host, { layout = 'exercise', theme = 'dark', taskKey = 'task-1', example = true, twice = false, misplaced = false, overlap = false, control = false } = {}) {
  const ex = example && (control
    ? <WorkedExample taskKey={taskKey} context={route.context}><input aria-label="поле" defaultValue="192.0.2.0" /></WorkedExample>
    : <WorkedExample taskKey={taskKey} {...route} note="Мережа — адреса блоку, не адреса вузла." className={overlap ? 'fx-overlap' : ''} />);
  const choices = (
    <div role="radiogroup" aria-labelledby="fx-act" className="fx-choices">
      {['/24', '/25', '/26'].map(p => <button key={p} type="button" role="radio" aria-checked="false" className="fx-choice">{p}</button>)}
    </div>
  );
  if (layout === 'exercise') {
    render(
      <ExerciseLayout heading="Маска" theme={theme}
        stage={<p className="fx-stage">Мережа 10.4.0.0, 50 вузлів.</p>}
        question={<p className="fx-task">Яка найменша маска вмістить 50 вузлів?</p>}
        action="Обери маску." actionId="fx-act" example={ex} answer={choices}
        help={<button type="button" className="fx-check">Перевірити</button>} />, host);
    return;
  }
  render(
    <div data-theme={theme} style={{ background: 'var(--ng-bg)', padding: 24, minHeight: '100vh', boxSizing: 'border-box', fontFamily: 'var(--ng-sans)' }}>
      <section className="fx-work" style={{ width: 420, padding: 20, background: 'var(--ng-panel)', border: '1px solid var(--ng-stroke)', borderRadius: 12, display: 'flex', flexDirection: 'column', gap: 12 }}>
        <p className="fx-task" style={{ margin: 0, color: 'var(--ng-text)', fontSize: 18 }}>Додай маршрути до LAN-B.</p>
        <ActionLine id="fx-act">Заповни перший рядок: мережа, маска, наступний перехід.</ActionLine>
        {!misplaced && ex}
        {twice && ex}
        {choices}
        {misplaced && ex}
        <button type="button" className="fx-check">Перевірити</button>
      </section>
    </div>, host);
}

window.wex = { firstView, unmount() { root?.unmount(); root = null; } };
