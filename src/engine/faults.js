/** Shared fault mechanisms. Sections own eligibility, evidence signatures,
 * option selection, disclosure and assistance policy. No learner state here. */
/** @typedef {{code:string, text:string, sites:Function, plant:Function, repair:Function}} FaultEntry */
/** Section-specific fields (e.g. VLAN vendor/layer) remain on each entry.
 * @returns {ReadonlyArray<Readonly<FaultEntry>>} */
export function faultCatalogue(entries, methods) {
  return Object.freeze(entries.map(entry => Object.freeze({ ...entry, ...methods(entry) })));
}

/** Compare all valid plantings, including causes outside the selected level. */
export function ambiguousSites(candidate, candidates) {
  return candidates.filter(other => other.valid && other.site.code !== candidate.site.code
    && other.signature === candidate.signature).map(other => other.site.key);
}

/** Section-supplied gate facts; no assumptions about VLAN or routing policy. */
export function faultGates(facts) {
  return Object.entries(facts).filter(([, passes]) => !passes).map(([name]) => name);
}

/** A failing fix cannot disclose anything about a cause choice. Call only
 * after evaluating the fix; the policy callback is lazy for the same reason.
 * Routing calls this on its second step; VLAN retains its combined check. */
export function fixThenCause(result, policy) {
  if (!result.ok) return result;
  const { cause, expected, allowed } = policy();
  if (cause != null && !allowed.includes(cause)) return { ...result, ok: false, complete: false,
    code: 'invalid-cause', findings: [{ code: 'invalid-cause', severity: 'blocks' }] };
  if (cause !== expected) {
    const code = cause ? 'fault-cause-other' : 'fault-cause-required';
    return { ...result, ok: false, complete: false, code, assisted: !!cause,
      findings: [{ code, severity: 'blocks' }], evidence: result.evidence };
  }
  return result;
}
