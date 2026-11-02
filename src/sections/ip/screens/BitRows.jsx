// Read-only bit rows (design §2 «У бітах», §3 the walk's worksheet): one row
// per address (адреса, маска, мережа, широкомовна), eight bits per octet
// under their weights 128…1, and, when `prefix` is given, a vertical line
// after bit `prefix` (network bits left of it, device bits right).
//
// The width decides how many octets share a line: four, two or one (a
// container query picks one of the three drawings; the others are
// display: none, so only one reaches the accessibility tree). The drawing
// is hidden from screen readers; a list says each row in words instead.
// The calculator shows its own result here; the walk shows only the rows
// the student entered and had accepted (never a reference row).
import { binaryUi, rowNames, spaced } from '../uk.js';
import '../../../ui/tokens.css';
import './BitRows.css';

const WEIGHTS = [128, 64, 32, 16, 8, 4, 2, 1];
const OCTETS = [0, 1, 2, 3];

/** An address's four octets as eight-bit strings. */
export function octetsOf(address) {
  return address.split('.').map(n => Number(n).toString(2).padStart(8, '0'));
}

/** The dotted address of four eight-bit octets (the student's own row). */
export function addressOf(octets) {
  return octets.map(bits => parseInt(bits, 2)).join('.');
}

/** Where the line goes on bit `index` (0–31): before it, after it, or nowhere. */
function lineAt(prefix, index) {
  if (prefix === null || prefix === undefined) return '';
  if (prefix === 32 && index === 31) return ' is-line-after';
  return index === prefix ? ' is-line' : '';
}

/**
 * @param {{
 *   rows: Array<{ id: string, label: string, octets: string[] }>,
 *   prefix?: number | null,      // the line after this bit; null: no line yet
 *   label: string,               // the drawing's accessible name and the list's
 *   provenance?: string,         // data-provenance (the walk's leak gate reads it)
 * }} props
 */
export default function BitRows({ rows, prefix = null, label, provenance }) {
  return (
    <div className="ng-bitrows" data-provenance={provenance}>
      <div className="ng-bitrows-drawings" aria-hidden="true">
        {[4, 2, 1].map(per => (
          <div key={per} className={`ng-bitrows-per ng-bitrows-per-${per}`}>
            {Array.from({ length: 4 / per }, (_, line) => OCTETS.slice(line * per, line * per + per)).map(octets => (
              <table key={octets[0]} className="ng-bitrows-table">
                <thead>
                  <tr>
                    <th className="ng-bitrows-band">{per === 4 ? '' : binaryUi.band({ first: octets[0] + 1, last: octets.at(-1) + 1 })}</th>
                    {octets.map(o => WEIGHTS.map((w, b) => (
                      <th key={`${o}.${b}`} className={`ng-bitrows-weight${b === 0 && o !== octets[0] ? ' is-octet' : ''}${lineAt(prefix, o * 8 + b)}`}>{w}</th>
                    )))}
                  </tr>
                </thead>
                <tbody>
                  {rows.map(row => (
                    <tr key={row.id} className={`ng-bitrows-row is-${row.id}`}>
                      <th scope="row" className="ng-bitrows-label">{row.label}</th>
                      {octets.map(o => [...row.octets[o]].map((bit, b) => (
                        <td key={`${o}.${b}`} className={`ng-bitrows-bit${bit === '1' ? ' is-one' : ''}${b === 0 && o !== octets[0] ? ' is-octet' : ''}${lineAt(prefix, o * 8 + b)}`}>{bit}</td>
                      )))}
                    </tr>
                  ))}
                </tbody>
              </table>
            ))}
          </div>
        ))}
      </div>
      <ul className="ng-sr-only" aria-label={label}>
        {/* Bits spaced per octet, so they are read as bits, not as a number. */}
        {rows.map(row => <li key={row.id}>{`${row.label}: ${row.octets.map(spaced).join(', ')}`}</li>)}
      </ul>
      {prefix !== null && prefix !== undefined && <p className="ng-bitrows-caption">{binaryUi.prefixLine(prefix)}</p>}
    </div>
  );
}

export { rowNames };
