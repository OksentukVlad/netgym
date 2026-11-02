import { validateFields as validateSyntaxFields, fieldsToRoute } from '../../../engine/vendors/fields.js';
// MikroTik RouterOS syntax for the routing screen: the round 1 MikroTik
// trainer's fields (dst-address in CIDR, gateway, distance; no mask field),
// its commands and feedback. Pure: no React. The logic's key is `routeros`.
import * as vendor from '../../../engine/vendors/routeros.js';
import { ui } from '../uk.js';

import { normalizeAnswer } from '../logic/normalise.js';
import { reasonFeedback } from './feedback.js';

const text = ui.routeros;

export const id = 'routeros';
export const label = 'MikroTik';

/** Fields as in round 1 (independent format examples); names match checkRow's RouterOS fields. */
export const fields = [
  { name: 'dst', label: 'DST-ADDRESS', okKey: 'dstOk', placeholder: ({ isDefault }) => isDefault ? '0.0.0.0' : 'dst-address, напр. 203.0.113.0/24' },
  { name: 'gw', label: 'GATEWAY', okKey: 'gwOk', placeholder: () => 'gateway, напр. 198.51.100.1' },
  { name: 'dist', label: 'DISTANCE', okKey: 'distOk', placeholder: () => 'distance', distance: true },
];

/** Round 1 MikroTik trimmed every field as it was typed. */
export const filterInput = value => value.trim();

/** Field text → a vendor-neutral route, or null if it doesn't parse. */
export function toRoute(values = {}) {
  return fieldsToRoute(Object.fromEntries(Object.entries(values).map(([k, v]) => [k, k === 'blackhole' ? v : normalizeAnswer(v)])), 'routeros');
}

/** Pure syntax-only validation; call validateRoute next for topology checks. */
export function validateFields(fields = {}) {
  return validateSyntaxFields(Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, k === 'blackhole' ? v : normalizeAnswer(v)])), 'routeros');
}

/** A neutral route → this syntax's field text (switching syntax keeps the answer). */
export function fromRoute(route, needDist) {
  return { dst: `${route.dst}/${route.prefix}`, gw: route.discard === true ? '' : route.via, ...(route.discard === true ? { blackhole: true } : {}), dist: needDist && route.distance !== 1 ? String(route.distance) : '' };
}

export const command = route => vendor.renderRoute(route);

/** All of a router's commands, as the round 1 reference showed them. */
export function commandBlock(routes) {
  return routes.map(command).join('\n');
}

export const ifaceLabel = iface => vendor.interfaceLabel(iface);

/** Wrong feedback takes only grading booleans and reason codes. */
export const feedback = reasonFeedback;

/** A right answer echoes only the student's own command. */
export const success = () => ({ ok: true, parts: [text.right] });

export default { id, label, fields, filterInput, validateFields, toRoute, fromRoute, command, commandBlock, ifaceLabel, feedback, success, text };
