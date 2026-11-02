import { validateFields as validateSyntaxFields, fieldsToRoute } from '../../../engine/vendors/fields.js';
// Cisco IOS syntax for the routing screen: the round 1 Cisco trainer's fields
// (network, full dotted mask, next-hop, distance), its commands and feedback.
// Pure: no React. Grading itself stays in logic/static.js (checkRow).
import * as vendor from '../../../engine/vendors/cisco.js';
import { prefixToMask } from '../../../engine/ip.js';
import { ui } from '../uk.js';

import { normIp } from '../logic/normalise.js';
import { reasonFeedback } from './feedback.js';

const text = ui.cisco;

export const id = 'cisco';
export const label = 'Cisco';

/** Fields as in round 1: names match checkRow's Cisco fields. */
export const fields = [
  { name: 'net', label: 'МЕРЕЖА', okKey: 'netOk', placeholder: ({ isDefault }) => (isDefault ? '0.0.0.0' : 'напр. 203.0.113.0') },
  { name: 'mask', label: 'ПОВНА МАСКА', okKey: 'maskOk', placeholder: ({ isDefault }) => (isDefault ? '0.0.0.0' : 'напр. 255.255.255.0') },
  // A guided discard row (task 17) is typed Null0; elsewhere the example stays.
  { name: 'gw', label: 'NEXT-HOP', okKey: 'gwOk', placeholder: ({ discard } = {}) => (discard ? 'Null0' : 'напр. 198.51.100.1') },
  { name: 'dist', label: 'DISTANCE', okKey: 'distOk', placeholder: () => 'distance', distance: true },
];

/** Typed text is kept as typed (round 1 Cisco). */
export const filterInput = value => value;

/** Field text → a vendor-neutral route, or null if it doesn't parse.
 * Whitespace is removed first, as the round 1 grader does. */
export function toRoute(values = {}) {
  return fieldsToRoute(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, normIp(v)])), 'cisco');
}

/** Pure syntax-only validation; call validateRoute next for topology checks. */
export function validateFields(fields = {}) {
  return validateSyntaxFields(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, normIp(v)])), 'cisco');
}

/** A neutral route → this syntax's field text (switching syntax keeps the answer). */
export function fromRoute(route, needDist) {
  return { net: route.dst, mask: prefixToMask(route.prefix), gw: route.discard === true ? 'Null0' : route.via, dist: needDist && route.distance !== 1 ? String(route.distance) : '' };
}

export const command = route => vendor.renderRoute(route);

/** All of a router's commands, as the round 1 reference showed them. */
export function commandBlock(routes) {
  const lines = routes.map(command).join('\n');
  return lines ? `configure terminal\n${lines}\nend\nwrite memory` : '';
}

export const ifaceLabel = iface => vendor.interfaceLabel(iface);

/** Wrong feedback takes only grading booleans and reason codes. */
export const feedback = reasonFeedback;

/** A right answer echoes only the student's own command. */
export function success(values) {
  const distance = normIp(values.dist);
  const route = toRoute(values);
  if (route?.discard) return { ok: true, parts: [text.right, { code: command({ ...route, distance: distance ? route.distance : undefined }) }] };
  const ownCommand = `ip route ${normIp(values.net)} ${normIp(values.mask)} ${normIp(values.gw)}${distance ? ` ${distance}` : ''}`;
  return { ok: true, parts: [text.right, { code: ownCommand }] };
}

export default { id, label, fields, filterInput, validateFields, toRoute, fromRoute, command, commandBlock, ifaceLabel, feedback, success, text };
