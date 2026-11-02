export const ciscoPrompts = ['>', '#', '(config)#', '(config-line)#', '(config-if)#'];

/** Missing optional capabilities mean order-only, with no hints or tips.
 * Banks opt in explicitly; callers receive detached arrays. */
export function capabilities(deck) {
  return {
    prompts: Array.isArray(deck.prompts) ? [...deck.prompts] : [], typed: deck.typed ?? false,
    modes: ['cards'],
    hints: Array.isArray(deck.hintCodes) ? [...deck.hintCodes] : [], tips: Array.isArray(deck.tipCodes) ? [...deck.tipCodes] : [],
  };
}
