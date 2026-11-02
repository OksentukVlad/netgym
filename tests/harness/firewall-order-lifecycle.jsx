// Logic integration fixture only. Opus still owns the production FW-2 screen.
import { useState, act } from 'react';
import { createRoot } from 'react-dom/client';
import StoreProvider from '../../src/app/StoreProvider.jsx';
import { useExercise } from '../../src/ui/useExercise.js';
import ReorderList from '../../src/ui/components/ReorderList.jsx';
import { forRecord } from '../../src/sections/firewall/logic/order.js';
import { initialState, transition } from '../../src/sections/firewall/logic/order-state.js';
import { resolveOrderRecord } from '../../src/banks/firewall/order.js';
import { t, orderUi } from '../../src/sections/firewall/uk.js';
export { act };

export function mountOrderContract() {
  const record = resolveOrderRecord(), logic = forRecord(record), into = {}, control = {};
  let solutionCalls = 0;
  const reveal = logic.solution;
  logic.solution = task => { solutionCalls++; return reveal(task); };
  function Exercise() {
    const ex = useExercise(logic, record, { variantId: 'all', seed: 0 });
    const state = ex.view.orderState ?? initialState(ex.task);
    function send(action) {
      const next = transition(logic, ex.task, state, action);
      if (action.type === 'reveal') ex.reveal();
      if (action.type === 'check') ex.check(next.answer, { result: next.result });
      if (action.type === 'hint') ex.hint(3);
      ex.setView({ orderState: next });
    }
    Object.assign(into, { task: ex.task, state, send, solution: ex.solution, solutionCalls, session: ex.session });
    const items = state.answer.order.map(id => ex.task.rules.find(r => r.id === id));
    return <section className="fw-order-contract">
      <ReorderList items={items} onReorder={order => send({ type: 'order', order })} name={r => t(r.descriptionCode)} label={orderUi.title}>
        {r => <span>{t(r.descriptionCode)}{state.result?.feedback?.ruleIds.includes(r.id) ? <b>{orderUi.mark}</b> : null}</span>}
      </ReorderList>
      {state.result?.feedback ? <p className="order-feedback">{state.result.feedback.code}</p> : null}
      {state.walkOpen ? <p className="order-walk">{logic.walkInput(ex.task, state.answer.order, state.result.feedback.card).walk.verdict}</p> : null}
      {ex.solution ? <pre className="order-reveal">{ex.solution.script}</pre> : null}
      <button className="order-check" onClick={() => send({ type: 'check' })}>Перевірити</button>
    </section>;
  }
  function Frame() {
    const [shown, setShown] = useState(true); control.setShown = setShown;
    return shown ? <Exercise /> : null;
  }
  const container = document.createElement('div'); document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<StoreProvider><Frame /></StoreProvider>));
  return { into, container,
    remount() { act(() => control.setShown(false)); act(() => control.setShown(true)); },
    unmount() { act(() => root.unmount()); container.parentNode?.removeChild(container); } };
}
