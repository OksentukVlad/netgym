import * as logic from '../../src/sections/routing/logic/static.js';
import * as bank from '../../src/banks/routing/tasks.js';
import * as generated from '../../src/sections/routing/logic/generated.js';
export * from '../../src/sections/routing/logic/static.js';
export const create = (record, params = {}) => logic.create(record, { bank, ...params });
export const frozenFor = task => generated.frozenFor(task, bank);
export const acceptanceIssues = (original, mapped, answers) => generated.acceptanceIssues(original, mapped, answers, bank);
export default { ...logic.default, create };
