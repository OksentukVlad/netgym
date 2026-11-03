// Reviewed complete output intervals, not sampled seeds.
// Source digests bind each proof to its transformations and dependencies;
// when a generator changes, review its full ranges before updating the digest.
export const rangeProofs = [
  {
    "file": "src/engine/renumber.js",
    "sha256": "96bc00d5e3be903307820fc56ef2d46ab994c45bb10cbce545bf30ca005d2a0c",
    "ranges": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "172.31.0.0/16",
      "10.255.0.0/16",
      "100.64.0.0/10",
      "198.18.0.0/15"
    ],
    "reason": "All placement pools, including fixed benchmark; placement checks require each entire mapped unit to fit its pool."
  },
  {
    "file": "src/sections/ip/logic/binary.js",
    "sha256": "09deef813f16e2543de2761cb2388dc91a7074501896af67c6ae608aa9ef0d19",
    "ranges": [
      "10.0.0.0/8",
      "192.168.0.0/16"
    ],
    "reason": "Generated address starts in a private block; all generated prefixes are at least /17, preserving pool membership. Explicit caller-supplied addresses are not generated."
  },
  {
    "file": "src/sections/ip/logic/mask.js",
    "sha256": "b6a960e3c346a8bb045d2dc0361e5f575e3644474f80e914fb1145658c299b0a",
    "ranges": [
      "192.168.0.0/16"
    ],
    "reason": "Delegates generation to mask-core.generate with no address postprocessing."
  },
  {
    "file": "src/sections/ip/logic/mask-core.js",
    "sha256": "bbecc16f1af69d681939788cf5648db2634ca648f2b77db05be58aee88c6ac2d",
    "ranges": [
      "192.168.0.0/16"
    ],
    "reason": "Address template is 192.168.*, prefixes /17 or longer keep the complete selected subnet inside this /16. Hint-3 addresses are examples, not generator output."
  },
  {
    "file": "src/sections/setup/logic/deck.js",
    "sha256": "6877f04b577c468a2d49425947b608d612ddf72318aa4a32eca2d2ad714b38ba",
    "ranges": [
      "192.168.0.0/16"
    ],
    "reason": "All profiles use 192.168.*, prefixes /24 through /26; switch gateway changes only host octet."
  },
  {
    "file": "src/sections/vlan/logic/model.js",
    "sha256": "79821cf9e0f3a5531666d614fef1b8b32167158883aeed71ab789327356dd9e0",
    "ranges": [
      "192.168.0.0/16"
    ],
    "reason": "All host templates use 192.168.*, VLAN pool is 10/20/30/40/50/100/200; host suffix fits a /24."
  },
  {
    "file": "src/sections/vlan/logic/route-model.js",
    "sha256": "aa5a88b95ede020b6df2d07b97d7c03e3689a90627b910336d64fe1884fb5257",
    "ranges": [
      "172.16.0.0/16"
    ],
    "reason": "All generated networks, gateways, PCs and management addresses are in 172.16.*, /24; numbered suffixes fit octets."
  },
  {
    "file": "src/sections/vlan/logic/predict-model.js",
    "sha256": "283e40f198cd4458d65c66fce11a8d9a51cb44ef15d491e7e238eff095164d9f",
    "ranges": [
      "192.168.0.0/16"
    ],
    "reason": "Delegates to generateNetwork; subnet derangement and optional address annotation retain 192.168.*."
  },
  {
    "file": "src/sections/vlan/logic/faults-exercise.js",
    "sha256": "e843a53ee9214edc1bc0390081e0c26e7e03fbcc00a07d953edc3d71857d3c06",
    "ranges": [
      "192.168.0.0/16",
      "172.16.0.0/16"
    ],
    "reason": "Delegates to generateNetwork or generateRoute; chosen fault changes addresses only through faults.js sites."
  },
  {
    "file": "src/sections/vlan/logic/faults.js",
    "sha256": "bfb66da8ff13c749fd35ea07448ef4de0dfab0141288dab098374294342cfe3c",
    "ranges": [
      "192.168.0.0/16",
      "172.16.0.0/16"
    ],
    "reason": "Wrong-network fault retains the first two octets of generateRoute; third octet is 10..229, suffix .1."
  },
  {
    "file": "src/sections/routing/logic/faults-templates.js",
    "sha256": "76f62e4f0db98cee86824962d1aa1e1bf900eb59e69c19608f28c5e4388d4260",
    "ranges": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "100.64.0.0/10",
      "198.18.0.0/15"
    ],
    "reason": "Stored placement uses renumber pools; XOR salts preserve private pool high bits, other source addresses stay fixed. Frozen masks/units are checked separately."
  },
  {
    "file": "src/sections/routing/logic/faults-exercise.js",
    "sha256": "49be08705b94cf61ea7d6315be84a183ff1bccd11fea98436beff79f93e59fb0",
    "ranges": [
      "10.0.0.0/7",
      "172.0.0.0/10",
      "192.168.0.0/15",
      "100.0.0.0/8",
      "198.16.0.0/13"
    ],
    "reason": "Delegates address placement to templateTask; initialConfiguration includes one fault. faults.js increments a nondefault route by one block; bank/frozen prefixes are >= /22, so the expanded conservative intervals cover boundary crossings."
  },
  {
    "file": "src/sections/firewall/logic/order.js",
    "sha256": "e2795dbfba931595ac10a66c73ddd7ed75a68441f6550fd019ac2f1ff0463e52",
    "ranges": [
      "100.64.0.0/10",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Selects/permutates bank rules and topology; addresses are fixed bank data checked by membership. Witnesses delegate to the separately pinned universe."
  },
  {
    "file": "src/sections/firewall/logic/predict.js",
    "sha256": "a77cfa458821b52e35bf0aa7320fe11aa3f74b57dba6e474b7e49562e296f53a",
    "ranges": [
      "100.64.0.0/10",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Shuffles/selects bank cards and policies; no independent address allocation."
  },
  {
    "file": "src/sections/firewall/logic/universe.js",
    "sha256": "bad09e2008ca22927b075f9f3cc915798bb7e2ce2de1df2f6aa981fab797fb76",
    "ranges": [
      "100.64.0.0/10",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Domain assertion fixes the topology; the complete representative product uses fixed literal src/dst address tuples."
  },
  {
    "file": "src/sections/routing/logic/faults.js",
    "sha256": "96004cee8300edc7042489cf80a3697ad66b501bdb4902a962117638c040eaf1",
    "ranges": [
      "10.0.0.0/7",
      "172.0.0.0/10",
      "192.168.0.0/15",
      "100.0.0.0/8",
      "198.16.0.0/13"
    ],
    "reason": "Wrong destination adds one block to a nondefault dst; all nondefault bank/frozen prefixes are >= /22 (asserted in reservation test). Expanded intervals enclose each entire source pool plus this increment. Other address faults use existing neighbour IPs."
  },
  {
    "file": "src/sections/dhcp/logic/scenario.js",
    "sha256": "1db127d42ef4d52196b2021f481c38ba64b9664ce1af0973d5346ff6705a13e5",
    "ranges": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Maps a /24 LAN unit into one aligned /24 selected within engine.privatePools; same host offsets. ISP endpoints use identity-mapped TEST-NET-3 only. Rejects returning the base LAN for otherAddresses."
  },
  {
    "file": "src/sections/dhcp/logic/sides.js",
    "sha256": "caa6e3b1ce3e3ee2d13b7a2f3392ffdf0800bec812f3bfbda1bf670b0edf982d",
    "ranges": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Selects/shuffles the cardBank on scenario.createTopology; no address arithmetic except host suffixes 1..254 inside its private /24."
  },
  {
    "file": "src/sections/dhcp/logic/server.js",
    "sha256": "b7005867e16c0b242c493101977c94c93b1a38ffbfcf06e2ec92d56dd60acc3c",
    "ranges": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Chooses an aligned /24 or /25..27 subblock inside the base /24; all offsets stay inside it. Delegates whole /24 placement to scenario.lanMapper and fixed ISP DNS in TEST-NET-3."
  },
  {
    "file": "src/sections/dhcp/logic/nat.js",
    "sha256": "a591098d84b2c48fd2f937916559126abd588eff2bc9aba4d1e14f9b8d769ff1",
    "ranges": [
      "10.0.0.0/8",
      "172.16.0.0/12",
      "192.168.0.0/16",
      "203.0.113.0/24"
    ],
    "reason": "Delegates placement to scenario.createTopology. Additional /24 networks XOR only bits 8 or 9, preserving all private-pool high bits. WAN, ISP and remote endpoints stay in TEST-NET-3."
  }
];
