// The packet path, drawn in the diagram's own SVG (round 2 step 6, design §2
// "Drawing" and "Motion"). The geometry is pathPlan.js; this draws it in
// two parts, PathUnder (under the diagram's boxes and names, so they stay
// readable) and PathOver (marks and the envelope on top), both at the step
// usePathStep gives.
//
//   - the request solid, the reply dashed beside it, each with an arrowhead;
//     the request's moves numbered 1, 2, 3…;
//   - an amber ring (and ✗) where a leg stopped, or on the repair router of
//     a failure that stopped nothing; a demonstration's safe drop gets a
//     quiet ring instead;
//   - a loop's closing edge as a curved arrow with ⟲ (TTL for ttl-exceeded);
//   - a link that is down in the scenario grey and dashed, «⚡ впав»;
//   - ✓ where the request arrived, and on every LAN once the network passes.
//
// Motion (usePathStep): the envelope moves one move per STEP_MS (0.45 s),
// request then reply; the move under way fades in behind it; marks appear
// when their leg is done. The last frame is the static drawing. With
// prefers-reduced-motion (or without a browser) the static drawing is shown
// at once. `onStep` gets each move's target as the envelope sets off (the
// screen pans a pannable diagram to it); `onStill` gets the plan's focus
// when the path is shown without motion. The timer and prefers-reduced-motion
// are src/ui/motion.js's, shared with the firewall walk. Purely visual:
// aria-hidden; the strip, the list and «Текстом» say the same in words. Its
// pieces (Move, Mark, Envelope, Stop, DownLink) also draw the success lap
// (LapLayer.jsx).
import { useEffect, useLayoutEffect, useRef } from 'react';
import { useStepTimer } from '../../../ui/motion.js';
import { frameAt, STEP_MS } from './pathPlan.js';
import { ui } from '../uk.js';

export { STEP_MS };
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;

/** The step of the motion for `playKey`: 0 → moves.length, one move per
 * STEP_MS; at once (moves.length) with reduced motion or without a browser.
 * The timer is the shared one (src/ui/motion.js, FW-1 screen spec S6). */
export function usePathStep(plan, playKey, reduced, onStep, onStill) {
  const live = useRef(plan);
  live.current = plan;
  const { step } = useStepTimer(plan?.moves.length ?? 0, plan ? playKey : null, reduced, {
    stepMs: STEP_MS,
    onStep: i => onStep?.(live.current.moves[i]),
    onStill: () => onStill?.(live.current.focus),
  });
  return plan ? step : 0;
}

/** The envelope: set off from the move's start, arrive at its end in one
 * step (STEP_MS, or the success lap's shorter `duration`). */
export function Envelope({ move, duration = STEP_MS }) {
  const ref = useRef(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el?.animate) return undefined;
    const animation = el.animate(
      [{ transform: `translate(${move.x1}px, ${move.y1}px)` }, { transform: `translate(${move.x2}px, ${move.y2}px)` }],
      { duration, easing: 'linear', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [move, duration]);
  // Its path along a loop is the curve's chord: close enough for 0.45 s.
  return (
    <g ref={ref} className="ng-path-envelope" transform={`translate(${move.x1} ${move.y1})`}>
      <rect x="-2.9" y="-2.1" width="5.8" height="4.2" rx="0.7" className="ng-path-envelope-box" strokeWidth="0.45" />
      <path d="M-2.9,-2.1 L0,0.5 L2.9,-2.1" className="ng-path-envelope-flap" strokeWidth="0.45" fill="none" />
    </g>
  );
}

/** One move: its line (or loop arc) with an arrowhead, its hop number if
 * it has one. `entering`: the move under way, fading in over `duration`. */
export function Move({ move, ids, entering, duration = STEP_MS }) {
  const reply = move.leg === 'reply';
  const cls = `ng-path-line ${reply ? 'is-reply' : 'is-request'}${entering ? ' is-entering' : ''}`;
  const marker = `url(#${reply ? ids.reply : ids.request})`;
  const shape = move.kind === 'loop'
    ? props => <path d={move.d} fill="none" {...props} />
    : props => <line x1={move.x1} y1={move.y1} x2={move.x2} y2={move.y2} {...props} />;
  return (
    <g className={cls} style={entering && duration !== STEP_MS ? { animationDuration: `${duration}ms` } : undefined}>
      {shape({ className: 'ng-path-casing', strokeWidth: 2.6, strokeLinecap: 'round' })}
      {shape({ className: 'ng-path-stroke', strokeWidth: reply ? 0.95 : 1.15, markerEnd: marker, ...(reply ? { strokeDasharray: '2.2 1.5' } : {}) })}
      {move.kind === 'loop' && (
        <text x={move.labelX} y={move.labelY + 1.5} textAnchor="middle" className="ng-path-loop-label" fontSize={move.label === 'TTL' ? 3.2 : 4.6} fontWeight="700">{move.label}</text>
      )}
      {move.badge && (
        <g className="ng-path-hop">
          <circle cx={move.badge.x} cy={move.badge.y} r="2.25" className="ng-path-hop-dot" />
          <text x={move.badge.x} y={move.badge.y + 0.95} textAnchor="middle" className="ng-path-hop-n" fontSize="2.7" fontWeight="700">{move.n}</text>
        </g>
      )}
    </g>
  );
}

/** A small round mark: ✓ (green) or ✗ (amber). */
export function Mark({ x, y, tone, children }) {
  return (
    <g className={`ng-path-mark is-${tone}`}>
      <circle cx={x} cy={y} r="2.5" className="ng-path-mark-dot" />
      <text x={x} y={y + 1.05} textAnchor="middle" className="ng-path-mark-text" fontSize="3" fontWeight="700">{children}</text>
    </g>
  );
}

/** A link that is down in the scenario: grey, dashed, «⚡ впав». */
export function DownLink({ link: d }) {
  return (
    <g className="ng-path-down">
      <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} className="ng-path-down-casing" strokeWidth="2.8" />
      <line x1={d.x1} y1={d.y1} x2={d.x2} y2={d.y2} className="ng-path-down-line" strokeWidth="1.1" strokeDasharray="1.6 1.4" />
      <text x={d.labelX} y={d.labelY} textAnchor="middle" className="ng-path-down-label" fontSize="2.9" fontWeight="700">{ui.shared.linkDown}</text>
    </g>
  );
}

