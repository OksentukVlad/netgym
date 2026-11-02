// The task's diagram (round 1 Cisco TopologyMap), drawn from the bank's
// network through logic/topology.js and the shared geometry.js with
// NetGym's larger font set, in the active syntax's interface labels. The
// router buttons under it are the keyboard path; the caller's children
// («Текстом») end that row. Round 5 5b-2: a network with one router (task
// 15) has nothing to choose, so no router row: the children start the tool
// row instead, at its right end (its height is reserved anyway), and the drawing gets that
// row's height, which keeps the whole drawing at 12 px under task 15's two
// sentences at 1000 × 700.
//
// The diagram frame (step 7 fix round):
//   - a tool row: the caller's `tools` («Правила») and the zoom buttons
//     «−», «+» and «Уся схема»;
//   - the drawing, in a frame that takes focus: «+» and «−» zoom there,
//     Ctrl + wheel zooms the diagram (never the page), and once the drawing
//     is bigger than the frame it pans (scrollbars, drag, arrow keys);
//   - the caller's `overlays` («Правила», «Текстом») laid over the drawing,
//     so opening one doesn't change the frame's size. While one is open
//     (`covered`), the drawing and the zoom are out of reach.
//
// Size and zoom (ui/topology/size.js): by default the diagram fills its
// frame, up to MAX_SCALE; if its smallest text would fall below 12 px there,
// it keeps 12 px text and pans instead. The zoom is the task instance's
// (`zoom`, `onZoom`: the store, through the screen), so it stays with the
// task for the session; it is not a check or a hint. Buttons and keys zoom
// about the frame's centre, the wheel about the pointer.
//
// Panning to a point: the ref's `centreOn(target, { ifHidden })` scrolls a
// router (by name) or a point of the drawing ({ x, y } in viewBox units)
// into the middle of the frame, at any zoom, without selecting anything.
// The selected router is brought into view with it when it changes; step 6
// follows a packet's current hop the same way.
//
// Step 6: the packet path is drawn in the same SVG (PathLayer.jsx):
// `underlay` after the links (under the boxes, port names and routers, so
// their words stay readable) and `overlay` on top of everything.
//
// Round 4 (spec A3, ui/topology/useZoomBar.js): the zoom bar shows only when
// the fitted drawing's text would be below 12 px, or once the learner has
// zoomed (keys and Ctrl + wheel work without it); «Уся схема» only while it
// would change something.
//
// Polish (the success lap): while `fit` is on, the frame shows the whole
// diagram («Уся схема») without touching the stored zoom, and the zoom is
// out of reach; when it goes off, the stored zoom applies again and the
// frame scrolls back to where it was. The camera never follows a packet.
//
// Round 5 (R5): the drawing states its counts from the task's topology
// (data-routers, data-links, data-gateways) and marks the labels the gate
// measures (a link's two ends .ng-dg-end, an ISP's gateway line on
// .ng-dg-ep.is-gw, each endpoint's kind in data-ep); tools/shots.mjs
// requires every one of them on the first view.
import { forwardRef, useCallback, useEffect, useId, useImperativeHandle, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { diagramGeometry, linkScale, NETGYM_DIAGRAM_FONT } from '../../../ui/topology/geometry.js';
import { diagramView, MIN_TEXT_PX, scrollToShow, smallestText, zoomBy, zoomIn, zoomOut } from '../../../ui/topology/size.js';
import { useZoomBar } from '../../../ui/topology/useZoomBar.js';
import HighlightLayer from '../../../ui/topology/HighlightLayer.jsx';
import { bareAddress, hl } from '../../../ui/topology/highlight.js';
import { ui } from '../uk.js';
import { routerClass } from './theme.js';

const F = NETGYM_DIAGRAM_FONT;
const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
const lastOctet = ip => String(ip).split('/')[0].split('.').pop();
/** The frame's padding (routing.css .ng-dg-frame), kept clear of the drawing. */
const FRAME_PAD = 8;
/** Ctrl + wheel: zoom factor per wheel pixel (a 100 px notch ≈ one «+» step). */
const WHEEL_ZOOM = 0.0023;

/** The frame's inner size, kept up to date. */
function useFrameSize(ref) {
  const [size, setSize] = useState(null);
  useIsoLayoutEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === 'undefined') return undefined;
    const measure = () => setSize(s => {
      const w = el.clientWidth, h = el.clientHeight;
      return s && s.w === w && s.h === h ? s : { w, h };
    });
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return size;
}

