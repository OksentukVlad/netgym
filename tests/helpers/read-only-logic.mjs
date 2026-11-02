// Scoped fixture reuse for presentation sweeps over immutable bank tasks.
// Every distinct task/argument tuple invokes the real function. Return fresh
// copies so a caller cannot poison the next case by editing a result.
export function withReadOnlyLogic(logic, run) {
  const originals = new Map();
  for (const name of ['check', 'hints']) {
    const original = logic[name], tasks = new WeakMap();
    originals.set(name, original);
    logic[name] = (task, ...args) => {
      if (!tasks.has(task)) tasks.set(task, new Map());
      const results = tasks.get(task), key = JSON.stringify(args);
      if (!results.has(key)) results.set(key, structuredClone(original(task, ...args)));
      return structuredClone(results.get(key));
    };
  }
  try { return run(); }
  finally { for (const [name, original] of originals) logic[name] = original; }
}
