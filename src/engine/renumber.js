import { blockSize, contains, fromInt, maskToPrefix, network, parseIp, toInt } from './ip.js';
import { makeRng } from './rng.js';
import { validateNetwork } from './network.js';

export const generatorVersion = 1;
export const privatePools = Object.freeze([
  Object.freeze({ dst: '10.0.0.0', prefix: 8 }),
  Object.freeze({ dst: '172.16.0.0', prefix: 12 }),
  Object.freeze({ dst: '192.168.0.0', prefix: 16 }),
]);
const benchmark = { dst: '198.18.0.0', prefix: 15 };
const carrier = { dst: '100.64.0.0', prefix: 10 };
const interval = (dst, prefix) => ({ dst: network(dst, prefix), prefix, start: toInt(network(dst, prefix)), end: toInt(network(dst, prefix)) + blockSize(prefix) });
const encloses = (a, b) => a.start <= b.start && b.end <= a.end;
const intersects = (a, b) => a.start < b.end && b.start < a.end;

export function numberedSegments(record) {
  return record.network.segments.flatMap(segment => {
    const address = record.network.devices.flatMap(d => d.interfaces).find(f => f.segmentId === segment.id && f.address)?.address;
    return address ? [{ ...interval(address.ip, address.prefix), id: segment.id, kind: segment.kind }] : [];
  });
}

/** All variants share the plan. Extra route tables come from the owning
 * section's frozen optimiser data, keeping the engine independent of banks. */
export function planBlocks(record, variant, frozenAnswers = []) {
  const segments = numberedSegments(record);
  const blocks = segments.map(s => ({ ...interval(s.dst, s.prefix) }));
  const add = p => { if (p.prefix !== 0) blocks.push(interval(p.dst, p.prefix)); };
  for (const v of record.variants) {
    for (const o of v.objectives ?? []) {
      if (o.type === 'summary') add(o);
      for (const p of o.exclude ?? []) add(p);
    }
  }
  const tables = [...record.variants.map(v => v.referenceRoutes), ...frozenAnswers];
  for (const rows of tables.flatMap(table => Object.values(table))) for (const row of rows) {
    if (row.prefix > 0 && segments.filter(s => encloses(interval(row.dst, row.prefix), s)).length >= 2) add(row);
  }
  const merged = [];
  for (let block of blocks.sort((a, b) => a.start - b.start || b.end - a.end)) {
    if (merged.length && intersects(merged.at(-1), block)) {
      const previous = merged.pop();
      let prefix = Math.min(previous.prefix, block.prefix);
      while (!encloses(interval(previous.dst, prefix), block)) prefix--;
      block = interval(previous.dst, prefix);
    }
    merged.push(block);
  }
  return merged.map(b => {
    const members = segments.filter(s => encloses(b, s));
    const kinds = new Set(members.map(s => s.kind));
    const pool = contains(benchmark.dst, benchmark.prefix, b.dst) ? 'fixed'
      : contains(carrier.dst, carrier.prefix, b.dst) ? 'carrier'
      : kinds.has('lan') || kinds.has('server') ? 'lan' : 'link';
    if (!members.length || (pool === 'lan' && [...kinds].some(k => !['lan', 'server'].includes(k)))) throw new RangeError('Mixed or empty renumbering unit');
    return { ...b, pool, segments: members.map(s => s.id) };
  });
}

/** Different groups cannot occupy sibling halves, even with unequal sizes. */
export function accidentalAdjacency(a, b) {
  const size = Math.max(a.end - a.start, b.end - b.start) * 2;
  return Math.floor(a.start / size) === Math.floor(b.start / size);
}

