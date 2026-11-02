// «Налаштуй порти»: one switch's form (VLAN-1 spec §4, W2), in the syntax
// the bar's switch chose:
//   - Cisco: the VLANs to create, then a row per port: its mode (access,
//     trunk or —) and its access VLAN or allowed list;
//   - MikroTik: Bridge → Ports (PVID, Frame Types), Bridge → VLANs (a row
//     per entry: VLAN IDs, Tagged and Untagged ports, as toggles), and the
//     bridge's «VLAN Filtering».
// Text fields keep what is typed until they lose focus (or Enter, or
// «Перевірити»), then parse into the form (portsState.js); Enter checks. A
// field a check found wrong is marked while that check's verdict is on
// screen and the field is unchanged since (portsState freshMarks): the
// control itself gets aria-invalid (the mode group too), its row's words go
// under the row, and every control of the row is described by them.
//
// «Між VLAN» (VLAN-2) reuses it for a switch or a MikroTik router's bridge,
// with two options: `fixed`, ports the task gives (shown, not editable: the
// mode group read-only, the value as text), and `cpu`, which offers bridge1
// itself as a Tagged or Untagged member (VLAN interfaces on bridge1 need it).
// Removing a VLAN row keeps focus in the list (rowFocus.js).
//
// «Знайди несправність» (VLAN-3) adds `native`: a Cisco trunk's native VLAN
// beside its allowed list, where the task's configuration uses one (level 3).
//
// Round 4 (spec F4): a port with no mode says so briefly under its row; the
// DTP explanation is said once, in the verdict's «Детальніше». The mode
// «—» reads «не задано». The help panel's evidence (data-evidence) is the
// first mark's words (`evidence`), or, after an edit made the verdict stale,
// the field edited (`edited`).
//
// Round 5 (spec 5b-1 §4 v2): the modes are two-line options, the Ukrainian
// word over the term («доступ» over access, «транк» over trunk, «не
// задано»), each named «доступ (access)»; the value column is «VLAN цього
// порту»; «VLAN, які створити» says «створити на комутаторі (один раз)»
// under it. With `onFact`, a port's name («fa0/3 — PC1») is a FactLink to
// its label on the diagram (device-qualified, label only).
import Segmented from '../../../ui/components/Segmented.jsx';
import FactLink from '../../../ui/components/FactLink.jsx';
import { matches } from '../../../ui/topology/highlight.js';
import { frameTypes, peer } from '../../../engine/l2.js';
import { fieldKey, formatValue, markOn, portOrder, readField } from './portsState.js';
import { portCaption } from '../logic/model.js';
import { portFact } from '../logic/facts.js';
import { addId, removeId, useRowFocus } from './rowFocus.js';
import { t, ui, vlanTeaching } from '../uk.js';

/** A mode option: the Ukrainian word over the term in brackets, so its name reads «доступ (access)». */
const ModeLabel = ({ mode }) => (
  <span className="ng-vl-mode">
    <span className="ng-vl-mode-word">{ui.modeWords[mode]}</span>{' '}
    <span className="ng-vl-mode-term">{`(${ui.modes[mode]})`}</span>
  </span>
);
/** The mode group's options (Cisco ports). */
export const modeOptions = () => [
  { value: 'access', label: <ModeLabel mode="access" /> },
  { value: 'trunk', label: <ModeLabel mode="trunk" /> },
  { value: null, label: <span className="ng-vl-mode"><span className="ng-vl-mode-word">{ui.modes.none}</span></span> },
];

/** A text field of the form: the raw text while typing, else the form's value. */
export function Field({ id, label, value, invalid, describedBy, numeric = false, onText, onBlur, onEnter, className = '', placeholder, evidence = false }) {
  return (
    <input id={id} type="text" className={`ng-vl-input ${className}${invalid ? ' is-invalid' : ''}`.trim()} value={value}
      {...(evidence ? { 'data-evidence': 'current' } : {})}
      aria-label={label} aria-invalid={invalid || undefined} aria-describedby={describedBy} placeholder={placeholder}
      autoComplete="off" autoCapitalize="off" spellCheck={false} inputMode={numeric ? 'numeric' : 'text'}
      onChange={e => onText(e.target.value)} onBlur={onBlur}
      onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onEnter(); } }} />
  );
}

/** A mark's words under its row: short for a port with no mode (its DTP
 * explanation is the verdict's, once), else the finding's own words. */
