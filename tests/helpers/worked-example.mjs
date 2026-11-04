// The WorkedExample test helper (round 5, spec 5b-2 A): a screen renders
// exactly one worked example, its toggle a button with aria-expanded and
// the controlled live region inside it; closed unless `open`; opened, the
// card carries the tag and nothing in it is focusable or an input.
//
//   expectWorkedExample(container, { open = false, rows, tag })
// `container`: a DOM element (mini-dom or a browser) or server markup (a
// string). `rows`: the number of ✓ rows expected when open (optional).
// Throws an AssertionError naming the first problem.
import assert from 'node:assert/strict';

const CONTROL = /<(?:input|select|textarea|button)\b|<a\b[^>]*\shref=|\stabindex=|\scontenteditable=(?!"false")/;
const CONTROLS = ['input', 'select', 'textarea', 'button', 'a[href]', '[tabindex]', '[contenteditable]'];
const TAG = 'приклад · інші числа';

/** The markup of the element opened at `index` (its tag name counted for depth). */
function elementAt(html, index) {
  const name = /^<([\w-]+)/.exec(html.slice(index))[1];
  const tags = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*?(/?)>`, 'g');
  tags.lastIndex = index;
  let depth = 0, t;
  while ((t = tags.exec(html))) {
    if (t[2] === '/') continue;
    depth += t[1] ? -1 : 1;
    if (depth === 0) return html.slice(index, tags.lastIndex);
  }
  return html.slice(index);
}

function ofMarkup(html) {
  const starts = [...html.matchAll(/<[\w-]+\b[^>]*\sdata-worked-example=""[^>]*>/g)].map(m => m.index);
  return starts.map(start => {
    const markup = elementAt(html, start);
    const toggle = /<button\b[^>]*class="ng-wex-toggle"[^>]*>/.exec(markup)?.[0] ?? null;
    const bodyAt = markup.search(/<div\b[^>]*class="ng-wex-body"/);
    const body = bodyAt < 0 ? '' : elementAt(markup, bodyAt);
    const text = s => s.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
    return {
      expanded: toggle && /aria-expanded="([^"]*)"/.exec(toggle)?.[1],
      controls: toggle && /aria-controls="([^"]*)"/.exec(toggle)?.[1],
      bodyId: /^<div\b[^>]*\sid="([^"]*)"/.exec(body)?.[1],
      live: /^<div\b[^>]*aria-live="polite"/.test(body),
      card: /class="ng-wex-card"/.test(body),
      words: text(body),
      marks: (body.match(/class="ng-wex-mark" aria-hidden="true">✓</g) ?? []).length,
      control: CONTROL.exec(body.replace(/^<div\b[^>]*>/, ''))?.[0] ?? null,
    };
  });
}

function ofDom(container) {
  return [...container.querySelectorAll('[data-worked-example]')].map(ex => {
    const toggle = ex.querySelector('.ng-wex-toggle');
    const body = ex.querySelector('.ng-wex-body');
    const control = body && CONTROLS.map(sel => body.querySelector(sel)).find(Boolean);
    return {
      expanded: toggle?.getAttribute('aria-expanded') ?? null,
      controls: toggle?.getAttribute('aria-controls') ?? null,
      bodyId: body?.getAttribute('id') ?? null,
      live: body?.getAttribute('aria-live') === 'polite',
      card: Boolean(body?.querySelector('.ng-wex-card')),
      words: (body?.textContent ?? '').replace(/\s+/g, ' '),
      marks: body ? [...body.querySelectorAll('.ng-wex-mark')].filter(m => m.textContent === '✓').length : 0,
      control: control ? control.tagName.toLowerCase() : null,
    };
  });
}

export function expectWorkedExample(container, { open = false, rows, tag = TAG } = {}) {
  const found = typeof container === 'string' ? ofMarkup(container) : ofDom(container);
  assert.equal(found.length, 1, `worked examples on the screen: ${found.length}, expected 1`);
  const [ex] = found;
  assert.ok(ex.expanded !== null && ex.expanded !== undefined, 'the toggle is a button.ng-wex-toggle with aria-expanded');
  assert.ok(ex.live && ex.bodyId && ex.controls === ex.bodyId, 'the toggle controls the example\'s polite live region (always present)');
  assert.equal(ex.expanded, String(open), open ? 'the example is open' : 'the example is closed (it opens only by its toggle)');
  assert.equal(ex.card, open, open ? 'the opened example shows its card' : 'nothing of the example is in the page while closed');
  assert.equal(ex.control, null, `nothing inside the example takes focus or input: ${ex.control}`);
  if (open) {
    assert.ok(ex.words.includes(tag), `the opened example carries the tag «${tag}»`);
    if (rows !== undefined) assert.equal(ex.marks, rows, `✓ rows: ${ex.marks}, expected ${rows}`);
  }
}
