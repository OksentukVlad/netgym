// A rendering inventory, not a RouterOS parser or a simulated device.
export const routerosSetupProfile = Object.freeze({
  id: 'routeros7-serial-management', family: 'RouterOS', version: '7.12 or later',
  fresh: true, defaultConfiguration: false, access: 'serial-console',
  network: 'isolated-practice-no-wan', interfaces: ['ether2'],
});

export const routerosSetupCommands = {
  bridge: ['/interface bridge add name=bridge-lan', 'Bridge → Bridge'],
  'bridge-port': ['/interface bridge port add bridge=bridge-lan interface=ether2', 'Bridge → Ports'],
  list: ['/interface list add name=LAN', 'Interfaces → Interface List → Lists'],
  'list-member': ['/interface list member add list=LAN interface=bridge-lan', 'Interfaces → Interface List'],
  address: ['/ip address add address={ip}/{prefix} interface=bridge-lan', 'IP → Addresses'],
  user: ['/user add name={username} group=full password=<пароль>', 'System → Users'],
  'admin-off': ['/user disable admin', 'System → Users'],
  services: ['/ip service disable telnet,ftp,www,api,api-ssl', 'IP → Services'],
  'mac-server': ['/tool mac-server mac-winbox set allowed-interface-list=LAN', 'Tools → MAC Server → MAC Winbox Server'],
  discovery: ['/ip neighbor discovery-settings set discover-interface-list=LAN', 'IP → Neighbors → Discovery Settings'],
  'ssh-strong': ['/ip ssh set strong-crypto=yes', 'IP → SSH'],
  'mac-telnet-off': ['/tool mac-server set allowed-interface-list=none', 'Tools → MAC Server → MAC Telnet Server'],
};
