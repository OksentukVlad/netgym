// The address ruler (from an earlier IP trainer by the same author; shared in
// round 6 for «DHCP і NAT»): a strip of one octet's values, a tick at every
// block start, and an address marked. With `block` it also shades the block
// and names its two ends. A line of text under it says the same (`caption`,
// the screen's words; null leaves it out).
//
// Step 8: any prefix /0–/32 (the calculator), so the strip can be any of the
// four octets; where blocks are narrower than 4 values (/31, /32) the ticks
// are thinned to every 4th value, and the block is still shaded exactly.
//
// Round 6 (DHCP's address strip): `span` draws only a part of the octet (a
// /25–/27 network, its network address at the left end, its broadcast at the
// right); `bands` shade the ranges given out; `pins` mark taken addresses,
// each with its label above the strip (pinLabels: one row, else two); `value: null`
// draws no address marker. Without them the ruler is
// exactly the IP screens' (sections/ip/screens/AddressRuler.jsx adds their
// captions).
import { blockSize, broadcast, network } from '../../engine/ip.js';
import '../tokens.css';
import './AddressRuler.css';

const X0 = 14;
const WIDTH = 300;
const FULL = { start: 0, end: 255 };
const octetOf = (ip, n) => Number(ip.split('.')[n - 1]);
/** The pins' label row above the strip (user units). */
const PIN_ROW = 26;

/** Where the block's edges fall (Vlad's blockOn, for /0–/32): the octet, the
 * block step in that octet, and the block's first and last value there. */
export function blockOn(ip, prefix) {
  const octet = prefix >= 24 ? 4 : prefix >= 16 ? 3 : prefix >= 8 ? 2 : 1;
  const unit = blockSize(prefix) / 256 ** (4 - octet);
  return { octet, unit, start: octetOf(network(ip, prefix), octet), end: octetOf(broadcast(ip, prefix), octet) };
}

/** The ruler for an address and a prefix; `showBlock` shades its block. */
export function rulerFor(ip, prefix, showBlock) {
  const { octet, unit, start, end } = blockOn(ip, prefix);
  return { octet, unit, value: octetOf(ip, octet), block: showBlock ? { start, end, size: blockSize(prefix) } : null };
}

/** The ruler with a block the student found: its first and last address
 * (the binary walk's accepted network and broadcast rows), not the reference. */
export function rulerWith(ip, prefix, first, last) {
  const { octet, unit } = blockOn(ip, prefix);
  return { octet, unit, value: octetOf(ip, octet), block: { start: octetOf(first, octet), end: octetOf(last, octet), size: blockSize(prefix) } };
}

/** Approximate width of a 14 px bold label in the viewBox. */
const textWidth = text => String(text).length * 8.6 + 2;
const ANCHORS = ['middle', 'start', 'end'];

/** A pin label's width in the viewBox (12-unit bold sans), and the gap between two labels. */
const pinWidth = text => String(text).length * 7.6 + 2;
const PIN_GAP = 6;

/** The baselines of the pins' label rows: the lower one (next to the strip) and the upper one. */
const PIN_BASE = { one: [13], two: [33, 13] };

/** Each label as close above its pin as the others in its row let it be (pushed right, then back left from the end), or null when they don't fit. */
function sweepRow(items, words) {
  const right = 2 * X0 + WIDTH;
  const ws = items.map(pin => pinWidth(words(pin)));
  if (ws.reduce((sum, w) => sum + w, 0) + PIN_GAP * Math.max(0, items.length - 1) > right) return null;
  const lefts = items.map((pin, i) => pin.x - ws[i] / 2);
  for (let i = 0; i < items.length; i++) lefts[i] = Math.max(lefts[i], i ? lefts[i - 1] + ws[i - 1] + PIN_GAP : 0);
  for (let i = items.length - 1; i >= 0; i--) lefts[i] = Math.min(lefts[i], (i < items.length - 1 ? lefts[i + 1] - PIN_GAP : right) - ws[i]);
  return items.map((pin, i) => ({ ...pin, text: words(pin), left: lefts[i], w: ws[i] }));
}

