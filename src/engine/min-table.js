import { blockSize, fromInt, isNetworkAddress, toInt } from './ip.js';
import { actionKey } from './forwarding-map.js';

const routable = action => ['hop', 'discard'].includes(action?.kind);

/** Exact minimum within the constrained domain: fixed connected rows prohibit
 * emitted descendants; pinned rows must be emitted but allow exceptions below.
 * Throws on unsupported/malformed inputs;
 * returns {infeasible:true} for a valid but unsatisfiable requirement. */
export function minimiseTable({ intervals, fixed = [], pinned = [], rootAction = { kind: 'none' }, forbidDefault = false }) {
  let cursor = 0;
  for (const piece of intervals) {
    if (piece.start !== cursor || !Number.isInteger(piece.end) || piece.end <= cursor || piece.end > 2 ** 32
      || !(piece.action === 'dontCare' || ['hop', 'discard', 'none', 'connected', 'ecmp'].includes(piece.action?.kind))) {
      throw new TypeError('Intervals must partition IPv4 space with supported actions');
    }
    cursor = piece.end;
  }
  if (cursor !== 2 ** 32) throw new TypeError('Incomplete IPv4 partition');
  const immutables = fixed.map(row => {
    if (!isNetworkAddress(row.dst, row.prefix) || row.action?.kind !== 'connected') throw new TypeError('Fixed rows must be connected prefixes');
    const start = toInt(row.dst);
    return { ...row, start, end: start + blockSize(row.prefix) };
  }).sort((a, b) => a.start - b.start);
  if (immutables.some((row, i) => i && row.start < immutables[i - 1].end)) throw new TypeError('Overlapping connected rows');
  const pins = new Map();
  for (const row of pinned) {
    if (!isNetworkAddress(row.dst, row.prefix) || !routable(row.action)) throw new TypeError('Pinned rows must be routable prefixes');
    const start = toInt(row.dst), end = start + blockSize(row.prefix), key = `${start}/${row.prefix}`;
    if (immutables.some(r => r.start <= start && end <= r.end)) throw new TypeError('Pinned row inside connected prefix');
    if (pins.has(key) && actionKey(pins.get(key).action) !== actionKey(row.action)) throw new TypeError('Conflicting pinned actions');
    pins.set(key, { ...row, start, end });
  }
  // Validate even when the inherited action or dontCare would cost zero.
  for (const row of immutables) for (const piece of intervals) {
    if (piece.start < row.end && piece.end > row.start && piece.action !== 'dontCare'
      && actionKey(piece.action) !== actionKey(row.action)) return { infeasible: true };
  }
  const alphabet = [...new Map([
    ...intervals.map(p => p.action), ...pinned.map(r => r.action), rootAction, { kind: 'discard' },
  ].filter(routable).map(a => [actionKey(a), a])).entries()].sort(([a], [b]) => a < b ? -1 : a > b ? 1 : 0).map(([, a]) => a);
  const states = [...new Map([rootAction, ...alphabet].map(a => [actionKey(a), a])).values()];
  const stateIndex = a => states.findIndex(s => actionKey(s) === actionKey(a));
  const emitStates = alphabet.map(stateIndex);
  function build(start, prefix, pieces, rows, pinned) {
    const end = start + blockSize(prefix);
    const node = { start, prefix, costs: [], choices: [] };
    if (rows.some(r => r.start === start && r.prefix === prefix)) {
      node.costs = states.map(() => 0); return node;
    }
    const concrete = [...new Map(pieces.filter(p => p.action !== 'dontCare').map(p => [actionKey(p.action), p.action])).values()];
    // Keep mixed don't-care boundaries so reconstruction can prefer descending
    // without a route here when that ties an ancestor emission.
    const pin = pinned.find(r => r.start === start && r.prefix === prefix);
    const uniform = new Set(pieces.map(p => actionKey(p.action))).size === 1 && rows.length === 0 && pinned.length === 0;
    if (uniform && !(prefix === 0 && forbidDefault && concrete.length && routable(concrete[0]))) {
      const required = concrete[0];
      states.forEach((inherited, i) => {
        const same = !required || actionKey(required) === actionKey(inherited);
        node.costs[i] = same ? 0 : routable(required) ? 1 : Infinity;
        if (!same && routable(required)) node.choices[i] = stateIndex(required);
      });
      return node;
    }
    if (prefix === 32) {
      if (!pin) throw new TypeError('Unsplittable nonuniform leaf');
      const fits = concrete.every(a => actionKey(a) === actionKey(pin.action));
      node.costs = states.map(() => fits ? 1 : Infinity);
      node.choices = states.map(() => stateIndex(pin.action));
      return node;
    }
    const middle = (start + end) / 2;
    const descendants = pinned.filter(r => r !== pin);
    node.left = build(start, prefix + 1, pieces.filter(p => p.start < middle), rows.filter(r => r.start < middle), descendants.filter(r => r.start < middle));
    node.right = build(middle, prefix + 1, pieces.filter(p => p.end > middle), rows.filter(r => r.end > middle), descendants.filter(r => r.end > middle));
    states.forEach((inherited, i) => {
      if (pin) {
        const d = stateIndex(pin.action);
        node.costs[i] = prefix === 0 && forbidDefault ? Infinity : 1 + node.left.costs[d] + node.right.costs[d];
        node.choices[i] = d;
        return;
      }
      let best = node.left.costs[i] + node.right.costs[i];
      // No emission wins ties. Inherited action is first, then serialisation.
      if (!(prefix === 0 && forbidDefault)) for (const a of [...emitStates.filter(a => a === i), ...emitStates.filter(a => a !== i)]) {
        const cost = 1 + node.left.costs[a] + node.right.costs[a];
        if (cost < best) { best = cost; node.choices[i] = a; }
      }
      node.costs[i] = best;
    });
    return node;
  }
  const root = build(0, 0, intervals, immutables, [...pins.values()]), inherited = stateIndex(rootAction);
  if (!Number.isFinite(root.costs[inherited])) return { infeasible: true };
  const routes = [];
  function emit(node, state) {
    const choice = node.choices[state];
    if (choice !== undefined) {
      routes.push({ dst: fromInt(node.start), prefix: node.prefix, action: { ...states[choice] } });
      state = choice;
    }
    if (node.left) { emit(node.left, state); emit(node.right, state); }
  }
  emit(root, inherited);
  return { routes, count: routes.length };
}
