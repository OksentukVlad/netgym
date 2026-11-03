// The PC / R1 / Інтернет drawing (FW-1 screen spec §3, v2 S4; shared in
// round 6 for «DHCP і NAT»). Its own SVG, not routing's map. The layout is
// router-layout.js; this draws it in a frame with routing's zoom pattern as
// the fallback when the stage is narrower than the drawing: «−», «+» and
// «Уся схема», with the frame scrolling once the drawing is bigger than it.
// By default the drawing fills its frame (up to MAX_GROW) while its smallest
// text stays at 12 px or more; otherwise it keeps 12 px text and the frame
// scrolls. The zoom is the task instance's (`zoom`, `onZoom`: the store).
//
// Two views (`view`):
//   - 'firewall': the doors, lanes and core inside R1, the server, the
//     ingress chip, the walk's path and envelope (the firewall's scene);
//   - 'dhcp': the PC, R1 with its two-address block (WAN first, with its
//     prefix where the topology asks for it: `showPrefix`), the port labels, the ISP gateway
//     and the cloud with its address; no doors, lanes, core or chip, and the
//     server only when the topology has one (spec v2.1: E3's LAN-server card).
// The words are the caller's (`words`: the firewall's `ui`, or DHCP's).
// A topology may name its ports in the vendor's words (`router.portNames`,
// «g0/0» for ether1): the label says that name, and carries both facts.
//
// The drawing is aria-hidden: the screen's text and «Текстом» say everything
// it shows. Overlays («Текстом») are laid over the frame, so opening one
// doesn't move the page.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { diagramView, zoomBy, zoomIn, zoomOut } from './size.js';
import { useZoomBar } from './useZoomBar.js';
import HighlightLayer from './HighlightLayer.jsx';
import { hl } from './highlight.js';
import { BUS, CLOUD, CORE, DOORS, HOSTS, ISP, LANES, PORTS, TEXT, UNDER, VIEWS, pointsOf } from './router-layout.js';
import '../tokens.css';
import './RouterDiagram.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Ctrl + wheel: zoom factor per wheel pixel (a 100 px notch ≈ one «+» step), as routing's. */
const WHEEL_ZOOM = 0.0023;
/** The frame's padding (RouterDiagram.css .ng-fw-frame). */
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

/** The diagram label ids of the address labels (the firewall logic's cardView owner.labelId). */
export const ROUTER_LABEL = 'fw-label-router-addresses';
export const hostLabelId = host => `fw-label-${host.id}-address`;

/** No packet on the drawing: doors neutral, no path (the DHCP view's only scene). */
export const NEUTRAL_SCENE = Object.freeze({ source: null, ingress: null, ingressLists: [], nat: null, doors: { input: 'neutral', forward: 'neutral' }, path: [], envelope: null, stop: null, arrived: null });

/** A port's label under the link, outside R1: «ether1 · WAN» (round 5: its address is in R1's block). */
function PortLabel({ port, name, lists, ingress, highlight }) {
  const p = PORTS[port];
  const left = p.side === 'left';
  const x = left ? p.x - 6 : p.x + 6;
  const anchor = left ? 'end' : 'start';
  return (
    <g className={`ng-fw-port${ingress ? ' is-given' : ''}`}>
      <rect x={p.x - 5} y={p.y - 5} width="10" height="10" rx="2" className="ng-fw-port-mark" />
      <text x={x} y={UNDER.label} textAnchor={anchor} className="ng-fw-port-name" fontSize={TEXT.label} fontWeight="700"
        {...hl(highlight, ['port', port], ...(name !== port ? [['port', name]] : []))}>{`${name} · ${lists.join(', ')}`}</text>
    </g>
  );
}

/** The router's own addresses inside R1 (round 5, spec G): the heading, then each interface and its address, WAN first. */
function RouterAddresses({ router, highlight, words, at }) {
  return (
    <g className="ng-fw-addresses" {...hl(highlight, ['label', ROUTER_LABEL])}>
      <text x={at.x} y={at.y[0]} className="ng-fw-addresses-title ng-fw-sans" fontSize={TEXT.label}>{words.routerAddresses}</text>
      {router.interfaces.map((iface, i) => (
        <text key={iface.id} x={at.x} y={at.y[i + 1]} className="ng-fw-address" fontSize={TEXT.label} fontWeight="700"
          {...hl(highlight, ['address', iface.address])}>{`${iface.id} · ${iface.address}${iface.showPrefix ? `/${iface.prefix}` : ''}`}</text>
      ))}
    </g>
  );
}

