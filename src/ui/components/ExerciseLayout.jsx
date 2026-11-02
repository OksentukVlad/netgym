// The exercise screen's arrangement (ARCHITECTURE §6): a header with the
// screen's heading and its controls, the stage (what the task gives), the
// question, the answer, the help (HelpPanel: the check row and its message,
// directly under the answer) and the tools. Regions are slots; the screen
// fills them with generic components. A tool with no help (the calculator)
// has none.
//
// Round 4 (spec A1): the sticky bottom bar is gone (it covered hint 3 in the
// mask screen); the check and its message live in the `help` slot.
//
// Round 5 (rule R1): the `action` slot is one sentence naming the next
// action, rendered as an ActionLine right before the `answer` region (the
// first control). Give it an `actionId` when a choice group in the answer
// names itself by it (aria-labelledby).
import ActionLine from './ActionLine.jsx';
import '../tokens.css';
import './ExerciseLayout.css';

/**
 * @param {{
 *   caption?: string, heading: string, controls?: any,
 *   stage?: any, question?: any, action?: any, actionId?: string, answer?: any, help?: any, tools?: any,
 *   theme?: 'dark'|'light',
 *   wide?: 'stage',      // two columns: the stage gets 3/5 of the width (bit rows, results)
 *   first?: 'work',      // one column: the work area first (a tool's inputs); in
 *                        // two columns the stage stays on the left. The work
 *                        // area also comes first in the DOM, so the focus order
 *                        // follows the one-column reading order.
 * }} props
 */
export default function ExerciseLayout({ caption, heading, controls, stage, question, action, actionId, answer, help, tools, theme, wide, first }) {
  const stageRegion = stage && <section className="ng-exercise-stage" data-region="stage">{stage}</section>;
  return (
    <div className="ng-exercise" data-layout="exercise" data-theme={theme} data-wide={wide} data-first={first}>
      <header className="ng-exercise-head">
        <div className="ng-exercise-titles">
          {caption && <p className="ng-caption">{caption}</p>}
          <h1 className="ng-exercise-heading">{heading}</h1>
        </div>
        {controls && <div className="ng-exercise-controls">{controls}</div>}
      </header>
      <div className="ng-exercise-body">
        {first !== 'work' && stageRegion}
        <section className="ng-exercise-work" data-region="work">
          {question && <div className="ng-exercise-question" data-region="question">{question}</div>}
          {action ? (
            // The action line and the answer it introduces, close together (their own gap).
            <div className="ng-exercise-act">
              <ActionLine id={actionId}>{action}</ActionLine>
              {answer && <div className="ng-exercise-answer" data-region="answer">{answer}</div>}
            </div>
          ) : answer && <div className="ng-exercise-answer" data-region="answer">{answer}</div>}
          {help && <div className="ng-exercise-help" data-region="help">{help}</div>}
          {tools && <div className="ng-exercise-tools" data-region="tools">{tools}</div>}
        </section>
        {first === 'work' && stageRegion}
      </div>
    </div>
  );
}
