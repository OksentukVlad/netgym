import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { renderAddress as cisco } from '../src/engine/vendors/cisco.js';
import { renderAddress as routeros } from '../src/engine/vendors/routeros.js';
const goldens = JSON.parse(readFileSync(new URL('./fixtures/address-commands.json', import.meta.url)));
for (const row of goldens.rows) test(`renderAddress /${row.address.prefix}: Cisco and RouterOS golden strings`, () => {
  assert.equal(cisco(row.address, row.ciscoLabel), row.cisco);
  assert.equal(routeros(row.address, row.routerosLabel), row.routeros);
});
test('renderAddress: default /31 link interfaces and /32 Cisco Loopback0 only', () => {
  assert.equal(cisco({ ip: '10.0.0.0', prefix: 31 }), goldens.rows[2].cisco);
  assert.equal(routeros({ ip: '10.0.0.0', prefix: 31 }), goldens.rows[2].routeros);
  assert.equal(cisco({ ip: '10.0.0.1', prefix: 32 }), goldens.rows[3].cisco);
  assert.equal(cisco({ ip: '10.0.0.1', prefix: 32 }, 'GigabitEthernet0/0'), null);
  assert.equal(cisco({ ip: '10.0.0.1', prefix: 32 }, 'Loopback1'), null);
  assert.equal(routeros({ ip: '10.0.0.1', prefix: 32 }, 'lo'), null);
});
test('renderAddress: invalid fields, LAN boundaries and command-bearing labels are rejected', () => {
  for (const render of [cisco, routeros]) {
    for (const address of [null, {}, { ip: null, prefix: 24 }, { ip: '10.0.0.01', prefix: 24 }, { ip: '10.0.0.1', prefix: '/24' },
      { ip: '10.0.0.1', prefix: 33 }, { ip: '10.0.0.1', prefix: null }, { ip: '10.0.0.0', prefix: 24 }, { ip: '10.0.0.255', prefix: 24 }]) assert.equal(render(address), null);
    for (const label of ['', 'bridge\n/ip route add', 'ether1;reboot', 'GigabitEthernet0/0\r', 'bridge name']) assert.equal(render({ ip: '10.0.0.1', prefix: 24 }, label), null);
  }
});
