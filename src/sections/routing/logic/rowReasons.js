import { strictIp, parseFields, isNull0 } from '../../../engine/vendors/fields.js';
import { maskToPrefix, isNetworkAddress, contains, network, broadcast } from '../../../engine/ip.js';
import { normIp, normalizeAnswer } from './normalise.js';

export const reasonCodes = [
  'empty', 'invalid-ip', 'invalid-prefix', 'dst-not-network', 'wrong-destination',
  'mask-not-dotted', 'invalid-mask', 'wrong-mask', 'gateway-is-self',
  'gateway-off-link', 'gateway-not-host', 'gateway-not-router', 'gateway-mismatch',
  'primary-distance', 'backup-needs-distance', 'backup-needs-higher-distance',
  'invalid-distance', 'blackhole-with-gateway', 'discard-with-gateway', 'invalid-discard', 'discard-mismatch', 'field-wrong',
];

/** Copy only grading booleans across the feedback boundary. */
export function rowVerdict(result) {
  return Object.fromEntries(Object.entries(result).filter(([key, value]) =>
    ['ok', 'netOk', 'maskOk', 'dstOk', 'gwOk', 'distOk', 'needDist'].includes(key) && typeof value === 'boolean'));
}

/** Diagnose wrong fields without consulting reference routes or changing grading.
 * @returns {Object<string, string>} One reason code per wrong field.
 */
export function rowReasons(task, routerId, rowIndex, fields, syntax, verdict) {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError(`Unknown syntax: ${syntax}`);
  const norm = syntax === 'cisco' ? normIp : normalizeAnswer;
  const values = Object.fromEntries(Object.entries(fields ?? {}).map(([key, value]) => [key, norm(value)]));
  const row = task.variant.scaffold[routerId]?.[rowIndex];
  const reasons = {};
  const dottedPrefix = strictIp(values.mask) ? maskToPrefix(values.mask) : null;

  if (verdict.netOk === false) {
    reasons.net = !values.net ? 'empty' : !strictIp(values.net) ? 'invalid-ip'
      : dottedPrefix !== null && verdict.maskOk && !isNetworkAddress(values.net, dottedPrefix) ? 'dst-not-network' : 'wrong-destination';
  }
  if (verdict.dstOk === false) {
    // Use the vendor parser with a valid synthetic gateway so only the destination is diagnosed.
    const parsed = parseFields({ dst: values.dst, gw: '198.51.100.1' }, 'routeros');
    reasons.dst = !values.dst ? 'empty' : !strictIp(values.dst.split('/')[0]) ? 'invalid-ip'
      : parsed.code === 'invalid-prefix' ? 'invalid-prefix'
        : parsed.code === 'dst-not-network' ? 'dst-not-network' : 'wrong-destination';
  }
  if (verdict.maskOk === false) {
    reasons.mask = !values.mask ? 'empty' : values.mask.startsWith('/') ? 'mask-not-dotted'
      : dottedPrefix === null ? 'invalid-mask' : 'wrong-mask';
  }
  if (verdict.gwOk === false) {
    const gateway = values.gw;
    const device = task.network.devices.find(d => d.id === routerId);
    const interfaces = device?.interfaces ?? [];
    const connected = interfaces.filter(i => i.address && contains(i.address.ip, i.address.prefix, gateway));
    let code = 'gateway-mismatch';
    if (!gateway) code = 'empty';
    else if (!strictIp(gateway)) code = 'invalid-ip';
    else if (!device) code = 'field-wrong';
    else if (interfaces.some(i => i.address?.ip === gateway)) code = 'gateway-is-self';
    else if (!connected.length && interfaces.every(i => i.address)) code = 'gateway-off-link';
    else if (connected.some(i => gateway === network(i.address.ip, i.address.prefix) || gateway === broadcast(i.address.ip, i.address.prefix))) code = 'gateway-not-host';
    else if (connected.length && !task.network.devices.some(d => d.interfaces.some(i => connected.some(c => c.segmentId === i.segmentId) && i.address?.ip === gateway))) code = 'gateway-not-router';
    if (syntax === 'routeros' && fields.blackhole === true) code = gateway ? 'blackhole-with-gateway' : 'discard-mismatch';
    else if (syntax === 'cisco' && isNull0(gateway)) code = 'discard-mismatch';
    else if (row?.discard === true && strictIp(gateway)) code = 'discard-mismatch';
    else if (row?.discard === true && !gateway && syntax === 'routeros') code = 'discard-mismatch';
    reasons.gw = code;
  }
  if (verdict.distOk === false) {
    const distance = values.dist;
    reasons.dist = row?.role === 'primary' ? ['', '1'].includes(distance) ? 'field-wrong' : 'primary-distance'
      : row?.role !== 'backup' ? 'field-wrong'
        : !distance ? 'backup-needs-distance'
          : !/^-?\d+$/.test(distance) ? 'invalid-distance'
            : Number(distance) >= 2 && Number(distance) <= 255 ? 'field-wrong' : 'backup-needs-higher-distance';
  }
  return reasons;
}
