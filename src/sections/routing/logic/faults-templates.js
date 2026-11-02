import { makeRng } from '../../../engine/rng.js';
import { addressMapper, mapAddresses, privatePools } from '../../../engine/renumber.js';
import { contains, fromInt, toInt } from '../../../engine/ip.js';
import { create } from './static.js';

export const generatorVersion = 3;
export const tableVersion = 1;

// Store the exact inputs, rather than a collision-prone runtime content hash.
// Comparison on every call also catches mutations of a previously used bank.
export function frozenInputs(record, bank) {
  return { record, bankId: bank.bankId, bankRevision: bank.bankRevision,
    sources: record.variants.map(({ taskId }) => bank.tasks.find(t => t.id === taskId)),
    optimiser: record.variants.map(({ taskId, variantId }) => bank.frozen?.results[`${taskId}/${variantId}`]) };
}

/** A prefix-tree automorphism inside each private pool. Low bits are reserved
 * by the offline tool for every subnet and destination+size planting. Thus
 * host offsets, containment, common summaries, and fault-site arithmetic all
 * survive translation. Addresses outside private pools stay fixed. */
export function templateTask(source, variantId, seed, entry) {
  const rng = makeRng(`${seed}:routing-faults:addresses:${source.id}`);
  const salts = entry.masks.map(mask => (rng.int(0, 0xffffffff) & mask) >>> 0);
  const translate = (ip, prefix) => {
    if (prefix === 0) return ip;
    const pool = privatePools.findIndex(p => contains(p.dst, p.prefix, ip));
    if (pool < 0) return ip;
    const mask = prefix === undefined ? 0xffffffff : (0xffffffff << (32 - prefix)) >>> 0;
    return fromInt((toInt(ip) ^ (salts[pool] & mask)) >>> 0);
  };
  // The stored placement was accepted by the original routing generator.
  const original = mapAddresses(source, addressMapper(entry.units));
  return { internal: create(mapAddresses(original, translate), { variantId }), translate };
}

