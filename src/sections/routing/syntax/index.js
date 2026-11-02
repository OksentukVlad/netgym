// The routing screen's syntaxes, keyed as the logic and vendors key them.
import cisco from './cisco.js';
import routeros from './mikrotik.js';

export const syntaxes = { cisco, routeros };
export const syntaxList = [cisco, routeros];
export { cisco, routeros };
