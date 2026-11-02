import { withReadOnlyLogic } from '../helpers/read-only-logic.mjs';
import { renderToStaticMarkup } from 'react-dom/server';
import RouteRows, { feedbackOf, announcementOf, Row } from '../../src/sections/routing/screens/RouteRows.jsx';
import { InterfacesCard } from '../../src/sections/routing/screens/RouterCard.jsx';
import Rich from '../../src/sections/routing/screens/Rich.jsx';
import { diagramTopology } from '../../src/sections/routing/screens/diagramTopology.js';
import RulesPanel from '../../src/sections/routing/screens/RulesPanel.jsx';
import TopologyMap from '../../src/sections/routing/screens/TopologyMap.jsx';
import TextEquivalent from '../../src/ui/components/TextEquivalent.jsx';
import { describeNetwork } from '../../src/ui/topology/describe.js';
import { syntaxes } from '../../src/sections/routing/syntax/index.js';
import { CheckLine, ChecksList, otherSyntaxBlocks, otherSyntaxPayload, stripOf } from '../../src/sections/routing/screens/CheckPanel.jsx';
import { rowCheck } from '../../src/sections/routing/screens/rowCheck.js';
import routing, { presentCheck } from '../helpers/routing.mjs';

export { otherSyntaxBlocks, otherSyntaxPayload, stripOf, rowCheck };

/** A stand-in for useRouteAnswers: every row shows `values` and `shown`. In
 * free mode the router has one empty route (its placeholders are scanned). */
function answersOf(rows, shown, values, mode) {
  const anyDist = Object.values(rows).flat().some(r => r.needDist);
  return {
    mode, rows,
    slotItem: (r, i) => ({ kind: 'slot', router: r, index: i, slot: `${r}.row${i + 1}`, key: `${r}.row${i + 1}`, route: null, needDist: Boolean(rows[r][i].needDist) }),
    extraItems: () => [],
    freeItems: r => [{ kind: 'route', router: r, n: 1, key: `${r}.f1`, route: null, needDist: anyDist }],
    valuesOf: () => values, resultOf: () => shown, formErrorOf: () => null,
  };
}

/** The work panel's routes for a router, in a mode («З підказками» by default). */
export function renderRows(task, syntax, router, rows, shown = null, values = {}, mode = 'guided') {
  return renderToStaticMarkup(<RouteRows ex={{ key: task.instanceKey, task }} answers={answersOf(rows, shown, values, mode)}
    syntax={syntax} router={router} onNetwork={() => {}} />);
}

/** The work panel's interfaces card (round 4: the reveal is the help panel's; nothing of it renders before). */
export function renderCard(task, syntax, router) {
  return renderToStaticMarkup(<InterfacesCard task={task} syntax={syntax} router={router} colour="ng-rc-0" />);
}

export function renderFeedback(syntax, shown, router, index) {
  const feedback = feedbackOf(syntax, shown);
  const cut = feedback.parts.indexOf('\n');
  return {
    visible: renderToStaticMarkup(<Rich parts={feedback.parts} />),
    // Round 4: a wrong row shows its reasons (the lines after the verdict word) under its fields.
    reasons: cut < 0 ? '' : renderToStaticMarkup(<Rich parts={feedback.parts.slice(cut + 1)} />),
    announcement: announcementOf(syntax, shown, router, index),
  };
}

/** The opened Rules panel in a syntax (default Cisco). */
export const renderRules = (syntax = syntaxes.cisco) => renderToStaticMarkup(<RulesPanel syntax={syntax} />);
/** The diagram as the screens draw it (round 4: diagramTopology's labels). */
export const renderTopology = (task, syntax, highlight = null) => renderToStaticMarkup(<TopologyMap topo={diagramTopology(task.network, syntax.id)} setActiveRouter={() => {}} highlight={highlight} />);

/** The opened «Текстом» panel: the task's network described in a syntax. */
export const renderTextEquivalent = (task, syntax) => renderToStaticMarkup(
  <TextEquivalent id="t" title="Схема текстом" sections={describeNetwork(task.network, syntax.id)} open onClose={() => {}} />,
);

export function renderCheckedRow(task, syntax, router, rows, index, shown, values) {
  const answers = answersOf(rows, shown, values, 'guided');
  return renderToStaticMarkup(<Row task={task} syntax={syntax} item={answers.slotItem(router, index)}
    answers={answers} onNetwork={() => {}} />);
}

/** Deliberately leaking rendered fixtures must be rejected by the same gate. */
export function renderLeakFixture(kind, text) {
  return renderToStaticMarkup(kind === 'placeholder' ? <input placeholder={text} /> : <p>{text}</p>);
}

/** «Усі перевірки», opened, for a check result (every line pickable), then
 * each line as it reads once picked (with its sentence). */
export function renderChecks(task, syntax, result) {
  const presented = result ? presentCheck(task, result, syntax.id) : null;
  const list = renderToStaticMarkup(<ChecksList presented={presented}
    pending={presentCheck(task, routing.check(task, {}), syntax.id)} shownId={null} onPick={() => {}} pickable={() => true} />);
  const picked = (presented?.lines ?? []).filter(l => l.text).map(line => renderToStaticMarkup(
    <CheckLine line={line} status={line.status} pickable shownId={line.id} onPick={() => {}} />));
  return [list, ...picked].join('\n');
}

/** «Текстом» opened on its «Шлях пакета» section alone. */
export const renderPathText = items => renderToStaticMarkup(
  <TextEquivalent id="t" title="Схема текстом" sections={[{ heading: 'Шлях пакета', items }]} open onClose={() => {}} />,
);

export const withReadOnlyRouting = run => withReadOnlyLogic(routing, run);
