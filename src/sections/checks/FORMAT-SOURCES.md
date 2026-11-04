# Checks terminal profiles — sources and limits

Checked 3 November 2026 against the frozen checks spec v2.1. These are
bounded teaching excerpts, not captured device sessions or full CLI emulators.
The renderer's `profile` contains the source URLs and the 40 × 10 budget.

## Windows 11, English terminal text

- [ipconfig](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ipconfig):
  effective adapter configuration, `/all`, DHCP information. One adapter;
  dot leaders become ` : `, and Lease Obtained is a short ISO date. A down
  adapter shows Media disconnected. Missing DNS configuration does not invent
  a resolver address.
- [ping](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/ping):
  Echo Request/Reply, timeout and unreachable remain distinct. One of the four
  repeated request results is shown; the four-packet summary is retained.
  An unreachable ICMP response can count as a received packet without being
  an Echo Reply. The reporting address stays visible. Long lines wrap into
  stable continuation lines. In C2 a wrapped observation or split table entry is one selectable button; physical lines still obey the budget.
- [tracert](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/tracert):
  increasing TTL, ICMP Time Exceeded, three probes per hop, silent routers.
  `-d` avoids incidental reverse lookup. Every hop occupies two lines: three
  timing slots, then the responder or Request timed out. Four hops plus the
  target and completion fit ten lines. RTTs are illustrative `<1 ms` values,
  not simulated timings. Separate TTL-reply filtering and routing determine
  whether a slot is `*`; they do not disable forwarding.
- [nslookup](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/nslookup):
  resolver identity, forward/reverse answer, Non-existent domain, timeout.
  Wrong answers remain answers; judging correctness needs a trusted expected
  record. NXDOMAIN for the explicit absent-name check is expected.
- [OpenSSH for Windows](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh-server-configuration),
  [key authentication](https://learn.microsoft.com/en-us/windows-server/administration/openssh/openssh_keymanagement):
  representative session excerpts for a host-key prompt, authentication,
  Access denied, refusal and timeout. Successful plain SSH shows a remote prompt, a clock command and its response;
  verbose authentication diagnostics are not invented. A first-login key prompt
  is normal and does not establish authentication. In C1 the learner explicitly
  continues the modelled login after the fingerprint check.
  [OpenSSH ssh(1)](https://man.openbsd.org/ssh.1#v) documents verbose diagnostics;
  checked 4 November 2026 for usage-review item A7.
- [curl manual](https://curl.se/docs/manpage.html): `curl -i` HTTP request,
  HTTP status/body and resolution/connection/timeout errors. This is a named
  HTTP transaction to an example host, not an assertion about every website
  or TLS. Windows terminal commands are captions, outside the output budget.

## Cisco IOS

- [NAT local/global terminology and translation table](https://www.cisco.com/c/en/us/support/docs/ip/network-address-translation-nat/4606-8.html):
  inside global, inside local, outside local and outside global are all kept.
  The four columns reflow into two narrow panels. Port/ICMP-ID tuples remain
  complete; an ICMP flow keeps its Echo identifier in all four columns. The NAT panel displays the most recent collected flow, while the
  rung result retains all collected entries. Empty output means no displayed
  dynamic state, not missing NAT configuration.
- `show ip interface brief` retains address, Status and Protocol. Optional
  disabled and protocol-down states are separate. `show ip route` retains C,
  L, S/S*, gateway of last resort and next-hop/distance information, omitting
  the long introductory legend. The DHCP profile retains client identifier,
  lease expiration and Automatic type. Table continuations replace wide
  column spacing; they do not collapse different meanings into one field.

## RouterOS 7.16 profile

The frozen spec pins the teaching profile to **7.16**. Only the following
subsets print; the code comments explicitly identify them as subsets:

| Command | Taught flags / fields | Official reference checked |
| --- | --- | --- |
| `/interface print` | R running, X disabled | [Interface monitoring](https://help.mikrotik.com/docs/spaces/ROS/pages/139526175/Interface+stats+and+monitor-traffic) |
| `/ip address print` | X disabled, D dynamic | [Address CLI](https://manual.mikrotik.com/docs/cli-reference/ip/address/) |
| `/ip route print` | D dynamic, A active, c connected, s static | [IP Routing, Hardware Offloaded Route](https://help.mikrotik.com/docs/spaces/ROS/pages/328084/IP+Routing#IPRouting-HardwareOffloadedRoute), [route reference](https://manual.mikrotik.com/docs/cli-reference/ip/route/) |
| `/ip dhcp-server lease print` | bound / waiting | [DHCP leases](https://help.mikrotik.com/docs/spaces/ROS/pages/24805500/DHCP#DHCP-Leases) |
| `/ip firewall connection print detail` | lowercase s srcnat; original and reply `address:port` tuples for TCP/UDP (7.16; separate port fields came in 7.20); ICMP: bare addresses plus `icmp-id` | [Connection CLI](https://manual.mikrotik.com/docs/cli-reference/ip/firewall/connection/), [connection tracking](https://help.mikrotik.com/docs/spaces/ROS/pages/130220087/Connection+tracking) |
| `/ping` | sequence, host, size, TTL, time/status, sent/received/loss | [Ping](https://help.mikrotik.com/docs/spaces/ROS/pages/8323183/Ping) |

`I` invalid and `S` slave exist in the address reference, but are outside our
scenarios and never print. Static **routes use lowercase s**. A DHCP default
prints the taught D/A subset, omitting its additional origin flag. A bare
connection has no `s` flag and retains the unmodified reply destination; it
is not NAT evidence. Uppercase `S` (seen-reply) is not used as srcnat.

The current generated CLI reference identifies itself as **7.26**, and the
older IP Routing page contains mixed legacy/current examples. Its Hardware
Offloaded Route example explicitly uses lowercase `s`; the CLI reference
corroborates current flag/field meanings. These sources are documentation
checks, **not release-specific 7.16 device captures**. Astra's requested code
review should recheck this pinned subset; no 7.16 executable was available
or run as part of this logic task.

The source sheets were read privately for command coverage. No source-sheet
identity, credentials, network values or extracts are included in app content.
