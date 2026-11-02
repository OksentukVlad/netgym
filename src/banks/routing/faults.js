// Normal coverage and explicitly visible internet requirements only.
// Router counts determine size tiers; causes still require accepted witnesses.
export const record = Object.freeze({ id: 'routing.faults', version: 1, variants: [
  { taskId: 'routing.task-01', variantId: 'main', levels: [1] },
  { taskId: 'routing.task-02', variantId: 'main', levels: [1, 2] },
  { taskId: 'routing.task-04', variantId: 'main', levels: [2] },
  { taskId: 'routing.task-05', variantId: 'main', levels: [2] },
  { taskId: 'routing.task-09', variantId: 'main', levels: [3] },
  { taskId: 'routing.task-12', variantId: 'main', levels: [2] },
  { taskId: 'routing.task-14', variantId: 'main', levels: [2] },
] });
export default record;
