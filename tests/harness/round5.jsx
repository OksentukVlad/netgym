// Bundled by tools/test.sh into .test-bundles/harness/round5.mjs: the round 5
// shared parts (spec 5a §2 A–C) for server rendering, used by
// tests/round5-shared.test.mjs: ActionLine, Purpose, FactLink, the
// ExerciseLayout action slot and the diagram highlight API; stage 5b-2's
// WorkedExample (tests/worked-example.test.mjs).
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import ActionLine from '../../src/ui/components/ActionLine.jsx';
import Purpose, { PURPOSE_MAX, tooLong } from '../../src/ui/components/Purpose.jsx';
import FactLink from '../../src/ui/components/FactLink.jsx';
import ExerciseLayout from '../../src/ui/components/ExerciseLayout.jsx';
import WorkedExample from '../../src/ui/components/WorkedExample.jsx';
import { RuleTable } from '../../src/sections/firewall/screens/Choices.jsx';
import { tableRows } from '../../src/sections/firewall/screens/walkView.js';
import { DiagramSvg as FirewallSvg } from '../../src/sections/firewall/screens/FirewallDiagram.jsx';
import { neutralScene } from '../../src/sections/firewall/screens/diagram.js';

export { createElement, ActionLine, Purpose, PURPOSE_MAX, tooLong, FactLink, ExerciseLayout, WorkedExample, RuleTable, tableRows, neutralScene };
export const render = element => renderToStaticMarkup(element);
/** The firewall drawing with a highlight (no packet on it). */
export const renderFirewall = (topology, highlight = null, scene = neutralScene()) => renderToStaticMarkup(<FirewallSvg scene={scene} topology={topology} size={{ width: 452 }} highlight={highlight} />);