/** Where a leg stopped: the amber ring and ✗, or a demonstration's quiet ring. */
export function Stop({ stop: s }) {
  return (
    <g className={`ng-path-stop${s.expected ? ' is-expected' : ''}`}>
      {s.r > 0 && <circle cx={s.x} cy={s.y} r={s.r} className="ng-path-stop-ring" strokeWidth={s.expected ? 0.7 : 1.1} fill="none" {...(s.expected ? { strokeDasharray: '1.4 1.2' } : {})} />}
      {!s.expected && <Mark x={s.x + s.r * 0.72} y={s.y - s.r * 0.72} tone="stop">✗</Mark>}
    </g>
  );
}

/** «суцільна — запит, пунктир — відповідь», beside a drawn path's diagram
 * (the routing tasks and «Знайди несправність»). */
export function PathLegend() {
  return (
    <p className="ng-path-legend" aria-label={ui.shared.legend}>
      <span><svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" className="ng-path-legend-line is-request" strokeWidth="2.4" /></svg> {ui.shared.legendRequest}</span>
      <span><svg width="26" height="8" aria-hidden="true"><line x1="1" y1="4" x2="25" y2="4" className="ng-path-legend-line is-reply" strokeWidth="2" strokeDasharray="4 3" /></svg> {ui.shared.legendReply}</span>
    </p>
  );
}

/** The arrowheads the moves use (once per diagram: PathUnder draws them). */
function Markers({ ids }) {
  return (
    <defs>
      <marker id={ids.request} markerWidth="4" markerHeight="4" refX="3" refY="1.75" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,3.5 L3.5,1.75 z" className="ng-path-arrow is-request" />
      </marker>
      <marker id={ids.reply} markerWidth="4" markerHeight="4" refX="3" refY="1.75" orient="auto" markerUnits="strokeWidth">
        <path d="M0,0 L0,3.5 L3.5,1.75 z" className="ng-path-arrow is-reply" />
      </marker>
    </defs>
  );
}

/**
 * Under the diagram's boxes, port names and routers (so their words stay
 * on top): the moves, hop numbers, the loop arc and a link that is down.
 * @param {{ plan: object|null, step: number, ids: { request: string, reply: string } }} props
 */
export function PathUnder({ plan, step, ids }) {
  const frame = plan ? frameAt(plan, step) : null;
  return (
    <g className="ng-path-layer" aria-hidden="true">
      <Markers ids={ids} />
      {plan?.downLinks.map(d => <DownLink key={d.segmentId} link={d} />)}
      {frame?.drawn.map((move, i) => <Move key={i} move={move} ids={ids} />)}
      {frame?.moving && <Move key={`moving-${step}`} move={frame.moving} ids={ids} entering />}
    </g>
  );
}

/**
 * On top of everything: where a leg stopped (the ring and ✗), ✓ where the
 * request arrived and on every LAN once the network passes, and the envelope.
 * @param {{ plan: object|null, step: number, solved?: object[]|null }} props
 */
export function PathOver({ plan, step, solved = null }) {
  const frame = plan ? frameAt(plan, step) : null;
  return (
    <g className="ng-path-layer ng-path-over" aria-hidden="true">
      {frame?.stops.map(s => <Stop key={`${s.leg}-${s.deviceId}`} stop={s} />)}
      {frame?.arrived.map((m, i) => <Mark key={`arrived-${i}`} x={m.x} y={m.y} tone="ok">✓</Mark>)}
      {solved?.map(m => <Mark key={m.key} x={m.x} y={m.y} tone="ok">✓</Mark>)}
      {frame?.moving && <Envelope key={`envelope-${step}`} move={frame.moving} />}
    </g>
  );
}
