// Literal replay data. Orders and scripts are hand-written independently of
// the bank's graph, reference order, checker and script builder.
export const switchReplay = {
  seed: 'dr-2-replay',
  values: { hostname: 'SW15', domain: 'lab.example', username: 'maintainer', mgmt: 10, ip: '192.168.185.2', mask: '255.255.255.0', modulus: 2048, interface: 'vlan 10', gateway: '192.168.185.1' },
  initial: ['username', 'domain', 'login-local', 'enable-secret', 'default-gateway', 'no-shutdown', 'ip-address', 'write-memory', 'transport-ssh', 'hostname', 'ssh-version', 'crypto'],
  typed: ['domain', 'ip-address', 'username'],
  prompts: {
    hostname: '(config)#', domain: '(config)#', crypto: '(config)#', 'ssh-version': '(config)#',
    'enable-secret': '(config)#', username: '(config)#', 'default-gateway': '(config)#',
    'transport-ssh': '(config-line)#', 'login-local': '(config-line)#',
    'ip-address': '(config-if)#', 'no-shutdown': '(config-if)#', 'write-memory': '#',
  },
  accepted: ['default-gateway', 'no-shutdown', 'username', 'login-local', 'ip-address', 'domain', 'hostname', 'crypto', 'enable-secret', 'ssh-version', 'transport-ssh', 'write-memory'],
  script: `enable
configure terminal
ip default-gateway 192.168.185.1
interface vlan 10
no shutdown
exit
username maintainer privilege 15 secret <пароль>
line vty 0 15
login local
exit
interface vlan 10
ip address 192.168.185.2 255.255.255.0
exit
ip domain-name lab.example
hostname SW15
crypto key generate rsa modulus 2048
enable secret <пароль>
ip ssh version 2
line vty 0 15
transport input ssh
end
write memory`,
};

export const routerosReplay = {
  seed: 'dr-3-replay', values: { username: 'maintainer', ip: '192.168.77.1', prefix: 25 },
  initial: ['list-member', 'bridge-port', 'mac-server', 'mac-telnet-off', 'list', 'services', 'ssh-strong', 'bridge', 'admin-off', 'user', 'discovery', 'address'],
  typed: [],
  accepted: ['ssh-strong', 'user', 'services', 'list', 'mac-server', 'discovery', 'admin-off', 'mac-telnet-off', 'bridge', 'address', 'list-member', 'bridge-port'],
  script: `/ip ssh set strong-crypto=yes
/user add name=maintainer group=full password=<пароль>
/ip service disable telnet,ftp,www,api,api-ssl
/interface list add name=LAN
/tool mac-server mac-winbox set allowed-interface-list=LAN
/ip neighbor discovery-settings set discover-interface-list=LAN
/user disable admin
/tool mac-server set allowed-interface-list=none
/interface bridge add name=bridge-lan
/ip address add address=192.168.77.1/25 interface=bridge-lan
/interface list member add list=LAN interface=bridge-lan
/interface bridge port add bridge=bridge-lan interface=ether2`,
};

// Independent expected dependencies, not imported or copied at runtime from a bank.
export const switchIds = ['hostname', 'domain', 'crypto', 'ssh-version', 'enable-secret', 'username', 'transport-ssh', 'login-local', 'ip-address', 'no-shutdown', 'default-gateway', 'write-memory'];
export const switchEdges = [
  ['hostname', 'crypto', 'hostname-before-key'], ['domain', 'crypto', 'domain-before-key'],
  ['username', 'login-local', 'user-before-login'],
];
export const routerosIds = ['bridge', 'bridge-port', 'list', 'list-member', 'address', 'user', 'admin-off', 'services', 'mac-server', 'discovery', 'ssh-strong', 'mac-telnet-off'];
export const routerosEdges = [
  ['bridge', 'bridge-port', 'bridge-before-port'], ['bridge', 'list-member', 'bridge-before-member'],
  ['bridge', 'address', 'bridge-before-address'], ['list', 'list-member', 'list-before-member'],
  ['list', 'mac-server', 'list-before-mac'], ['list', 'discovery', 'list-before-discovery'],
  ['user', 'admin-off', 'user-before-disable'],
];
