// Outlines the highlighted labels of a diagram (ui/topology/highlight.js):
// after each render it measures every `[data-highlight]` text in its SVG and
// draws a rounded outline around it, a few units clear of the text, on top
// and unfilled, so it never covers what it marks. It pulses twice; with
// reduced motion it is a static outline (highlight.css). Without a layout
// (server rendering, tests) it draws nothing: the labels' `data-highlight`
// is the contract.
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import './highlight.css';

const useIsoLayoutEffect = typeof window === 'undefined' ? useEffect : useLayoutEffect;
/** Clearance between a label's text and its outline (user units). */
export const HL_PAD = 3;

function boxesIn(svg) {
  if (!svg?.getScreenCTM) return [];
  const ctm = svg.getScreenCTM();
  if (!ctm) return [];
  const inverse = ctm.inverse();
  const point = (x, y) => { const p = svg.createSVGPoint(); p.x = x; p.y = y; return p.matrixTransform(inverse); };
  return [...svg.querySelectorAll('[data-highlight]')].map(el => {
    const r = el.getBoundingClientRect();
    if (!r.width || !r.height) return null;
    const a = point(r.left, r.top), b = point(r.right, r.bottom);
    return { x: Math.min(a.x, b.x) - HL_PAD, y: Math.min(a.y, b.y) - HL_PAD, w: Math.abs(b.x - a.x) + 2 * HL_PAD, h: Math.abs(b.y - a.y) + 2 * HL_PAD };
  }).filter(Boolean);
}

/** Render as the SVG's last child. `highlight`: the screen's { kind, value } or null. */
export default function HighlightLayer({ highlight }) {
  const ref = useRef(null);
  const [boxes, setBoxes] = useState([]);
  const key = highlight ? `${highlight.kind}:${highlight.value}` : '';
  useIsoLayoutEffect(() => {
    const next = key ? boxesIn(ref.current?.ownerSVGElement) : [];
    setBoxes(prev => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
  });
  return (
    <g ref={ref} className="ng-hl-layer" key={key}>
      {boxes.map((b, i) => <rect key={i} x={b.x} y={b.y} width={b.w} height={b.h} rx="4" className="ng-hl-mark" />)}
    </g>
  );
}
