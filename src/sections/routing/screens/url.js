// «Маршрутизація»'s URL codec (spec URL v2.1; the contract is in ui/url-params.js).
//
// «Налаштуй маршрути» (no `view`):
//   code   a share code (logic/codes.js: A3b-0042, as «Код задачі» reads it) of
//          this bank, a task and variant it has, with a seed the logic can place
//          → routing.taskId, routing.variants[task] and routing.seeds[task]
//            (no seed: the base addresses, seeds[task] = null)
//          (default: the bank's first task on its base addresses; the router
//          selection resets when the task changes)
// «Знайди несправність» (`view=fault`, where the target gives bank.faults):
//   view   fault                    → routing-faults.open (true; without it: false)
//   level  a level the logic offers (1–3) → routing-faults.level (default the first)
//   seed   0–9999, one the logic builds at that level → routing-faults.seed
//                                   (default: a new one)
//
// Precedence: `code` alone names the task: a link's separate `level` and
// `seed` are «Знайди несправність»'s and never change the task `code` names.
// Without `view=fault` they are ignored. Every other task's variant and seed,
// the task list's filter and the asides are kept as remembered.
import routing from '../logic/static.js';
import faults from '../logic/faults-exercise.js';
import { formatCode, letters, parseCode } from '../logic/codes.js';
import { builds, int, pairs } from '../../../ui/url-params.js';
import { instanceOf } from './instances.js';
import { round1Variant } from './RoutingScreen.jsx';
import { hasSlot, levelsOf, pickSeed } from './FaultsView.jsx';

export const MAX_SEED = 9999;
const FAULTS = 'routing-faults';

/** The task a share code names in this bank: { record, variantId, seed }, or null. */
export function codeTask(text, bank) {
  const d = parseCode(text);
  if (d.code || d.exerciseId !== routing.id || d.bankId !== bank.bankId || d.bankRevision !== bank.bankRevision) return null;
  const record = bank.tasks.find(r => r.id === d.taskId);
  if (!record?.variants.some(v => v.id === d.variantId)) return null;
  if (d.seed !== null && instanceOf(record, { variantId: d.variantId, seed: d.seed, bank }).infeasible) return null;
  return { record, variantId: d.variantId, seed: d.seed };
}

/** A task's share code in this bank, or null where the bank has no letter. */
export function codeFor(bank, taskId, variantId, seed) {
  const entry = Object.values(letters).find(e => e.exerciseId === routing.id && e.bankId === bank.bankId && e.bankRevision === bank.bankRevision);
  if (!entry) return null;
  try {
    return formatCode({ ...entry, taskId, variantId, generatorVersion: seed === null ? null : entry.generatorVersion, seed });
  } catch { return null; }
}

export const url = Object.freeze({
  keys: ['code', 'view', 'level', 'seed'],
  syntax: true,
  scopes: ['routing', FAULTS],
  decode(p, { bank, places, random = Math.random }) {
    const out = {};
    const fault = Boolean(bank.faults) && p.view === 'fault';
    const named = typeof p.code === 'string' ? codeTask(p.code, bank) : null;
    if (named || !fault) {
      const first = bank.tasks[0];
      const base = places.routing ?? { taskId: first.id, router: null, filterLevel: 0, variants: {}, seeds: {} };
      const record = named?.record ?? first;
      out.routing = {
        ...base, taskId: record.id, router: base.taskId === record.id ? base.router ?? null : null,
        variants: named ? { ...base.variants, [record.id]: named.variantId } : base.variants,
        seeds: { ...base.seeds, [record.id]: named ? named.seed : null },
      };
    }
    if (bank.faults) {
      const remembered = places[FAULTS];
      if (fault) {
        const levels = levelsOf(bank.faults, bank);
        const asked = int(p.level, 1, 9);
        const level = levels.includes(asked) ? asked : levels[0];
        const seed = int(p.seed, 0, MAX_SEED);
        const ok = seed !== null && builds(() => faults.create(bank.faults, { bank, level, seed }));
        out[FAULTS] = { ...remembered, open: true, level, seed: ok ? seed : pickSeed(bank.faults, bank, level, null, random) };
      } else if (remembered) out[FAULTS] = { ...remembered, open: false };
    }
    return out;
  },
  encode({ bank, syntax, places }) {
    const remembered = places[FAULTS];
    if (bank.faults && remembered?.open === true) {
      const slot = hasSlot(remembered);
      return pairs([['view', 'fault'], ['level', slot ? remembered.level : null], ['seed', slot ? remembered.seed : null]]);
    }
    const place = places.routing;
    if (!place) return [];
    const record = bank.tasks.find(r => r.id === place.taskId) ?? bank.tasks[0];
    const variantId = place.variants?.[record.id] ?? round1Variant(record, syntax);
    // As the screen shows it: a seed the logic can't place shows the base addresses.
    const wanted = place.seeds?.[record.id] ?? null;
    const seed = wanted !== null && instanceOf(record, { variantId, seed: wanted, bank }).infeasible ? null : wanted;
    return pairs([['code', codeFor(bank, record.id, variantId, seed)]]);
  },
});
