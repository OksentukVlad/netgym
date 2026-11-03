// E4 «Ремонт» (spec E4 v2 with v2.1, Fable 2 and Astra 5): one form, built
// from the logic's field descriptors (logic/faults.js repairFields), with
// the same lines for every task of a level, pre-filled with R1's broken
// configuration, every line editable. The screen keeps the whole
// configuration as its draft; a field writes its value at its descriptor's
// `path` (setAt). Controls by type:
//   - boolean, select: a Segmented choice (MikroTik's native `disabled` at
//     level 3 reads «no» for an enabled server, as Winbox does);
//   - ip, optional-ip: an address field («порожньо — немає» for the optional one);
//   - prefix: a mask field (/24 or 255.255.255.0; the integer is stored);
//   - dns: a text field (one address or several; the logic reads the text);
//   - intervals, acl: rows of two fields, «+ ще один рядок» up to three;
//   - roles: a Segmented choice per interface.
// Level 3 shows each line as the vendor names it: the native term labels the
// control and the Ukrainian label is its purpose (data-term, Purpose), as
// E2's wizard. At level 2 and 3 the WAN lines are their own group, «WAN і NAT».
import { maskToPrefix } from '../../../engine/ip.js';
import AddressField from '../../../ui/components/AddressField.jsx';
import Segmented from '../../../ui/components/Segmented.jsx';
import Purpose from '../../../ui/components/Purpose.jsx';
import { uk } from '../../../ui/uk.js';
import { labels, screen } from '../uk.js';
import TextField from './TextField.jsx';

const w = screen.fault;
const MAX_ROWS = 3;

/** The configuration with `value` at `path` (a fresh copy along the path; the rest shared). */
export function setAt(config, path, value) {
  if (!path.length) return value;
  const [head, ...rest] = path;
  const node = config?.[head];
  return Array.isArray(config)
    ? config.map((v, i) => (i === head ? setAt(node, rest, value) : v))
    : { ...config, [head]: setAt(node, rest, value) };
}

/** A prefix as the field shows it: «/24», or the text as typed. */
export const prefixText = value => (Number.isInteger(value) ? `/${value}` : String(value ?? ''));

/** The typed mask: its prefix (an integer) when it reads as /n, n or a dotted mask; else the text itself. */
export function prefixValue(text) {
  const t = String(text ?? '').trim();
  const m = /^\/?(\d{1,2})$/.exec(t);
  if (m && Number(m[1]) <= 32) return Number(m[1]);
  const p = /^\d+\.\d+\.\d+\.\d+$/.test(t) ? maskToPrefix(t) : null;
  return p ?? text;
}

/** DNS as the field shows it: a list joined by spaces, or the text as typed. */
export const dnsText = value => (Array.isArray(value) ? value.join(' ') : String(value ?? ''));

/** The fields grouped: [{ group, fields }] in the descriptors' order. */
export function groupsOf(fields) {
  const out = [];
  for (const f of fields) {
    if (!out.length || out.at(-1).group !== f.group) out.push({ group: f.group, fields: [] });
    out.at(-1).fields.push(f);
  }
  return out;
}

/** A choice with its label beside it, in a field label's look (one row where it fits). */
function Choice({ label, ...props }) {
  return (
    <div className="ng-dh-fchoice">
      <span className="ng-field-label" aria-hidden="true">{label}</span>
      <Segmented label={label} {...props} />
    </div>
  );
}

