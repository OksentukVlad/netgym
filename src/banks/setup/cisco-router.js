import { setupPurpose } from './purposes.js';
import { profile } from '../../engine/vendors/cisco-cli.js';
import { ciscoPrompts } from '../../engine/vendors/setup-capabilities.js';

export const ciscoRouter = {
  id: 'dr-1', version: 1, profile,
  title: 'Налаштування з нуля',
  label: 'Роутер Cisco', prompts: ciscoPrompts, typed: true, profileText: 'profile',
  hintCodes: ['hint-question', 'hint-evidence', 'hint-example'],
  tipCodes: ['tip-modes', 'tip-key', 'tip-passwords', 'tip-admin'],
  cards: [
    { id: 'hostname', purpose: setupPurpose['dr-1']['hostname'], mode: '(config)#', template: 'hostname {hostname}', requires: { hostname: '$hostname' } },
    { id: 'domain', purpose: setupPurpose['dr-1']['domain'], mode: '(config)#', template: 'ip domain-name {domain}', requires: { domain: '$domain' } },
    { id: 'crypto', purpose: setupPurpose['dr-1']['crypto'], mode: '(config)#', template: 'crypto key generate rsa modulus {modulus}', requires: { modulus: [2048, 4096] } },
    { id: 'ssh-version', purpose: setupPurpose['dr-1']['ssh-version'], mode: '(config)#', template: 'ip ssh version 2', requires: { version: 2 } },
    { id: 'enable-secret', purpose: setupPurpose['dr-1']['enable-secret'], mode: '(config)#', template: 'enable secret <пароль>', requires: { secret: 'any-secret', encoding: 0 } },
    { id: 'username', purpose: setupPurpose['dr-1']['username'], mode: '(config)#', template: 'username {username} privilege 15 secret <пароль>', requires: { username: '$username', privilege: 15, secret: 'any-secret', encoding: 0 } },
    { id: 'password-encryption', purpose: setupPurpose['dr-1']['password-encryption'], mode: '(config)#', template: 'service password-encryption', requires: {} },
    { id: 'transport-ssh', purpose: setupPurpose['dr-1']['transport-ssh'], mode: '(config-line)#', template: 'transport input ssh', requires: { transport: 'ssh' } },
    { id: 'login-local', purpose: setupPurpose['dr-1']['login-local'], mode: '(config-line)#', template: 'login local', requires: {} },
    { id: 'ip-address', purpose: setupPurpose['dr-1']['ip-address'], mode: '(config-if)#', template: 'ip address {ip} {mask}', requires: { ip: '$ip', mask: '$mask' } },
    { id: 'no-shutdown', purpose: setupPurpose['dr-1']['no-shutdown'], mode: '(config-if)#', template: 'no shutdown', requires: {} },
    { id: 'write-memory', purpose: setupPurpose['dr-1']['write-memory'], mode: '#', template: 'write memory', requires: {} },
  ],
  rules: [
    // Cisco IOS 15S, Configuring Secure Shell: unnamed default key uses FQDN.
    { kind: 'before', a: 'hostname', b: 'crypto', why: 'hostname-before-key' },
    { kind: 'before', a: 'domain', b: 'crypto', why: 'domain-before-key' },
    // Safe console setup order, not a claim that IOS refuses the command.
    { kind: 'before', a: 'username', b: 'login-local', why: 'user-before-login' },
    // Complete saved result; not a device refusal.
    { kind: 'last', a: 'write-memory', why: 'save-last' },
  ],
  referenceOrder: ['hostname', 'domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'password-encryption', 'transport-ssh', 'login-local', 'ip-address', 'no-shutdown', 'write-memory'],
};
export default ciscoRouter;
