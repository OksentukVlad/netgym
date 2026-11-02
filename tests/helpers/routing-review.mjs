// Existing review assertions select their bank explicitly through this adapter.
import * as logic from '../../src/sections/routing/logic/review.js';
import * as bank from '../../src/banks/routing/tasks.js';
export const shortest = task => logic.shortest(task, bank);
export const reviewSteps = (task, answer, options) => logic.reviewSteps(task, answer, { bank, ...options });
export const review = (task, answer, options) => logic.review(task, answer, { bank, ...options });
