// A terminal output (logic/outputs.js: at most ten lines of forty characters):
// its command as a caption, then its lines in monospace, pre-wrap. Read-only
// lines are one <pre>; tappable lines (C2's step 1) are toggle buttons, each
// a 44 px target, selected with aria-pressed. Nothing here says which lines
// matter: the logic grades the selection.

/**
 * @param {{ output: { command: string, lines: Array<{ id: string, text: string }> },
 *   idOf?: (line: object) => string, selected?: string[], onToggle?: ((id: string) => void) | null,
 *   locked?: boolean, caption?: string, className?: string }} props
 */
export default function Terminal({ output, idOf = line => line.id, selected = [], onToggle = null, locked = false, caption = null, className = '' }) {
  return (
    <figure className={`ng-ck-terminal ${className}`.trim()}>
      <figcaption className="ng-ck-command">{caption && <span className="ng-ck-caption">{caption} </span>}<code>{output.command}</code></figcaption>
      {onToggle
        ? (
          <ul className="ng-ck-lines">
            {output.lines.map(line => {
              const id = idOf(line), on = selected.includes(id);
              return (
                <li key={id}>
                  <button type="button" className={`ng-ck-line${on ? ' is-on' : ''}`} aria-pressed={on} aria-disabled={locked || undefined}
                    data-line={id} onClick={() => { if (!locked) onToggle(id); }}>
                    <span className="ng-ck-line-text">{line.text || ' '}</span>
                  </button>
                </li>
              );
            })}
          </ul>
        )
        : <pre className="ng-ck-pre">{output.lines.map(l => l.text).join('\n')}</pre>}
    </figure>
  );
}
