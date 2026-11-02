// Direct node --test retains historical full coverage. The runner selects fast.
export const full = process.env.NETGYM_TEST_MODE !== 'fast';

// A size knob only expands the deterministic sample: witnesses cannot be removed.
// Full mode ignores it, including malformed or smaller inherited values.
// A sweep with a complete single-seed witness matrix can opt into defaultCount=1.
// The explicit size knob still only expands it and keeps its existing >=2 rule.
export function sweepSeeds(all, witnesses = [0, 1], defaultCount = 2) {
  if (full) return [...all];
  const raw = process.env.NETGYM_TEST_SEEDS;
  const count = raw === undefined ? defaultCount : Number(raw);
  if (!Number.isInteger(count) || count < (raw === undefined ? 1 : 2)) throw new Error('NETGYM_TEST_SEEDS must be an integer >= 2');
  return [...new Set([...all.slice(0, count), ...witnesses])];
}
