// The VLAN diagram (VLAN-1 spec §4, W9): switches, PCs with their
// addresses, links and port labels in the chosen syntax (diagram.js), in a
// frame with the firewall's zoom pattern: «−», «+» and «Уся схема», the
// frame scrolling once the drawing is bigger than it. By default the drawing
// fills its frame (up to MAX_GROW) while its smallest text stays at 12 px or
// more; otherwise it keeps 12 px text and the frame scrolls.
//
// On top of the network, as the screen passes them:
//   - a walk (diagram.js walkScene): the links the frame crossed, drawn
//     bold, each labelled «тег 10» or «без тега»; ✕ where it was dropped;
//     each PC's status in words on its fourth line (a PC the frame must not
//     reach, but did, says so in amber);
//   - broadcast domains: each PC's edge in its domain's colour and its
//     domain's number in a badge (colour is never the only signal);
//   - the prediction's own choice («☑ обрано», the third line) and the
//     round's source, both givens or the student's answer.
// «Між VLAN» (VLAN-2) adds a router box and interface lines inside the
// router and the switch (from the submitted configuration), each PC's
// «шлюз …» (a fifth line), and an IP trace (diagram.js traceScene): its
// plates say their direction (a trunk can carry the request up in one VLAN
// and down in another), and its interface lines a marker: • taking part,
// ✓ received, ✕ dropped there.
// Round 5: the labels carry explicit facts for the highlight (a port
// device-qualified, «SW1:fa0/1», so SW2's fa0/1 is never outlined with it;
// the screens' lines give theirs as { kind, value }); «Між VLAN» and «Знайди
// несправність» draw the compact layout (diagram.js COMPACT): a PC's name
// and goal on one line, a router without PCs with its tag beside its name.
// The drawing is aria-hidden: «Текстом», the choice buttons, the walk's
// words and the legend say everything it shows. PCs and switches also take
// a pointer press (the keyboard paths are the buttons in the work panel).
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { diagramView, zoomBy, zoomIn, zoomOut } from '../../../ui/topology/size.js';
import { useZoomBar } from '../../../ui/topology/useZoomBar.js';
import { COMPACT, LINES, MONO, TEXT, hostStatus, domainOf, lineStatus } from './diagram.js';
import { STEP_MS } from './walkSteps.js';
import { ui } from '../uk.js';
import HighlightLayer from '../../../ui/topology/HighlightLayer.jsx';
import { hl, vlanOf } from '../../../ui/topology/highlight.js';
import { portFact } from '../logic/facts.js';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Ctrl + wheel: zoom factor per wheel pixel (a 100 px notch ≈ one «+» step), as routing's. */
const WHEEL_ZOOM = 0.0023;
const FRAME_PAD = 8;
/** A wide stage doesn't blow the drawing up: at most this many px per unit. */
export const MAX_GROW = 1.6;
/** An interface line's marker by its status in a trace. */
const LINE_MARK = { source: '•', hop: '•', received: '✓', dropped: '✕', leaked: '✕' };

