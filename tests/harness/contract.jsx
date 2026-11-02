import { withReadOnlyLogic } from '../helpers/read-only-logic.mjs';
// Bundled by tools/test.sh into .test-bundles/harness/contract.mjs (JSX and
// React, like the target bundles). Components for rendering the exercise
// contract with react-dom/server in Node:
//   - RoutingContract: routing logic (task 1) through useExercise and
//     ExerciseLayout, the same hook and layout the mask screen uses;
//   - RoutingProbe: the routing screen's own session hook (useRouteAnswers)
//     without its layout, for driving row and network checks, syntax and
//     mode switches;
//   - the real RoutingScreen (given the bank, as a target gives it),
//     MaskScreen and Standalone.
// A test store stands in for StoreProvider: dispatch runs the app reducer and
// the next render reads the new state.
import { renderToStaticMarkup } from 'react-dom/server';
import { initialStore, storeReducer } from '../../src/app/store.js';
import { StoreContext } from '../../src/ui/useStore.js';
import { instanceKeyOf, useExercise } from '../../src/ui/useExercise.js';
import mask from '../../src/sections/ip/logic/mask.js';
import ExerciseLayout from '../../src/ui/components/ExerciseLayout.jsx';
import AddressField from '../../src/ui/components/AddressField.jsx';
import Button from '../../src/ui/components/Button.jsx';
import Feedback from '../../src/ui/components/Feedback.jsx';
import HintLadder from '../../src/ui/components/HintLadder.jsx';
import Reveal from '../../src/ui/components/Reveal.jsx';
import routing, { textFor } from '../helpers/routing.mjs';
import { t } from '../../src/sections/routing/uk.js';
import { syntaxes } from '../../src/sections/routing/syntax/index.js';
import * as routingBank from '../../src/banks/routing/tasks.js';
import { useRouteAnswers } from '../../src/sections/routing/screens/useRouteAnswers.js';
import RoutingScreen, { instanceKeys } from '../../src/sections/routing/screens/RoutingScreen.jsx';
import { cachedRouting } from '../../src/sections/routing/screens/instances.js';
import MaskScreen from '../../src/sections/ip/screens/MaskScreen.jsx';
import Standalone from '../../src/app/Standalone.jsx';
import { keyChoice } from '../../src/ui/components/Segmented.jsx';

const { bankId, bankRevision } = routingBank;
const bankRouting = { ...cachedRouting, create: (record, params) => cachedRouting.create(record, { ...params, bank: routingBank }) };

export { RoutingScreen, MaskScreen, Standalone, routing, mask, instanceKeyOf, instanceKeys, routingBank, keyChoice, syntaxes };

/** A store for tests: `render(Component, props)` renders inside it. */
export function testStore(prefs) {
  const store = { state: initialStore(prefs), actions: [] };
  store.dispatch = action => {
    store.actions.push(action);
    store.state = storeReducer(store.state, action);
  };
  store.render = (Component, props = {}) => renderToStaticMarkup(
    <StoreContext.Provider value={{ state: store.state, dispatch: store.dispatch }}><Component {...props} /></StoreContext.Provider>,
  );
  return store;
}

/** Renders without a test store (components that bring their own provider). */
export const renderPlain = (Component, props = {}) => renderToStaticMarkup(<Component {...props} />);

/** Routing task 1 as a generic exercise: the contract's create, check, hints,
 * solution and scaffold through useExercise, laid out by ExerciseLayout. */
export function RoutingContract({ record, syntax = 'cisco', expose }) {
  const ex = useExercise(routing, record, { variantId: record.variants[0].id, bankId, bankRevision });
  expose?.(ex);
  const adapter = syntaxes[syntax];
  const rows = routing.scaffold(ex.task, syntax);
  const hints = ex.hints(syntax).map(h => t('routing.static.legacy-hint', h.params));
  const result = ex.result;
  const fields = Object.entries(rows).flatMap(([router, list]) => list.flatMap((row, i) => {
    const route = ex.answer?.[router]?.[i];
    const values = route ? adapter.fromRoute(route, row.needDist) : {};
    return row.fields.map(name => (
      <AddressField key={`${router}-${i}-${name}`} label={`${router} · ${row.label} · ${adapter.fields.find(f => f.name === name).label}`}
        value={values[name] ?? ''} onChange={() => {}} onEnter={() => {}} />
    ));
  }));
  return (
    <ExerciseLayout
      caption="contract"
      heading={`#${ex.task.variant.code} — ${textFor(ex.task.variant.title, syntax)}`}
      stage={<p>{textFor(ex.task.variant.text, syntax)}</p>}
      answer={fields}
      tools={<>
        <HintLadder hints={hints} shown={ex.session.hintIndex} onMore={() => ex.hint(hints.length)} disabled={ex.finished} />
        <Reveal revealed={ex.session.revealed} onReveal={ex.reveal}>
          {() => <pre>{Object.entries(ex.solution).map(([router, routes]) => `${router}\n${adapter.commandBlock(routes)}`).join('\n')}</pre>}
        </Reveal>
      </>}
      help={<><Button variant="primary">Перевірити</Button><Feedback tone={result ? (result.ok ? 'ok' : 'no') : null}>{result ? t(`routing.static.${result.code}`) : null}</Feedback></>}
    />
  );
}

/** The routing screen's session hook, exposed for tests (mode: 'guided' or 'free').
 * With a `seed`, the instance with other addresses (step 9), built once
 * through the screen's own memo (screens/instances.js), as the screen does. */
export function RoutingProbe({ record, variantId, syntax, mode = 'guided', expose, seed = null }) {
  const params = { variantId: variantId ?? record.variants[0].id, bankId, bankRevision };
  const ex = useExercise(seed === null ? routing : bankRouting, record, seed === null ? params : { ...params, seed });
  const answers = useRouteAnswers(ex, syntaxes[syntax], mode);
  expose({ ex, answers });
  return null;
}

export const withReadOnlyRouting = run => withReadOnlyLogic(routing, run);