/** The ingress port's list chip: «ether1 ∈ WAN». */
function IngressChip({ port, lists, words }) {
  const p = PORTS[port];
  const text = words.ingressChip(port, lists);
  const w = text.length * 7.4 + 14;
  const x = p.side === 'left' ? p.x - 6 - w : p.x + 6;
  return (
    <g className="ng-fw-chip">
      <rect x={x} y={UNDER.chip} width={w} height="20" rx="10" className="ng-fw-chip-box" />
      <text x={x + w / 2} y={UNDER.chip + 14} textAnchor="middle" className="ng-fw-chip-text" fontSize={TEXT.label} fontWeight="700">{text}</text>
    </g>
  );
}

function Door({ hook, state, words }) {
  const d = DOORS[hook];
  const [name, said] = words.hook[hook].split(' — ');
  return (
    <g className={`ng-fw-door is-${state}`}>
      <rect x={d.x} y={d.y} width={d.w} height={d.h} rx="8" className="ng-fw-door-box" />
      <text x={d.x + d.w / 2} y={d.y + 16} textAnchor="middle" className="ng-fw-door-name" fontSize={TEXT.door} fontWeight="700">{name}</text>
      <text x={d.x + d.w / 2} y={d.y + 33} textAnchor="middle" className="ng-fw-door-words ng-fw-sans" fontSize={TEXT.door}>{said}</text>
    </g>
  );
}

/**
 * The drawing itself at a scene (the firewall's diagram.js sceneOf; the DHCP view has none).
 * `highlight`: { kind, value } (highlight.js), labels only. `words`: internet, isp, pc, server,
 * routerAddresses; the firewall's view also core, hook, ingressChip, natLines.
 */
