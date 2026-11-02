// Test-only provenance gate. Inspect DOM text, accessible names, descriptions
// and copy payloads as separate surfaces; a string alone cannot prove origin.
import { bits8, network, broadcast, prefixToMask, parseIp } from '../../src/engine/ip.js';
import { solution } from '../../src/sections/ip/logic/binary.js';

// Eight-bit groups, written together («01001101») or bit by bit with single
// spaces («0 1 0 0 1 1 0 1», as screen-reader text and hints spell them);
// a run of 16, 24 or 32 bits is split into its octets.
const binaryTokens = value => {
  const runs = String(value).match(/(?<!\d)(?<!\d[\u00a0 ])[01](?:[\u00a0 ]?[01])*(?!\d)(?![\u00a0 ]\d)/g) ?? [];
  return runs.map(run => run.replace(/[\u00a0 ]/g, '')).filter(bits => bits.length % 8 === 0).flatMap(bits => bits.match(/.{8}/g));
};
const dotted = value => String(value).match(/(?<![\d.])\d{1,3}(?:\.\d{1,3}){3}(?![\d.])/g) ?? [];
const bitsOf = address => address.split('.').map(n => bits8(Number(n)));

/** `provenance`: given | rule | learner | accepted | independent-example |
 * reference | unattributed. Learner/accepted must provide actual `octets`;
 * examples must provide the hint's `example` params. Reveal opens references.
 * Matching repeated octets is allowed when origin is proven; no substring ban.
 * `addresses` (learner/accepted only): dotted addresses the learner owns, the
 * decimal form of their own accepted rows (the walk's final line and ruler);
 * a caller must derive them from the learner's rows, never from `solution`.
 */
export function leaks(task, surface, provenance = 'unattributed', { step = 0, octets = [], example, revealed = false, sourceStep = step, addresses: own = [] } = {}) {
  if (revealed) return [];
  const text = typeof surface === 'string' ? surface : JSON.stringify(surface);
  const tokens = binaryTokens(text);
  const addresses = dotted(text);
  const found = new Set();
  if (provenance === 'reference' && sourceStep >= step) found.add('reference-before-reveal');
  if (provenance === 'given' && task.level === 1) {
    // Level 1 deliberately discloses only the first three octets of this row.
    // The fourth, and all editable octets at other levels, keep the same gate.
    const given = new Set(solution(task).steps[sourceStep].octets.slice(0, 3));
    if (tokens.some(token => !given.has(token))) found.add('unproven-bits');
    if (addresses.some(address => address !== task.ip && address !== task.mask)) found.add('ungiven-address');
    return [...found];
  }
  if (provenance === 'learner' || provenance === 'accepted') {
    const owned = new Set(octets);
    if (tokens.some(token => !owned.has(token))) found.add('unproven-learner-bits');
    if (addresses.some(address => address !== task.ip && address !== task.mask && !own.includes(address))) found.add('ungiven-address');
    return [...found];
  }
  if (provenance === 'independent-example') {
    if (!example || parseIp(example.ip) !== example.ip || !Number.isInteger(example.prefix) || example.prefix < 25 || example.prefix > 30 || !/^198\.51\.100\.(\d{1,3})$/.test(example.ip) || example.prefix === task.prefix) {
      found.add('unproven-example');
      return [...found];
    }
    const expected = new Set(solution(task).steps[step].octets);
    const independent = {
      addressBits: bitsOf(example.ip)[3], maskBits: bitsOf(prefixToMask(example.prefix))[3],
      networkBits: bitsOf(network(example.ip, example.prefix))[3], broadcastBits: bitsOf(broadcast(example.ip, example.prefix))[3],
    };
    const shown = Object.entries(example).filter(([key]) => key.endsWith('Bits'));
    if (example.octet !== 4 || shown.some(([key, value]) => independent[key] !== value)) found.add('unproven-example');
    const allowed = new Set(shown.map(([, value]) => value));
    if (tokens.some(token => !allowed.has(token))) found.add('bits-outside-example');
    if ([...allowed].some(token => expected.has(token))) found.add('current-answer-in-example');
    if (addresses.some(address => address !== example.ip)) found.add('address-outside-example');
    return [...found];
  }
  if (tokens.length) found.add('unproven-bits');
  if (addresses.some(address => address !== task.ip && address !== task.mask)) found.add('ungiven-address');
  return [...found];
}
export default leaks;