export const markText = mark => (mark.code === 'mode-not-set' ? ui.modeNotSet : t(mark.code, mark.params));

/** The words of a mark, under its row; `id` is what its controls are described by; `evidence`: the panel's current evidence. */
export const MarkWords = ({ mark, id, evidence = false }) => (mark
  ? <p id={id} className="ng-vl-mark" {...(evidence ? { 'data-evidence': 'current' } : {})}>{markText(mark)}</p> : null);

/** The first marked row in reading order, among `paths` (its mark's words are the evidence). */
export const firstMarked = (marks, paths) => paths.find(path => markOn(marks, path)) ?? null;

/**
 * @param {{ device: object, syntax: 'cisco'|'routeros', form: object, raw: object, marks: object[],
 *   edit: { text: Function, blur: Function, set: Function, addRow: Function, removeRow: Function, member: Function },
 *   onCheck: Function, fixed?: string[], cpu?: boolean, native?: boolean, evidence?: boolean, edited?: string|null }} props
 *   `form`: this syntax's whole form; `raw`: its typed texts; `marks`: this switch's marks;
 *   `fixed`: port ids given by the task (read-only); `cpu`: offer bridge1 as a member;
 *   `topology`: names each port's PC («fa0/3 — PC1»); `note`: { row, text } a line under that row (a
 *   hint's or an edit's evidence, when the row has no mark of its own);
 *   `native`: a Cisco trunk's native VLAN field; `evidence`: the mark's words of that row path (or,
 *   true, of the first mark) are the panel's evidence; `edited`: the field last edited (a stale verdict's)
 */
