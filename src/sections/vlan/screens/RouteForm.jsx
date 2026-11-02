// «Між VLAN»: one device's form (VLAN-2 spec §3, v2 X1, X6), in the syntax
// the bar's switch chose. The switch's ports and a MikroTik bridge are
// «Налаштуй порти»'s form (PortsForm.jsx), with the task's given ports
// read-only and bridge1 offered as a member; this adds the L3 parts:
//   - Cisco router: «Фізичний інтерфейс» (shutdown / no shutdown) and the
//     subinterfaces, a row each shaped as its commands read (interface
//     gi0/N.[number], encapsulation dot1Q [VLAN], ip address [IP and mask]);
// Every row is one line where the panel is wide enough (label and field
// kept together, the pairs wrapping), so a form keeps to a few lines;
//   - MikroTik: Interfaces → VLAN (Name, VLAN ID, Interface: a port or
//     bridge1) and IP → Addresses (Address, Interface: a VLAN interface);
//   - task 3's switch: the management block (Cisco: interface vlan, ip
//     address, ip default-gateway; MikroTik: its VLAN interface, address and
//     IP → Routes' default gateway).
// Rows start blank (X6); task 3's given router rows are shown as «задано».
// «Знайди несправність» (VLAN-3) passes `fixed` with nothing given: every
// device and row of its given configuration is the student's to edit.
// Text fields keep what is typed until blur, Enter or «Перевірити»
// (routeState.js parses them); Enter checks. A marked row's words go under
// it, every control of the row is described by them (aria-describedby), and
// the control the finding is about gets aria-invalid.
import Segmented from '../../../ui/components/Segmented.jsx';
import PortsForm, { Field, MarkWords } from './PortsForm.jsx';
import { WinboxTables } from './GivenConfig.jsx';
import { fieldKey, markOn } from './portsState.js';
import { fixedOf, formatAddress, routeValue, trunkPort } from './routeState.js';
import { addId, removeId, useRowFocus } from './rowFocus.js';
import { routeUi } from '../uk.js';

/** The control a row-wide mark is about (the rest of its row is described by its words). */
function rowControl(row, code) {
  if (row.startsWith('subifs.')) return code === 'duplicate-interface' ? `${row}.number` : `${row}.address`;
  if (row.startsWith('vlanIfs.')) return `${row}.name`;
  if (row.startsWith('addresses.')) return `${row}.address`;
  if (row === 'svi') return code === 'invalid-config' ? 'svi.vid' : 'svi.address';
  if (row.startsWith('routes.')) return 'routes.0.gateway';
  return null;
}

/**
 * @param {{ task: object, device: object, syntax: 'cisco'|'routeros', form: object, raw: object, marks: object[],
 *   edit: { text: Function, blur: Function, set: Function, addRow: Function, removeRow: Function, member: Function },
 *   onCheck: Function, config: object, fixed?: object }} props
 *   `form`: this syntax's whole form; `marks`: this device's; `config`: the effective configuration (givens restored);
 *   `fixed`: what the task gives (routeState.fixedOf's shape), by default «Між VLAN»'s givens
 */
