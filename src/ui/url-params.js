// Strict readers for the URL codecs (round 6, spec URL v2.1). Each section's
// codec (src/sections/<id>/screens/url.js) reads its allowlisted keys with
// these; the shell (src/app/url.js) has already capped the hash, dropped
// malformed percent-encoding and kept the first of duplicate keys, so every
// value here is a short string or undefined. Pure: nothing reads the page.
//
// A codec is { keys, syntax?, scopes, decode(params, ctx), encode(ctx) }:
//   keys     the section's own URL keys, in the order encode writes them
//            (`syntax` is the shell's, for sections with a vendor switch);
//   syntax   true when the section has the vendor switch (routing, VLAN, DHCP);
//   scopes   the store places the codec owns;
//   decode   params ({ key: string }) and ctx ({ bank, syntax, places,
//            random }) → { [scope]: complete place }: the remembered place (or
//            the screen's defaults), its URL-owned fields reset to defaults,
//            then the valid URL fields over them; unrelated fields are kept;
//   encode   ctx ({ bank, syntax, places }) → [[key, value]], the current
//            task's identity only (never answers, drafts, hints or marks).

/** A strict decimal integer within [min, max], or null: digits only, no sign,
 * no leading zeros (except 0 itself), at most 9 digits. */
export function int(value, min, max) {
  if (typeof value !== 'string' || !/^(?:0|[1-9][0-9]{0,8})$/.test(value)) return null;
  const n = Number(value);
  return n >= min && n <= max ? n : null;
}

/** One of `allowed` (strings), or null. */
export function oneOf(value, allowed) {
  return typeof value === 'string' && allowed.includes(value) ? value : null;
}

/** True when `fn` runs without throwing (a seed the logic can build). */
export function builds(fn) {
  try { fn(); return true; } catch { return false; }
}

/** [key, value] pairs with the empty ones (null, undefined, false) left out; values as strings. */
export function pairs(list) {
  return list.filter(([, v]) => v !== null && v !== undefined && v !== false).map(([k, v]) => [k, String(v)]);
}
