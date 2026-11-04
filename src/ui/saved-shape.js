// Small shape checks for saved progress (spec save v2, Astra 2): the section
// tables (src/sections/<id>/screens/saved.js) are built from these, and
// app/saved.js runs them on what it reads. Each check is value → boolean and
// must not throw on any JSON value. Pure: nothing reads the page.
//
// `shape` fields are optional unless named in `required`: a view starts as {}
// and fills in as the learner works. A field the check doesn't name is left
// alone: no screen reads it, so it can do no harm.

export const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value);
export const any = () => true;
export const bool = value => typeof value === 'boolean';
export const text = value => typeof value === 'string';
export const finite = value => Number.isFinite(value);
/** A whole number from 0: a counter, a position, a seed. */
export const count = value => Number.isSafeInteger(value) && value >= 0;
export const between = (min, max) => value => Number.isInteger(value) && value >= min && value <= max;
export const nullable = check => value => value === null || check(value);
export const oneOf = (...allowed) => value => allowed.includes(value);
export const listOf = check => value => Array.isArray(value) && value.every(check);
export const mapOf = check => value => isObject(value) && Object.values(value).every(check);

/** An object whose named fields pass, and whose `required` fields are there. */
export const shape = (fields, required = []) => value => isObject(value)
  && required.every(name => Object.hasOwn(value, name))
  && Object.keys(fields).every(name => !Object.hasOwn(value, name) || fields[name](value[name]));

/** A Set of values that pass (a VLAN walk's `received`: the screens call .has on it). */
export const setOf = check => value => value instanceof Set && [...value].every(check);

/** Text JSON.parse reads into a value that passes: the views keep answers as JSON and parse them on render. */
export function jsonOf(check) {
  return value => {
    if (typeof value !== 'string') return false;
    try { return check(JSON.parse(value)); } catch { return false; }
  };
}

/** A form field: a number, or the text as typed. */
export const field = value => typeof value === 'string' || Number.isFinite(value);

/** True when `identity` has exactly these values. */
export const matches = (identity, expected) => Object.keys(expected).every(name => identity[name] === expected[name]);

/** The diagram's stored zoom: 'all' or a scale (RouterDiagram). */
export const zoom = value => value === null || value === 'all' || Number.isFinite(value);

/** The asides a screen's place can also hold (ui/components/Aside.jsx). */
export const asides = Object.freeze({ asides: mapOf(bool), started: bool });

/** Which hard screens' examples have opened by themselves (useFirstVisit): a place of its own,
 * outside the sections' URLs, so a link can't bring a first visit back. */
export const firstVisits = Object.freeze({ examples: mapOf(bool) });

/** A check's finding, as far as the shared code reads it. */
export const finding = shape({ code: text, severity: text, params: isObject });

/** What a check returns: `ok`, and whatever else the section's screens read
 * from it (`fields`), named as required where they read it without a guard. */
export const resultOf = (fields = {}, required = []) => shape({ ok: bool, complete: bool, code: nullable(text), findings: listOf(finding), ...fields }, ['ok', ...required]);
