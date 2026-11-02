import { toInt, blockSize, isNetworkAddress, maskToPrefix } from '../ip.js';

// IOS accepts the null interface name with an optional separating space.
export const isNull0 = value => typeof value === 'string' && /^null ?0$/i.test(value.trim());

// The engine's general parser accepts leading zeros. Vendor fields deliberately do not.
export const strictIp = value => typeof value === 'string' && /^(0|[1-9]\d{0,2})(\.(0|[1-9]\d{0,2})){3}$/.test(value) && toInt(value) !== null;

/** Parse fields into a neutral route, rejecting noncanonical address spelling.
 * @returns {{ok:boolean, code:string, route:object|null}}
 */
export function parseFields(fields, syntax) {
  const fail = code => ({ ok: false, code, route: null });
  const clean = value => typeof value === 'string' ? value.trim() : value;
  const via = clean(fields?.gw);
  const discard = syntax === 'cisco' ? isNull0(via) : fields?.blackhole === true;
  if (syntax === 'routeros' && discard && via != null && via !== '') return fail('blackhole-with-gateway');
  let dst, prefix;
  if (syntax === 'cisco') {
    dst = clean(fields?.net);
    const mask = clean(fields?.mask);
    prefix = strictIp(mask) ? maskToPrefix(mask) : null;
  } else {
    const parts = typeof fields?.dst === 'string' ? fields.dst.trim().split('/') : [];
    dst = parts[0];
    prefix = parts.length === 2 && /^(0|[1-9]\d?)$/.test(parts[1]) ? Number(parts[1]) : null;
  }
  if (!strictIp(dst) || (!discard && !strictIp(via))) return fail('invalid-ip');
  if (blockSize(prefix) === null) return fail('invalid-prefix');
  if (!isNetworkAddress(dst, prefix)) return fail('dst-not-network');
  const raw = clean(fields?.dist);
  const distance = raw == null || raw === '' ? 1 : Number(raw);
  if ((raw != null && raw !== '' && !/^\d+$/.test(String(raw))) || !Number.isInteger(distance) || distance < 1 || distance > 254) return fail('invalid-distance');
  return { ok: true, code: 'ok', route: { dst, prefix, ...(discard ? { discard: true } : { via }), distance } };
}

/** Validate editable syntax fields only, without a network or reference route.
 * Destination alignment is left to validateRoute. Returns the first code or null.
 * @param {object} fields
 * @param {'cisco'|'routeros'} syntax
 * @returns {string|null}
 */
export function validateFields(fields = {}, syntax) {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError(`Unknown syntax: ${syntax}`);
  const value = key => String(fields[key] ?? '').trim();
  const discard = syntax === 'cisco' ? isNull0(value('gw')) : fields.blackhole === true;
  if (syntax === 'routeros' && discard && value('gw')) return 'blackhole-with-gateway';
  if ((syntax === 'cisco' ? ['net', 'mask', 'gw'] : discard ? ['dst'] : ['dst', 'gw']).some(k => !value(k))) return 'empty';
  if (!discard && !strictIp(value('gw'))) return 'invalid-ip';
  if (syntax === 'cisco') {
    if (!strictIp(value('net'))) return 'invalid-ip';
    if (!value('mask').includes('.') || value('mask').includes('/')) return 'mask-not-dotted';
    if (!strictIp(value('mask')) || maskToPrefix(value('mask')) === null) return 'invalid-mask';
  } else {
    const parts = value('dst').split('/');
    if (!strictIp(parts[0])) return 'invalid-ip';
    if (parts.length !== 2 || !/^(0|[1-9]\d?)$/.test(parts[1]) || Number(parts[1]) > 32) return 'invalid-prefix';
  }
  if (value('dist') && (!/^\d+$/.test(value('dist')) || Number(value('dist')) < 1 || Number(value('dist')) > 254)) return 'invalid-distance';
  return null;
}

/** Parse syntactically valid fields, retaining host bits for validateRoute to
 * diagnose. Invalid/unfinished fields return null. Does not grade an answer. */
export function fieldsToRoute(fields, syntax) {
  if (validateFields(fields, syntax)) return null;
  const clean = key => String(fields[key] ?? '').trim();
  const [dst, prefix] = syntax === 'cisco' ? [clean('net'), maskToPrefix(clean('mask'))] : [clean('dst').split('/')[0], Number(clean('dst').split('/')[1])];
  const discard = syntax === 'cisco' ? isNull0(clean('gw')) : fields.blackhole === true;
  return { dst, prefix, ...(discard ? { discard: true } : { via: clean('gw') }), distance: Number(clean('dist') || 1) };
}
