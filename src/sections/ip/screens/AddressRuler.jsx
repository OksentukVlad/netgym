// The address ruler (from an earlier IP trainer by the same author):
// the 0–255 strip of the octet where the block boundaries fall, a tick at
// every block start, and the address marked. With `block` it also shades the
// block and names its two ends; the screen passes a block only when the
// student may see it. A line of text under it says the same.
//
// Step 8: any prefix /0–/32 (the calculator), so the strip can be any of the
// four octets; where blocks are narrower than 4 values (/31, /32) the ticks
// are thinned to every 4th value, and the block is still shaded exactly.
import { blockSize, broadcast, network } from '../../../engine/ip.js';
import { ui } from '../uk.js';
import '../../../ui/tokens.css';
import './AddressRuler.css';

const X0 = 14;
const SCALE = 300 / 256;
const px = v => X0 + v * SCALE;
const octetOf = (ip, n) => Number(ip.split('.')[n - 1]);

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

/**
 * @param {{ octet: number, unit: number, value: number, block?: { start: number, end: number, size: number } | null, subject?: 'task'|'input' }} props
 * `subject`: whose address is marked (the task's, or the calculator's input).
 */
export default function AddressRuler({ octet, unit, value, block = null, subject = 'task' }) {
  // `subject: 'size'` (the mask's network-size task, which has no address):
  // no address marker; the caption names the block's size.
  const marked = subject !== 'size';
  const labelStep = Math.max(unit, 32);
  const ticks = [];
  for (let v = 0; v <= 256; v += Math.max(unit, 4)) ticks.push(v);
  const labels = [];
  for (let v = 0; v < 256; v += labelStep) labels.push(v);
  const x = px(value + 0.5);
  return (
    <figure className="ng-ruler">
      <svg className="ng-ruler-svg" viewBox="0 0 328 96" aria-hidden="true" focusable="false">
        {block && <rect className="ng-ruler-block" x={px(block.start)} y={40} width={(block.end - block.start + 1) * SCALE} height={22} rx={3} />}
        <rect className="ng-ruler-strip" x={X0} y={40} width={300} height={22} rx={3} />
        {ticks.map(v => {
          const major = v % labelStep === 0;
          return <line key={v} className={major ? 'ng-ruler-tick is-major' : 'ng-ruler-tick'} x1={px(v)} y1={major ? 62 : 56} x2={px(v)} y2={66} />;
        })}
        {labels.map(v => <text key={v} x={px(v)} y={84} textAnchor="middle">{v}</text>)}
        <text x={px(255)} y={84} textAnchor="middle">255</text>
        {block && !(block.start === 0 && block.end === 255) && <BlockEdges block={block} mx={marked ? x : -100} />}
        {marked && <polygon className="ng-ruler-marker" points={`${x - 7},26 ${x + 7},26 ${x},40`} />}
        {marked && <text className="ng-ruler-value" x={x} y={18} textAnchor={x < 24 ? 'start' : x > 304 ? 'end' : 'middle'}>{value}</text>}
      </svg>
      <figcaption className="ng-ruler-text">{marked ? ui.rulerText({ octet, value, step: labelStep, block, subject }) : ui.rulerSizeText({ octet, step: labelStep, block })}</figcaption>
    </figure>
  );
}

/** Approximate width of a 14 px bold label in the viewBox. */
const textWidth = text => String(text).length * 8.6 + 2;
const ANCHORS = ['middle', 'start', 'end'];

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
function BlockEdges({ block, mx }) {
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
