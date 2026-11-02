import { setupPurpose } from './purposes.js';
import { profile2960 as profile } from '../../engine/vendors/cisco-cli.js';
import { ciscoPrompts } from '../../engine/vendors/setup-capabilities.js';

export const cisco2960 = {
  id: 'dr-2', version: 2, profile, label: 'Комутатор Cisco 2960',
  title: 'Cisco 2960: налаштування керування', profileText: 'profile.dr-2',
  prompts: ciscoPrompts, typed: true,
  hintCodes: ['hint-question', 'hint-evidence', 'hint-example'],
  tipCodes: ['tip-modes', 'tip-2960-key', 'tip-passwords', 'tip-admin', 'tip-management-vlan', 'tip-default-gateway'],
  scriptPurposes: setupPurpose['dr-1'],
  cards: [
    { id: 'hostname', purpose: setupPurpose['dr-2']['hostname'], mode: '(config)#', template: 'hostname {hostname}', requires: { hostname: '$hostname' } },
    { id: 'svi-address', purpose: setupPurpose['dr-2']['svi-address'], commandId: 'ip-address', mode: '(config-if)#', template: 'ip address {ip} {mask}', requires: { ip: '$ip', mask: '$mask' }, description: 'typed.svi-address' },
    { id: 'svi-up', purpose: setupPurpose['dr-2']['svi-up'], commandId: 'no-shutdown', mode: '(config-if)#', template: 'no shutdown', requires: {}, description: 'typed.svi-up' },
    { id: 'default-gateway', purpose: setupPurpose['dr-2']['default-gateway'], mode: '(config)#', template: 'ip default-gateway {gateway}', requires: { ip: '$gateway' } },
    { id: 'write-memory', purpose: setupPurpose['dr-2']['write-memory'], mode: '#', template: 'write memory', requires: {} },
  ],
  rules: [{ kind: 'last', a: 'write-memory', why: 'save-last' }],
  referenceOrder: ['hostname', 'svi-address', 'svi-up', 'default-gateway', 'write-memory'],
};
export default cisco2960;
