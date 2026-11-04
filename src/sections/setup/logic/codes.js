export const codes = [
  'typed.svi-enter', 'typed.svi-address', 'typed.svi-up', 'typed.default-gateway', 'checkpoint-login', 'checkpoint-comment',
  'user-before-checkpoint', 'address-before-checkpoint', 'port-before-checkpoint', 'checkpoint-before-disable', 'tip-default-gateway',
  'script-part-1', 'script-part-2', 'script-setup', 'script-as-router', 'hint-cards', 'hint-mode-missing', 'hint-mode-rule', 'hint-bridge-shape',
  'order-ok', 'hint-modes-router', 'hint-modes-switch', 'hint-modes-where', 'hint-modes-shape',
  'hint-start-router', 'hint-start-switch', 'hint-start-routeros', 'hint-shape', 'hint-recall-mode', 'hint-recall-first', 'hint-recall-almost',
  'ok', 'invalid-record', 'invalid-answer', 'needs-before', 'not-last', 'mode-missing', 'wrong-mode', 'typed-missing',
  'unknown-command', 'ambiguous-keyword', 'missing-part', 'wrong-part', 'extra-part', 'wrong-value', 'other-command', 'unsafe-command',
  'weak-key', 'weak-secret', 'keep-together',
  'hostname-before-key', 'domain-before-key', 'user-before-login', 'save-last',
  'hint-question', 'hint-evidence', 'hint-example', 'tip-save', 'tip-key', 'tip-passwords', 'tip-admin', 'tip-modes',
  'reference-label', 'accepted-label', 'copy-secret', 'profile',
  ...['hostname', 'domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'password-encryption', 'transport-ssh', 'login-local', 'ip-address', 'no-shutdown', 'write-memory'].map(id => `typed.${id}`),
];
