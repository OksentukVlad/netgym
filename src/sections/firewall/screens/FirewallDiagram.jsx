// The firewall's diagram (FW-1 screen spec §3, v2 S4): its own SVG, not
// routing's map. The layout and what it shows at a frame are diagram.js;
// this draws them in a frame with routing's zoom pattern as the fallback
// when the stage is narrower than the drawing: «−», «+» and «Уся схема»,
// with the frame scrolling once the drawing is bigger than it. By default
// the drawing fills its frame (up to MAX_GROW) while its smallest text stays
// at 12 px or more; otherwise it keeps 12 px text and the frame scrolls.
// The zoom is the task instance's (`zoom`, `onZoom`: the store).
//
// The drawing is aria-hidden: the card, the walk in the table, the feedback
// and «Текстом» say everything it shows. Overlays («Правила», «Текстом»)
// are laid over the frame, so opening one doesn't move the page.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { diagramView, zoomBy, zoomIn, zoomOut } from '../../../ui/topology/size.js';
import { useZoomBar } from '../../../ui/topology/useZoomBar.js';
import HighlightLayer from '../../../ui/topology/HighlightLayer.jsx';
import { hl } from '../../../ui/topology/highlight.js';
import { ADDRESSES, BUS, CLOUD, CORE, DOORS, HOSTS, ISP, LANES, PORTS, R1, TEXT, UNDER, VIEW, pointsOf } from './diagram.js';
import { ui } from '../uk.js';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Ctrl + wheel: zoom factor per wheel pixel (a 100 px notch ≈ one «+» step), as routing's. */
const WHEEL_ZOOM = 0.0023;
/** The frame's padding (firewall.css .ng-fw-frame). */
const FRAME_PAD = 8;
/** A wide stage doesn't blow the drawing up: at most this many px per unit. */
export const MAX_GROW = 1.6;

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

const hostLabel = { pc: ui.pc, 'web-server': ui.server };

/** The diagram label ids of the address labels (logic's cardView owner.labelId). */
export const ROUTER_LABEL = 'fw-label-router-addresses';
export const hostLabelId = host => `fw-label-${host.id}-address`;

/** A port's label under the link, outside R1: «ether1 · WAN» (round 5: its address is in R1's block). */
function PortLabel({ port, lists, ingress, highlight }) {
  const p = PORTS[port];
  const left = p.side === 'left';
  const x = left ? p.x - 6 : p.x + 6;
  const anchor = left ? 'end' : 'start';
  return (
    <g className={`ng-fw-port${ingress ? ' is-given' : ''}`}>
      <rect x={p.x - 5} y={p.y - 5} width="10" height="10" rx="2" className="ng-fw-port-mark" />
      <text x={x} y={UNDER.label} textAnchor={anchor} className="ng-fw-port-name" fontSize={TEXT.label} fontWeight="700" {...hl(highlight, ['port', port])}>{`${port} · ${lists.join(', ')}`}</text>
    </g>
  );
}

/** The router's own addresses inside R1 (round 5, spec G): the heading, then each interface and its address, WAN first. */
function RouterAddresses({ router, highlight }) {
  return (
    <g className="ng-fw-addresses" {...hl(highlight, ['label', ROUTER_LABEL])}>
      <text x={ADDRESSES.x} y={ADDRESSES.y[0]} className="ng-fw-addresses-title ng-fw-sans" fontSize={TEXT.label}>{ui.routerAddresses}</text>
      {router.interfaces.map((iface, i) => (
        <text key={iface.id} x={ADDRESSES.x} y={ADDRESSES.y[i + 1]} className="ng-fw-address" fontSize={TEXT.label} fontWeight="700"
          {...hl(highlight, ['address', iface.address])}>{`${iface.id} · ${iface.address}`}</text>
      ))}
    </g>
  );
}

/** The ingress port's list chip: «ether1 ∈ WAN». */
function IngressChip({ port, lists }) {
  const p = PORTS[port];
  const text = ui.ingressChip(port, lists);
  const w = text.length * 7.4 + 14;
  const x = p.side === 'left' ? p.x - 6 - w : p.x + 6;
  return (
    <g className="ng-fw-chip">
      <rect x={x} y={UNDER.chip} width={w} height="20" rx="10" className="ng-fw-chip-box" />
      <text x={x + w / 2} y={UNDER.chip + 14} textAnchor="middle" className="ng-fw-chip-text" fontSize={TEXT.label} fontWeight="700">{text}</text>
    </g>
  );
}

function Door({ hook, state }) {
  const d = DOORS[hook];
  const [name, words] = ui.hook[hook].split(' — ');
  return (
    <g className={`ng-fw-door is-${state}`}>
      <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="8" className="ng-fw-door-box" />
      <text x={d.x + d.w / 2} y={d.y + 16} textAnchor="middle" className="ng-fw-door-name" fontSize={TEXT.door} fontWeight="700">{name}</text>
      <text x={d.x + d.w / 2} y={d.y + 33} textAnchor="middle" className="ng-fw-door-words ng-fw-sans" fontSize={TEXT.door}>{words}</text>
    </g>
  );
}

