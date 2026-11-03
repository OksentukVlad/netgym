import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

export const mountedHelpers = { routing: 453, firewall: 343, ip: 179, vlan: 288, vlan3: 158, setup: 509, shared: 135, dhcp: 138, checks: 69 };

export function mountedResults(text, minimum) {
  // Parse the whole output, so extra, malformed or truncated output cannot pass.
  const { results } = JSON.parse(text);
  assert.ok(Array.isArray(results) && results.length >= minimum, `expected at least ${minimum} mounted results`);
  for (const row of results) {
    assert.ok(row && typeof row.name === 'string' && row.name.length > 0, 'missing mounted result name');
    assert.equal(row.ok, true, `${row.name}: ${JSON.stringify(row.detail ?? '')}`);
  }
  return results;
}

if (process.argv[1] === new URL(import.meta.url).pathname) {
  const [helper, file] = process.argv.slice(2);
  assert.ok(Object.hasOwn(mountedHelpers, helper), `unknown mounted helper ${helper}`);
  const results = mountedResults(readFileSync(file, 'utf8'), mountedHelpers[helper]);
  console.error(`mounted-${helper}: ${results.length} checks passed`);
}
