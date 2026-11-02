import { catalogue } from '../../src/sections/routing/logic/faults.js';
import { faultCauseText } from '../../src/sections/routing/uk.js';

/** Logic and primitive-render surfaces before assistance. Addresses in the
 * faulty rows and network are intentionally visible; do not mistake them for
 * hidden answers. Structural allowlists prevent original route/repair leaks. */
export function rf1Leaks(task, surfaces = []) {
  const leaks = [], allowed = ['identity', 'instanceKey', 'title', 'instructions', 'requirements', 'level', 'network', 'probes', 'scenarios', 'initialRoutes'];
  if (Object.keys(task).some(k => !allowed.includes(k))) leaks.push('public-task-field');
  const forbidden = new Set(['record', 'variant', 'referenceRoutes', 'hint', 'hints', 'scaffold', 'site', 'faultCode', 'canonicalFix', 'originalRoute', 'baseline', 'repaired']);
  const walk = (value, path = '') => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if ((key === 'id' || key === 'routeId' || key === 'routeIds') && /(?:\.route\d+|reference|fault-site)/i.test(JSON.stringify(child))) leaks.push(`${path}/${key}:reference-id`);
      if (forbidden.has(key)) leaks.push(`${path}/${key}`);
      walk(child, `${path}/${key}`);
    }
  };
  walk([task, ...surfaces]);
  for (const rows of Object.values(task.initialRoutes)) for (const row of rows) {
    if (Object.keys(row).some(k => !['id', 'dst', 'prefix', 'via', 'distance'].includes(k))) leaks.push('route-field');
    if (!/^route-\d+-\d+$/.test(row.id)) leaks.push('reference-row-id');
  }
  const text = JSON.stringify([task, ...surfaces]);
  for (const c of catalogue) {
    // wrong-destination can also be a form reason, so only unassisted
    // well-formed surfaces participate in this gate.
    if (text.includes(c.code)) leaks.push(`cause-code:${c.code}`);
    if (text.includes(faultCauseText[c.code])) leaks.push(`cause-text:${c.code}`);
  }
  return [...new Set(leaks)];
}
