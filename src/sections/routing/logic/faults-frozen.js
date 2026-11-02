import { solution } from './static.js';
import { clone, sites, plant, evidenceKey } from './faults.js';
import { frozenInputs, templateTask, generatorVersion, tableVersion } from './faults-templates.js';
export { frozenInputs, templateTask, generatorVersion, tableVersion } from './faults-templates.js';

export function frozenAnalysis(record, bank, source, variantId, seed) {
  const frozen = bank.faultsFrozen;
  if (!frozen || frozen.tableVersion !== tableVersion || frozen.generatorVersion !== generatorVersion
    || JSON.stringify(frozenInputs(record, bank)) !== frozen.inputs)
    throw new RangeError('stale-faults-table: run node tools/freeze-faults.mjs');
  const entry = frozen.results[`${source.id}/${variantId}`];
  if (!entry) throw new RangeError('stale-faults-table: missing variant');
  const { internal, translate } = templateTask(source, variantId, seed, entry);
  const baseline = solution(internal), currentSites = sites(internal, baseline);
  if (JSON.stringify(currentSites.map(s => s.key)) !== JSON.stringify(entry.candidates.map(c => c.key)))
    throw new RangeError('stale-faults-table: changed sites');
  // The complete walks translate with their next-hop addresses. No pings,
  // competing-repair searches or baseline acceptance run on the UI thread.
  const candidates = currentSites.map((site, index) => {
    const { key, observation: templateObservation, ...facts } = entry.candidates[index];
    const faulty = plant(baseline, site), candidate = { site, faulty, ...clone(facts) };
    let observation, signature;
    // Only tooling reads these diagnostics. A normal create/options/restore
    // needs the gate facts and selected routes, never every site's full walk.
    // Getters stay enumerable, detached and memoized for inspect/structuredClone.
    Object.defineProperties(candidate, {
      observation: { enumerable: true, get() {
        if (!observation) {
          observation = clone(templateObservation);
          for (const probe of observation) for (const leg of [probe.request, probe.reply])
            for (const hop of leg?.hops ?? []) if (hop.nextHop) hop.nextHop = translate(hop.nextHop);
        }
        return observation;
      } },
      signature: { enumerable: true, get() {
        return signature ??= evidenceKey(faulty, candidate.observation);
      } },
    });
    return candidate;
  });
  return { internal, baseline, candidates };
}