export default function PortsForm({ device, syntax, form, raw, marks, edit, onCheck, fixed = [], cpu = false, native = false, evidence = false, edited = null, topology = null, note = null, highlight = null, onFact = null, action = null }) {
  const sw = device.id;
  const ports = portOrder(device);
  /** A port's PC (round 4, spec F4: «fa0/3 — PC1»), muted after the port's own name; none for a trunk. */
  const pcOf = p => {
    if (!topology) return null;
    const caption = portCaption(topology, sw, p.id, syntax), name = p.label[syntax];
    return caption.startsWith(`${name} — `) ? caption.slice(name.length + 3) : null;
  };
  const portCell = (p, label) => {
    const pc = pcOf(p);
    const fact = portFact(sw, label);
    const name = onFact && topology
      ? <FactLink value={label} active={matches(highlight, fact.kind, fact.value)}
        onActivate={() => onFact(fact, ui.portOwner({ device: sw, port: label, to: pc ?? peer(topology, sw, p.id)?.device ?? '—' }))} />
      : label;
    return <th scope="row" className="ng-vl-port">{name}{pc && <span className="ng-vl-port-pc">{` —\u00a0${pc}`}</span>}</th>;
  };
  /** A line under a row the panel's message is about (`note` { row, text }): its evidence, full width, so the panel can sit right after it. */
  const noteRow = (row, key) => (note?.row === row
    ? <tr key={`${key}-note`} className="ng-vl-mark-row"><td colSpan={3}><p className="ng-vl-row-note" data-evidence="current">{note.text}</p></td></tr> : null);
  const given = id => fixed.includes(id);
  const members = cpu ? [...ports, { id: 'bridge1', label: { cisco: 'bridge1', routeros: 'bridge1' } }] : ports;
  const markId = field => `vl-${sw}-mark-${field.replace(/\./g, '-') || 'switch'}`;
  const rowRemoved = useRowFocus();
  const valueOf = field => raw[fieldKey(sw, field)] ?? formatValue(readField(form, sw, field));
  /** A field; `row`: the field path whose mark describes it (its row's). */
  const field = (fieldName, label, { row, describedBy: also, ...extra } = {}) => {
    const rowMark = row !== undefined ? markOn(marks, row) : null;
    return (
      <Field id={`vl-${sw}-${fieldName.replace(/\./g, '-')}`} label={label} value={valueOf(fieldName)} invalid={Boolean(markOn(marks, fieldName))}
        describedBy={[rowMark ? markId(row) : null, also].filter(Boolean).join(' ') || undefined} evidence={edited === fieldName && !fieldName.startsWith('ports.')}
        onText={text => edit.text(sw, fieldName, text)} onBlur={() => edit.blur(sw, fieldName)} onEnter={onCheck} {...extra} />
    );
  };
  const config = form[sw];
  // The first marked row in reading order: its words are the panel's evidence.
  const first = typeof evidence === 'string' && markOn(marks, evidence) ? evidence : evidence ? firstMarked(marks, syntax === 'cisco'
    ? ['vlans', ...ports.map(p => `ports.${p.id}`)]
    : [...ports.map(p => `ports.${p.id}`), ...config.vlans.map((_, i) => `vlans.${i}`), '']) : null;

  if (syntax === 'cisco') {
    const vlansMark = markOn(marks, 'vlans');
    return (
      <div className="ng-vl-form" data-syntax="cisco">
        <div className={`ng-vl-form-line${vlansMark ? ' is-marked' : ''}`}>
          <label className="ng-vl-label" htmlFor={`vl-${sw}-vlans`}>{ui.ciscoVlans}</label>
          {field('vlans', ui.ciscoVlans, { row: 'vlans', placeholder: ui.listHint, className: 'is-list', describedBy: `vl-${sw}-vlans-what` })}
          <p id={`vl-${sw}-vlans-what`} className="ng-vl-form-what">{vlanTeaching.createVlans}</p>
          <MarkWords mark={vlansMark} id={markId('vlans')} evidence={first === 'vlans'} />
        </div>
        {action}
        <table className="ng-vl-form-table">
          <thead><tr><th scope="col">{ui.portCol}</th><th scope="col">{ui.modeCol}</th><th scope="col">{ui.valueCol}</th></tr></thead>
          <tbody>
            {ports.map(p => {
              const port = config.ports[p.id];
              const label = p.label.cisco;
              const row = `ports.${p.id}`;
              const mark = markOn(marks, row);
              // The mode group is what a port-level mark (an unset mode) is about.
              const modeInvalid = Boolean(mark) && !mark.field.startsWith(`${row}.`);
              return [
                <tr key={p.id} className={mark ? 'is-marked' : undefined}>
                  {portCell(p, label)}
                  <td>
                    <Segmented label={ui.mode({ port: label })} value={port.mode} invalid={modeInvalid} describedBy={mark ? markId(row) : undefined} className="ng-vl-modes"
                      onChange={mode => edit.set(sw, `${row}.mode`, mode)} readOnly={given(p.id)}
                      options={modeOptions()} />
                  </td>
                  <td>
                    {given(p.id) ? <span className="ng-vl-given-value">{formatValue(port.mode === 'trunk' ? port.allowed : port.vlan)}</span> : <>
                      {port.mode === 'access' && field(`${row}.vlan`, ui.accessVlan({ port: label }), { row, className: 'is-vid', numeric: true })}
                      {port.mode === 'trunk' && field(`${row}.allowed`, ui.allowed({ port: label }), { row, placeholder: ui.listHint, className: 'is-list' })}
                      {port.mode === 'trunk' && native && (
                        <span className="ng-vl-pair ng-vl-native">
                          <label className="ng-vl-label ng-vl-mono" htmlFor={`vl-${sw}-ports-${p.id}-native`}>{ui.nativeShort}</label>
                          {field(`${row}.native`, ui.native({ port: label }), { row, className: 'is-vid', numeric: true, placeholder: '1' })}
                        </span>
                      )}
                    </>}
                  </td>
                </tr>,
                mark && <tr key={`${p.id}-mark`} className="ng-vl-mark-row"><td colSpan={3}><MarkWords mark={mark} id={markId(row)} evidence={first === row} /></td></tr>,
                !mark && noteRow(row, p.id),
              ];
            })}
          </tbody>
        </table>
      </div>
    );
  }

  const switchMark = markOn(marks, '');
  return (
    <div className="ng-vl-form" data-syntax="routeros">
      {action}
      <table className="ng-vl-form-table">
        <caption className="ng-vl-caption">{ui.bridgePorts}</caption>
        <thead><tr><th scope="col">{ui.col.interface}</th><th scope="col">{ui.col.pvid}</th><th scope="col">{ui.col.frameTypes}</th></tr></thead>
        <tbody>
          {ports.map(p => {
            const label = p.label.routeros;
            const row = `ports.${p.id}`;
            const mark = markOn(marks, row);
            // A port-level mark (two untagged VLANs) is about its PVID and the table.
            const pvidInvalid = Boolean(mark) && !mark.field.startsWith(`${row}.frameTypes`);
            return [
              <tr key={p.id} className={mark ? 'is-marked' : undefined}>
                {portCell(p, label)}
                <td>{given(p.id) ? <span className="ng-vl-given-value">{formatValue(config.ports[p.id].pvid)}</span>
                  : field(`${row}.pvid`, ui.pvid({ port: label }), { row, className: 'is-vid', numeric: true, invalid: pvidInvalid })}</td>
                <td>
                  <Segmented label={ui.frameTypesOf({ port: label })} value={config.ports[p.id].frameTypes} className="ng-vl-frames" readOnly={given(p.id)}
                    invalid={Boolean(markOn(marks, `${row}.frameTypes`))} describedBy={mark ? markId(row) : undefined}
                    onChange={value => edit.set(sw, `${row}.frameTypes`, value)}
                    options={frameTypes.map(value => ({ value, label: ui.frameShort[value], title: value }))} />
                </td>
              </tr>,
              mark && <tr key={`${p.id}-mark`} className="ng-vl-mark-row"><td colSpan={3}><MarkWords mark={mark} id={markId(row)} evidence={first === row} /></td></tr>,
              !mark && noteRow(row, p.id),
            ];
          })}
        </tbody>
      </table>
      <p className="ng-vl-legend-line">{ui.frameLegend}</p>
      <div className="ng-vl-vlans">
        <h3 className="ng-vl-caption">{ui.bridgeVlans}</h3>
        {config.vlans.length === 0 && <p className="ng-vl-muted">{ui.noRows}</p>}
        <ol className="ng-vl-rows">
          {config.vlans.map((row, i) => {
            const n = i + 1;
            const path = `vlans.${i}`;
            const mark = markOn(marks, path);
            const chips = kind => (
              <div className="ng-vl-chips" role="group" aria-label={ui.members({ kind: ui.col[kind], n })} aria-describedby={mark ? markId(path) : undefined}
                {...(edited === `${path}.${kind}` ? { 'data-evidence': 'current' } : {})}>
                <span className="ng-vl-chips-label" aria-hidden="true">{ui.col[kind]}</span>
                {members.map(p => (
                  <button key={p.id} type="button" className={`ng-vl-chip${p.id === 'bridge1' ? ' is-cpu' : ''}`} aria-pressed={row[kind].includes(p.id)}
                    onClick={() => edit.member(sw, i, kind, p.id)}>{p.label.routeros}</button>
                ))}
              </div>
            );
            return (
              <li key={i} className={`ng-vl-row${mark ? ' is-marked' : ''}`}>
                <div className="ng-vl-row-head">
                  <label className="ng-vl-label" htmlFor={`vl-${sw}-vlans-${i}-vids`}>{ui.col.vlanIds}</label>
                  {field(`${path}.vids`, ui.vlanIds({ n }), { row: path, className: 'is-list', placeholder: ui.listHint, invalid: Boolean(mark) })}
                  <button type="button" id={removeId(sw, 'vlans', i)} className="ng-vl-icon ng-vl-remove" aria-label={ui.removeRow({ n })} title={ui.removeRow({ n })}
                    onClick={() => { rowRemoved(sw, 'vlans', i); edit.removeRow(sw, i); }}>✕</button>
                </div>
                {chips('tagged')}
                {chips('untagged')}
                <MarkWords mark={mark} id={markId(path)} evidence={first === path} />
                {!mark && note?.row === path && <p className="ng-vl-row-note" data-evidence="current">{note.text}</p>}
              </li>
            );
          })}
        </ol>
        <button type="button" id={addId(sw, 'vlans')} className="ng-vl-btn ng-vl-add" onClick={() => edit.addRow(sw)}>{ui.addRow}</button>
      </div>
      <label className={`ng-vl-filter${switchMark ? ' is-marked' : ''}`} {...(edited === 'filtering' ? { 'data-evidence': 'current' } : {})}>
        <input type="checkbox" className="ng-vl-checkbox" checked={config.filtering === true}
          aria-invalid={switchMark ? true : undefined} aria-describedby={switchMark ? markId('') : undefined}
          onChange={e => edit.set(sw, 'filtering', e.target.checked)}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); onCheck(); } }} />
        {ui.filteringBox}
      </label>
      <MarkWords mark={switchMark} id={markId('')} evidence={first === ''} />
    </div>
  );
}