/** Drag to pan a scrolling frame; a drag doesn't count as a click. */
function usePan(ref) {
  const drag = useRef(null);
  const moved = useRef(false);
  return {
    moved,
    handlers: {
      onPointerDown: e => {
        if (e.button !== 0 || !ref.current) return;
        drag.current = { x: e.clientX, y: e.clientY, left: ref.current.scrollLeft, top: ref.current.scrollTop };
        moved.current = false;
      },
      onPointerMove: e => {
        const d = drag.current;
        if (!d) return;
        const dx = e.clientX - d.x, dy = e.clientY - d.y;
        if (!moved.current && Math.hypot(dx, dy) < 5) return;
        moved.current = true;
        ref.current.scrollLeft = d.left - dx;
        ref.current.scrollTop = d.top - dy;
      },
      onPointerUp: () => { drag.current = null; },
      onPointerLeave: () => { drag.current = null; },
    },
  };
}

/** Where the drawing's top left is in the frame's scroll content (CSS px). */
function drawingOrigin(frame, svg) {
  const f = frame.getBoundingClientRect(), s = svg.getBoundingClientRect();
  return { x: s.left - f.left - frame.clientLeft + frame.scrollLeft, y: s.top - f.top - frame.clientTop + frame.scrollTop };
}

/**
 * @param {{ topo: object, activeRouter: string|null, setActiveRouter: Function,
 *   fitHeight?: boolean, zoom?: undefined|'all'|number, onZoom?: Function, viewKey?: string,
 *   tools?: any, overlays?: any, covered?: boolean, underlay?: any, overlay?: any, fit?: boolean, children?: any,
 *   highlight?: { kind: 'address'|'port', value: string }|null }} props
 * `highlight` (round 5, R3): outlines the labels showing that fact (an
 * address or network on a link or an endpoint, a port name); labels only.
 * `topo` is in the active syntax's interface labels (logic/topology.js).
 * `fitHeight`: the frame has a height of its own (the page doesn't scroll);
 * otherwise the diagram takes the height its width gives it.
 * `viewKey`: the task instance; a new one starts the frame at its top left.
 */
