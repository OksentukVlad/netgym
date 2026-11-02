import { setupPurpose } from './purposes.js';
import { routerosSetupProfile as profile, routerosSetupCommands } from '../../engine/vendors/routeros-setup.js';

export const mikrotikRouter = {
  id: 'dr-3', version: 2, profile, label: 'Роутер MikroTik',
  title: 'MikroTik: налаштування керування', profileText: 'profile.dr-3',
  // No prompts and no typed parser: the capability defaults are order-only.
  hintCodes: ['hint-question', 'hint-objects', 'hint-routeros-example'],
  tipCodes: ['tip-routeros-admin', 'tip-routeros-mac', 'tip-routeros-firewall', 'tip-routeros-save'],
  cards: [...Object.entries(routerosSetupCommands).map(([id, [template, secondary]]) => ({ id, template, secondary, purpose: setupPurpose['dr-3'][id] })),
    { id: 'checkpoint', purpose: setupPurpose['dr-3'].checkpoint, kind: 'checkpoint', description: 'checkpoint-login', secondary: 'Winbox → New Window → Connect To: LAN → Login' }],
  rules: [
    // general knowledge, not a cited refusal: referenced bridge must already exist.
    { kind: 'before', a: 'bridge', b: 'bridge-port', why: 'bridge-before-port' },
    // general knowledge, not a cited refusal: referenced interface must already exist.
    { kind: 'before', a: 'bridge', b: 'list-member', why: 'bridge-before-member' },
    // general knowledge, not a cited refusal: referenced interface must already exist.
    { kind: 'before', a: 'bridge', b: 'address', why: 'bridge-before-address' },
    // general knowledge, not a cited refusal: referenced list must already exist.
    { kind: 'before', a: 'list', b: 'list-member', why: 'list-before-member' },
    // general knowledge, not a cited refusal: referenced list must already exist.
    { kind: 'before', a: 'list', b: 'mac-server', why: 'list-before-mac' },
    // general knowledge, not a cited refusal: referenced list must already exist.
    { kind: 'before', a: 'list', b: 'discovery', why: 'list-before-discovery' },
    // Safety: disabling the default account prevents later logins with it.
    { kind: 'before', a: 'user', b: 'checkpoint', why: 'user-before-checkpoint' },
    { kind: 'before', a: 'address', b: 'checkpoint', why: 'address-before-checkpoint' },
    { kind: 'before', a: 'bridge-port', b: 'checkpoint', why: 'port-before-checkpoint' },
    { kind: 'before', a: 'checkpoint', b: 'admin-off', why: 'checkpoint-before-disable' },
  ],
  referenceOrder: ['bridge', 'bridge-port', 'list', 'list-member', 'address', 'user', 'checkpoint', 'admin-off', 'services', 'mac-telnet-off', 'mac-server', 'discovery', 'ssh-strong'],
};
export default mikrotikRouter;
