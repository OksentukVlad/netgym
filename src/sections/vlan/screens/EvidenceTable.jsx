// «Куди дійде кадр»: the port evidence (round 5, spec 5b-1 §4 v2), on the
// first view under the question: a row per configured port, «комутатор ·
// порт · ПК · налаштований VLAN / PVID», from the given configuration only
// (vlan/logic/facts.js portEvidence: never the goals, the receivers or the
// walk). The learner still applies the rule.
//   - an access port shows its VLAN (Cisco) or its PVID (MikroTik); a trunk
//     (or a tagged member) the VLANs it carries;
//   - a Cisco switch shows the VLANs created on it under its name: a trunk
//     may allow a VLAN the switch doesn't have (a missing transit VLAN);
//   - a MikroTik switch with filtering off says so under its name: then PVID
//     and the table don't separate anything; a MikroTik port says which
//     frames it admits («з тегом», «без тега», «усі кадри»);
//   - the round's sender is marked «надсилає» on its row;
//   - each port is a FactLink: a tap outlines that port's label on the
//     diagram (device-qualified, label only) and says whose port it is.
// The command block (GivenConfig) stays under the work as its source.
import FactLink from '../../../ui/components/FactLink.jsx';
import { matches } from '../../../ui/topology/highlight.js';
import { portEvidence, portEvidenceFacts } from '../logic/facts.js';
import { ui, vlanTeaching } from '../uk.js';

/** The value cell's words for one evidence row. */
export function evidenceValue(row) {
  const parts = [];
  if (row.vlan !== undefined) parts.push(ui.evidenceVlan({ vid: row.vlan }));
  else if (row.host && row.pvid !== undefined) parts.push(ui.evidencePvid({ vid: row.pvid }));
  if (row.allowed) parts.push(ui.evidenceTrunk({ vids: row.allowed }));
  if (row.frameTypes) parts.push(ui.evidenceFrames[row.frameTypes] ?? row.frameTypes);
  return parts.join(' · ');
}

/** The device at the other end of a displayed port (a trunk's neighbour). */
export function peerOf(topology, device, label) {
  const node = topology.devices.find(d => d.id === device);
  const port = node?.ports.find(p => Object.values(p.label).includes(label));
  const link = port && topology.links.find(l => (l.a.device === device && l.a.port === port.id) || (l.b.device === device && l.b.port === port.id));
  if (!link) return null;
  return link.a.device === device && link.a.port === port.id ? link.b.device : link.a.device;
}

/** Rows grouped by switch, in the evidence's order. */
export function evidenceGroups(rows) {
  const groups = [];
  for (const row of rows) {
    const last = groups.at(-1);
    if (last?.device === row.device) last.rows.push(row);
    else groups.push({ device: row.device, rows: [row] });
  }
  return groups;
}

/**
 * @param {{ task: object, source?: string|null, highlight?: object|null, onFact?: (fact: object, words: string) => string }} props
 *   `source`: the round's sender, a muted «надсилає» on its row (where to start; the configuration, not a goal)
 *   `onFact`: a port's tap; the screen sets the diagram's highlight and returns the words to say
 */
export default function EvidenceTable({ task, source = null, highlight = null, onFact = null }) {
  const rows = portEvidence(task);
  const [c1, c2, c3, c4] = vlanTeaching.evidenceColumns;
  return (
    <table className="ng-vl-evidence" aria-label={ui.evidenceTitle}>
      <thead><tr><th scope="col">{c1}</th><th scope="col">{c2}</th><th scope="col">{c3}</th><th scope="col">{c4}</th></tr></thead>
      {evidenceGroups(rows).map(group => {
        // The switch's own facts (any row of it carries them): Cisco's created VLANs, MikroTik's filtering.
        const created = group.rows.find(r => r.created)?.created;
        const off = group.rows.some(r => r.filtering === false);
        return (
          <tbody key={group.device}>
            {group.rows.map((row, i) => {
              const fact = portEvidenceFacts(row)[0];
              const to = row.host ?? peerOf(task.topology, row.device, row.port);
              const words = ui.portOwner({ device: row.device, port: row.port, to });
              return (
                <tr key={row.port} data-evidence-row="">
                  {i === 0 && (
                    <th scope="rowgroup" rowSpan={group.rows.length} className="ng-vl-ev-switch">
                      <span className="ng-vl-ev-name">{group.device}</span>
                      {created && <span className="ng-vl-ev-note">{ui.evidenceCreated({ vids: created })}</span>}
                      {off && <span className="ng-vl-ev-note is-off">{vlanTeaching.filteringOff}</span>}
                    </th>
                  )}
                  <td className="ng-vl-ev-port">
                    {onFact
                      ? <FactLink value={row.port} active={matches(highlight, fact.kind, fact.value)} onActivate={() => onFact(fact, words)} />
                      : <span className="ng-vl-mono">{row.port}</span>}
                  </td>
                  <td className={row.host ? 'ng-vl-ev-host' : 'ng-vl-ev-host is-trunk'}>{row.host ?? ui.evidenceTo({ to })}
                    {row.host && row.host === source && <span className="ng-vl-ev-sender">{` ${ui.evidenceSender}`}</span>}</td>
                  <td className="ng-vl-ev-value">{evidenceValue(row)}</td>
                </tr>
              );
            })}
          </tbody>
        );
      })}
    </table>
  );
}
