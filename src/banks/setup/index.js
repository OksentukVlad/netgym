import ciscoRouter from './cisco-router.js';
import cisco2960 from './cisco-2960.js';
import mikrotikRouter from './mikrotik-router.js';
import { capabilities } from '../../engine/vendors/setup-capabilities.js';

export const decks = [ciscoRouter, cisco2960, mikrotikRouter];
/** Safe picker DTO; no cards, graph or reference data. */
export const deckList = () => decks.map(deck => ({ id: deck.id, label: deck.label, title: deck.title, profileText: deck.profileText, capabilities: capabilities(deck) }));
export default { decks };

export { setupPurpose } from './purposes.js';