export default function RouteForm({ task, device, syntax, form, raw, marks, edit, onCheck, config, fixed = fixedOf(task, syntax), note = null }) {
  /** A line the help panel's message is about (round 4 repair, Astra 2): `note.at` a port row
   * ('ports.<id>', PortsForm's), the physical interface, the VLAN interfaces, the management block or the device. */
  const noteAt = at => (note?.at === at ? <p className="ng-vl-row-note" data-evidence="current">{note.text}</p> : null);
  const dev = device.id, r = routeUi;
  const c = form[dev] ?? {};
  const markId = field => `vl-${dev}-mark-${field.replace(/\./g, '-') || 'device'}`;
  const rowRemoved = useRowFocus();
  /** A text field; `row`: the row whose mark describes it. */
  const field = (name, label, { row, ...extra } = {}) => {
    const rowMark = row !== undefined ? markOn(marks, row) : null;
    const invalid = Boolean(markOn(marks, name)) || Boolean(rowMark && rowMark.field === row && rowControl(row, rowMark.code) === name);
    return (
      <Field id={`vl-${dev}-${name.replace(/\./g, '-')}`} label={label} value={raw[fieldKey(dev, name)] ?? routeValue(form, dev, name, syntax)}
        invalid={invalid} describedBy={rowMark ? markId(row) : undefined}
        onText={text => edit.text(dev, name, text)} onBlur={() => edit.blur(dev, name)} onEnter={onCheck} {...extra} />
    );
  };
  const removeButton = (list, i, label) => (
    <button type="button" id={removeId(dev, list, i)} className="ng-vl-icon ng-vl-remove" aria-label={label} title={label}
      onClick={() => { rowRemoved(dev, list, i); edit.removeRow(dev, list, i); }}>✕</button>
  );
  const addButton = (list, label) => <button type="button" id={addId(dev, list)} className="ng-vl-btn ng-vl-add" onClick={() => edit.addRow(dev, list)}>{label}</button>;
  const portsEdit = { ...edit, addRow: sw => edit.addRow(sw, 'vlans'), removeRow: (sw, i) => edit.removeRow(sw, 'vlans', i) };
  const bridged = syntax === 'routeros' && c.ports !== undefined;

  // ── The switch's ports, or a MikroTik router's bridge ──
  let l2 = null;
  if (dev === 'SW1' && fixed.switchWhole) {
    l2 = (
      <div className="ng-vl-form ng-vl-given-switch">
        <p className="ng-vl-muted">{r.givenSwitch}</p>
        {syntax === 'routeros' && config?.[dev]?.ports && <WinboxTables device={device} config={config[dev]} />}
      </div>
    );
  } else if (c.ports !== undefined) {
    const given = dev === 'SW1' ? fixed.switchPorts : [];
    l2 = <>
      {given.length > 0 && <p className="ng-vl-muted">{r.fixedPorts}</p>}
      <PortsForm device={device} syntax={syntax} form={form} raw={raw} marks={marks} edit={portsEdit} onCheck={onCheck}
        fixed={given} cpu={bridged && (device.kind === 'router' || task.management?.device === dev)} topology={task.topology}
        note={note?.at?.startsWith('ports.') ? { row: note.at, text: note.text } : null} />
    </>;
  }

  // ── Cisco router: the physical interface and the subinterfaces ──
  const cisco = () => {
    const parent = trunkPort(task, dev);
    const parentLabel = device.ports.find(p => p.id === parent)?.label.cisco ?? parent;
    const upField = `interfaces.${parent}`;
    const upMark = markOn(marks, upField);
    const upGiven = fixed.routerUp.includes(parent);
    const given = fixed.rows.subifs;
    return (
      <div className="ng-vl-form" data-syntax="cisco">
        <div className={`ng-vl-form-line${upMark ? ' is-marked' : ''}`}>
          <span className="ng-vl-label">{r.physical}</span>
          <span className="ng-vl-port">{parentLabel}</span>
          <Segmented label={r.physicalState({ port: parentLabel })} value={c.interfaces?.[parent]?.up === true} readOnly={upGiven}
            invalid={Boolean(upMark)} describedBy={upMark ? markId(upField) : undefined} className="ng-vl-states"
            onChange={value => edit.set(dev, `${upField}.up`, value)}
            options={[{ value: false, label: r.states.off }, { value: true, label: r.states.on }]} />
          {upGiven && <span className="ng-vl-fixed">{r.fixedRow}</span>}
          <MarkWords mark={upMark} id={markId(upField)} />
          {!upMark && noteAt('physical')}
        </div>
        <div className="ng-vl-vlans">
          <h3 className="ng-vl-caption">{r.subifs}</h3>
          {noteAt('vlanIfs')}
          {(c.subifs ?? []).length === 0 && <p className="ng-vl-muted">{r.noSubifs}</p>}
          <ol className="ng-vl-rows ng-vl-subifs">
            {(c.subifs ?? []).map((s, i) => {
              const row = `subifs.${i}`, n = i + 1, mark = markOn(marks, row);
              const id = name => `vl-${dev}-subifs-${i}-${name}`;
              if (i < given) {
                return (
                  <li key={i} className={`ng-vl-row is-fixed${mark ? ' is-marked' : ''}`}>
                    <p className="ng-vl-given-line"><span>{`${r.cli.interface({ parent: parentLabel })}${s.number}`}</span> <span>{`${r.cli.encap} ${s.vid}`}</span> <span>{`${r.cli.address} ${formatAddress(s, syntax)}`}</span> <span className="ng-vl-fixed">{r.fixedRow}</span></p>
                    <MarkWords mark={mark} id={markId(row)} />
                  </li>
                );
              }
              return (
                <li key={i} className={`ng-vl-row ng-vl-line${mark ? ' is-marked' : ''}`}>
                  <span className="ng-vl-pair">
                    <label className="ng-vl-label ng-vl-mono" htmlFor={id('number')}>{r.cli.interface({ parent: parentLabel })}</label>
                    {field(`${row}.number`, r.number({ parent: parentLabel, n }), { row, className: 'is-vid', numeric: true })}
                  </span>
                  <span className="ng-vl-pair">
                    <label className="ng-vl-label ng-vl-mono" htmlFor={id('vid')}>{r.cli.encap}</label>
                    {field(`${row}.vid`, r.encap({ n }), { row, className: 'is-vid', numeric: true })}
                  </span>
                  <span className="ng-vl-pair is-address">
                    <label className="ng-vl-label ng-vl-mono" htmlFor={id('address')}>{r.cli.address}</label>
                    {field(`${row}.address`, r.addressOf({ n }), { row, className: 'is-address', placeholder: r.addressHint.cisco })}
                  </span>
                  {removeButton('subifs', i, r.removeSubif({ n }))}
                  <MarkWords mark={mark} id={markId(row)} />
                </li>
              );
            })}
          </ol>
        </div>
        {addButton('subifs', r.addSubif)}
      </div>
    );
  };

  // ── MikroTik: VLAN interfaces, addresses ──
  const routeros = () => {
    const rowsGiven = dev === 'R1' ? fixed.rows : { vlanIfs: 0, addresses: 0 };
    const onOptions = [...device.ports.map(p => ({ value: p.id, label: p.label.routeros })), ...(bridged ? [{ value: 'bridge1', label: 'bridge1' }] : [])];
    const vlanIfs = c.vlanIfs ?? [], addresses = c.addresses ?? [];
    const names = [...new Set(vlanIfs.map(v => v.name).filter(Boolean))];
    return (
      <div className="ng-vl-form" data-syntax="routeros">
        <div className="ng-vl-vlans">
          <h3 className="ng-vl-caption">{r.vlanIfs}</h3>
          {noteAt('vlanIfs')}
          {/* A finding about the block itself (task 3: SW1 has no management interface yet). */}
          {markOn(marks, 'vlanIfs')?.field === 'vlanIfs' && <MarkWords mark={markOn(marks, 'vlanIfs')} id={markId('vlanIfs')} />}
          {vlanIfs.length === 0 && <p className="ng-vl-muted">{r.noVlanIfs}</p>}
          <ol className="ng-vl-rows">
            {vlanIfs.map((v, i) => {
              const row = `vlanIfs.${i}`, n = i + 1, mark = markOn(marks, row);
              if (i < rowsGiven.vlanIfs) {
                return (
                  <li key={i} className={`ng-vl-row is-fixed${mark ? ' is-marked' : ''}`}>
                    <p className="ng-vl-given-line"><span>{`${r.col.name}=${v.name}`}</span> <span>{`${r.col.vlanId}=${v.vid}`}</span> <span>{`${r.col.on}=${onOptions.find(o => o.value === v.on)?.label ?? v.on}`}</span> <span className="ng-vl-fixed">{r.fixedRow}</span></p>
                    <MarkWords mark={mark} id={markId(row)} />
                  </li>
                );
              }
              const onMark = markOn(marks, `${row}.on`);
              return (
                <li key={i} className={`ng-vl-row ng-vl-line${mark ? ' is-marked' : ''}`}>
                  <span className="ng-vl-pair">
                    <label className="ng-vl-label" htmlFor={`vl-${dev}-${row.replace('.', '-')}-name`}>{r.col.name}</label>
                    {field(`${row}.name`, r.vlanIfName({ n }), { row, className: 'is-name' })}
                  </span>
                  <span className="ng-vl-pair">
                    <label className="ng-vl-label" htmlFor={`vl-${dev}-${row.replace('.', '-')}-vid`}>{r.col.vlanId}</label>
                    {field(`${row}.vid`, r.vlanIfVid({ n }), { row, className: 'is-vid', numeric: true })}
                  </span>
                  <span className="ng-vl-pair">
                    <span className="ng-vl-chips-label" aria-hidden="true">{r.col.on}</span>
                    <Segmented label={r.vlanIfOn({ n })} value={v.on} options={onOptions} className="ng-vl-on"
                      invalid={Boolean(onMark)} describedBy={mark ? markId(row) : undefined} onChange={value => edit.set(dev, `${row}.on`, value)} />
                  </span>
                  {removeButton('vlanIfs', i, r.removeVlanIf({ n }))}
                  <MarkWords mark={mark} id={markId(row)} />
                </li>
              );
            })}
          </ol>
          {addButton('vlanIfs', r.addVlanIf)}
        </div>
        <div className="ng-vl-vlans">
          <h3 className="ng-vl-caption">{r.addresses}</h3>
          {addresses.length === 0 && <p className="ng-vl-muted">{r.noAddresses}</p>}
          <ol className="ng-vl-rows">
            {addresses.map((a, i) => {
              const row = `addresses.${i}`, n = i + 1, mark = markOn(marks, row);
              if (i < rowsGiven.addresses) {
                return (
                  <li key={i} className={`ng-vl-row is-fixed${mark ? ' is-marked' : ''}`}>
                    <p className="ng-vl-given-line"><span>{`${r.col.rosAddress}=${formatAddress(a, syntax)}`}</span> <span>{`${r.col.on}=${a.iface}`}</span> <span className="ng-vl-fixed">{r.fixedRow}</span></p>
                    <MarkWords mark={mark} id={markId(row)} />
                  </li>
                );
              }
              const choices = [...names, ...(a.iface && !names.includes(a.iface) ? [a.iface] : [])].map(value => ({ value, label: value }));
              return (
                <li key={i} className={`ng-vl-row ng-vl-line${mark ? ' is-marked' : ''}`}>
                  <span className="ng-vl-pair is-address">
                    <label className="ng-vl-label" htmlFor={`vl-${dev}-${row.replace('.', '-')}-address`}>{r.col.rosAddress}</label>
                    {field(`${row}.address`, r.rosAddress({ n }), { row, className: 'is-address', placeholder: r.addressHint.routeros })}
                  </span>
                  <span className="ng-vl-pair">
                    <span className="ng-vl-chips-label" aria-hidden="true">{r.col.on}</span>
                    {choices.length ? (
                      <Segmented label={r.ifaceOf({ n })} value={a.iface} options={choices} className="ng-vl-on"
                        invalid={Boolean(markOn(marks, `${row}.iface`))} describedBy={mark ? markId(row) : undefined} onChange={value => edit.set(dev, `${row}.iface`, value)} />
                    ) : <span className="ng-vl-muted">{r.noNames}</span>}
                  </span>
                  {removeButton('addresses', i, r.removeAddress({ n }))}
                  <MarkWords mark={mark} id={markId(row)} />
                </li>
              );
            })}
          </ol>
          {addButton('addresses', r.addAddress)}
        </div>
        {'routes' in c && (
          <div className={`ng-vl-form-line${markOn(marks, 'routes') ? ' is-marked' : ''}`}>
            <span className="ng-vl-caption">{r.routes}</span>
            <span className="ng-vl-mono">{r.routeDst}</span>
            <label className="ng-vl-label" htmlFor={`vl-${dev}-routes-0-gateway`}>gateway</label>
            {field('routes.0.gateway', r.routeGateway, { row: 'routes.0', className: 'is-ip', placeholder: r.ipHint })}
            <MarkWords mark={markOn(marks, 'routes.0')} id={markId('routes.0')} />
          </div>
        )}
      </div>
    );
  };

  // ── Task 3's Cisco switch: the management block ──
  const management = () => {
    const sviMark = markOn(marks, 'svi'), gwMark = markOn(marks, 'defaultGateway');
    return (
      <section className="ng-vl-form ng-vl-mgmt" data-syntax="cisco" aria-label={r.management}>
        <h3 className="ng-vl-caption">{r.management}</h3>
        {noteAt('svi')}
        <div className={`ng-vl-form-line${sviMark ? ' is-marked' : ''}`}>
          <label className="ng-vl-label ng-vl-mono" htmlFor={`vl-${dev}-svi-vid`}>{r.sviVlan}</label>
          {field('svi.vid', r.sviVlanLabel, { row: 'svi', className: 'is-vid', numeric: true })}
        </div>
        <div className={`ng-vl-form-line${sviMark ? ' is-marked' : ''}`}>
          <label className="ng-vl-label ng-vl-mono" htmlFor={`vl-${dev}-svi-address`}>{r.sviAddress}</label>
          {field('svi.address', r.sviAddressLabel, { row: 'svi', className: 'is-address', placeholder: r.addressHint.cisco })}
        </div>
        <MarkWords mark={sviMark} id={markId('svi')} />
        <div className={`ng-vl-form-line${gwMark ? ' is-marked' : ''}`}>
          <label className="ng-vl-label ng-vl-mono" htmlFor={`vl-${dev}-defaultGateway`}>{r.defaultGateway}</label>
          {field('defaultGateway', r.defaultGatewayLabel, { row: 'defaultGateway', className: 'is-ip', placeholder: r.ipHint })}
        </div>
        <MarkWords mark={gwMark} id={markId('defaultGateway')} />
      </section>
    );
  };

  const deviceMark = markOn(marks, '');
  const l3 = syntax === 'cisco'
    ? (device.kind === 'router' ? cisco() : 'svi' in c ? management() : null)
    : (device.kind === 'router' || 'routes' in c ? routeros() : null);
  // Task 3 (repair v1): on the switch, the management block (the learner's work; its ports are given)
  // comes before the ports, so a verdict or hint about it is in view with the help panel.
  const first = device.kind === 'switch' && l3 && l2;
  return (
    <div className="ng-vl-device-form">
      {noteAt('device')}
      {first ? l3 : l2}
      {first ? l2 : l3}
      {!l2 && deviceMark && <MarkWords mark={deviceMark} id={markId('')} />}
    </div>
  );
}
