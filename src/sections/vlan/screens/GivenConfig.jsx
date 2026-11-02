// «Куди дійде кадр»: each switch's given configuration (VLAN-1 spec §4), one
// switch at a time (the tabs, or a press on the diagram): Cisco as its
// commands; MikroTik as the two Winbox-like tables a student meets first
// (Bridge → Ports: Interface, PVID, Frame Types; Bridge → VLANs: VLAN IDs,
// Tagged, Untagged), the bridge's VLAN Filtering in words, and the commands
// behind «Команди». Everything here is a given: it's the same before and
// after a commitment.
import { useState } from 'react';
import Segmented from '../../../ui/components/Segmented.jsx';
import Commands from './Commands.jsx';
import { orderedPorts } from '../logic/predict.js';
import { ui } from '../uk.js';

/** RouterOS: the two tables of one switch, from its given configuration. */
export function WinboxTables({ device, config, syntax = 'routeros' }) {
  const name = id => device.ports.find(p => p.id === id)?.label[syntax] ?? id;
  // Round 4 (2a handoff): ports in the order of their displayed names, as the commands list them.
  const ports = orderedPorts(device, syntax).filter(p => config.ports[p.id]);
  const names = ids => (ids.length ? ids.map(name).join(', ') : ui.empty);
  return (
    <div className="ng-vl-winbox">
      <p className={`ng-vl-filtering${config.filtering ? '' : ' is-off'}`}>{ui.filtering({ on: config.filtering })}</p>
      <table className="ng-vl-table">
        <caption className="ng-vl-caption">{ui.bridgePorts}</caption>
        <thead><tr><th scope="col">{ui.col.interface}</th><th scope="col">{ui.col.pvid}</th><th scope="col">{ui.col.frameTypes}</th></tr></thead>
        <tbody>
          {ports.map(p => (
            <tr key={p.id}>
              <th scope="row">{p.label[syntax]}</th>
              <td>{config.ports[p.id].pvid}</td>
              <td className="ng-vl-ft">{ui.frameTypes[config.ports[p.id].frameTypes] ?? config.ports[p.id].frameTypes}</td>
            </tr>
          ))}
        </tbody>
      </table>
      <table className="ng-vl-table">
        <caption className="ng-vl-caption">{ui.bridgeVlans}</caption>
        <thead><tr><th scope="col">{ui.col.vlanIds}</th><th scope="col">{ui.col.tagged}</th><th scope="col">{ui.col.untagged}</th></tr></thead>
        <tbody>
          {config.vlans.map((row, i) => (
            <tr key={i}>
              <th scope="row">{row.vids.join(',')}</th>
              <td>{names(row.tagged)}</td>
              <td>{names(row.untagged)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/**
 * @param {{ task: object, syntax: string, commands: Object<string, string>, switchId: string, onSwitch: Function }} props
 *   `commands`: predict.render(task), per switch
 */
export default function GivenConfig({ task, syntax, commands, switchId, onSwitch }) {
  const [showCommands, setShowCommands] = useState(false);
  const switches = task.topology.devices.filter(d => d.kind === 'switch');
  const device = switches.find(d => d.id === switchId) ?? switches[0];
  const config = task.configurations[device.id];
  return (
    <section className="ng-vl-given" aria-label={ui.given}>
      <div className="ng-vl-given-head">
        <h2 className="ng-vl-caption">{ui.given}</h2>
        {switches.length > 1 && (
          <Segmented label={ui.switchTabs} value={device.id} onChange={onSwitch} className="ng-vl-switches"
            options={switches.map(d => ({ value: d.id, label: d.id }))} />
        )}
        {switches.length === 1 && <span className="ng-vl-switch-one">{device.id}</span>}
      </div>
      {syntax === 'routeros' ? (
        <>
          <WinboxTables device={device} config={config} />
          <button type="button" className="ng-vl-btn ng-vl-show-commands" aria-pressed={showCommands} onClick={() => setShowCommands(s => !s)}>{ui.commands}</button>
          {showCommands && <Commands device={device.id} text={commands[device.id]} copy={false} />}
        </>
      ) : (
        <Commands device={device.id} text={commands[device.id]} copy={false} />
      )}
    </section>
  );
}
