// The R2 test helper (round 5, spec 5a §2B, v2 B): every row marked
// `data-term` carries a non-empty purpose (`data-purpose`), and the number
// of such rows is the one the caller expects, so a row that lost its
// `data-term` fails instead of passing with nothing to check.
//
//   expectPurposes(container, { expected })
// `container`: a DOM element (mini-dom or a browser) or server markup (a
// string). Returns nothing; throws an AssertionError naming the first problem.
import assert from 'node:assert/strict';

/** The rows of server markup: each opening tag with data-term, and the markup up to its closing tag. */
function rowsOfMarkup(html) {
  const rows = [];
  const open = /<([\w-]+)\b[^>]*\sdata-term=""[^>]*>/g;
  let m;
  while ((m = open.exec(html))) {
    const name = m[1], tags = new RegExp(`<(/?)${name}(?=[\\s>/])[^>]*?(/?)>`, 'g');
    tags.lastIndex = m.index;
    let depth = 0, t, end = html.length;
    while ((t = tags.exec(html))) {
      if (t[2] === '/') continue;
      depth += t[1] ? -1 : 1;
      if (depth === 0) { end = tags.lastIndex; break; }
    }
    const inner = html.slice(m.index, end);
    const purposes = [...inner.matchAll(/<[\w-]+\b[^>]*\sdata-purpose=""[^>]*>([^<]*)</g)].map(p => p[1]);
    rows.push({ text: inner.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 60), purposes });
  }
  return rows;
}

export function expectPurposes(container, { expected } = {}) {
  assert.ok(Number.isInteger(expected), 'expectPurposes: say how many rows carry a term ({ expected })');
  const rows = typeof container === 'string' ? rowsOfMarkup(container)
    : [...container.querySelectorAll('[data-term]')].map(row => ({
      text: (row.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 60),
      purposes: [...row.querySelectorAll('[data-purpose]')].map(p => p.textContent ?? ''),
    }));
  assert.equal(rows.length, expected, `rows with a term (data-term): ${rows.length}, expected ${expected}`);
  for (const row of rows) {
    assert.ok(row.purposes.length >= 1, `no purpose (data-purpose) in the row «${row.text}»`);
    assert.ok(row.purposes.every(p => /\S/u.test(p)), `an empty purpose in the row «${row.text}»`);
  }
}
