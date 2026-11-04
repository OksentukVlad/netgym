import { text } from '../uk.js';

// Shapes use documentation addresses and different profile values, never a
// current reference line. In recall a shape is the explicit third hint. A
// value the checker accepts from a set (the key size: 2048 or 4096) is a
// placeholder, so no shape is itself an accepted answer.
function example(task, line) {
  if (task?.profile.family === 'RouterOS') return text('hint-bridge-shape');
  if (!line?.template) return task?.values.mgmt ? 'interface vlan 88; ip address 192.0.2.2 255.255.255.0'
      : 'hostname Demo; ip domain-name demo.example; crypto key generate rsa modulus 2048';
  const values = { hostname: 'Demo', domain: 'demo.example', username: 'demoAdmin', mgmt: 88, ip: '192.0.2.2', mask: '255.255.255.0', gateway: '192.0.2.1', modulus: '<розмір>' };
  return line.template.replace(/\{(\w+)\}/g, (_, key) => values[key]);
}

/** Hints follow the last checked finding, including its saved board positions.
 * Pass the full state; using hints(task) returns the pre-check ladder. */
export function hints(task, state) {
  let entries;
  if (['recall', 'done', 'done-shown'].includes(state?.phase)) {
    if (state.phase !== 'recall') return [];
    const line = task.recallLines.find(line => !state.typedFeedback[line.id]?.ok);
    if (!line?.template) return [];
    // Never the answer itself: a line without values has no "other values"
    // example, so its last rung shows the command with the last word hidden.
    const words = line.template.split(' ');
    entries = [
      { code: 'hint-recall-mode', params: { mode: line.mode, count: words.length } },
      { code: 'hint-recall-first', params: { word: words[0] } },
      /\{\w+\}/.test(line.template)
        ? { code: 'hint-shape', params: { example: example(task, line) } }
        : { code: 'hint-recall-almost', params: { start: words.slice(0, -1).join(' ') } },
    ];
  } else {
    const finding = state?.lastFinding;
    const positions = finding?.positions ?? [];
    const card = task?.cards.find(card => card.id === finding?.cards[0]);
    const modes = { code: 'hint-modes-where' }, shape = { code: 'hint-modes-shape' };
    entries = finding?.code === 'mode-missing' ? [
      // Round 9 (B1): the first card still without a mode, and where it belongs, not the question again.
      { code: 'hint-mode-missing', params: { positions, prompt: card?.mode } }, modes, shape,
    ] : finding?.code === 'wrong-mode' ? [
      { code: 'hint-cards', params: { positions } }, { code: 'hint-mode-rule', params: { prompt: card?.mode } }, shape,
    ] : finding ? [
      { code: 'hint-cards', params: { positions } },
      { code: finding.why ?? finding.code },
      { code: 'hint-shape', params: { example: example(task, card) } },
    ] : state?.phase === 'modes' ? [
      { code: task?.values.mgmt ? 'hint-modes-switch' : 'hint-modes-router' }, modes, shape,
    ] : [
      { code: task?.profile.family === 'RouterOS' ? 'hint-start-routeros' : task?.values.mgmt ? 'hint-start-switch' : 'hint-start-router' },
      { code: task?.profile.family === 'RouterOS' ? 'hint-objects' : 'hint-evidence' },
      { code: 'hint-shape', params: { example: example(task) } },
    ];
  }
  return entries.map((entry, index) => ({ ...entry, rung: index + 1 }));
}

/** Only disclose a chosen rule's explanation after a failed check. */
export function explanation(result) {
  if (!result || result.ok) return null;
  const first = result.findings[0];
  return { code: first.why ?? first.code, ...(first.positions ? { params: { positions: first.positions } } : {}), ...(first.field ? { params: { field: first.field } } : {}), ...(first.reason ? { params: { reason: first.reason } } : {}) };
}

// Rules whose success tip is a shared or fuller one: one tip per lesson, not one per rule.
const objects = 'tip-routeros-objects';
const SUCCESS_TIP = {
  'save-last': 'tip-save', 'user-before-disable': 'tip-routeros-admin',
  'user-before-checkpoint': 'tip-routeros-admin', 'address-before-checkpoint': 'tip-routeros-admin',
  'port-before-checkpoint': 'tip-routeros-admin', 'checkpoint-before-disable': 'tip-routeros-admin',
  'bridge-before-port': objects, 'bridge-before-member': objects, 'bridge-before-address': objects,
  'list-before-member': objects, 'list-before-mac': objects, 'list-before-discovery': objects,
};

export function tips(task, result) {
  if (!result?.ok || !result.complete) return [];
  const codes = [...task.rules.map(r => SUCCESS_TIP[r.why] ?? r.why), ...(task.tipCodes ?? [])];
  return [...new Set(codes)].map(code => ({ code }));
}