function useFrameSize(ref) {
  const [size, setSize] = useState(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setSize(s => (s && s.w === el.clientWidth && s.h === el.clientHeight ? s : { w: el.clientWidth, h: el.clientHeight }));
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return size;
}

/** A word on a link (a tag or «без тега»), on a plate so lines don't cross it. */
function LinkWord({ at, text, className }) {
  const w = text.length * MONO + 8;
  const x = at.anchor === 'end' ? at.x - w : at.anchor === 'middle' ? at.x - w / 2 : at.x;
  return (
    <g className={className}>
      <rect x={x} y={at.y - 12} width={w} height={16} rx="4" className="ng-vl-plate" />
      <text x={x + 4} y={at.y} fontSize={TEXT.label} fontWeight="700" className="ng-vl-tag-text">{text}</text>
    </g>
  );
}

/** A frame on its way (VLAN-anim Y11): the firewall's envelope size, moved
 * across its link in one step by the Web Animations API (as routing's
 * envelope; without it the token waits at the link's start). Its wire form
 * is on LinkWord's plate where the end frame's plate for this crossing
 * will be: never over a box's words or a port's label. */
function Token({ token, duration }) {
  const ref = useRef(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el?.animate) return undefined;
    const animation = el.animate(
      [{ transform: `translate(${token.from.x}px, ${token.from.y}px)` }, { transform: `translate(${token.to.x}px, ${token.to.y}px)` }],
      { duration, easing: 'ease-in-out', fill: 'forwards' },
    );
    return () => animation.cancel();
  }, [token.id, duration]);
  const word = token.tagged ? ui.tag(token.vid) : ui.untagged;
  const classes = ['ng-vl-token', token.frame > 1 && 'is-new-frame', token.back && 'is-back', token.tone != null && `ng-vl-d${token.tone} has-tone`].filter(Boolean).join(' ');
  return (
    <g className="ng-vl-moving">
      {token.badgeAt && <LinkWord at={token.badgeAt} text={token.arrow ? `${token.arrow} ${word}` : word} className={`ng-vl-tag ng-vl-token-word${token.tagged ? ' is-tagged' : ''}`} />}
      <g ref={ref} className={classes} transform={`translate(${token.from.x} ${token.from.y})`}>
        <rect x="-9" y="-6.5" width="18" height="13" rx="2" className="ng-vl-token-box" />
        <path d="M-9,-6.5 L0,1 L9,-6.5" className="ng-vl-token-flap" fill="none" />
      </g>
    </g>
  );
}

/** A fact as hl() takes it: the screens give objects { kind, value }
 * (spec 5b-1 v2; vlan/logic/facts.js), hl() reads [kind, value] pairs. */
/** A label line's highlight facts (round 5, R3): the line's own `facts`
 * ([{ kind, value }, ...]) when the screen gives them; else, as a fallback
 * only, the first VLAN its words name («VLAN 10», «vlan10»). */
const factsOf = (line, words) => (line?.facts ? line.facts : [['vlan', vlanOf(words)]]);

/** «VLAN N» inside a bridge that classified the frame, while it leaves (Y1). */
function VlanChip({ chip }) {
  const word = ui.inVlan({ vid: chip.vid });
  const w = word.length * MONO + 8;
  const x = chip.anchor === 'end' ? chip.x - w : chip.x;
  return (
    <g className="ng-vl-chip-vlan">
      <rect x={x} y={chip.y - 12} width={w} height="16" rx="4" className="ng-vl-chip-plate" />
      <text x={x + 4} y={chip.y} fontSize={TEXT.label} fontWeight="700" className="ng-vl-chip-text">{word}</text>
    </g>
  );
}

/**
 * The drawing itself.
 * @param {{ geo: object, topology: object, size: object, scene?: object|null, domains?: object[]|null,
 *   third?: Object<string, {text: string, className?: string}>, fourth?: Object<string, {text: string, className?: string}>,
 *   selected?: string[]|null, source?: string|null,
 *   onHost?: Function|null, activeSwitch?: string|null, onSwitch?: Function|null }} props
 *   `fourth`: a PC's fifth-line text (its gateway), with `geo.hostLines` 5;
 *   `activeTag`: the words on the selected device («налаштовуєш»; null: none);
 *   `tokens`, `chips`, `stepMs`: a walk in motion at its step (walkSteps.js);
 *   `quietIps`: the PCs' addresses muted (round 4, spec F3: in the prediction the VLAN decides, not the address)
 *   `highlight` (round 5, R3): { kind: 'address'|'port'|'vlan', value } outlines the labels showing
 *   that fact (a host's address, a port name; interface and host lines by their explicit `facts`,
 *   else the VLAN their words name); labels only
 */
