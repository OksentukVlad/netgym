// Parts the VLAN screens share around the help panel (round 4, spec F3–F6):
//   - CommandsFold: a device's live commands, folded to one line while a
//     verdict is open (spec F4/F5: the verdict and the form stay together),
//     open again after an edit; the learner can open or fold it by hand at
//     any time (a native <details>);
//   - WalkWords: the walk in words, after the help panel in the work column;
//   - the screen id of the VLAN asides (first-visit notes, spec A8), and
//     (round 5) their fold on a short window.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { bringIntoView } from '../../../ui/components/HelpPanel.jsx';
import { useStore } from '../../../ui/useStore.js';
import Commands from './Commands.jsx';
import { vlanFact } from '../logic/facts.js';
import { routeUi, ui } from '../uk.js';

/** The place of the VLAN asides. */
export const SCREEN = 'vlan';

/** Round 5 (R5, the gate): what the first view must show, counted from the
 * task's data (PCs, devices, configured ports, gateways, failing checks):
 * `data-task-*` on the work column; the shots recipe compares each with the
 * labels rendered, so a missing label fails. Words and layout never use them. */
export const taskCounts = counts => Object.fromEntries(Object.entries(counts).map(([k, v]) => [`data-task-${k}`, String(v)]));

/** Each PC's goal (its third line) and, where the task gives one, its
 * gateway (the fourth), with their highlight facts (round 5, R3: explicit,
 * no reading of the words). */
export function hostLines(task, { gateways = false } = {}) {
  const third = Object.fromEntries(task.topology.hosts.map(h => [h.device,
    { text: ui.goal(task.goals[h.device]), className: 'is-goal', facts: [vlanFact(task.goals[h.device])] }]));
  const fourth = gateways ? Object.fromEntries(task.topology.hosts.map(h => [h.device,
    { text: routeUi.gatewayLine({ ip: h.gateway }), className: 'is-gateway', facts: [{ kind: 'address', value: h.gateway }] }])) : {};
  return { third, fourth };
}

/** Round 5: a short screen area (a 1000 × 700 window; 1280 × 800 is not). `limit`: a long aside (task 3's
 * «Умова повністю») folds below a taller screen too (repair v1). Unmeasured (0) is never short. */
export const SHORT_SCREEN = 700;
export const isShort = (height, limit = SHORT_SCREEN) => height > 0 && height < limit;

/** Round 5 (spec 5b-1 §4 v2, narrow): on a short window (VlanScreen's
 * `short`) the intro aside of «Між VLAN» and «Знайди несправність» starts
 * folded to its one line, so the whole drawing fits on the first view; the
 * learner's own open or fold is kept, and «?» opens it as ever. */
export function useShortAside(id, short) {
  const { state, dispatch } = useStore();
  const place = state.places[SCREEN] ?? {};
  const chosen = typeof place.asides?.[id] === 'boolean';
  useIsoLayoutEffect(() => {
    if (!short || chosen || place.started) return;
    dispatch({ type: 'place', scope: SCREEN, patch: { asides: { ...(place.asides ?? {}), [id]: false } } });
  }, [short, id, chosen, place.started]);
}

/**
 * @param {{ device: string, text: string, note?: any, empty?: string, fold?: any, heading?: string }} props
 *   `fold`: a key that is non-null while a verdict is open (folded then);
 *   a new key folds it again, null opens it
 */
export function CommandsFold({ device, text, note = null, empty, fold = null, heading = ui.commandsOf({ device }) }) {
  const [state, setState] = useState({ key: fold, open: fold === null });
  const shown = state.key === fold ? state : { key: fold, open: fold === null };
  if (shown !== state) setState(shown);
  const lines = text.trim() ? text.trim().split('\n').length : 0;
  return (
    <details className="ng-vl-cmds" open={shown.open} onToggle={e => { const open = e.currentTarget.open; if (open !== shown.open) setState({ key: fold, open }); }}>
      <summary className="ng-vl-cmds-head">
        <span className="ng-vl-caption">{heading}</span>
        {!shown.open && lines > 0 && <span className="ng-vl-muted"> · {ui.linesFolded({ n: lines })}</span>}
      </summary>
      <Commands device={device} text={text} note={note} {...(empty ? { empty } : {})} />
    </details>
  );
}

