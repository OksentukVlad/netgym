import { parse } from '../../../engine/vendors/cisco-cli.js';
import { text } from '../uk.js';
import { checkTyped, checkRecall, weakSecret } from './typed.js';
import { check } from './rules.js';
import { boardAnswer } from './state.js';

export const fill = (task, template) => template.replace(/\{(\w+)\}/g, (_, key) => task.values[key]);
export function cardText(task, cardId) {
  const card = task.cards.find(c => c.id === cardId) ?? task.recallLines?.find(c => c.id === cardId);
  if (!card) throw new RangeError('invalid-answer');
  return card.kind === 'checkpoint' ? text(card.description, task.values) : fill(task, card.template);
}
const inRecall = state => ['recall', 'done', 'done-shown'].includes(state?.phase);
const finishedLine = (task, state, id) => state.phase === 'done-shown' || (state.typedFeedback[id]?.ok && checkTyped(task, id, state.answer.typed[id]).ok);

/** Safe board rows, learner ordered unless the state explicitly reveals them.
 * Pass the complete state during recall so hidden commands cannot reappear. */
export function render(task, input) {
  const state = input?.answer ? input : null, answer = state ? boardAnswer(task, state) : input;
  return answer.order.map(id => {
    const card = task.cards.find(c => c.id === id);
    const masked = inRecall(state) && task.typedIds.includes(id) && !finishedLine(task, state, id);
    return { id, kind: card.kind ?? 'card', purpose: card.purpose, text: masked ? '…' : cardText(task, id),
      ...(card.description ? { description: text(card.description, task.values) } : {}),
      ...(card.secondary ? { secondary: card.secondary } : {}), prompt: answer.prompts?.[id] ?? null };
  });
}

/** Three full-width inputs, separate from sortable cards (SVI entry is not a card).
 * Do not render semantic ids in DOM attributes. */
export function recallRows(task, state) {
  if (!inRecall(state)) return [];
  return task.recallLines.map(line => ({ id: line.id, description: text(line.description ?? `typed.${line.commandId}`, task.values),
    prompt: line.mode, value: state.answer.typed[line.id], result: state.typedFeedback[line.id] ?? null,
    locked: Boolean(finishedLine(task, state, line.id)), shown: state.phase === 'done-shown' }));
}

/** Structured script, including transitions and previously learned 2960 setup.
 * RouterOS deliberately has no combined paste payload: copy each part separately. */
export function buildScript(task, order, commands) {
  const lines = [], add = (value, kind, extra = {}) => lines.push({ text: value, kind, ...extra });
  if (task.profile.family === 'RouterOS') {
    const at = order.findIndex(id => task.cards.find(c => c.id === id).kind === 'checkpoint');
    if (at < 0) throw new RangeError('invalid-answer');
    for (const id of order.slice(0, at)) add(commands[id], 'command', { cardId: id });
    add(text('checkpoint-comment', task.values), 'checkpoint');
    const first = [...lines]; lines.length = 0;
    for (const id of order.slice(at + 1)) add(commands[id], 'command', { cardId: id });
    const parts = [first, [...lines]].map((part, index) => ({ id: `part-${index + 1}`, label: text(`script-part-${index + 1}`), lines: part, script: part.map(l => l.text).join('\n') }));
    return { lines: [...first, ...lines], parts, script: null };
  }
  add('enable', 'transition');
  let mode = '#';
  const enter = next => {
    if (next === '#' && mode !== '#') { add('end', 'transition'); mode = '#'; }
    if (next !== '#' && mode === '#') { add('configure terminal', 'transition'); mode = '(config)#'; }
    if (next !== mode && mode !== '(config)#') { add('exit', 'transition'); mode = '(config)#'; }
    if (next === '(config-line)#' && mode !== next) { add(`line vty ${task.profile.vty}`, 'transition'); mode = next; }
    if (next === '(config-if)#' && mode !== next) {
      add(`interface ${task.values.interface}`, 'transition', task.values.mgmt ? { recallId: 'recall:svi-enter' } : {}); mode = next;
    }
  };
  for (const id of order) {
    const card = task.cards.find(c => c.id === id);
    enter(card.mode); add(commands[id], 'command', { cardId: id, ...(task.typedIds.includes(id) ? { recallId: id } : {}) });
    if (task.values.mgmt && card.commandId === 'hostname') {
      // Fixed learned block follows hostname, irrespective of the learner's order.
      for (const [commandId, next, template] of [
        ['domain', '(config)#', 'ip domain-name {domain}'], ['crypto', '(config)#', 'crypto key generate rsa modulus 2048'],
        ['ssh-version', '(config)#', 'ip ssh version 2'], ['enable-secret', '(config)#', 'enable secret <пароль>'],
        ['username', '(config)#', 'username {username} privilege 15 secret <пароль>'],
        ['transport-ssh', '(config-line)#', 'transport input ssh'], ['login-local', '(config-line)#', 'login local'],
      ]) {
        const start = lines.length; enter(next);
        for (let index = start; index < lines.length; index++) lines[index].note = 'script-as-router';
        add(fill(task, template), 'learned', { note: 'script-as-router', purpose: task.scriptPurposes[commandId], ...(template.startsWith('crypto ') ? { detail: 'tip-2960-key' } : {}) });
      }
    }
  }
  const script = lines.map(l => l.text).join('\n');
  return { lines, parts: [{ id: 'setup', label: text('script-setup'), lines, script }], script };
}

