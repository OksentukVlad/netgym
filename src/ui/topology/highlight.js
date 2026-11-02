// The diagram highlight (round 5, rule R3): a fact on the screen (an
// address, a port, a VLAN) shows where it is on the diagram. Label only:
// the three diagrams (firewall, routing, VLAN) mark the text labels that
// carry a fact with `hl()`, and HighlightLayer outlines the one(s) matching
// the screen's `highlight` prop. Doors, chains, paths, device boxes and
// answer controls never carry `data-hl`, so they can never be highlighted.
//
// highlight: { kind, value } | null
//   kind 'address': an IPv4 address without its prefix («192.168.88.1»)
//   kind 'port':    an interface or port name as the diagram writes it
//   kind 'vlan':    a VLAN id («10»)
//   kind 'label':   a diagram's own label id (the firewall's «r1-bridge»,
//                   «pc», «server», «internet»; logic's cardView owner.labelId)

export const HIGHLIGHT_KINDS = ['address', 'port', 'vlan', 'label'];

const keyOf = (kind, value) => `${kind}:${value}`;

/** Does `highlight` name this fact? */
export function matches(highlight, kind, value) {
  return Boolean(highlight && HIGHLIGHT_KINDS.includes(highlight.kind) && value !== undefined && value !== null
    && highlight.kind === kind && String(highlight.value) === String(value));
}

/**
 * Props for a text label (an SVG <text> or <tspan>) that carries facts:
 * each fact is `{ kind, value }` (round 5 5b-1, the agreed API) or the older
 * `[kind, value]` pair. `data-hl` lists them; `data-highlight` marks the label
 * while `highlight` names one of them.
 */
export function hl(highlight, ...facts) {
  // A value is one token (data-hl lists facts separated by spaces).
  const known = facts.map(f => (Array.isArray(f) ? f : f && typeof f === 'object' ? [f.kind, f.value] : [])).filter(([, value]) => value !== undefined && value !== null && value !== '' && !/\s/.test(String(value)));
  if (!known.length) return {};
  return {
    'data-hl': known.map(([kind, value]) => keyOf(kind, value)).join(' '),
    ...(known.some(([kind, value]) => matches(highlight, kind, value)) ? { 'data-highlight': '' } : {}),
  };
}

/** An address without its prefix: «192.168.1.1/24» → «192.168.1.1». */
export const bareAddress = text => (typeof text === 'string' ? text.split('/')[0].trim() : text);

/** A VLAN id named in a label («VLAN 10», «vlan10», «access 20»): the id, else null. */
export function vlanOf(text) {
  const m = typeof text === 'string' ? /\bvlan\s*(\d{1,4})\b/i.exec(text) : null;
  return m ? m[1] : null;
}
