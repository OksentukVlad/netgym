// Hand-authored outcomes. Do not regenerate this file from the checker.
export const replay = {
  seed: 'dr-1-replay',
  values: { hostname: 'R87', domain: 'practice.example', username: 'maintainer', interface: 'GigabitEthernet0/1', ip: '192.168.234.1', mask: '255.255.255.0', modulus: 4096 },
  initialOrder: ['transport-ssh', 'username', 'crypto', 'ssh-version', 'login-local', 'write-memory', 'no-shutdown', 'domain', 'password-encryption', 'enable-secret', 'hostname', 'ip-address'],
  typedIds: ['enable-secret', 'username', 'password-encryption'],
  order: ['ip-address', 'username', 'domain', 'hostname', 'login-local', 'password-encryption', 'transport-ssh', 'ssh-version', 'no-shutdown', 'crypto', 'enable-secret', 'write-memory'],
  prompts: {
    hostname: '(config)#', domain: '(config)#', crypto: '(config)#', 'ssh-version': '(config)#',
    'enable-secret': '(config)#', username: '(config)#', 'password-encryption': '(config)#',
    'transport-ssh': '(config-line)#', 'login-local': '(config-line)#', 'ip-address': '(config-if)#', 'no-shutdown': '(config-if)#', 'write-memory': '#',
  },
  outcomes: [
    { edit: 'none', code: 'ok', complete: true },
    { edit: 'crypto-first', code: 'needs-before', why: 'hostname-before-key', cards: ['hostname', 'crypto'] },
    { edit: 'save-first', code: 'not-last', why: 'save-last', cards: ['write-memory'] },
    { edit: 'address-mode', code: 'wrong-mode', cards: ['ip-address'] },
    { edit: 'missing-mode', code: 'mode-missing', cards: ['ip-address'] },
  ],
  script: `enable
configure terminal
interface GigabitEthernet0/1
ip address 192.168.234.1 255.255.255.0
exit
username maintainer privilege 15 secret <пароль>
ip domain-name practice.example
hostname R87
line vty 0 15
login local
exit
service password-encryption
line vty 0 15
transport input ssh
exit
ip ssh version 2
interface GigabitEthernet0/1
no shutdown
exit
crypto key generate rsa modulus 4096
enable secret <пароль>
end
write memory`,
};