const TopologyMap = forwardRef(function TopologyMap({
  topo, activeRouter, setActiveRouter, fitHeight = true, zoom, onZoom = () => {}, viewKey,
  tools = null, overlays = null, covered = false, underlay = null, overlay = null, fit = false, children, highlight = null,
}, ref) {
  const routerNames = Object.keys(topo.routers);
  // One router: no router row (nothing to choose); the children go to the tool row.
  const lone = routerNames.length === 1;
  const geo = useMemo(() => diagramGeometry(topo, topo, undefined, F), [topo]);
  const minText = useMemo(() => smallestText(geo), [geo]);
  const arrow = `ng-dg-arrow-${useId().replace(/:/g, '')}`;
  const frameRef = useRef(null);
  const svgRef = useRef(null);
  const frame = useFrameSize(frameRef);
  const pan = usePan(frameRef);
  const vb = geo.viewBox;
  const inner = frame && frame.w > 0 ? { width: frame.w - 2 * FRAME_PAD, height: fitHeight ? frame.h - 2 * FRAME_PAD : Infinity } : null;
  // Repair v1 (Fable 1): a drawing that doesn't fit its frame at 12 px text starts as fitted as it can
  // while every address label (a link's network and ends, an endpoint's address) keeps 12 px; the
  // prefixes and port names may go smaller, and the zoom bar (shown then) brings 12 px back.
  const addressText = useMemo(() => Math.min(...geo.links.flatMap(l => l.label.lines.map(line => line.size)),
    ...geo.endpoints.flatMap(e => (e.lines[1] ? [e.lines[1].size] : []))), [geo]);
  const unset = zoom === undefined || zoom === null;
  const first = inner && unset && diagramView(vb, minText, inner, undefined).pan ? MIN_TEXT_PX * minText / addressText : zoom;
  const view = inner ? diagramView(vb, minText, inner, fit ? 'all' : first) : null;
  const rc = name => routerClass(routerNames, name);
  const toggle = name => {
    if (pan.moved.current) return;
    setActiveRouter(activeRouter === name ? null : name);
  };

  // The latest drawing, for the callbacks below (the wheel listener and the ref).
  const live = useRef(null);
  live.current = { geo, vb, view, inner, minText, zoom, covered, onZoom, fit };

  /** Scroll a router (by name) or a point ({ x, y }, viewBox units) into the middle of the frame. */
  const centreOn = useCallback((target, { ifHidden = false } = {}) => {
    const el = frameRef.current, svg = svgRef.current, { geo: g, vb: box, view: v } = live.current;
    if (!el || !svg || !v) return false;
    const router = typeof target === 'string' ? g.routers.find(r => r.name === target) : null;
    const point = router ?? target;
    if (!point || !Number.isFinite(point.x) || !Number.isFinite(point.y)) return false;
    if (!v.pan) return true; // the whole drawing is in view
    const origin = drawingOrigin(el, svg);
    const next = scrollToShow(
      { x: origin.x + (point.x - box.x) * v.scale, y: origin.y + (point.y - box.y) * v.scale, margin: (router ? router.ring * v.scale : 0) + FRAME_PAD },
      { left: el.scrollLeft, top: el.scrollTop, width: el.clientWidth, height: el.clientHeight },
      { ifHidden },
    );
    if (next) { el.scrollLeft = next.left; el.scrollTop = next.top; }
    return true;
  }, []);
  useImperativeHandle(ref, () => ({ centreOn }), [centreOn]);

  // Zoom to `next`, keeping the drawing's point at `at` (client px; the
  // frame's centre by default) where it is.
  const anchor = useRef(null);
  const zoomTo = useCallback((next, at = null) => {
    const { vb: box, view: v, inner: size, minText: m, zoom: current, covered: hidden, onZoom: store, fit: fitted } = live.current;
    if (hidden || fitted || !v || next === current) return;
    const el = frameRef.current, svg = svgRef.current;
    if (el && svg && diagramView(box, m, size, next).scale !== v.scale) {
      const f = el.getBoundingClientRect(), origin = drawingOrigin(el, svg);
      const ox = at ? at.x - f.left - el.clientLeft : el.clientWidth / 2;
      const oy = at ? at.y - f.top - el.clientTop : el.clientHeight / 2;
      anchor.current = { x: box.x + (el.scrollLeft + ox - origin.x) / v.scale, y: box.y + (el.scrollTop + oy - origin.y) / v.scale, ox, oy };
    }
    store(next);
  }, []);

  // A new task instance starts at the top left, and shows its selected router.
  const shown = useRef(undefined);
  const lastKey = useRef(viewKey);
  useIsoLayoutEffect(() => {
    if (lastKey.current === viewKey) return;
    lastKey.current = viewKey;
    shown.current = undefined;
    anchor.current = null;
    if (frameRef.current) { frameRef.current.scrollLeft = 0; frameRef.current.scrollTop = 0; }
  }, [viewKey]);

  // The lap's «Уся схема»: the scroll position before it (kept from scroll
  // events while it is off) comes back when it ends, at the stored zoom.
  const scrolled = useRef({ left: 0, top: 0 });
  const beforeFit = useRef(null);
  const onScroll = e => { if (!live.current.fit) scrolled.current = { left: e.currentTarget.scrollLeft, top: e.currentTarget.scrollTop }; };
  useIsoLayoutEffect(() => {
    const el = frameRef.current;
    if (fit) { beforeFit.current = { ...scrolled.current }; return; }
    const back = beforeFit.current;
    beforeFit.current = null;
    if (back && el) { el.scrollLeft = back.left; el.scrollTop = back.top; }
  }, [fit]);

  // After a zoom: the anchored point back where it was.
  useIsoLayoutEffect(() => {
    const a = anchor.current, el = frameRef.current, svg = svgRef.current;
    if (!a || !view || !el || !svg) return;
    anchor.current = null;
    const origin = drawingOrigin(el, svg);
    el.scrollLeft = origin.x + (a.x - vb.x) * view.scale - a.ox;
    el.scrollTop = origin.y + (a.y - vb.y) * view.scale - a.oy;
  }, [view?.scale]);

  // A newly selected router is brought into view, at any zoom (only if it
  // isn't in view already). A zoom doesn't move the view to it.
  useIsoLayoutEffect(() => {
    if (!view || shown.current === activeRouter) return;
    shown.current = activeRouter;
    if (activeRouter) centreOn(activeRouter, { ifHidden: true });
  });

  // Ctrl + wheel zooms the diagram, never the page: a listener that can
  // cancel the wheel (React's onWheel is passive).
  useEffect(() => {
    const el = frameRef.current;
    if (!el) return undefined;
    const onWheel = e => {
      if (!e.ctrlKey) return;
      e.preventDefault();
      const { view: v } = live.current;
      if (!v) return;
      const px = e.deltaMode === 1 ? e.deltaY * 16 : e.deltaMode === 2 ? e.deltaY * el.clientHeight : e.deltaY;
      zoomTo(zoomBy(v, Math.exp(-px * WHEEL_ZOOM)), { x: e.clientX, y: e.clientY });
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, [zoomTo]);

  // Round 4 A3: the bar only when the fitted diagram's text is too small, or once the learner zoomed.
  const showZoom = useZoomBar({ taskKey: viewKey, width: frame?.w, fitPx: view ? view.fitScale * minText : null, zoom });
  const free = view && !covered && !fit;
  const can = {
    out: Boolean(free && view.canZoomOut),
    in: Boolean(free && view.canZoomIn),
    all: Boolean(free && !view.all),
  };
  const zoomOutNow = () => { if (can.out) zoomTo(zoomOut(view)); };
  const zoomInNow = () => { if (can.in) zoomTo(zoomIn(view)); };
  /** «+» and «−» (and = and _ on the same keys) on the frame and the zoom buttons. */
  function onZoomKey(e) {
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '+' || e.key === '=') { e.preventDefault(); zoomInNow(); }
    else if (e.key === '-' || e.key === '_' || e.key === '−') { e.preventDefault(); zoomOutNow(); }
  }

  const size = view ? { width: view.width, height: view.height } : { width: '100%' };
  const k = linkScale(F);
  const z = ui.shared.zoom;

  return (
    <div className="ng-dg">
      <div className="ng-dg-box">
        <div className="ng-dg-tools">
          {tools}
          {showZoom && (
            <div className="ng-dg-zoom" role="group" aria-label={z.group} onKeyDown={onZoomKey}>
              <button type="button" className="ng-rt-icon ng-dg-zoom-step" aria-label={z.out} title={z.out} aria-disabled={!can.out} onClick={zoomOutNow}>−</button>
              <button type="button" className="ng-rt-icon ng-dg-zoom-step" aria-label={z.in} title={z.in} aria-disabled={!can.in} onClick={zoomInNow}>+</button>
              {can.all && <button type="button" className="ng-rt-btn ng-dg-zoom-all" aria-label={z.allLabel} title={z.allLabel} onClick={() => zoomTo('all')}>{z.all}</button>}
            </div>
          )}
          {/* One router: «Текстом» ends the tool row, at the right edge as under other diagrams (repair v1, Fable). */}
          {lone && <span className="ng-dg-lone-end">{children}</span>}
        </div>
        <div className={`ng-dg-view${covered ? ' has-overlay' : ''}`}>
          <div
            ref={frameRef}
            className={`ng-dg-frame${view?.pan ? ' is-pan' : ''}${fitHeight ? ' is-fit' : ''}${covered ? ' is-covered' : ''}`}
            data-scale={view ? view.scale.toFixed(3) : undefined}
            data-zoom={zoom === undefined || zoom === null ? 'default' : String(zoom)}
            data-fit={fit ? 'lap' : undefined}
            onScroll={onScroll}
            tabIndex={covered ? -1 : 0}
            role="region"
            aria-label={view?.pan ? ui.shared.pannable : ui.shared.frameLabel}
            onKeyDown={onZoomKey}
            {...(view?.pan ? pan.handlers : {})}
          >
            <svg ref={svgRef} className="ng-dg-svg" viewBox={`${vb.x} ${vb.y} ${vb.w} ${vb.h}`} preserveAspectRatio="xMidYMid meet" role="img" aria-label={ui.shared.diagramLabel} {...size}
              data-routers={routerNames.length} data-links={topo.links.length} data-gateways={topo.endpoints.filter(e => e.ispGateway).length}>
              <defs>
                <marker id={arrow} markerWidth="10" markerHeight="10" refX="8" refY="3" orient="auto" markerUnits="strokeWidth">
                  <path d="M0,0 L0,6 L9,3 z" className="ng-dg-arrow" />
                </marker>
              </defs>
              {geo.links.map(link => {
                const b = link.label;
                return (
                  <g key={link.key} className="ng-dg-linkg">
                    <line x1={link.x1} y1={link.y1} x2={link.x2} y2={link.y2} className="ng-dg-link" strokeWidth="1" />
                    <rect x={b.x} y={b.y} width={b.w} height={b.h} rx="1.8" className="ng-dg-net-box" strokeWidth="0.4" />
                    <text x={b.cx} y={b.cy - 1.2 * k} textAnchor="middle" className="ng-dg-net" fontSize={F.net} fontWeight="700" {...hl(highlight, ['address', bareAddress(link.network)])}>{link.network}</text>
                    <text x={b.cx} y={b.cy + 2.5 * k} textAnchor="middle" className="ng-dg-ports" fontSize={F.ports}>
                      {b.ends ? <>
                        {/* Round 4: both ends in full, each in its router's colour. */}
                        <tspan className={`ng-dg-port-name ng-dg-end ${rc(b.ends[0].router)}`} fontWeight="700" {...hl(highlight, ['address', bareAddress(b.ends[0].ip)])}>{b.ends[0].ip}</tspan>
                        <tspan className="ng-dg-octet"> ↔ </tspan>
                        <tspan className={`ng-dg-port-name ng-dg-end ${rc(b.ends[1].router)}`} fontWeight="700" {...hl(highlight, ['address', bareAddress(b.ends[1].ip)])}>{b.ends[1].ip}</tspan>
                      </> : <>
                        <tspan className={`ng-dg-port-name ${rc(link.from)}`} fontWeight="700" {...hl(highlight, ['port', link.a.name])}>{link.a.name}</tspan>
                        <tspan className="ng-dg-octet">.{lastOctet(link.a.ip)}</tspan>
                        <tspan className="ng-dg-octet">↔</tspan>
                        <tspan className={`ng-dg-port-name ${rc(link.to)}`} fontWeight="700" {...hl(highlight, ['port', link.b.name])}>{link.b.name}</tspan>
                        <tspan className="ng-dg-octet">.{lastOctet(link.b.ip)}</tspan>
                      </>}
                    </text>
                  </g>
                );
              })}
              {underlay}
              {geo.endpoints.map(e => {
                const kind = e.type === 'internet' ? 'ng-dg-internet' : e.type === 'server' ? 'ng-dg-server' : rc(e.router);
                const fills = ['ng-dg-ep-label', 'ng-dg-ep-ip', 'ng-dg-ep-prefix'];
                return (
                  <g key={e.key} className={`ng-dg-ep ${kind}${e.ep.ispGateway ? ' is-gw' : ''}`} data-ep={e.type}>
                    <line x1={e.line.x1} y1={e.line.y1} x2={e.line.x2} y2={e.line.y2} className="ng-dg-ep-line" strokeWidth="0.7" strokeDasharray={e.type === 'internet' ? 'none' : '1.6,1.1'} markerEnd={`url(#${arrow})`} />
                    {e.port && <>
                      <rect x={e.port.x} y={e.port.y} width={e.port.w} height={e.port.h} rx="0.6" className="ng-dg-port-bg" />
                      {e.port.lines
                        ? <text x={e.port.cx} y={e.port.y + 0.98 * e.port.size} textAnchor="middle" className="ng-dg-port-name" fontSize={e.port.size} fontWeight="700" {...hl(highlight, ['port', (e.port.lines?.[0] ?? e.port.text).split(/\s+/)[0]])}>
                            {e.port.lines.map((line, i) => <tspan key={i} x={e.port.cx} dy={i ? 1.25 * e.port.size : 0}>{line}</tspan>)}
                          </text>
                        : <text x={e.port.cx} y={e.port.cy + 0.36 * e.port.size} textAnchor="middle" className="ng-dg-port-name" fontSize={e.port.size} fontWeight="700" {...hl(highlight, ['port', e.port.text.split(/\s+/)[0]])}>{e.port.text}</text>}
                    </>}
                    {e.shape === 'ellipse'
                      ? <ellipse cx={e.x} cy={e.y} rx={e.box.rx} ry={e.box.ry} className="ng-dg-ep-box" strokeWidth="0.5" />
                      : <rect x={e.box.x} y={e.box.y} width={e.box.w} height={e.box.h} rx="1.6" className="ng-dg-ep-box" strokeWidth="0.5" />}
                    {e.lines.map((l, i) => (
                      <text key={i} x={e.x} y={e.y + l.dy} textAnchor="middle" className={`${fills[i]}${l.sans ? ' ng-dg-sans' : ''}`} fontSize={l.size} fontWeight={l.sans ? '700' : undefined}
                        {...(l.sans ? {} : hl(highlight, ['address', bareAddress(l.text)]))}>{l.text}</text>
                    ))}
                  </g>
                );
              })}
              {geo.routers.map(r => {
                const active = activeRouter === r.name;
                return (
                  <g key={r.name} className={`ng-dg-router ${rc(r.name)}${active ? ' is-active' : ''}`} onClick={() => toggle(r.name)}>
                    {active && <circle cx={r.x} cy={r.y} r={r.ring} className="ng-dg-ring" strokeWidth="0.5" strokeDasharray="1.4,1.2" />}
                    <circle cx={r.x} cy={r.y} r={r.r} className="ng-dg-circle" strokeWidth={active ? '1.1' : '0.65'} />
                    <text x={r.x} y={r.y + 0.35 * r.nameSize} textAnchor="middle" className="ng-dg-name" fontSize={r.nameSize} fontWeight="bold">{r.name}</text>
                  </g>
                );
              })}
              {overlay}
              <HighlightLayer highlight={highlight} />
            </svg>
          </div>
          {overlays}
        </div>
      </div>
      {!lone && (
        <div className="ng-rt-routers">
          {routerNames.map(name => (
            <button key={name} type="button" aria-pressed={activeRouter === name} onClick={() => setActiveRouter(activeRouter === name ? null : name)} className={`ng-rt-router ${rc(name)}`}>
              {name}
            </button>
          ))}
          {children}
        </div>
      )}
    </div>
  );
});

export default TopologyMap;
