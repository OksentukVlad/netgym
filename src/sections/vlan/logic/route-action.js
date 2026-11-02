import { givens } from './route-model.js';
import { label } from './model.js';
import { interVlanActions } from '../uk.js';

/** Describe the parts left to configure, from the public givens. No answer,
 * reference solution, gateway value or generated VLAN number is disclosed.
 */
export function interVlanAction(task, syntax = task.syntax) {
  const fixed = givens(task, syntax), words = interVlanActions[syntax];
  if (task.management) return words.management;
  if (task.taskNumber === 4) return words.bridgesAndRouter;
  const routerLink = task.topology.links.find(link => [link.a, link.b].some(end => end.device === 'SW1')
    && [link.a, link.b].some(end => end.device === 'R1'));
  const end = [routerLink.a, routerLink.b].find(end => end.device === 'R1');
  const key = fixed.SW1 ? 'router' : 'switchAndRouter';
  const line = words[key];
  return typeof line === 'function' ? line({ iface: label(task.topology, end.device, end.port, syntax) }) : line;
}