/** With a failing check's verdict (its summaryNode): one line saying where
 * the walk is (the diagram, and in words under the panel), so the verdict
 * stays short under a hint too. Never the panel's data-evidence: with a long
 * board the panel may sit inside the board, and HelpPanel anchors after its
 * evidence's row (it would move into itself). */
export function WalkPointer({ what }) {
  return <p className="ng-vl-walk-pointer">{ui.walkPointer({ what })}</p>;
}

/** The walk in words: a caption, an optional note above the steps, the
 * numbered steps. `mark`: the index of the step the help panel's verdict
 * is about (the failing hop: data-evidence, the panel may sit right after it). */
export function WalkWords({ title, note = null, steps, children = null, mark = -1 }) {
  return (
    <section className="ng-vl-walk-text" aria-label={title}>
      <h3 className="ng-vl-caption">{title}</h3>
      {note && <p className="ng-vl-abstraction">{note}</p>}
      {steps?.length > 0 && <ol className="ng-vl-steps">{steps.map((line, i) => <li key={i} {...(i === mark ? { 'data-evidence': 'current' } : {})}>{line}</li>)}</ol>}
      {children}
    </section>
  );
}

/** The step a failing walk stops at, in its words: a step about the target
 * PC itself (it got the frame wrong), else the last step about the target's
 * own port (where the frame should have come out), else the last step that
 * says the frame doesn't go on, else the last step. */
export function failingStep(steps, { device = null, port = null, host = null } = {}) {
  const at = pred => { for (let i = steps.length - 1; i >= 0; i--) if (pred(steps[i])) return i; return -1; };
  const pc = host ? at(line => line.startsWith(`${host} `)) : -1;
  if (pc >= 0) return pc;
  const own = device && port ? at(line => line.startsWith(`${device}`) && line.split(/[\s,:]+/).includes(port)) : -1;
  if (own >= 0) return own;
  const stop = at(line => /не виходить|відкинуто|не приймає|не отримано|не дістається|обривається|неактивн/.test(line));
  return stop >= 0 ? stop : steps.length - 1;
}

/** The switch port a PC is plugged into: { device, port } (topology ids), or null. */
export function hostPort(topology, host) {
  for (const l of topology.links) {
    if (l.a.device === host) return { device: l.b.device, port: l.b.port };
    if (l.b.device === host) return { device: l.a.device, port: l.a.port };
  }
  return null;
}

/** A port's id on a device from its displayed label in a syntax. */
export const portIdOf = (topology, device, label, syntax) => topology.devices.find(d => d.id === device)?.ports.find(p => p.label?.[syntax] === label)?.id ?? null;

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/**
 * The help panel's evidence inside a form the screen doesn't render itself
 * (RouteForm, and PortsForm inside it): the first element matching
 * `selector` within `within` gets data-evidence="current" while `active`.
 * Put it before the HelpPanel in the tree, so its layout effect runs first
 * and the panel's scroll finds the mark (it removes the marks it set).
 */
export function EvidenceMark({ within, selector = '.ng-vl-mark', active }) {
  const set = useRef(null);
  useIsoLayoutEffect(() => {
    const el = active ? within.current?.querySelector(selector) ?? null : null;
    if (set.current && set.current !== el) set.current.removeAttribute('data-evidence');
    if (el) el.setAttribute('data-evidence', 'current');
    set.current = el;
  });
  useEffect(() => () => { set.current?.removeAttribute('data-evidence'); }, []);
  return null;
}

/**
 * A device tab change (the learner's own press) re-lays the form out: the
 * help panel's check row and message, and what they are about, are brought
 * back into view together (as the panel does after a check). Not on mount.
 */
export function useHelpInView(rootRef, device) {
  const last = useRef(device);
  useIsoLayoutEffect(() => {
    if (last.current === device) return;
    last.current = device;
    const root = rootRef.current;
    const current = root?.querySelector('[data-help-current]');
    if (!root || !current) return;
    const reduced = typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
    bringIntoView([root.querySelector('[data-help="row"]'), current, root.querySelector('[data-evidence="current"]')], reduced ? 'auto' : 'smooth');
  });
}
