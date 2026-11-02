import { cardText, buildScript } from './render.js';
import { text } from '../uk.js';

/** Explicit sorting reveal only. During recall use scriptForState, never this
 * raw reference: it intentionally contains the complete answer. */
export function solution(task) {
  const order = [...task.referenceOrder];
  const prompts = Object.fromEntries(task.cards.filter(c => c.mode).map(c => [c.id, c.mode]));
  const commands = Object.fromEntries(order.map(id => [id, cardText(task, id)]));
  return { order, prompts, label: text('reference-label'), ...buildScript(task, order, commands) };
}
