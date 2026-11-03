// The IP screens' address ruler: the shared ruler (ui/components/
// AddressRuler.jsx, moved there in round 6 for DHCP's address strip) with the
// IP section's own line under it.
//
// Round 5 5b-2 (spec D): the screen may word the line under it (`caption`:
// the mask's address tasks), or leave it out (null: the worked example's
// ruler, whose card says it).
import Ruler from '../../../ui/components/AddressRuler.jsx';
import { ui } from '../uk.js';

export { blockOn, rulerFor, rulerWith } from '../../../ui/components/AddressRuler.jsx';

/**
 * @param {{ octet: number, unit: number, value: number, block?: { start: number, end: number, size: number } | null, subject?: 'task'|'input'|'size', caption?: string|null }} props
 * `subject`: whose address is marked (the task's, or the calculator's input).
 * `caption`: the line under the ruler in the screen's words; null leaves it out; by default the ruler's own.
 */
export default function AddressRuler({ octet, unit, value, block = null, subject = 'task', caption }) {
  // `subject: 'size'` (the mask's network-size task, which has no address):
  // no address marker; the caption names the block's size.
  const marked = subject !== 'size';
  const step = Math.max(unit, 32);
  const words = caption !== undefined ? caption
    : marked ? ui.rulerText({ octet, value, step, block, subject }) : ui.rulerSizeText({ octet, step, block });
  return <Ruler octet={octet} unit={unit} value={marked ? value : null} block={block} caption={words} />;
}
