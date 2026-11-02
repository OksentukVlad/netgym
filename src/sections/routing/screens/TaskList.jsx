// The task list (round 1 Cisco sidebar): level filter and one button per
// task, titled as the variant it opens on, in the active syntax. A solved
// task shows a ✓ (step 6: a variant was earned, its network check passed
// before any reveal; a later failure keeps it). A task's level is its colour, with the name for
// screen readers; the filter buttons and the task bar say it in words.
// Round 5 5b-2 (spec C): task 15 keeps its «Експерт» level and says, under
// its title, «спершу задачі 1–3» (advice, not a lock).
//
// A column from 1440 px of content; below that a drawer («☰ Задачі»): it
// takes focus when opened, keeps Tab inside, and Escape closes it (the
// screen returns focus to its button).
import { useEffect, useRef } from 'react';
import { comprehension, ui } from '../uk.js';
import { levelClass } from './theme.js';
import DoneMark from '../../../ui/components/DoneMark.jsx';

const focusable = root => [...root.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(el => el.offsetParent !== null);

/**
 * @param {{ tasks: object[], titleOf: (record: object) => string, current: string, filterLevel: number, setFilterLevel: Function,
 *   onOpen: Function, solved: (record: object) => boolean, drawer: boolean, open: boolean, onClose: Function, codeField?: any }} props
 * `drawer`: shown as a drawer (below 1440 px); `open`: the drawer is open.
 */
export default function TaskList({ tasks, titleOf, current, filterLevel, setFilterLevel, onOpen, solved, drawer, open, onClose, codeField = null }) {
  const filtered = filterLevel === 0 ? tasks : tasks.filter(t => t.level === filterLevel);
  const root = useRef(null);
  const modal = drawer && open;

  // Opened: focus the current task (or the close button).
  useEffect(() => {
    if (!modal || !root.current) return;
    (root.current.querySelector('[aria-current="true"]') ?? root.current.querySelector('button'))?.focus();
  }, [modal]);

  function onKeyDown(e) {
    if (!modal) return;
    if (e.key === 'Escape') { e.preventDefault(); onClose(); return; }
    if (e.key !== 'Tab') return;
    const items = focusable(root.current);
    if (!items.length) return;
    const first = items[0], last = items[items.length - 1];
    if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
    else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
  }

  return (
    <aside id="ng-rt-tasks" ref={root} aria-label={ui.shared.tasks} className={`ng-rt-tasks${open ? ' is-open' : ''}`} onKeyDown={onKeyDown}
      {...(modal ? { role: 'dialog', 'aria-modal': 'true' } : {})}>
      <button type="button" className="ng-rt-btn ng-rt-tasks-close" onClick={onClose}>{ui.shared.close}</button>
      {codeField}
      <p className="ng-rt-caption">{ui.shared.levelsCaption}</p>
      <div className="ng-rt-levels">
        {[0, 1, 2, 3, 4, 5].map(level => (
          <button key={level} type="button" aria-pressed={filterLevel === level} onClick={() => setFilterLevel(level)} className={`ng-rt-level-filter ${levelClass(level)}`}>
            {level === 0 ? ui.shared.allLevels : ui.shared.level(level)}
          </button>
        ))}
      </div>
      <ul className="ng-rt-tasklist">
        {filtered.map(t => {
          const active = t.id === current;
          return (
            <li key={t.id}>
              <button type="button" aria-current={active ? 'true' : undefined} onClick={() => onOpen(t.id)} className={`ng-rt-task ${levelClass(t.level)}`}>
                <span className="ng-sr-only">{ui.shared.levelLabels[t.level]}: </span>
                <span className="ng-rt-task-title">#{t.displayNumber} {titleOf(t)}{t.displayNumber === 15 && <>{' '}<span className="ng-rt-task-advice">{comprehension.task15First}</span></>}</span>
                <DoneMark done={solved(t)} />
              </button>
            </li>
          );
        })}
      </ul>
    </aside>
  );
}