function place(record, units, seed, attempt) {
  const rng = makeRng(`${record.id}:${attempt === 0 ? seed : `${seed}#${attempt}`}`);
  const used = numberedSegments(record).filter(s => ['lan', 'server'].includes(s.kind));
  const available = privatePools.filter(p => !used.some(s => contains(p.dst, p.prefix, s.dst)));
  const lan = rng.pick(available.length ? available : privatePools);
  const link = lan.prefix === 8 ? { dst: '172.31.0.0', prefix: 16 } : { dst: '10.255.0.0', prefix: 16 };
  const pools = { lan, link, carrier };
  const oldTextPrefixes = numberedSegments(record).filter(s => !contains(benchmark.dst, benchmark.prefix, s.dst))
    .map(s => interval(s.dst, Math.min(24, s.prefix)));
  const placed = units.filter(u => u.pool === 'fixed').map(u => ({ ...u, mapped: u.dst }));
  for (const unit of rng.shuffle(units.filter(u => u.pool !== 'fixed'))) {
    const pool = pools[unit.pool], size = unit.end - unit.start, start = toInt(pool.dst);
    let target;
    for (let i = 0; i < 2048; i++) {
      if (size > blockSize(pool.prefix)) break;
      const n = start + rng.int(0, blockSize(pool.prefix) / size - 1) * size;
      const candidate = { start: n, end: n + size };
      if (n === unit.start || oldTextPrefixes.some(p => intersects(candidate, p)) || placed.some(p => {
        const other = { start: toInt(p.mapped), end: toInt(p.mapped) + p.end - p.start };
        return intersects(candidate, other) || accidentalAdjacency(candidate, other);
      })) continue;
      target = fromInt(n); break;
    }
    if (!target) throw new RangeError('No placement in pool');
    placed.push({ ...unit, mapped: target });
  }
  return { units: units.map(u => placed.find(p => p.start === u.start && p.prefix === u.prefix)), lanPool: { ...lan }, linkPool: link };
}

/** One interval function for every literal, including unnumbered summary holes.
 * Prefixes must fit wholly in one unit. The engine boundary is identity-mapped. */
export function addressMapper(units) {
  return (ip, prefix) => {
    const n = toInt(ip);
    if (n === null) throw new RangeError(`Invalid address: ${ip}`);
    if (ip === '0.0.0.0' && (prefix === undefined || prefix === 0)) return ip;
    const size = prefix === undefined ? 1 : blockSize(prefix);
    if (size === null || (prefix !== undefined && network(ip, prefix) !== ip)) throw new RangeError(`Unaligned prefix: ${ip}/${prefix}`);
    if (contains(benchmark.dst, benchmark.prefix, ip) && n + size <= toInt(benchmark.dst) + blockSize(benchmark.prefix)) return ip;
    const unit = units.find(u => u.start <= n && n + size <= u.end);
    if (!unit) throw new RangeError(`Address outside one unit: ${ip}${prefix === undefined ? '' : `/${prefix}`}`);
    return fromInt(toInt(unit.mapped) + n - unit.start);
  };
}

// A token ends where no digit or dotted digit follows, so a sentence-final
// «…/24.» is read with its prefix, deliberately (not as the bare address).
const addressToken = /(?<![\d.])(?:\d{1,3}\.){2}\d{1,3}[–-]\d{1,3}\.x(?:\/\d{1,2})?|(?<![\d.])(?:\d{1,3}\.){3}(?:\d{1,3}|x)(?:\/\d{1,2})?(?!\d|\.\d)/g;
export function mapText(text, map) {
  const output = text.replace(addressToken, token => {
    const range = /^(\d+\.\d+\.)(\d+)([–-])(\d+)\.x(\/\d+)?$/.exec(token);
    if (range) {
      const [, head, lo, dash, hi, suffix = ''] = range;
      const low = toInt(`${head}${lo}.0`), high = toInt(`${head}${hi}.255`);
      if (low === null || high === null || high < low) throw new RangeError(`Invalid range: ${token}`);
      // Find the smallest covering prefix and require the entire range in one unit.
      let prefix = 32;
      while (network(fromInt(low), prefix) !== network(fromInt(high), prefix)) prefix--;
      map(network(fromInt(low), prefix), prefix);
      const a = map(fromInt(low)).split('.'), b = map(fromInt(high)).split('.');
      if (a.slice(0, 2).join('.') !== b.slice(0, 2).join('.') || Number(b[2]) - Number(a[2]) !== Number(hi) - Number(lo)) throw new RangeError(`Range changed shape: ${token}`);
      return `${a[0]}.${a[1]}.${a[2]}${dash}${b[2]}.x${suffix}`;
    }
    const [ip, p] = token.split('/');
    if (ip.endsWith('.x')) return `${map(ip.slice(0, -1) + '0', 24).split('.').slice(0, 3).join('.')}.x${p === undefined ? '' : `/${p}`}`;
    if (ip.startsWith('255.') && maskToPrefix(ip) !== null) return token;
    return `${map(ip, p === undefined ? undefined : Number(p))}${p === undefined ? '' : `/${p}`}`;
  });
  // No partially recognised dotted fragments may silently survive.
  const remainder = text.replace(addressToken, '');
  if (/\d{1,3}\.\d{1,3}\.[\dx]/.test(remainder)) throw new RangeError(`Unknown address fragment: ${remainder}`);
  return output;
}

const addressFields = new Set(['ip', 'gateway', 'via', 'dst', 'from', 'to', 'destination', 'primaryVia', 'backupVia', 'alternatives']);
const textFields = new Set(['text', 'topology', 'hint', 'justification', 'title', 'label', 'note', 'name']);
/** Strict structural walk: new address-bearing fields fail closed. */
export function mapAddresses(value, map, key = '', parent = null, prose = false) {
  if (typeof value === 'string') {
    if (prose || textFields.has(key)) return mapText(value, map);
    if (addressFields.has(key) && parseIp(value) !== null) return map(value, key === 'dst' ? parent?.prefix : undefined);
    if (/\d+\.\d+\.\d+\./.test(value)) throw new RangeError(`Unmapped address field ${key}: ${value}`);
    return value;
  }
  if (Array.isArray(value)) return value.map(v => mapAddresses(v, map, key, parent, prose));
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, mapAddresses(v, map, k, value, prose || textFields.has(key))]));
}

