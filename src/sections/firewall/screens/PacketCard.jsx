// The packet card (FW-1 screen spec §4, v2 S1, S4): the givens of one
// packet in three lines on most cards (five on a dst-NAT card, whose
// destination label and forwarding line are longer; its forwarding in 14 px): where from (with the ingress port
// and its lists) and where to (the address only; on a dst-NAT card, the
// address the filter sees, after dst-NAT); the protocol and ports, the
// destination first, with the service where known; the state, which is
// given, and dst-NAT. The state's meaning shows on hover and in «Текстом».
// The card takes focus when a new one comes («Наступний пакет →», «Ще раз»);
// with keyboard focus it shows the state's meaning (fix round 1).
//
// Round 5 (spec §3, R3): the card shows only the fields its level decides
// with (logic's cardView `fields`): level 1 is two lines, «Звідки:
// 192.168.88.10 (ПК)» and «Куди: 192.168.88.1»; the «Куди» value can be a
// FactLink (`toNode`), which shows that address on the diagram.
import { forwardRef, useState } from 'react';
import { keyboardFocus } from './Choices.jsx';
import { ui } from '../uk.js';

/** One given; `field` names it (data-field: the gate's R5 essentials select each field). */
function Field({ label, children, title, small = false, field }) {
  return (
    <span className="ng-fw-field" data-field={field}>
      <span className="ng-fw-label">{label}:</span>{' '}
      <span className={`ng-fw-value${small ? ' is-small' : ''}`} title={title}>{children}</span>
    </span>
  );
}

const ALL = ['from', 'to', 'ports', 'state', 'nat'];

/** @param {{ lines: object, n?: number, total?: number, label?: string, fields?: string[], toNode?: any }} props  lines: walkView.cardLines;
 * `label`: the card's accessible name instead of «Пакет n з m» (FW-2's single packet).
 * `fields`: the fields shown (cardView.fields; default all); with only
 * «from» and «to», each is a line of its own. `toNode`: the «Куди» value as a node (a FactLink). */
const PacketCard = forwardRef(function PacketCard({ lines, n, total, label, fields = ALL, toNode = null }, ref) {
  // The state's meaning: a hidden description, and shown while the card has
  // keyboard focus (fix round 1); hover keeps the value's title.
  const [focused, setFocused] = useState(false);
  const meaning = fields.includes('state') ? lines.state.meaning : null;
  const to = <Field label={lines.to.label} field="to">{toNode ?? lines.to.value}</Field>;
  if (!fields.includes('ports')) {
    return (
      <section ref={ref} tabIndex={-1} className="ng-fw-card is-short" aria-label={label ?? ui.progress({ n, total })}>
        <p className="ng-fw-card-line"><Field label={lines.from.label} field="from">{lines.from.value}</Field></p>
        <p className="ng-fw-card-line">{to}</p>
      </section>
    );
  }
  return (
    <section ref={ref} tabIndex={-1} className="ng-fw-card" aria-label={label ?? ui.progress({ n, total })}
      aria-describedby={meaning ? 'ng-fw-card-meaning' : undefined}
      onFocus={e => setFocused(e.target === e.currentTarget && keyboardFocus(e.currentTarget))} onBlur={() => setFocused(false)}>
      <p className="ng-fw-card-line">
        <Field label={lines.from.label} field="from">{lines.from.value}</Field>
        {lines.natShown ? null : to}
      </p>
      {lines.natShown && <p className="ng-fw-card-line">{to}</p>}
      <p className="ng-fw-card-line ng-fw-mono" data-field="ports">{lines.ports}</p>
      <p className="ng-fw-card-line">
        <Field label={lines.state.label} title={lines.state.meaning ?? undefined} field="state">{lines.state.value}</Field>
        <Field label={lines.nat.label} small={lines.natShown} field="nat">{lines.nat.value}</Field>
      </p>
      {meaning && <span id="ng-fw-card-meaning" hidden>{meaning}</span>}
      {meaning && focused && <p className="ng-fw-meaning" aria-hidden="true">{meaning}</p>}
    </section>
  );
});

export default PacketCard;
