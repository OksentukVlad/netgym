// Router facts from diagram topology, and row names from explicit metadata.
// (Step 6 cut the «тупіковий: досить default» badge: the row header says it,
// and in free mode it would give the form away.)
import { ui } from '../uk.js';

/** Round 1: a router is a stub when exactly one router is its neighbour. */
export function isStub(topo, router) {
  const neighbours = new Set();
  for (const link of topo.links) {
    if (link.from === router) neighbours.add(link.to);
    if (link.to === router) neighbours.add(link.from);
  }
  return neighbours.size === 1;
}

/** Round 1 Cisco: a WAN interface addressed by DHCP. */
export function hasDhcpWan(topo, router) {
  return (topo.routers[router]?.interfaces ?? []).some(i => /^DHCP$/i.test(String(i.ip).trim()));
}

/** Header facts contain names and roles only, never reference values. A
 * discard row (task 17's R-CORE) has its own title, from its `discard` flag
 * (OPT-1 UI U8), not the summary row's names. */
export function rowFacts(task, router, index) {
  const row = task.variant.scaffold[router][index];
  const names = row.dest.segments.map(id => task.network.segments.find(s => s.id === id).name);
  const isDefault = row.dest.kind === 'default';
  const discard = row.discard === true;
  return {
    isDefault,
    discard,
    // Task 14's summary row is a suggestion (spec §2.3): the names, then «Порада: …».
    label: discard ? ui.shared.discardTitle : isDefault ? ui.shared.defaultRoute : names.join(', ') + (row.dest.kind === 'summary' && !row.suggestion ? ui.shared.summary : ''),
    role: row.role,
    suggestion: Boolean(row.suggestion),
  };
}

/** A task teaches discard routes when its scaffold has a `discard` row: task
 * 17 and its «Інші адреси» instances today, and any later task from the
 * bank alone (polish-2 P2). Only the scaffold is read (screens never read
 * reference routes); the bank validator keeps every reference discard on
 * a scaffold discard row (`scaffold-discard-mismatch`). MikroTik rows offer
 * the «blackhole» box only on such tasks (RouteRows). */
export function teachesDiscard(task) {
  return Object.values(task.variant.scaffold ?? {}).some(rows => rows.some(row => row.discard === true));
}
