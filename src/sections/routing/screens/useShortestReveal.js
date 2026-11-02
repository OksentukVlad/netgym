// «Показати найкоротший варіант» (spec OPT-1 UI §4 with U6, U7): the frozen
// optimiser's known safe table for this exact instance, on request. This is
// the one screen-side caller of the explicit reveal API; the leak scan gives
// its permission to this file alone.
//   - Available only once the exact instance (task, variant and addresses of
//     the fixed bank) is earned: not on a passing check alone, nor on the
//     list's ✓ (which may come from other addresses). A generated instance
//     («Інші адреси», step 9) shows the frozen table mapped to its own
//     addresses (logic/review.js shortest, keyed by the exact identity).
//   - In free mode only: guided mode follows its scaffold, and a table
//     shorter than the scaffold would contradict it (as U3 avoids for tips).
//   - Its own state, not ex.reveal() (which marks assistance): nothing is
//     marked, and earned and the ★ don't change. It closes on any instance
//     change and when the earned mark goes («↺»).
//   - The table is read only while it is open, so its commands exist in the
//     page only then.
import { useMemo, useState } from 'react';
import { shortest } from '../logic/review.js';
import { routeCounts } from '../logic/table-tools.js';

/**
 * @param {object} ex the routing instance (useExercise)
 * @param {'guided'|'free'} mode the screen's mode
 * @returns {{ available: boolean, open: boolean, table: null|{ answer: object, total: number }, toggle: Function }}
 *   total: the logic's count (student rows, backups and discards; no supplied routes)
 */
export function useShortestReveal(ex, mode, bank) {
  const [openKey, setOpenKey] = useState(null);
  const available = mode === 'free' && Boolean(ex.session?.earned?.solved);
  if (openKey !== null && (openKey !== ex.key || !available)) setOpenKey(null);
  const open = available && openKey === ex.key;
  const table = useMemo(() => {
    if (!open) return null;
    try {
      const answer = shortest(ex.task, bank);
      return { answer, total: routeCounts(ex.task, answer).total };
    } catch {
      return null;
    }
  }, [open, ex.task, bank]);
  return { available, open: Boolean(table), table, toggle: () => setOpenKey(open ? null : ex.key) };
}