/** One field's control. `label` is its accessible name (the native term at level 3). */
function Control({ field, label, value, onChange, onEnter, readOnly, invalid }) {
  const set = v => { if (!readOnly) onChange(v); };
  if (field.type === 'boolean') {
    // MikroTik's `disabled` (level 3): the server enabled reads «no».
    const native = field.native === 'disabled';
    const options = native
      ? [{ value: false, label: 'yes' }, { value: true, label: 'no' }]
      : [{ value: true, label: w.yes }, { value: false, label: w.no }];
    return <Choice label={label} value={value === true} onChange={set} options={options} readOnly={readOnly} invalid={invalid} />;
  }
  if (field.type === 'select') {
    return <Choice label={label} value={value} onChange={set} options={field.options.map(o => ({ value: o, label: o }))} readOnly={readOnly} invalid={invalid} />;
  }
  if (field.type === 'ip' || field.type === 'optional-ip') {
    return <AddressField label={label} value={value ?? ''} onChange={set} onEnter={onEnter} readOnly={readOnly} invalid={invalid}
      hint={field.type === 'optional-ip' ? w.none : undefined} />;
  }
  if (field.type === 'prefix') {
    return <AddressField label={label} kind="prefix" value={prefixText(value)} onChange={v => set(prefixValue(v))} onEnter={onEnter} readOnly={readOnly} invalid={invalid} hint={w.prefixHint} />;
  }
  if (field.type === 'dns') {
    return <TextField label={label} value={dnsText(value)} onChange={set} onEnter={onEnter} readOnly={readOnly} invalid={invalid} hint={w.dnsHint} mono={Boolean(field.native)} />;
  }
  if (field.type === 'roles') {
    return (
      <div className="ng-dh-froles">
        {Object.keys(value ?? {}).map(iface => (
          <Choice key={iface} label={w.roleOf(iface)} value={value[iface]} onChange={role => set({ ...value, [iface]: role })}
            options={field.options.map(o => ({ value: o, label: o }))} readOnly={readOnly} invalid={invalid} />
        ))}
      </div>
    );
  }
  // intervals ({ from, to }) and acl ({ network, wildcard }): rows of two fields.
  const keys = field.type === 'acl' ? ['network', 'wildcard'] : ['from', 'to'];
  const names = field.type === 'acl' ? [w.network, w.wildcard] : [labels.from, labels.to];
  const rows = Array.isArray(value) && value.length ? value : [{ [keys[0]]: '', [keys[1]]: '' }];
  const setRow = (i, patch) => set(rows.map((r, j) => (j === i ? { ...r, ...patch } : r)));
  return (
    <div className="ng-dh-frows" role="group" aria-label={label}>
      <p className="ng-field-label ng-dh-frows-label" aria-hidden="true">{label}</p>
      {rows.map((row, i) => (
        <div key={i} className="ng-dh-row-fields">
          {keys.map((key, k) => (
            <AddressField key={key} label={rows.length > 1 ? `${names[k]} (${i + 1})` : names[k]} value={row?.[key] ?? ''} onChange={v => setRow(i, { [key]: v })}
              onEnter={onEnter} readOnly={readOnly} invalid={invalid} />
          ))}
          {i > 0 && !readOnly && <button type="button" className="ng-dh-remove" aria-label={w.removeRow(i + 1)} title={uk.remove} onClick={() => set(rows.filter((_, j) => j !== i))}>×</button>}
        </div>
      ))}
      {!readOnly && rows.length < MAX_ROWS && (
        <button type="button" className="ng-dh-add" onClick={() => set([...rows, { [keys[0]]: '', [keys[1]]: '' }])}>{w.addRow}</button>
      )}
    </div>
  );
}

/**
 * @param {{ fields: object[], config: object, onChange: (config: object) => void, onEnter?: Function,
 *   readOnly?: boolean, marked?: string|null, grouped?: boolean }} props
 * `fields`: repairFields(task, config); `marked`: the field id a finding names (data-evidence, aria-invalid).
 */
export default function RepairForm({ fields, config, onChange, onEnter, readOnly = false, marked = null, grouped = false }) {
  return (
    <div className="ng-dh-repair">
      {groupsOf(fields).map(({ group, fields: list }) => (
        <div key={group} className="ng-dh-fgroup" role={grouped ? 'group' : undefined} aria-label={grouped ? w.groups[group] : undefined}>
          {grouped && <p className="ng-dh-fgroup-title" aria-hidden="true">{w.groups[group]}</p>}
          {list.map(field => {
            const native = Boolean(field.native);
            const evidence = marked === field.id ? { 'data-evidence': 'current' } : {};
            return (
              <div key={field.id} className={`ng-dh-ffield is-${field.type}`} data-field={field.id} {...(native ? { 'data-term': '' } : {})} {...evidence}>
                {native && <Purpose>{field.label}</Purpose>}
                <Control field={field} label={native ? field.native : field.label} value={field.value}
                  onChange={v => onChange(setAt(config, field.path, v))} onEnter={onEnter} readOnly={readOnly} invalid={marked === field.id} />
              </div>
            );
          })}
        </div>
      ))}
    </div>
  );
}
