// Runs post-success reviews a step at a time (spec OPT-1 UI U1). No React:
// the screen creates one queue for its lifetime, and disposes of it when it
// unmounts (leaving the section). Tested in Node with an injected scheduler.
//
//   - A job is one passing check: { key, generation, edits, steps }, where
//     `steps` is reviewSteps(task, answer, { assessment }) for the checked
//     answer, and (key, generation, edits) identify that check's answer.
//   - One step is one `steps.next()`, in its own idle callback after a frame
//     (so a lap's end frame paints first); a step is atomic.
//   - While anything plays on the screen (a lap, a replay, a picked path),
//     steps wait: `isBusy()` is asked before scheduling and before each step,
//     and the screen calls `kick()` once nothing plays.
//   - Before each step the job's instance is read again: a newer check or
//     «↺» (generation), an edit (edits), or no passing result any more drops
//     the job, with no further generator work. Navigation and syntax or mode
//     switches don't: the review is a function of the checked answer, and
//     finishes in the background for its own instance.
//   - Only the generator's final return is written ({ tips, star }); the
//     instance's reducer stores it only if the check is still current.
//   - A new check of the same instance replaces its job.

/** One step later: after the next frame, in an idle callback (with a timeout). */
export function scheduleIdle(fn) {
  const w = typeof window !== 'undefined' ? window : null;
  let frame = null, idle = null, timer = null;
  const later = () => {
    frame = null;
    if (w?.requestIdleCallback) idle = w.requestIdleCallback(fn, { timeout: 500 });
    else timer = setTimeout(fn, 1);
  };
  if (w?.requestAnimationFrame) frame = w.requestAnimationFrame(later);
  else timer = setTimeout(later, 16);
  return () => {
    if (frame !== null) w.cancelAnimationFrame?.(frame);
    if (idle !== null) w.cancelIdleCallback?.(idle);
    if (timer !== null) clearTimeout(timer);
  };
}

/**
 * @param {{ instanceOf: (key: string) => object|undefined, write: (key: string, review: object) => void,
 *   isBusy: () => boolean, schedule?: (fn: Function) => Function }} options
 */
export function createReviewQueue({ instanceOf, write, isBusy, schedule = scheduleIdle }) {
  const jobs = new Map();
  let cancel = null;
  let disposed = false;

  function run() {
    cancel = null;
    if (disposed || isBusy()) return;
    const [key, job] = jobs.entries().next().value ?? [];
    if (!job) return;
    const instance = instanceOf(key);
    if (instance?.result?.ok !== true || (instance.generation ?? 0) !== job.generation || (instance.edits ?? 0) !== job.edits) {
      jobs.delete(key);
    } else {
      let step;
      try { step = job.steps.next(); } catch { step = { done: true, value: null }; }
      if (step.done) {
        jobs.delete(key);
        if (step.value) write(key, { generation: job.generation, edits: job.edits, tips: step.value.tips ?? [], star: step.value.star === true });
      }
    }
    kick();
  }

  /** Schedule the next step, unless one is scheduled, nothing waits, or something plays. */
  function kick() {
    if (disposed || cancel || !jobs.size || isBusy()) return;
    cancel = schedule(run);
  }

  return {
    /** Queue a passing check's review (replacing that instance's earlier one); kick() starts it. */
    add(job) {
      disposed = false;
      jobs.delete(job.key);
      jobs.set(job.key, job);
    },
    kick,
    /** Pending jobs' keys, oldest first. */
    get pending() { return [...jobs.keys()]; },
    /** The screen went: every job and the scheduled step go. (A later add,
     * as after a development-mode remount, starts again.) */
    dispose() {
      disposed = true;
      cancel?.();
      cancel = null;
      jobs.clear();
    },
  };
}
