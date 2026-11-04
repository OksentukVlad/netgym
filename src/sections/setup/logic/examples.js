import { profile } from '../../../engine/vendors/cisco-cli.js';
import { routerosSetupProfile } from '../../../engine/vendors/routeros-setup.js';

export function setupExample({ syntax = 'cisco' } = {}) {
  if (!['cisco', 'routeros'].includes(syntax)) throw new RangeError('invalid-syntax');
  const ros = syntax === 'routeros';
  const cards = ros ? [
    { id: 'example-bridge', template: '/interface bridge add name=bridge-example', purpose: 'створює міст для LAN' },
    { id: 'example-port', template: '/interface bridge port add bridge=bridge-example interface=ether2', purpose: 'додає ether2 до вже створеного моста' },
  ] : [
    // Round 9 (B2): a mini-deck in order, each card with its mode. The banner is in no deck.
    { id: 'example-enable', template: 'enable', mode: '>', purpose: 'відкриває привілейований режим' },
    { id: 'example-configure', template: 'configure terminal', mode: '#', purpose: 'відкриває налаштування пристрою' },
    { id: 'example-banner', template: 'banner motd #Demo#', mode: '(config)#', purpose: 'задає напис під час входу' },
  ];
  return {
    context: ros ? 'Спочатку створи bridge-example, потім додай ether2: порт посилається на міст, який уже має існувати.'
      : 'Три картки на місці: кожна відкриває режим для наступної, тому порядок саме такий.',
    columns: ros ? ['Призначення', 'Команда'] : ['Призначення', 'Команда', 'Режим'],
    rows: cards.map(c => [c.purpose, c.template, ...(!ros ? [c.mode] : [])]),
    task: { profile: ros ? routerosSetupProfile : profile, prompts: ros ? [] : ['>', '#', '(config)#'], cards,
      rules: ros ? [{ kind: 'before', a: cards[0].id, b: cards[1].id, why: 'bridge-before-port' }]
        : [{ kind: 'before', a: 'example-enable', b: 'example-configure', why: 'example-mode-first' }, { kind: 'before', a: 'example-configure', b: 'example-banner', why: 'example-mode-first' }], values: {} },
    answer: { order: cards.map(c => c.id), prompts: ros ? {} : Object.fromEntries(cards.map(c => [c.id, c.mode])) },
  };
}
