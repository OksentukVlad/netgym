// Optional second Node test reporter. Timings are test bodies, not import time;
// nested bodies are excluded from file sums to avoid double counting.
import { writeFileSync } from 'node:fs';
export default async function* (source) {
  const cases = [];
  for await (const { type, data } of source) {
    if (type === 'test:pass' || type === 'test:fail') {
      const row = {
        file: data.file, name: data.name, ms: data.details.duration_ms,
        nesting: data.nesting, skip: data.skip ?? false, ok: type === 'test:pass',
      };
      cases.push(row);
    }
  }
  writeFileSync(process.env.NETGYM_TEST_PROFILE, JSON.stringify(cases, null, 2) + '\n');
}