export function DiagramSvg({ geo, topology, size, scene = null, domains = null, third = {}, fourth = {}, selected = null, source = null, onHost = null, activeSwitch = null, onSwitch = null, activeTag = ui.activeTag, tokens = [], chips = [], stepMs = STEP_MS, quietIps = false, highlight = null }) {
  const address = id => topology.hosts.find(h => h.device === id);
  const shownSource = scene?.source ?? source;
  // A link's plates: one (VLAN-1's walk), or one per frame (an IP trace).
  const plates = link => [].concat(scene?.carried[link.index] ?? []).slice(0, 2);
  const statusY = 53 + 17 * Math.max(1, (geo.hostLines ?? 4) - 3);
  return (
    <svg className={`ng-vl-svg${quietIps ? ' is-quiet-ip' : ''}`} viewBox={`${geo.view.x} ${geo.view.y} ${geo.view.w} ${geo.view.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" {...size}>
      <g className="ng-vl-links">
        {geo.links.map(link => <line key={link.index} {...link.line} className={`ng-vl-link${link.kind === 'trunk' ? ' is-trunk' : ''}`} />)}
      </g>
      {scene && (
        <g className="ng-vl-walk">
          {geo.links.filter(link => scene.carried[link.index]).map(link => <line key={link.index} {...link.line} className="ng-vl-path" />)}
        </g>
      )}
      <g className="ng-vl-ports">
        {geo.links.flatMap(link => Object.entries(link.ends).filter(([, end]) => end.label).map(([key, end]) => (
          <g key={key}>
            <rect x={end.port.x - 4} y={end.port.y - 4} width="8" height="8" rx="1.5" className="ng-vl-port-mark" />
            <text x={end.text.x} y={end.text.y} textAnchor={end.text.anchor} fontSize={TEXT.label} className="ng-vl-port-name" {...hl(highlight, (portFact(key.split('|')[0], end.label)))}>{end.label}</text>
          </g>
        )))}
      </g>
      {geo.switches.map(sw => {
        const dropped = scene?.deviceDrops?.[sw.id];
        return (
          <g key={sw.id} className={`ng-vl-switch${sw.kind === 'router' ? ' is-router' : ''}${activeSwitch === sw.id ? ' is-active' : ''}${onSwitch ? ' is-pickable' : ''}${dropped ? ' is-dropped' : ''}`}
            onClick={onSwitch ? () => onSwitch(sw.id) : undefined}>
            <rect x={sw.x} y={sw.y} width={sw.w} height={sw.h} rx={sw.kind === 'router' ? 18 : 8} className="ng-vl-switch-box" />
            {sw.inlineTag ? (
              // Compact (round 5): a router without PCs says its tag beside its name, one row; with a physical
              // interface's line (repair v1), the name starts the row and the line ends it.
              <>
                <text x={sw.head ? sw.x + LINES.pad : sw.cx} y={sw.y + 22} textAnchor={sw.head ? 'start' : 'middle'}>
                  <tspan fontSize={TEXT.switch} fontWeight="700" className="ng-vl-switch-name ng-vl-sans">{dropped ? `${sw.id} ✕` : sw.id}</tspan>
                  {activeSwitch === sw.id && activeTag && <tspan dx="8" fontSize={TEXT.label} className="ng-vl-active-tag ng-vl-sans">{activeTag}</tspan>}
                </text>
                {sw.head && (() => {
                  const status = scene ? lineStatus(scene, sw.head) : null;
                  return (
                    <g className={`ng-vl-iface${sw.head.kind ? ` is-${sw.head.kind}` : ''}${status ? ` is-${status}` : ''}`}>
                      <text x={sw.x + sw.w - LINES.pad} y={sw.y + 22} textAnchor="end" fontSize={TEXT.label}>
                        {status && <tspan fontWeight="700" className="ng-vl-iface-mark">{`${LINE_MARK[status]} `}</tspan>}
                        <tspan fontWeight={status ? 700 : 400} className="ng-vl-iface-text" {...hl(highlight, ...factsOf(sw.head, sw.head.text))}>{sw.head.text}</tspan>
                      </text>
                    </g>
                  );
                })()}
              </>
            ) : <>
              <text x={sw.cx} y={sw.y + 22} textAnchor="middle" fontSize={TEXT.switch} fontWeight="700" className="ng-vl-switch-name ng-vl-sans">{dropped ? `${sw.id} ✕` : sw.id}</text>
              {activeSwitch === sw.id && activeTag && (
                // The device whose form is open: a tinted box, an outline and these words (never colour alone).
                // Compact: regular weight, so the word fits the narrow column.
                <text x={sw.cx} y={sw.y + 40} textAnchor="middle" fontSize={TEXT.label} fontWeight={geo.compact ? 400 : 700} className="ng-vl-active-tag ng-vl-sans">{activeTag}</text>
              )}
            </>}
            {sw.tray && (
              // Compact (repair v1): a device with PCs shows its lines on a tray under its PC rows.
              <g className="ng-vl-tray">
                <rect x={sw.tray.x} y={sw.tray.y} width={sw.tray.w} height={sw.tray.h} rx="6" className="ng-vl-switch-box" />
                {sw.tray.lines.map((line, i) => {
                  const status = scene ? lineStatus(scene, line) : null;
                  const y = sw.tray.y + 24 + i * LINES.step;
                  return (
                    <g key={i} className={`ng-vl-iface${line.kind ? ` is-${line.kind}` : ''}${status ? ` is-${status}` : ''}`}>
                      {status && <text x={sw.tray.x + LINES.pad} y={y} fontSize={TEXT.label} fontWeight="700" className="ng-vl-iface-mark">{LINE_MARK[status]}</text>}
                      <text x={sw.tray.x + LINES.pad + LINES.mark} y={y} fontSize={TEXT.label} fontWeight={status ? 700 : 400} className="ng-vl-iface-text"
                        {...hl(highlight, ...factsOf(line, line.shown))}>{line.shown}</text>
                    </g>
                  );
                })}
              </g>
            )}
            {(sw.lines ?? []).map((line, i) => {
              const status = scene ? lineStatus(scene, line) : null;
              const y = sw.y + (sw.linesTop ?? LINES.top) + i * LINES.step;
              // A line's leading spaces (an address under its interface) become its indent: SVG collapses them.
              const words = line.shown ?? line.text, indent = words.length - words.trimStart().length;
              return (
                <g key={i} className={`ng-vl-iface${line.kind ? ` is-${line.kind}` : ''}${status ? ` is-${status}` : ''}`}>
                  {status && <text x={sw.x + LINES.pad} y={y} fontSize={TEXT.label} fontWeight="700" className="ng-vl-iface-mark">{LINE_MARK[status]}</text>}
                  <text x={sw.x + LINES.pad + LINES.mark + indent * MONO} y={y} fontSize={TEXT.label} fontWeight={status ? 700 : 400} className="ng-vl-iface-text"
                    {...hl(highlight, ...factsOf(line, words))}>{words.trimStart()}</text>
                </g>
              );
            })}
          </g>
        );
      })}
      {geo.hosts.map(box => {
        const host = address(box.id);
        const status = hostStatus(scene, box.id);
        const domain = domainOf(domains, box.id);
        const picked = selected?.includes(box.id);
        const line3 = third[box.id], line4 = fourth[box.id];
        // The status word: the round's source before a walk; the walk's outcome after.
        const word = status && status !== 'missed' ? status : !scene && shownSource === box.id ? 'source' : null;
        const classes = ['ng-vl-host', status && `is-${status}`, !scene && shownSource === box.id && 'is-source', picked && 'is-picked',
          domain && `ng-vl-d${domain.colour}`, domain && 'has-domain', onHost && box.id !== shownSource && 'is-pickable'].filter(Boolean).join(' ');
        // Compact (round 5): the name and the third line share the first line; then the address, the fourth line, the status.
        const c = geo.compact;
        const tx = box.x + (c ? COMPACT.pad : 10);
        const ys = c
          ? { ip: COMPACT.name + COMPACT.step, fourth: COMPACT.name + 2 * COMPACT.step, status: COMPACT.name + COMPACT.step * (line4 || (geo.hostLines ?? 4) >= 5 ? 3 : 2) }
          : { ip: 36, fourth: 70, status: statusY };
        const thirdProps = line3 ? { fontSize: TEXT.label, fontWeight: '700', className: `ng-vl-host-third${line3.className ? ` ${line3.className}` : ''}`, ...hl(highlight, ...factsOf(line3, line3.text)) } : null;
        return (
          <g key={box.id} className={classes} onClick={onHost && box.id !== shownSource ? () => onHost(box.id) : undefined}>
            <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="6" className="ng-vl-host-box" />
            {c ? (
              <text x={tx} y={box.y + COMPACT.name}>
                <tspan fontSize={TEXT.name} fontWeight="700" className="ng-vl-host-name ng-vl-sans">{box.id}</tspan>
                {line3 && <tspan dx={COMPACT.nameGap} {...thirdProps}>{line3.text}</tspan>}
              </text>
            ) : <text x={tx} y={box.y + 18} fontSize={TEXT.name} fontWeight="700" className="ng-vl-host-name ng-vl-sans">{box.id}</text>}
            <text x={tx} y={box.y + ys.ip} fontSize={TEXT.label} className="ng-vl-host-ip" {...hl(highlight, ['address', host?.ip])}>{`${host?.ip}/${host?.prefix}`}</text>
            {line3 && !c && <text x={tx} y={box.y + 53} {...thirdProps}>{line3.text}</text>}
            {line4 && <text x={tx} y={box.y + ys.fourth} fontSize={TEXT.label} className={`ng-vl-host-fourth${line4.className ? ` ${line4.className}` : ''}`} {...hl(highlight, ...(line4.facts ?? []))}>{line4.text}</text>}
            {word && <text x={tx} y={box.y + ys.status} fontSize={TEXT.label} fontWeight={word === 'received' || word === 'tagged' ? 700 : 400} className={`ng-vl-status ng-vl-sans is-${word}`}>{ui.status[word]}</text>}
            {domain && (
              <g className="ng-vl-badge">
                <circle cx={box.side === 'left' ? box.x : box.x + box.w} cy={box.y} r="10" className="ng-vl-badge-dot" />
                <text x={box.side === 'left' ? box.x : box.x + box.w} y={box.y + 4.5} textAnchor="middle" fontSize={TEXT.label} fontWeight="700" className="ng-vl-badge-text">{domain.n}</text>
              </g>
            )}
          </g>
        );
      })}
      {scene && geo.links.flatMap(link => plates(link).filter((_, i) => (i === 0 ? link.tag : link.tag2)).map((carried, i) => {
        const word = carried.tagged ? ui.tag(carried.vid) : ui.untagged;
        return <LinkWord key={`${link.index}-${i}`} at={i === 0 ? link.tag : link.tag2} text={carried.arrow ? `${carried.arrow} ${word}` : word} className={`ng-vl-tag${carried.tagged ? ' is-tagged' : ''}`} />;
      }))}
      {chips.map(chip => <VlanChip key={chip.key} chip={chip} />)}
      {tokens.map(token => <Token key={token.id} token={token} duration={stepMs} />)}
      {scene && scene.drops.map(drop => {
        const end = geo.links.map(link => link.ends[`${drop.device}|${drop.port}`]).find(Boolean);
        if (!end) return null;
        return (
          <g key={`${drop.device}|${drop.port}`} className={`ng-vl-drop${drop.code === 'not-allowed-out' ? ' is-quiet' : ''}`}>
            <circle cx={end.mark.x} cy={end.mark.y} r="7" className="ng-vl-drop-dot" />
            <text x={end.mark.x} y={end.mark.y + 4} textAnchor="middle" fontSize={TEXT.label} fontWeight="700" className="ng-vl-drop-text">✕</text>
          </g>
        );
      })}
      <HighlightLayer highlight={highlight} />
    </svg>
  );
}

/**
 * @param {{ geo: object, topology: object, zoom?: undefined|'all'|number, onZoom?: Function, viewKey?: string,
 *   tools?: any, overlays?: any, covered?: boolean, caption?: string|null } & object} props the rest go to DiagramSvg
 */
export default function VlanDiagram({ geo, zoom, onZoom = () => {}, viewKey, tools = null, overlays = null, covered = false, caption = null, evidence = false, ...drawing }) {
  const frameRef = useRef(null);
  const frame = useFrameSize(frameRef);
  const inner = frame && frame.w > 0
    ? { width: Math.min(frame.w - 2 * FRAME_PAD, geo.view.w * MAX_GROW), height: Math.min(frame.h - 2 * FRAME_PAD, geo.view.h * MAX_GROW) }
    : null;
  const view = inner && inner.height > 0 ? diagramView(geo.view, TEXT.min, inner, zoom) : null;
  // A new task instance starts at the top left.
  const lastKey = useRef(viewKey);
  useIsoLayoutEffect(() => {
    if (lastKey.current === viewKey) return;
    lastKey.current = viewKey;
    if (frameRef.current) { frameRef.current.scrollLeft = 0; frameRef.current.scrollTop = 0; }
  }, [viewKey]);

  // Round 4 A3: the bar only when the fitted diagram's text is too small, or once the learner zoomed.
  const showZoom = useZoomBar({ taskKey: viewKey, width: frame?.w, fitPx: view ? view.fitScale * TEXT.min : null, zoom });
  const free = view && !covered;
  const can = { out: Boolean(free && view.canZoomOut), in: Boolean(free && view.canZoomIn), all: Boolean(free && !view.all) };
  const z = ui.zoom;
  // Ctrl + wheel zooms the diagram, never the page (routing's behaviour, a
  // non-passive listener); a stored zoom then shows the bar (useZoomBar).
  const live = useRef(null);
  live.current = { view, covered, onZoom };
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { view: v, covered: hidden, onZoom: store } = live.current;
      if (!v || hidden) return;
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      store(zoomBy(v, Math.exp(-px * WHEEL_ZOOM)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  function onZoomKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === '+' || e.key === '=') && can.in) { e.preventDefault(); onZoom(zoomIn(view)); }
    else if ((e.key === '-' || e.key === '_' || e.key === '−') && can.out) { e.preventDefault(); onZoom(zoomOut(view)); }
  }
  const size = view ? { width: view.width, height: view.height } : { width: '100%' };
  return (
    <div className="ng-vl-dg">
      <div className="ng-vl-tools">
        {tools}
        {showZoom && (
          <div className="ng-vl-zoom" role="group" aria-label={z.group} onKeyDown={onZoomKey}>
            <button type="button" className="ng-vl-icon" aria-label={z.out} title={z.out} aria-disabled={!can.out} onClick={() => { if (can.out) onZoom(zoomOut(view)); }}>−</button>
            <button type="button" className="ng-vl-icon" aria-label={z.in} title={z.in} aria-disabled={!can.in} onClick={() => { if (can.in) onZoom(zoomIn(view)); }}>+</button>
            {can.all && <button type="button" className="ng-vl-btn" aria-label={z.allLabel} title={z.allLabel} onClick={() => onZoom('all')}>{z.all}</button>}
          </div>
        )}
      </div>
      {/* The view keeps the drawing's own height (text at 12 px) where it can: the stage scrolls instead of the drawing panning. */}
      {/* `evidence`: the help panel's current message is about the drawing (a walk, a hint before a check). */}
      <div className={`ng-vl-view${covered ? ' has-overlay' : ''}`} style={{ '--ng-vl-natural': `${Math.ceil(geo.view.h + 2 * FRAME_PAD)}px` }}
        {...(evidence ? { 'data-evidence': 'current' } : {})}>
        <div ref={frameRef} className={`ng-vl-frame${view?.pan ? ' is-pan' : ''}${covered ? ' is-covered' : ''}`}
          data-scale={view ? view.scale.toFixed(3) : undefined} tabIndex={covered ? -1 : 0} role="region" aria-label={ui.frameLabel} onKeyDown={onZoomKey}>
          <DiagramSvg geo={geo} size={size} {...drawing} />
        </div>
        {/* A router's hop under way (Y3): over the frame, so nothing wraps or
            resizes mid-walk (fix brief item 5); the text walk says it for good. */}
        {caption && <p className="ng-vl-motion-caption" aria-hidden="true">{caption}</p>}
        {overlays}
      </div>
    </div>
  );
}