/** The drawing itself at a scene (diagram.js sceneOf). `highlight`: { kind, value } (ui/topology/highlight.js), labels only. */
export function DiagramSvg({ scene, topology, size, highlight = null }) {
  const { router, hosts } = topology;
  const listsOf = id => Object.keys(router.lists).filter(name => router.lists[name].includes(id));
  const hostOf = role => hosts.find(h => h.role === role);
  const given = place => `${scene.source === place ? ' is-given' : ''}${scene.arrived === place ? ' is-arrived' : ''}`;
  return (
    <svg className="ng-fw-svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" {...size}>
      {/* Links outside R1, then R1 and its lanes. */}
      <g className="ng-fw-links">
        <line x1={CLOUD.cx} y1={CLOUD.cy + CLOUD.ry} x2={CLOUD.cx} y2={ISP.y} className="ng-fw-link" />
        <line x1={ISP.x + ISP.w} y1={PORTS.ether1.y} x2={PORTS.ether1.x} y2={PORTS.ether1.y} className="ng-fw-link" />
        <line x1={PORTS.bridge.x} y1={PORTS.bridge.y} x2={BUS.x} y2={PORTS.bridge.y} className="ng-fw-link" />
        <line x1={BUS.x} y1={BUS.y1} x2={BUS.x} y2={BUS.y2} className="ng-fw-link" />
        {Object.values(HOSTS).map(box => <line key={box.y} x1={BUS.x} y1={box.y + box.h / 2} x2={box.x} y2={box.y + box.h / 2} className="ng-fw-link" />)}
      </g>
      <rect x={R1.x} y={R1.y} width={R1.w} height={R1.h} rx="14" className="ng-fw-router" />
      <text x={R1.x + 14} y={R1.y + 26} className="ng-fw-router-name ng-fw-sans" fontSize={TEXT.router} fontWeight="700">R1</text>
      <g className="ng-fw-lanes">
        {LANES.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`ng-fw-lane${scene.doors[l.hook] === 'dim' ? ' is-dim' : ''}`} />)}
      </g>
      <g className={`ng-fw-core${scene.arrived === 'core' ? ' is-reached' : ''}`}>
        <circle cx={CORE.x} cy={CORE.y} r={CORE.r} className="ng-fw-core-mark" />
        <circle cx={CORE.x} cy={CORE.y} r="4" className="ng-fw-core-dot" />
        <text x={CORE.x + CORE.r + 6} y={CORE.y + 4} className="ng-fw-core-text ng-fw-sans" fontSize={TEXT.label}>{ui.core}</text>
      </g>
      {/* The path so far (under the doors and boxes, so their words stay on top). */}
      <g className="ng-fw-path">
        {scene.path.map((points, i) => <polyline key={i} points={pointsOf(points)} className="ng-fw-path-line" />)}
      </g>
      <Door hook="input" state={scene.doors.input} />
      <Door hook="forward" state={scene.doors.forward} />

      {/* Outside R1: the internet, the ISP gateway, the hosts. */}
      <g className={`ng-fw-place ng-fw-internet${given('internet')}`}>
        <ellipse cx={CLOUD.cx} cy={CLOUD.cy} rx={CLOUD.rx} ry={CLOUD.ry} className="ng-fw-box" />
        <text x={CLOUD.cx} y={CLOUD.cy - 6} textAnchor="middle" className="ng-fw-box-name ng-fw-sans" fontSize={TEXT.name} fontWeight="700">{ui.internet}</text>
        <text x={CLOUD.cx} y={CLOUD.cy + 12} textAnchor="middle" className="ng-fw-box-ip" fontSize={TEXT.label} fontWeight="700"
          {...hl(highlight, ['label', hostOf('internet') && hostLabelId(hostOf('internet'))], ['address', hostOf('internet')?.address])}>{hostOf('internet')?.address}</text>
      </g>
      <g className="ng-fw-place ng-fw-isp">
        <rect x={ISP.x} y={ISP.y} width={ISP.w} height={ISP.h} rx="6" className="ng-fw-box" />
        <text x={ISP.x + ISP.w / 2} y={ISP.y + 18} textAnchor="middle" className="ng-fw-box-name ng-fw-sans" fontSize={TEXT.label}>{ui.isp}</text>
        <text x={ISP.x + ISP.w / 2} y={ISP.y + 35} textAnchor="middle" className="ng-fw-box-ip" fontSize={TEXT.label} {...hl(highlight, ['address', router.gateway])}>{router.gateway}</text>
      </g>
      {Object.entries(HOSTS).map(([role, box]) => (
        <g key={role} className={`ng-fw-place${given(role)}`}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="6" className="ng-fw-box" />
          <text x={box.x + box.w / 2} y={box.y + 18} textAnchor="middle" className="ng-fw-box-name ng-fw-sans" fontSize={TEXT.name} fontWeight="700">{hostLabel[role]}</text>
          <text x={box.x + box.w / 2} y={box.y + 35} textAnchor="middle" className="ng-fw-box-ip" fontSize={TEXT.label} fontWeight="700"
            {...hl(highlight, ['label', hostOf(role) && hostLabelId(hostOf(role))], ['address', hostOf(role)?.address])}>{hostOf(role)?.address}</text>
        </g>
      ))}
      <RouterAddresses router={router} highlight={highlight} />
      {['ether1', 'bridge'].map(port => <PortLabel key={port} port={port} lists={listsOf(port)} ingress={scene.ingress === port} highlight={highlight} />)}
      {scene.ingress && scene.ingressLists.length > 0 && <IngressChip port={scene.ingress} lists={scene.ingressLists} />}
      {scene.nat && (
        <text className="ng-fw-nat" fontSize={TEXT.label} fontWeight="700">
          {ui.natLines(scene.nat).map((line, i) => <tspan key={i} x={PORTS.bridge.x + 6} y={UNDER.nat[i]}>{line}</tspan>)}
        </text>
      )}

      {/* On top: ✕ at the door, the envelope (waiting: a small pulsing mark). */}
      {scene.stop && (
        <g className="ng-fw-stop">
          <circle cx={scene.stop.x} cy={scene.stop.y} r="10" className="ng-fw-stop-dot" />
          <text x={scene.stop.x} y={scene.stop.y + 5} textAnchor="middle" className="ng-fw-stop-text" fontSize="14" fontWeight="700">✕</text>
        </g>
      )}
      {scene.envelope && (
        <g className="ng-fw-envelope" style={{ transform: `translate(${scene.envelope.x}px, ${scene.envelope.y}px)` }}>
          {scene.envelope.waiting && <circle r="15" className="ng-fw-waiting" />}
          <rect x="-9" y="-6.5" width="18" height="13" rx="2" className="ng-fw-envelope-box" />
          <path d="M-9,-6.5 L0,1 L9,-6.5" className="ng-fw-envelope-flap" fill="none" />
        </g>
      )}
      <HighlightLayer highlight={highlight} />
    </svg>
  );
}

