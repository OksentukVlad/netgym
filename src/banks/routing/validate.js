// Shared pure validator also accepts generated records at runtime.
// Among its invariants, `scaffold-discard-mismatch`: a reference discard row
// sits on a scaffold row flagged `discard: true` (and the other way round),
// so a task that needs a discard route says so in its scaffold. The routing
// screens rely on it: they never read reference routes, and show MikroTik's
// blackhole box from the scaffold alone (screens/facts.js teachesDiscard,
// polish-2 V5).
export { validateBank } from '../../engine/validate-routing-bank.js';
