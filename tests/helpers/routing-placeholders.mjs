import assert from 'node:assert/strict';
import { checkRow } from '../../src/sections/routing/logic/static.js';
import cisco from '../../src/sections/routing/syntax/cisco.js';
import routeros from '../../src/sections/routing/syntax/mikrotik.js';

/** Exercise the field verdict in an otherwise valid row. When a future
 * placeholder adds an example address, test that address itself, not prose
 * which would trivially fail parsing. Task 15's distance example and the
 * explicit default-route constant are the only teaching exemptions.
 */
export function expectPlaceholdersFail(task, syntax, words) {
  const adapter = syntax === 'cisco' ? cisco : routeros;
  let checked = 0;
  for (const [router, routes] of Object.entries(task.variant.referenceRoutes)) for (const [index, route] of routes.entries()) {
    const valid = adapter.fromRoute(route, route.distance != null);
    assert.equal(checkRow(task, router, index, valid, syntax).ok, true, 'R4 baseline must be valid');
    for (const field of adapter.fields) {
      if (field.distance && (route.distance == null || task.record.displayNumber === 15)) continue;
      if (syntax === 'routeros' && field.name === 'gw' && route.discard) continue; // disabled
      const placeholder = words[field.name === 'gw' && route.discard ? 'gwDiscard' : field.name];
      assert.equal(typeof placeholder, 'string', `missing placeholder: ${syntax}/${field.name}`);
      const examples = placeholder.match(/\b(?:\d{1,3}\.){3}\d{1,3}(?:\/\d{1,2})?\b/g) ?? [placeholder];
      for (const example of examples) {
        if (example === '0.0.0.0/0') continue;
        const result = checkRow(task, router, index, { ...valid, [field.name]: example }, syntax);
        assert.equal(result[field.okKey], false, `${task.record.id}/${router}/${index}/${syntax}/${field.name}: placeholder ${example} passes`);
        checked++;
      }
    }
  }
  return checked;
}