/**
 * The pins' labels above the strip, in address order, and each one's line
 * to its pin (`points`, in the drawing's units; `top` is the label rows'
 * height, by which the rest of the drawing moves down):
 *   - the full names in one row when they fit;
 *   - else the full names in two rows, every other pin's label in the upper
 *     row; an upper label's line goes down beside it, through a gap between
 *     the lower labels (never across one), then to its pin;
 *   - else every label is its pin's `short` words (the number), in one row:
 *     the caption names them all.
 */
export function pinLabels(pins, px) {
  const items = [...pins].sort((a, b) => a.value - b.value).map(pin => ({ ...pin, x: px(pin.value + 0.5) }));
  const name = pin => pin.label;
  const straight = (pin, base, top) => [[Math.max(pin.left + 4, Math.min(pin.left + pin.w - 4, pin.x)), base + 4], [pin.x, top + 34], [pin.x, top + 62]];
  const one = (words, baseTop = PIN_ROW) => {
    const row = sweepRow(items, words);
    return row && { top: baseTop, placed: row.map(pin => ({ ...pin, row: 0, base: PIN_BASE.one[0], points: straight(pin, PIN_BASE.one[0], baseTop) })) };
  };
  const two = () => {
    const lower = sweepRow(items.filter((_, i) => i % 2 === 0), name), upper = sweepRow(items.filter((_, i) => i % 2 === 1), name);
    if (!lower || !upper) return null;
    const top = PIN_ROW + 20, [lb, ub] = PIN_BASE.two;
    // The gaps of the lower row (with a margin), where an upper label's line may pass.
    const covered = x => lower.some(l => x > l.left - 3 && x < l.left + l.w + 3);
    const passFor = x => {
      if (!covered(x)) return x;
      const edges = lower.flatMap(l => [l.left - 4, l.left + l.w + 4]).filter(e => e >= 2 && e <= 2 * X0 + WIDTH - 2 && !covered(e));
      return edges.length ? edges.reduce((best, e) => (Math.abs(e - x) < Math.abs(best - x) ? e : best)) : null;
    };
    const placed = [...lower.map(pin => ({ ...pin, row: 0, base: lb, points: straight(pin, lb, top) }))];
    for (const pin of upper) {
      const sx = Math.max(pin.left + 4, Math.min(pin.left + pin.w - 4, pin.x)), gx = passFor(sx);
      if (gx === null) return null;
      placed.push({ ...pin, row: 1, base: ub, points: [[sx, ub + 5], [gx, ub + 5], [gx, lb + 6], [pin.x, top + 34], [pin.x, top + 62]] });
    }
    return { top, placed: placed.sort((a, b) => a.value - b.value) };
  };
  return one(name) ?? two() ?? one(pin => pin.short ?? pin.label);
}

/**
 * @param {{ octet: number, unit: number, value?: number|null, block?: { start: number, end: number, size: number } | null,
 *   caption?: string|null, span?: { start: number, end: number }, bands?: Array<{ start: number, end: number }>,
 *   pins?: Array<{ value: number, label: string, short?: string, auto?: boolean, marked?: boolean }> }} props
 * A pin's `auto`: taken automatically (dashed); `marked`: a finding names it (amber).
 * `value`: the marked address's value in the octet (null: no marker). `caption`: the line under the ruler.
 */