export function RouterSvg({ scene = NEUTRAL_SCENE, topology, size, highlight = null, words, view = 'firewall' }) {
  const { router, hosts } = topology;
  const firewall = view !== 'dhcp';
  const { VIEW, R1, ADDRESSES } = VIEWS[firewall ? 'firewall' : 'dhcp'];
  const listsOf = id => Object.keys(router.lists).filter(name => router.lists[name].includes(id));
  const hostOf = role => hosts.find(h => h.role === role);
  const given = place => `${scene.source === place ? ' is-given' : ''}${scene.arrived === place ? ' is-arrived' : ''}`;
  const hostLabel = { pc: words.pc, 'web-server': words.server };
  // The DHCP view draws a host's box only when the topology has that host.
  const boxes = Object.entries(HOSTS).filter(([role]) => firewall || hostOf(role));
  return (
    <svg className="ng-fw-svg" viewBox={`${VIEW.x} ${VIEW.y} ${VIEW.w} ${VIEW.h}`} preserveAspectRatio="xMidYMid meet" aria-hidden="true" focusable="false" {...size}>
      {/* Links outside R1, then R1 and its lanes. */}
      <g className="ng-fw-links">
        <line x1={CLOUD.cx} y1={CLOUD.cy + CLOUD.ry} x2={CLOUD.cx} y2={ISP.y} className="ng-fw-link" />
        <line x1={ISP.x + ISP.w} y1={PORTS.ether1.y} x2={PORTS.ether1.x} y2={PORTS.ether1.y} className="ng-fw-link" />
        <line x1={PORTS.bridge.x} y1={PORTS.bridge.y} x2={BUS.x} y2={PORTS.bridge.y} className="ng-fw-link" />
        <line x1={BUS.x} y1={BUS.y1} x2={BUS.x} y2={BUS.y2} className="ng-fw-link" />
        {boxes.map(([, box]) => <line key={box.y} x1={BUS.x} y1={box.y + box.h / 2} x2={box.x} y2={box.y + box.h / 2} className="ng-fw-link" />)}
      </g>
      <rect x={R1.x} y={R1.y} width={R1.w} height={R1.h} rx="14" className="ng-fw-router" />
      <text x={R1.x + 14} y={R1.y + 26} className="ng-fw-router-name ng-fw-sans" fontSize={TEXT.router} fontWeight="700">R1</text>
      {firewall && <>
        <g className="ng-fw-lanes">
          {LANES.map(l => <line key={l.key} x1={l.x1} y1={l.y1} x2={l.x2} y2={l.y2} className={`ng-fw-lane${scene.doors[l.hook] === 'dim' ? ' is-dim' : ''}`} />)}
        </g>
        <g className={`ng-fw-core${scene.arrived === 'core' ? ' is-reached' : ''}`}>
          <circle cx={CORE.x} cy={CORE.y} r={CORE.r} className="ng-fw-core-mark" />
          <circle cx={CORE.x} cy={CORE.y} r="4" className="ng-fw-core-dot" />
          <text x={CORE.x + CORE.r + 6} y={CORE.y + 4} className="ng-fw-core-text ng-fw-sans" fontSize={TEXT.label}>{words.core}</text>
        </g>
        {/* The path so far (under the doors and boxes, so their words stay on top). */}
        <g className="ng-fw-path">
          {scene.path.map((points, i) => <polyline key={i} points={pointsOf(points)} className="ng-fw-path-line" />)}
        </g>
        <Door hook="input" state={scene.doors.input} words={words} />
        <Door hook="forward" state={scene.doors.forward} words={words} />
      </>}

      {/* Outside R1: the internet, the ISP gateway, the hosts. */}
      <g className={`ng-fw-place ng-fw-internet${given('internet')}`}>
        <ellipse cx={CLOUD.cx} cy={CLOUD.cy} rx={CLOUD.rx} ry={CLOUD.ry} className="ng-fw-box" />
        <text x={CLOUD.cx} y={CLOUD.cy - 6} textAnchor="middle" className="ng-fw-box-name ng-fw-sans" fontSize={TEXT.name} fontWeight="700">{words.internet}</text>
        <text x={CLOUD.cx} y={CLOUD.cy + 12} textAnchor="middle" className="ng-fw-box-ip" fontSize={TEXT.label} fontWeight="700"
          {...hl(highlight, ['label', hostOf('internet') && hostLabelId(hostOf('internet'))], ['address', hostOf('internet')?.address])}>{hostOf('internet')?.address}</text>
      </g>
      <g className="ng-fw-place ng-fw-isp">
        <rect x={ISP.x} y={ISP.y} width={ISP.w} height={ISP.h} rx="6" className="ng-fw-box" />
        <text x={ISP.x + ISP.w / 2} y={ISP.y + 18} textAnchor="middle" className="ng-fw-box-name ng-fw-sans" fontSize={TEXT.label}>{words.isp}</text>
        <text x={ISP.x + ISP.w / 2} y={ISP.y + 35} textAnchor="middle" className="ng-fw-box-ip" fontSize={TEXT.label} {...hl(highlight, ['address', router.gateway])}>{router.gateway}</text>
      </g>
      {boxes.map(([role, box]) => (
        <g key={role} className={`ng-fw-place${given(role)}`}>
          <rect x={box.x} y={box.y} width={box.w} height={box.h} rx="6" className="ng-fw-box" />
          <text x={box.x + box.w / 2} y={box.y + 18} textAnchor="middle" className="ng-fw-box-name ng-fw-sans" fontSize={TEXT.name} fontWeight="700">{hostLabel[role]}</text>
          <text x={box.x + box.w / 2} y={box.y + 35} textAnchor="middle" className="ng-fw-box-ip" fontSize={TEXT.label} fontWeight="700"
            {...hl(highlight, ['label', hostOf(role) && hostLabelId(hostOf(role))], ['address', hostOf(role)?.address])}>{hostOf(role)?.address}</text>
        </g>
      ))}
      <RouterAddresses router={router} highlight={highlight} words={words} at={ADDRESSES} />
      {['ether1', 'bridge'].map(port => <PortLabel key={port} port={port} name={router.portNames?.[port] ?? port} lists={listsOf(port)} ingress={scene.ingress === port} highlight={highlight} />)}
      {firewall && scene.ingress && scene.ingressLists.length > 0 && <IngressChip port={scene.ingress} lists={scene.ingressLists} words={words} />}
      {firewall && scene.nat && (
        <text className="ng-fw-nat" fontSize={TEXT.label} fontWeight="700">
          {words.natLines(scene.nat).map((line, i) => <tspan key={i} x={PORTS.bridge.x + 6} y={UNDER.nat[i]}>{line}</tspan>)}
        </text>
      )}

      {/* On top: ✕ at the door, the envelope (waiting: a small pulsing mark). */}
      {firewall && scene.stop && (
        <g className="ng-fw-stop">
          <circle cx={scene.stop.x} cy={scene.stop.y} r="10" className="ng-fw-stop-dot" />
          <text x={scene.stop.x} y={scene.stop.y + 5} textAnchor="middle" className="ng-fw-stop-text" fontSize="14" fontWeight="700">✕</text>
        </g>
      )}
      {firewall && scene.envelope && (
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
 * @param {{ scene?: object, topology: object, words: object, view?: 'firewall'|'dhcp',
 *   zoom?: undefined|'all'|number, onZoom?: Function, viewKey?: string, tools?: any, overlays?: any,
 *   covered?: boolean, highlight?: object|null }} props
 * `words` adds `zoom` ({ group, out, in, all, allLabel }) and `frameLabel` for the frame.
 * Round 4 (spec A3, useZoomBar.js): «−», «+» and «Уся схема» show only when
 * the fitted drawing's text would be below 12 px, or once the learner has
 * zoomed (the keys work without the bar); never because a packet or a check
 * appeared. «Уся схема» only while it would change something.
 */
export default function RouterDiagram({ scene = NEUTRAL_SCENE, topology, words, view = 'firewall', zoom, onZoom = () => {}, viewKey, tools = null, overlays = null, covered = false, highlight = null }) {
  const { VIEW } = VIEWS[view === 'dhcp' ? 'dhcp' : 'firewall'];
  const frameRef = useRef(null);
  const frame = useFrameSize(frameRef);
  const inner = frame && frame.w > 0
    ? { width: Math.min(frame.w - 2 * FRAME_PAD, VIEW.w * MAX_GROW), height: Math.min(frame.h - 2 * FRAME_PAD, VIEW.h * MAX_GROW) }
    : null;
  const shown = inner && inner.height > 0 ? diagramView(VIEW, TEXT.min, inner, zoom) : null;
  // A new task instance starts at the top left.
  const lastKey = useRef(viewKey);
  useIsoLayoutEffect(() => {
    if (lastKey.current === viewKey) return;
    lastKey.current = viewKey;
    if (frameRef.current) { frameRef.current.scrollLeft = 0; frameRef.current.scrollTop = 0; }
  }, [viewKey]);

  const showZoom = useZoomBar({ taskKey: viewKey, width: frame?.w, fitPx: shown ? shown.fitScale * TEXT.min : null, zoom });
  const free = shown && !covered;
  const can = { out: Boolean(free && shown.canZoomOut), in: Boolean(free && shown.canZoomIn), all: Boolean(free && !shown.all) };
  const z = words.zoom;
  // Ctrl + wheel zooms the diagram, never the page (routing's behaviour, a
  // non-passive listener); a stored zoom then shows the bar (useZoomBar).
  const live = useRef(null);
  live.current = { shown, covered, onZoom };
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { shown: v, covered: hidden, onZoom: store } = live.current;
      if (!v || hidden) return;
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      store(zoomBy(v, Math.exp(-px * WHEEL_ZOOM)));
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);
  function onZoomKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if ((e.key === '+' || e.key === '=') && can.in) { e.preventDefault(); onZoom(zoomIn(shown)); }
    else if ((e.key === '-' || e.key === '_' || e.key === '−') && can.out) { e.preventDefault(); onZoom(zoomOut(shown)); }
  }
  const size = shown ? { width: shown.width, height: shown.height } : { width: '100%' };
  return (
    <div className="ng-fw-dg" data-view={view}>
      <div className="ng-fw-tools">
        {tools}
        {showZoom && (
          <div className="ng-fw-zoom" role="group" aria-label={z.group} onKeyDown={onZoomKey}>
            <button type="button" className="ng-fw-icon" aria-label={z.out} title={z.out} aria-disabled={!can.out} onClick={() => { if (can.out) onZoom(zoomOut(shown)); }}>−</button>
            <button type="button" className="ng-fw-icon" aria-label={z.in} title={z.in} aria-disabled={!can.in} onClick={() => { if (can.in) onZoom(zoomIn(shown)); }}>+</button>
            {can.all && <button type="button" className="ng-fw-btn" aria-label={z.allLabel} title={z.allLabel} onClick={() => onZoom('all')}>{z.all}</button>}
          </div>
        )}
      </div>
      <div className={`ng-fw-view${covered ? ' has-overlay' : ''}`}>
        <div ref={frameRef} className={`ng-fw-frame${shown?.pan ? ' is-pan' : ''}${covered ? ' is-covered' : ''}`}
          data-scale={shown ? shown.scale.toFixed(3) : undefined} tabIndex={covered ? -1 : 0} role="region" aria-label={words.frameLabel} onKeyDown={onZoomKey}>
          <RouterSvg scene={scene} topology={topology} size={size} highlight={highlight} words={words} view={view} />
        </div>
        {overlays}
      </div>
    </div>
  );
}
