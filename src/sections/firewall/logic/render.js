import { fields, hooks } from './model.js';

const renderValue = value => typeof value === 'object' ? `${value.from}-${value.to}` : String(value);

/** Position belongs to the entire ordered policy, including the other chain. */
export function renderRule(rule, position) {
  const renderedFields = Object.entries(fields).filter(([field]) => rule.match[field]).map(([field, key]) => ({
    key, value: `${rule.match[field].not ? '!' : ''}${rule.match[field].values.map(renderValue).join(',')}`,
  }));
  const params = [`chain=${rule.chain}`, `action=${rule.action}`, ...renderedFields.map(({ key, value }) => `${key}=${value}`), ...(!rule.enabled ? ['disabled=yes'] : [])];
  return { command: `/ip firewall filter add ${params.join(' ')}`, position, chain: rule.chain, action: rule.action, disabled: !rule.enabled, fields: renderedFields };
}

export function renderPolicy(policy) {
  return [
    ...policy.rules.map((rule, index) => ({ id: rule.id, ...renderRule(rule, index + 1) })),
    ...hooks.map(chain => ({ id: `chain-end:${chain}`, chain, code: 'chain-end-row' })),
  ];
}

/** Pre-commit display is ONLY givens. In particular, destination is always an address. */
export function displayCard(card) {
  const { packet, facts } = card;
  return {
    id: card.id, from: { code: 'card-from', params: { address: packet.srcIp, ingress: facts.ingress } },
    to: { code: 'card-to', params: { address: packet.dstIp } },
    protocol: packet.protocol,
    ...(packet.srcPort !== undefined ? { srcPort: packet.srcPort } : {}),
    ...(packet.dstPort !== undefined ? { dstPort: packet.dstPort } : {}),
    ...(packet.icmpType !== undefined ? { icmpType: packet.icmpType } : {}),
    state: { code: `state.${facts.state}` },
    // The fact says only that translation occurred. Original tuple is not inferred.
    dstNat: { code: facts.dstNat === 'unknown' ? 'dstnat.unknown' : facts.dstNat ? 'dstnat.yes' : 'dstnat.no', ...(facts.dstNatFrom ? { params: { ...facts.dstNatFrom } } : {}) },
  };
}