export default function AddressRuler({ octet, unit, value = null, block = null, caption = null, span = FULL, bands = [], pins = [] }) {
  const count = span.end - span.start + 1;
  const scale = WIDTH / count;
  const px = v => X0 + (v - span.start) * scale;
  const marked = value !== null && value !== undefined;
  const labelStep = Math.max(unit, count / 8);
  const ticks = [];
  for (let v = span.start; v <= span.end + 1; v += Math.max(unit, count / 64, 1)) ticks.push(v);
  const labels = [];
  for (let v = span.start; v < span.end + 1; v += labelStep) labels.push(v);
  const x = marked ? px(value + 0.5) : -100;
  // Pins' labels take one or two rows above everything else; the rest of the drawing moves down under them.
  const { top, placed } = pins.length ? pinLabels(pins, px) : { top: 0, placed: [] };
  const drawing = <>
    {block && <rect className="ng-ruler-block" x={px(block.start)} y={40} width={(block.end - block.start + 1) * scale} height={22} rx={3} />}
    {bands.map(b => <rect key={`${b.start}-${b.end}`} className="ng-ruler-band" x={px(b.start)} y={40} width={(b.end - b.start + 1) * scale} height={22} />)}
    <rect className="ng-ruler-strip" x={X0} y={40} width={WIDTH} height={22} rx={3} />
    {ticks.map(v => {
      const major = (v - span.start) % labelStep === 0;
      return <line key={v} className={major ? 'ng-ruler-tick is-major' : 'ng-ruler-tick'} x1={px(v)} y1={major ? 62 : 56} x2={px(v)} y2={66} />;
    })}
    {labels.map(v => <text key={v} x={px(v)} y={84} textAnchor="middle">{v}</text>)}
    <text x={px(span.end)} y={84} textAnchor="middle">{span.end}</text>
    {block && !(block.start === 0 && block.end === 255) && <BlockEdges block={block} mx={x} px={px} />}
    {marked && <polygon className="ng-ruler-marker" points={`${x - 7},26 ${x + 7},26 ${x},40`} />}
    {marked && <text className="ng-ruler-value" x={x} y={18} textAnchor={x < 24 ? 'start' : x > 304 ? 'end' : 'middle'}>{value}</text>}
  </>;
  return (
    <figure className="ng-ruler">
      <svg className="ng-ruler-svg" viewBox={`0 0 328 ${96 + top}`} aria-hidden="true" focusable="false">
        {/* The pins' lines first, then their labels: no line is drawn over a label. */}
        {placed.map(pin => (
          <polyline key={`line-${pin.value}`} className={`ng-ruler-pin-line${pin.auto ? ' is-auto' : ''}${pin.marked ? ' is-marked' : ''}`} fill="none"
            points={pin.points.map(([px1, py1]) => `${px1},${py1}`).join(' ')} />
        ))}
        {placed.map(pin => (
          <text key={`label-${pin.value}`} className={`ng-ruler-pin-label${pin.marked ? ' is-marked' : ''}`} x={pin.left + pin.w / 2} y={pin.base} textAnchor="middle">{pin.text}</text>
        ))}
        {top ? <g transform={`translate(0 ${top})`}>{drawing}</g> : drawing}
      </svg>
      {caption !== null && <figcaption className="ng-ruler-text">{caption}</figcaption>}
    </figure>
  );
}

/** The anchor that keeps a label at `x` inside the viewBox and clear of the
 * address marker (`mx` ± 9) and of `taken` ([left, right] ranges), or null. */
function anchorFor(x, text, prefer, mx, taken = []) {
  const w = textWidth(text);
  const range = { start: [x, x + w], middle: [x - w / 2, x + w / 2], end: [x - w, x] };
  for (const anchor of [prefer, ...ANCHORS.filter(a => a !== prefer)]) {
    const [l, r] = range[anchor];
    const clear = ([a, b]) => r < a || l > b;
    if (l >= 0 && r <= 328 && clear([mx - 9, mx + 9]) && taken.every(clear)) return { anchor, range: range[anchor] };
  }
  return null;
}

/** The block's two ends above the strip (not for a block that fills the
 * strip: the scale already names 0 and 255), placed clear of the address
 * marker; one that can't be is left out (the text under the ruler names
 * both). A block narrower than 24 values (/29–/32 in the fourth octet) gets
 * one label, «76–79», beside it. */
function BlockEdges({ block, mx, px }) {
  const width = block.end - block.start + 1;
  if (width < 24) {
    const text = block.end === block.start ? String(block.start) : `${block.start}–${block.end}`;
    const right = Math.max(px(block.end + 1) + 6, mx + 10), left = Math.min(px(block.start) - 6, mx - 10);
    const anchor = right + textWidth(text) <= 328 ? 'start' : 'end';
    return <text className="ng-ruler-edge" x={anchor === 'start' ? right : left} y={34} textAnchor={anchor}>{text}</text>;
  }
  const sx = px(block.start), ex = px(block.end + 1);
  const first = anchorFor(sx, block.start, block.start < 24 ? 'start' : 'middle', mx);
  const last = anchorFor(ex, block.end, block.end > 232 ? 'end' : 'middle', mx, first ? [first.range] : []);
  return <>
    {first && <text className="ng-ruler-edge" x={sx} y={34} textAnchor={first.anchor}>{block.start}</text>}
    {last && <text className="ng-ruler-edge" x={ex} y={34} textAnchor={last.anchor}>{block.end}</text>}
  </>;
}
