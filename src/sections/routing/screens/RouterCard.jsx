// The selected router's interfaces, and its reference commands once the
// answer is revealed (round 1 RouterInfo), in the work panel.
//   - Interfaces («адреси цього роутера», round 5): one line per interface,
//     `g0/0 · ISP1 · 1.1.1.2/30`; a link to other routers names them
//     (`g0/1 · до R2 · 10.0.0.1/30`: the address is this router's own end);
//     a DHCP WAN gets the one-sentence DHCP note under its line, in both
//     syntaxes. The list states its count from the task data (data-count:
//     the gate's «all» essentials, tools/shots.mjs).
//   - Reveal (round 4 spec R1): ReferenceRows, the selected router's
//     reference commands in the rows' place, marked «показано».
import { useRef, useState } from 'react';
import { copyText, selectText } from '../../../ui/clipboard.js';
import { uk as generic } from '../../../ui/uk.js';
import { ui } from '../uk.js';

/** Interfaces as the card lists them: the syntax's label, address or DHCP, note. */
export function interfacesOf(network, router, syntax) {
  const device = network.devices.find(d => d.id === router);
  // The routers at the other end of a link (round 5: «до R2», not «→R2», which read as R2's address).
  const peers = iface => network.devices.filter(d => d.kind === 'router' && d.id !== router && d.interfaces.some(i => i.segmentId === iface.segmentId)).map(d => d.id);
  return (device?.interfaces ?? []).map(iface => {
    const segment = network.segments.find(s => s.id === iface.segmentId);
    const link = segment?.kind === 'link' && peers(iface).length > 0;
    return {
      name: syntax.ifaceLabel(iface),
      ip: iface.address ? `${iface.address.ip}/${iface.address.prefix}` : 'DHCP',
      note: link ? ui.shared.linkTo(peers(iface)) : iface.note ?? segment?.name,
      dhcp: !iface.address,
    };
  });
}

/** @param {{ task: object, syntax: object, router: string, colour: string }} props `colour`: the router's class (theme.js). */
export function InterfacesCard({ task, syntax, router, colour }) {
  const count = task.network.devices.find(d => d.id === router)?.interfaces.length ?? 0;
  return (
    <section className={`ng-rt-card ${colour}`} aria-label={ui.shared.interfaces(router)}>
      <h3 className="ng-rt-caption ng-rt-rc-text">{ui.shared.interfaces(router)}</h3>
      <ul className="ng-rt-ifaces" data-count={count}>
        {interfacesOf(task.network, router, syntax).map(i => (
          <li key={i.name}>
            <span className="ng-rt-if-name">{i.name}</span> · <span className="ng-rt-if-note">{i.note}</span> · <span className="ng-rt-if-ip">{i.ip}</span>
            {i.dhcp && <p className="ng-rt-note ng-rt-dhcp">{ui.shared.dhcpNote}</p>}
          </li>
        ))}
      </ul>
    </section>
  );
}

/**
 * Round 4 (spec R1): the reveal applied to the rows. Once the instance is
 * revealed (the help panel's «Показати відповідь»), the selected router's
 * reference commands take the rows' place, marked «показано» (never a
 * solve's look), with «Скопіювати команди»; another router shows its own.
 * The learner's own rows stay a button away («Моя відповідь», on the rows'
 * heading). The reveal path: ex.solution exists only once revealed.
 * @param {{ ex: object, syntax: object, router: string, colour: string, head?: any }} props
 */
export function ReferenceRows({ ex, syntax, router, colour, head = null }) {
  // { text, ok }: the last copy that finished (on failure the commands are selected for Ctrl+C).
  const [copied, setCopied] = useState(null);
  const pre = useRef(null);
  const commands = ex.solution ? syntax.commandBlock(ex.solution[router] ?? []) : '';
  const done = commands && copied?.text === commands ? copied : null;
  function copy() {
    setCopied(null);
    copyText(commands).then(() => setCopied({ text: commands, ok: true }), () => {
      selectText(pre.current);
      setCopied({ text: commands, ok: false });
    });
  }
  return (
    <section className={`ng-rt-reveal ${colour}`} aria-label={ui.shared.referenceRows(router)} data-revealed="">
      <div className="ng-rt-rows-head">
        <h3 className="ng-rt-caption ng-rt-rc-text">{ui.shared.referenceRows(router)} <span className="ng-shown-chip">{generic.help.shown}</span></h3>
        {head}
      </div>
      <pre ref={pre} className="ng-rt-pre ng-rt-commands">{commands || ui.shared.noRoutes}</pre>
      {commands && <>
        <button type="button" onClick={copy} className="ng-rt-btn ng-rt-copy">
          {done?.ok ? ui.shared.copied : ui.shared.copy}
        </button>
        <p className="ng-rt-note" aria-live="polite">{done && !done.ok ? ui.shared.copyFailed : ''}</p>
      </>}
    </section>
  );
}
