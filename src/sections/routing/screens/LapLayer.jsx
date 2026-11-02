// The success lap on the diagram (polish spec v2 §2): the frames of
// lapPlan.js drawn in the diagram's own SVG, in two parts like the packet
// path (PathLayer.jsx): LapUnder under the boxes and routers (the lines,
// a link that is down), LapOver on top (green outlines and ✓ on the boxes
// reached, a demonstration's ring, the envelopes). Lines keep the path's
// colours (--ng-path, --ng-path-reply: the legend is the lesson); only the
// marks, the outlines and the strip go green. Purely visual: aria-hidden;
// the strip and the one announcement say it in words.
//
// useLap plays the schedule for a play key (a new check, «Показати ще
// раз»), cancels it when the key changes (navigation, a new check, a picked
// line) or the screen goes, and skips to the end state on request. With
// reduced motion, or without a browser, it shows the end state at once.
import { useEffect, useMemo, useRef, useState } from 'react';
import { frameAt } from './pathPlan.js';
import { lapPlayer, lapSchedule, strokeKey } from './lapPlan.js';
import { DownLink, Envelope, Mark, Move, Stop } from './PathLayer.jsx';

/** How far a box's green outline sits outside its border (diagram units). */
const PAD = 0.8;
const round = v => Math.round(v * 100) / 100;

/**
 * @returns {{ tick: object|null, playing: boolean, skip: Function }} the
 *   tick on screen, whether the motion is under way, and skip-to-the-end.
 */
export function useLap(lap, playKey, reduced) {
  const schedule = useMemo(() => (lap ? lapSchedule(lap) : null), [lap]);
  const [state, setState] = useState({ key: null, index: 0 });
  const player = useRef(null);
  const live = useRef(schedule);
  live.current = schedule;
  useEffect(() => {
    if (playKey == null || !live.current) return undefined;
    if (reduced) {
      setState({ key: playKey, index: live.current.length - 1 });
      return undefined;
    }
    const p = lapPlayer(live.current, index => setState({ key: playKey, index }));
    player.current = p;
    p.start();
    return () => {
      p.cancel();
      if (player.current === p) player.current = null;
    };
  }, [playKey, reduced]);
  if (!schedule || playKey == null) return { tick: null, playing: false, skip: () => {} };
  const last = schedule.length - 1;
  const index = Math.min(state.key === playKey ? state.index : reduced ? last : 0, last);
  return { tick: schedule[index], playing: !reduced && index < last, skip: () => player.current?.skip() };
}

/** A box's (or cloud's) green outline, settling in over 0.3 s. */
function Outline({ shape: s }) {
  return s.kind === 'cloud'
    ? <ellipse cx={s.x} cy={s.y} rx={round(s.rx + PAD)} ry={round(s.ry + PAD)} className="ng-lap-outline" strokeWidth="0.9" fill="none" />
    : <rect x={round(s.x - s.w / 2 - PAD)} y={round(s.y - s.h / 2 - PAD)} width={round(s.w + 2 * PAD)} height={round(s.h + 2 * PAD)} rx="2.2" className="ng-lap-outline" strokeWidth="0.9" fill="none" />;
}

/** The demonstration ending's drawing at its step (as when it is picked). */
const demoFrame = ending => (ending?.kind === 'demo' ? frameAt(ending.plan, ending.step) : null);

/**
 * Under the diagram's boxes and routers: the lap's lines (fading while an
 * ending plays), and the ending's lines and the link that is down.
 * @param {{ frame: object|null, ids: { request: string, reply: string } }} props
 */
export function LapUnder({ frame, ids }) {
  if (!frame) return null;
  const end = frame.ending, demo = demoFrame(end);
  const drawn = new Set(frame.lines.map(strokeKey));
  const endDrawn = new Set(end?.kind === 'failover' ? end.lines.map(strokeKey) : []);
  return (
    <g className="ng-path-layer ng-lap" aria-hidden="true">
      <g className={`ng-lap-lines${frame.faded ? ' is-faded' : ''}`}>
        {frame.lines.map(m => <Move key={strokeKey(m)} move={m} ids={ids} />)}
        {frame.moving.filter(m => !drawn.has(strokeKey(m))).map(m => <Move key={`${frame.i}|${strokeKey(m)}`} move={m} ids={ids} entering duration={frame.stepMs} />)}
      </g>
      {end?.kind === 'failover' && <g className="ng-lap-ending">
        {end.downLinks.map(d => <DownLink key={d.segmentId} link={d} />)}
        {end.lines.map(m => <Move key={strokeKey(m)} move={m} ids={ids} />)}
        {end.moving.filter(m => !endDrawn.has(strokeKey(m))).map(m => <Move key={`${frame.i}|${strokeKey(m)}`} move={m} ids={ids} entering duration={end.stepMs} />)}
      </g>}
      {demo && <g className="ng-lap-ending">
        {demo.drawn.map((m, i) => <Move key={i} move={m} ids={ids} />)}
        {demo.moving && <Move key={`${frame.i}|moving`} move={demo.moving} ids={ids} entering duration={end.stepMs} />}
      </g>}
    </g>
  );
}

/**
 * On top of everything: the green outlines and ✓ of the boxes and clouds
 * reached, a demonstration's ring, and the envelopes under way.
 * @param {{ frame: object|null }} props
 */
export function LapOver({ frame }) {
  if (!frame) return null;
  const end = frame.ending, demo = demoFrame(end);
  return (
    <g className="ng-path-layer ng-path-over ng-lap-over" aria-hidden="true">
      {frame.marks.map(s => <Outline key={`o-${s.key}`} shape={s} />)}
      {frame.marks.map(s => <g key={`m-${s.key}`} className="ng-lap-mark"><Mark x={s.mark.x} y={s.mark.y} tone="ok">✓</Mark></g>)}
      {demo?.stops.map(s => <Stop key={`${s.leg}-${s.deviceId}`} stop={s} />)}
      {demo?.arrived.map((m, i) => <Mark key={`arrived-${i}`} x={m.x} y={m.y} tone="ok">✓</Mark>)}
      {frame.moving.map(m => <Envelope key={`${frame.i}|${strokeKey(m)}`} move={m} duration={frame.stepMs} />)}
      {end?.kind === 'failover' && end.moving.map(m => <Envelope key={`${frame.i}|${strokeKey(m)}`} move={m} duration={end.stepMs} />)}
      {demo?.moving && <Envelope key={`${frame.i}|demo`} move={demo.moving} duration={end.stepMs} />}
    </g>
  );
}