function safeTyped(task, id, value) {
  const parsed = parse(value, { mode: null, profile: task.profile });
  const secret = parsed.values.secret;
  const unsafe = secret !== undefined && !/^[A-Za-z0-9!@#$%^&*._+=:/,\-]+$/.test(secret);
  return { command: secret !== undefined && (weakSecret(secret, task.values) || unsafe) ? cardText(task, id) : parsed.tokens.map(token => token.text).join(' '), unsafe };
}

/** One masking path for on-board, revealed and copied scripts. Mask every
 * occurrence, including repeated SVI entries in alternative valid orders. */
export function scriptForState(task, state) {
  if (state.phase === 'done' && !checkRecall(task, state.answer).ok) return null;
  const answer = boardAnswer(task, state), shown = state.revealed && !state.showOwn;
  if (!shown && !check(task, answer).ok) return null;
  const commands = Object.fromEntries(task.cards.map(c => [c.id, cardText(task, c.id)]));
  let pasteReplaced = false;
  if (inRecall(state) && state.phase !== 'done-shown') for (const id of task.typedIds) {
    if (finishedLine(task, state, id)) {
      const safe = safeTyped(task, id, answer.typed[id]); commands[id] = safe.command; pasteReplaced ||= safe.unsafe;
    }
  }
  const script = buildScript(task, answer.order, commands);
  const mapLine = line => {
    if (!inRecall(state) || !line.recallId) return line;
    if (!finishedLine(task, state, line.recallId)) return { ...line, text: '…', masked: true };
    if (line.recallId === 'recall:svi-enter' && state.phase !== 'done-shown') return { ...line, text: safeTyped(task, line.recallId, answer.typed[line.recallId]).command };
    return { ...line, shown: state.phase === 'done-shown' };
  };
  const parts = script.parts.map(part => { const lines = part.lines.map(mapLine); return { ...part, lines, script: lines.map(l => l.text).join('\n') }; });
  return { label: text(shown ? 'reference-label' : 'accepted-label') + (pasteReplaced ? ` ${text('copy-secret')}` : ''),
    lines: parts.flatMap(p => p.lines), parts, script: script.script === null ? null : parts[0].script };
}

/** Answer-only calls check sorting. Screens must pass state for recall masking. */
export function acceptedScript(task, input) {
  return scriptForState(task, input?.answer ? input : { answer: input, phase: 'sorted', revealed: false, typedFeedback: {} });
}