/** Pure placement/retry mechanism. The section supplies its frozen route tables
 * and acceptance predicate; no bank or exercise can be imported by the engine.
 * Return the mapped record, with serialisable generation metadata, or infeasible.
 * attempt 0 uses seed; retries 1..20 use seed#k, preserving the requested seed. */
export function renumber(record, variantId, seed, { frozenAnswers = [], accept = () => true } = {}) {
  if (!Number.isInteger(seed) || seed < 0 || seed > 9999) throw new RangeError('Seed must be an integer from 0 to 9999');
  const variant = record.variants.find(v => v.id === variantId);
  if (!variant) throw new RangeError(`Unknown variant: ${variantId}`);
  // A record whose units can't be planned (a unit mixing LANs with links, or
  // with no segment) has no placement for any seed: infeasible, not an error.
  let units;
  try { units = planBlocks(record, variant, frozenAnswers); } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    return { infeasible: true, code: 'infeasible', seed, reason: error.message };
  }
  let reason;
  for (let attempt = 0; attempt <= 20; attempt++) {
    try {
      const placement = place(record, units, seed, attempt), map = addressMapper(placement.units);
      const mapped = mapAddresses(record, map);
      mapped.generation = { generatorVersion, seed, attempt, ...placement };
      const answers = frozenAnswers.map(answer => mapAddresses(answer, map));
      if (validateNetwork(mapped.network).length || !accept(mapped, answers)) throw new RangeError('Acceptance failed');
      return mapped;
    } catch (error) {
      if (!(error instanceof RangeError)) throw error;
      reason = error.message;
    }
  }
  return { infeasible: true, code: 'infeasible', seed, reason };
}

/** Independent acceptance assertions over complete reserved intervals, including
 * holes. A translation alone must never move a unit outside its assigned pool. */
export function placementIssues(original, mapped) {
  const issues = [], g = mapped.generation;
  if (!g) return ['missing-generation'];
  const target = u => ({ start: toInt(u.mapped), end: toInt(u.mapped) + u.end - u.start });
  for (const u of g.units) {
    const p = u.pool === 'fixed' ? benchmark : u.pool === 'carrier' ? carrier : u.pool === 'lan' ? g.lanPool : g.linkPool;
    const b = target(u), pool = interval(p.dst, p.prefix);
    if (!encloses(pool, b) || b.start % (u.end - u.start)) issues.push('pool-or-alignment');
    if (u.pool === 'fixed' && u.mapped !== u.dst) issues.push('benchmark-moved');
    for (const v of g.units.filter(v => v.start > u.start)) {
      if (intersects(b, target(v))) issues.push('unit-overlap');
      if (accidentalAdjacency(b, target(v))) issues.push('unit-adjacency');
    }
  }
  const map = addressMapper(g.units), before = numberedSegments(original), after = numberedSegments(mapped);
  for (const a of before) {
    const b = after.find(b => b.id === a.id);
    if (!b || b.dst !== map(a.dst, a.prefix) || b.prefix !== a.prefix) issues.push('segment-translation');
    const unit = g.units.find(u => u.segments.includes(a.id));
    if (!unit || !encloses(target(unit), b)) issues.push('aggregate-membership');
  }
  for (const d of original.network.devices) for (const f of d.interfaces.filter(f => f.address)) {
    const mappedAddress = mapped.network.devices.find(v => v.id === d.id)?.interfaces.find(v => v.id === f.id)?.address;
    if (mappedAddress?.ip !== map(f.address.ip) || mappedAddress?.prefix !== f.address.prefix) issues.push('host-offset');
  }
  return issues;
}
