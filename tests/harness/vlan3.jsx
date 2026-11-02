// Contract consumer for the forthcoming VLAN-3 screen. This deliberately
// renders all pre-assistance payloads, including hidden/accessible text.
// It is not a replacement for the eventual production screen leak tests.
import { renderToStaticMarkup } from 'react-dom/server';
import * as F from '../../src/sections/vlan/logic/faults-exercise.js';
import { t, faultText } from '../../src/sections/vlan/uk.js';
export function renderFaultContract(task, answer = F.initialAnswer(task), result) {
  const grid = result?.evidence.grid ?? F.grid(task);
  return renderToStaticMarkup(<main>
    <h1>{faultText.title}</h1>
    <section aria-label="Текстом">{F.describe(task, { answer, result }).map((line, i) => <p key={i}>{line}</p>)}</section>
    <fieldset><legend>{faultText.cause}</legend>{F.options(task, 'cause').map(o => <label key={o.value}><input type="radio" name="cause" value={o.value} />{o.label}</label>)}</fieldset>
    <table><tbody>{[...grid.reachability, ...grid.isolation].map(r => <tr key={r.id}><th>{r.id}</th><td aria-label={r.observed ? 'так' : 'ні'}>{r.observed ? '✓' : '✕'}</td></tr>)}</tbody></table>
    <aside>{F.hints(task, answer, { result }).map(h => <p key={h.rung}>{t(h.code, h.params)}</p>)}</aside>
  </main>);
}
