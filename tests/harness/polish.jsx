// Bundled by tools/test.sh into .test-bundles/harness/polish.mjs. The
// polish round's surfaces, rendered with react-dom/server:
//   - RoutingRows: the work panel's rows for a router through the screen's
//     own hook (useRouteAnswers), so a converted draft renders as it would
//     on screen (input values included); with a `seed`, on an instance with
//     other addresses (step 9, through the screen's own memo);
//   - renderLap: the success lap's two layers at a frame, in one SVG;
//   - renderStrip: the check panel (bar and strip) for a check, with the
//     strip showing a picked line, a demonstration or the lap.
// It re-exports the contract harness, so a test uses one bundle (one React).
import { renderToStaticMarkup } from 'react-dom/server';
import { useExercise } from '../../src/ui/useExercise.js';
import routing from '../helpers/routing.mjs';
import { syntaxes } from '../../src/sections/routing/syntax/index.js';
import * as routingBank from '../../src/banks/routing/tasks.js';
import { useRouteAnswers } from '../../src/sections/routing/screens/useRouteAnswers.js';
import RouteRows from '../../src/sections/routing/screens/RouteRows.jsx';
import { cachedRouting } from '../../src/sections/routing/screens/instances.js';
import { SuccessDetail, stripOf, verdictSummary } from '../../src/sections/routing/screens/CheckPanel.jsx';
import { LapOver, LapUnder } from '../../src/sections/routing/screens/LapLayer.jsx';

const { bankId, bankRevision } = routingBank;
const bankRouting = { ...cachedRouting, create: (record, params) => cachedRouting.create(record, { ...params, bank: routingBank }) };
export * from './contract.jsx';

/** The rows of `router` in a mode and syntax, from the store's instance. */
export function RoutingRows({ record, variantId, syntax, mode = 'guided', router, expose, seed = null }) {
  const params = { variantId: variantId ?? record.variants[0].id, bankId, bankRevision };
  const ex = useExercise(seed === null ? routing : bankRouting, record, seed === null ? params : { ...params, seed });
  const answers = useRouteAnswers(ex, syntaxes[syntax], mode);
  expose?.({ ex, answers });
  return <RouteRows ex={ex} answers={answers} syntax={syntaxes[syntax]} router={router} onNetwork={() => {}} />;
}

const ids = { request: 'req', reply: 'rep' };
/** The lap's layers at a frame (lapFrame), as the diagram's SVG holds them. */
export const renderLap = frame => renderToStaticMarkup(<svg><LapUnder frame={frame} ids={ids} /><LapOver frame={frame} /></svg>);

/** Round 4: what a presented check says. The panel's verdict sentence (as
 * the screen words it), the line for what is drawn (stripOf: a picked check
 * or demonstration, the lap's words), and after a pass the success box's
 * detail with «Показати ще раз». (The bar and strip under the diagram are gone.) */
export const renderStrip = (presented, pending, shown, onReplay = () => {}) => {
  const strip = stripOf(presented, pending, shown);
  return renderToStaticMarkup(<>
    {presented && <p className="ng-help-summary">{verdictSummary(presented, shown?.kind === 'lap' ? shown.words : null)}</p>}
    <p className={`ng-rt-strip is-${strip.tone}`}>{strip.text}</p>
    {presented?.ok && <SuccessDetail presented={presented} submitted={null} other={syntaxes.routeros} onDemo={() => {}} onReplay={onReplay} syntax={syntaxes.cisco} />}
  </>);
};

/** The success box's detail after a passing check (OPT-1 UI: the tips, the reveal). */
export const renderNotes = (presented, { tips = [], best = null, syntax = 'cisco' } = {}) => renderToStaticMarkup(
  <SuccessDetail presented={presented} submitted={null} other={syntaxes[syntax === 'cisco' ? 'routeros' : 'cisco']} onDemo={() => {}}
    tips={tips} onTip={() => {}} best={best} syntax={syntaxes[syntax]} />,
);
