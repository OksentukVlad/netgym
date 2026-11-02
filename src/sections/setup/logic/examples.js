import { profile } from '../../../engine/vendors/cisco-cli.js';
import { routerosSetupProfile } from '../../../engine/vendors/routeros-setup.js';

export function setupExample({ syntax = 'cisco' } = {}) {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError('invalid-syntax');
  const ros = syntax === 'routeros';
  const cards = ros ? [
    { id: 'example-bridge', template: '/interface bridge add name=bridge-example', purpose: 'створює міст для LAN' },
    { id: 'example-port', template: '/interface bridge port add bridge=bridge-example interface=ether2', purpose: 'додає ether2 до вже створеного моста' },
  ] : [{ id: 'example-show', template: 'show running-config', mode: '#', purpose: 'показує поточні налаштування' }];
  return {
    context: ros ? 'Спочатку створи bridge-example, потім додай ether2: порт посилається на міст, який уже має існувати.'
      : 'Команди show вводять у привілейованому режимі #: show running-config показує поточні налаштування.',
    columns: ros ? ['Призначення', 'Команда'] : ['Призначення', 'Команда', 'Режим'],
    rows: cards.map(c => [c.purpose, c.template, ...(!ros ? [c.mode] : [])]),
    task: { profile: ros ? routerosSetupProfile : profile, prompts: ros ? [] : ['#'], cards,
      rules: ros ? [{ kind: 'before', a: cards[0].id, b: cards[1].id, why: 'bridge-before-port' }] : [], values: {} },
    answer: { order: cards.map(c => c.id), prompts: ros ? {} : { 'example-show': '#' } },
  };
}
