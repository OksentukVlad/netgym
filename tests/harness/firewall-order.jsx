// A contract fixture for the logic handoff, not the production FW-2 screen.
// Reuse the gate against the actual screen when Opus adds it.
import { renderToStaticMarkup } from 'react-dom/server';
import ReorderList from '../../src/ui/components/ReorderList.jsx';
import { t, orderUi, orderText } from '../../src/sections/firewall/uk.js';

export function renderOrderGivens(task, hints = []) {
  return renderToStaticMarkup(<section>
    <h2>{orderUi.title}</h2><p>{orderUi.policy}</p><p>{task.text}</p>
    <ReorderList items={task.rules} onReorder={() => {}} label={orderUi.title} name={r => t(r.descriptionCode)}>
      {rule => <span>{rule.chain} · {rule.action} · {t(rule.descriptionCode)}</span>}
    </ReorderList>
    {hints.map(h => <p key={h.rung}>{orderText(h.code)}</p>)}
  </section>);
}
