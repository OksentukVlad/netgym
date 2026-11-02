import { readFileSync, writeFileSync } from 'node:fs';
const [output, ...inputs] = process.argv.slice(2);
const cases = inputs.flatMap(file => JSON.parse(readFileSync(file, 'utf8')));
writeFileSync(output, JSON.stringify(cases, null, 2) + '\n');
console.error(`Profile: ${cases.length} results; ${cases.filter(r => !r.ok).length} failed; ${cases.filter(r => r.skip).length} skipped`);