/**
 * @param {{ scene: object, topology: object, zoom?: undefined|'all'|number, onZoom?: Function,
 *   viewKey?: string, tools?: any, overlays?: any, covered?: boolean, highlight?: object|null }} props
 * `highlight`: a fact's label to outline (round 5, R3; label only).
 * Round 4 (spec A3, ui/topology/useZoomBar.js): «−», «+» and «Уся схема» show
 * only when the fitted drawing's text would be below 12 px, or once the
 * learner has zoomed (the keys work without the bar); never because a packet
 * or a check appeared. «Уся схема» only while it would change something.
 */
export default function FirewallDiagram({ scene, topology, zoom, onZoom = () => {}, viewKey, tools = null, overlays = null, covered = false, highlight = null }) {
  const frameRef = useRef(null);
  const frame = useFrameSize(frameRef);
  const inner = frame && frame.w > 0
    ? { width: Math.min(frame.w - 2 * FRAME_PAD, VIEW.w * MAX_GROW), height: Math.min(frame.h - 2 * FRAME_PAD, VIEW.h * MAX_GROW) }
    : null;
  const view = inner && inner.height > 0 ? diagramView(VIEW, TEXT.min, inner, zoom) : null;
  // A new task instance starts at the top left.
  const lastKey = useRef(viewKey);
  useIsoLayoutEffect(() => {
    if (lastKey.current === viewKey) return;
    lastKey.current = viewKey;
    if (frameRef.current) { frameRef.current.scrollLeft = 0; frameRef.current.scrollTop = 0; }
  }, [viewKey]);

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
    <div className="ng-fw-dg">
      <div className="ng-fw-tools">
        {tools}
        {showZoom && (
          <div className="ng-fw-zoom" role="group" aria-label={z.group} onKeyDown={onZoomKey}>
            <button type="button" className="ng-fw-icon" aria-label={z.out} title={z.out} aria-disabled={!can.out} onClick={() => { if (can.out) onZoom(zoomOut(view)); }}>−</button>
            <button type="button" className="ng-fw-icon" aria-label={z.in} title={z.in} aria-disabled={!can.in} onClick={() => { if (can.in) onZoom(zoomIn(view)); }}>+</button>
            {can.all && <button type="button" className="ng-fw-btn" aria-label={z.allLabel} title={z.allLabel} onClick={() => onZoom('all')}>{z.all}</button>}
          </div>
        )}
      </div>
      <div className={`ng-fw-view${covered ? ' has-overlay' : ''}`}>
        <div ref={frameRef} className={`ng-fw-frame${view?.pan ? ' is-pan' : ''}${covered ? ' is-covered' : ''}`}
          data-scale={view ? view.scale.toFixed(3) : undefined} tabIndex={covered ? -1 : 0} role="region" aria-label={ui.frameLabel} onKeyDown={onZoomKey}>
          <DiagramSvg scene={scene} topology={topology} size={size} highlight={highlight} />
        </div>
        {overlays}
      </div>
    </div>
  );
}
