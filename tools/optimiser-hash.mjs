import { createHash } from 'node:crypto';
import { bankId, bankRevision, tasks } from '../src/banks/routing/tasks.js';
import { optimiserVersion } from '../src/sections/routing/logic/optimise.js';

export function optimiserHash() {
  return createHash('sha256').update(JSON.stringify({ bankId, bankRevision, tasks, optimiserVersion })).digest('hex');
}
