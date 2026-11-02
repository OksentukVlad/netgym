export { default as frozen } from './optimiser-results.js';
export { default as faultsFrozen } from './faults-results.js';
// Converted once from both legacy TASKS at df9d2a6; step 5 removes answer leaks; step 7 shortens task texts.
export const bankId = 'routing.class-16';
export const bankRevision = 1;

/** @type {import('../../engine/network.js').TaskRecord[]} */
export const tasks = [
  {
    "id": "routing.task-01",
    "displayNumber": 1,
    "revision": 1,
    "level": 1,
    "title": "Два роутери, дві LAN",
    "text": "Найбазовіша топологія. Кожен роутер повинен знати мережу за сусідом.",
    "topology": "[PC-A 192.168.1.x] -- R1 --[10.0.0.0/30]-- R2 -- [PC-B 192.168.2.x]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"LAN-A"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.0.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"10.0.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-3","address":{"ip":"192.168.2.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-B"}
          ]
        }
      ],
      "segments": [{"id":"segment-1","kind":"lan","name":"LAN-A"},{"id":"segment-2","kind":"link","name":"лінк R1–R2"},{"id":"segment-3","kind":"lan","name":"LAN-B"}],
      "endpoints": [
        {"id":"segment-1.host","kind":"host","segmentId":"segment-1","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"192.168.2.2","gateway":"192.168.2.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-1.host","to":"segment-3.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.2.0","prefix":24}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "1",
        "hintQuestionId": "1",
        "title": "Два роутери, дві LAN",
        "text": "Найбазовіша топологія. Кожен роутер повинен знати мережу за сусідом.",
        "referenceRoutes": {
          "R1": [
            {
              "id": "R1.route1",
              "dst": "192.168.2.0",
              "prefix": 24,
              "via": "10.0.0.2",
              "hint": {"cisco":"Мережа PC-B за R2. Next-hop = IP R2 на лінку","routeros":"Мережа PC-B за R2. Gateway = IP R2 на лінку"}
            }
          ],
          "R2": [
            {
              "id": "R2.route1",
              "dst": "192.168.1.0",
              "prefix": 24,
              "via": "10.0.0.1",
              "hint": {"cisco":"Мережа PC-A за R1. Next-hop = IP R1 на лінку","routeros":"Мережа PC-A за R1. Gateway = IP R1 на лінку"}
            }
          ]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2"],"justification":"Найбазовіша топологія. Кожен роутер повинен знати мережу за сусідом."}
        ],
        "scaffold": {"R1":[{"label":"LAN-B","needDist":false,"dest":{"kind":"lan","segments":["segment-3"]}}],"R2":[{"label":"LAN-A","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}}]}
      }
    ]
  },
  {
    "id": "routing.task-02",
    "displayNumber": 2,
    "revision": 1,
    "level": 1,
    "title": "Два роутери, один з виходом в інтернет",
    "text": "R1 підключений до інтернету. R2 повинен слати весь невідомий трафік через R1.",
    "topology": "[Internet] -- R1 --[172.16.0.0/30]-- R2 -- [LAN2 10.10.0.0/24]\n               |\n       [LAN1 10.20.0.0/24]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"172.16.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"},
            {"id":"R1.if3","segmentId":"segment-3","address":{"ip":"10.20.0.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN1"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"172.16.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-4","address":{"ip":"10.10.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN2"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"lan","name":"LAN1"},
        {"id":"segment-4","kind":"lan","name":"LAN2"}
      ],
      "endpoints": [
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"10.20.0.2","gateway":"10.20.0.1"},
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"10.10.0.2","gateway":"10.10.0.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R1":[{"id":"dhcp:R1.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-3.host","to":"segment-4.host","coverage":{"from":{"dst":"10.20.0.0","prefix":24},"to":{"dst":"10.10.0.0","prefix":24}}},
      {"id":"internet-1","from":"segment-3.host","to":"internet","coverage":{"from":{"dst":"10.20.0.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-4.host","to":"internet","coverage":{"from":{"dst":"10.10.0.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","internet-1","internet-2"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "2",
        "hintQuestionId": "2",
        "title": "Два роутери, один з виходом в інтернет",
        "text": "R1 підключений до інтернету. R2 повинен слати весь невідомий трафік через R1.",
        "referenceRoutes": {
          "R1": [
            {
              "id": "R1.route1",
              "dst": "10.10.0.0",
              "prefix": 24,
              "via": "172.16.0.2",
              "hint": {"cisco":"Мережа за R2. Next-hop = IP R2 на лінку","routeros":"Мережа за R2. Gateway = IP R2 на лінку"}
            }
          ],
          "R2": [{"id":"R2.route1","dst":"0.0.0.0","prefix":0,"via":"172.16.0.1","hint":"Default route — весь невідомий трафік через R1 в інтернет"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","internet-1","internet-2"],"justification":"R1 підключений до інтернету. R2 повинен слати весь невідомий трафік через R1."}
        ],
        "scaffold": {
          "R1": [{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}}],
          "R2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-03",
    "displayNumber": 3,
    "revision": 1,
    "level": 1,
    "title": {"cisco":"Тупіковий роутер — default в один бік","routeros":"Два роутери, у кожного по дві LAN"},
    "text": {
      "cisco": "R1 — тупіковий: один сусід, тож замість переліку чужих LAN йому досить одного маршруту за замовчуванням на R2. R2 у зворотний бік пише конкретні маршрути до LAN-A1 і LAN-A2: другий default назустріч зациклив би весь невідомий трафік.",
      "routeros": "У кожного роутера є два LAN-сегменти. Потрібно знати про всі чужі мережі. Налаштуй маршрути до чужих мереж без default."
    },
    "topology": "[LAN-A1 10.1.0.0/24][LAN-A2 10.2.0.0/24] -- R1 --[192.168.0.0/30]-- R2 -- [LAN-B1 10.3.0.0/24][LAN-B2 10.4.0.0/24]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"10.1.0.1","prefix":24},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"LAN-A1"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.2.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-A2"},
            {"id":"R1.if3","segmentId":"segment-3","address":{"ip":"192.168.0.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→R2"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-3","address":{"ip":"192.168.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-4","address":{"ip":"10.3.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-B1"},
            {"id":"R2.if3","segmentId":"segment-5","address":{"ip":"10.4.0.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN-B2"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"lan","name":"LAN-A1"},
        {"id":"segment-2","kind":"lan","name":"LAN-A2"},
        {"id":"segment-3","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-4","kind":"lan","name":"LAN-B1"},
        {"id":"segment-5","kind":"lan","name":"LAN-B2"}
      ],
      "endpoints": [
        {"id":"segment-1.host","kind":"host","segmentId":"segment-1","ip":"10.1.0.2","gateway":"10.1.0.1"},
        {"id":"segment-2.host","kind":"host","segmentId":"segment-2","ip":"10.2.0.2","gateway":"10.2.0.1"},
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"10.3.0.2","gateway":"10.3.0.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"10.4.0.2","gateway":"10.4.0.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-1.host","to":"segment-2.host","coverage":{"from":{"dst":"10.1.0.0","prefix":24},"to":{"dst":"10.2.0.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-1.host","to":"segment-4.host","coverage":{"from":{"dst":"10.1.0.0","prefix":24},"to":{"dst":"10.3.0.0","prefix":24}}},
      {"id":"lan-1-4","from":"segment-1.host","to":"segment-5.host","coverage":{"from":{"dst":"10.1.0.0","prefix":24},"to":{"dst":"10.4.0.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-2.host","to":"segment-4.host","coverage":{"from":{"dst":"10.2.0.0","prefix":24},"to":{"dst":"10.3.0.0","prefix":24}}},
      {"id":"lan-2-4","from":"segment-2.host","to":"segment-5.host","coverage":{"from":{"dst":"10.2.0.0","prefix":24},"to":{"dst":"10.4.0.0","prefix":24}}},
      {"id":"lan-3-4","from":"segment-4.host","to":"segment-5.host","coverage":{"from":{"dst":"10.3.0.0","prefix":24},"to":{"dst":"10.4.0.0","prefix":24}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4"]}
    ],
    "demonstrations": [
      {"id":"unknown-destination","from":"segment-1.host","to":"198.19.255.253"}
    ],
    "variants": [
      {
        "id": "explicit-routes",
        "code": "3",
        "hintQuestionId": "3",
        "title": "Два роутери, у кожного по дві LAN",
        "text": "У кожного роутера є два LAN-сегменти. Потрібно знати про всі чужі мережі. Налаштуй маршрути до чужих мереж без default.",
        "referenceRoutes": {
          "R1": [
            {"id":"R1.route1","dst":"10.3.0.0","prefix":24,"via":"192.168.0.2","hint":"LAN-B1 за R2"},
            {"id":"R1.route2","dst":"10.4.0.0","prefix":24,"via":"192.168.0.2","hint":"LAN-B2 за R2"}
          ],
          "R2": [
            {"id":"R2.route1","dst":"10.1.0.0","prefix":24,"via":"192.168.0.1","hint":"LAN-A1 за R1"},
            {"id":"R2.route2","dst":"10.2.0.0","prefix":24,"via":"192.168.0.1","hint":"LAN-A2 за R1"}
          ]
        },
        "objectives": [
          {"id":"no-default-R1","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R1","justification":"Кожна мережа окремо."},
          {"id":"no-default-R2","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R2","justification":"Кожна мережа окремо."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4"],"justification":"У кожного роутера є два LAN-сегменти. Потрібно знати про всі чужі мережі. Налаштуй маршрути до чужих мереж без default."}
        ],
        "scaffold": {"R1":[{"label":"LAN-B1","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},{"label":"LAN-B2","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}}],"R2":[{"label":"LAN-A1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},{"label":"LAN-A2","needDist":false,"dest":{"kind":"lan","segments":["segment-2"]}}]}
      },
      {
        "id": "defaults",
        "code": "3b",
        "hintQuestionId": "3b",
        "title": "Тупіковий роутер — default в один бік",
        "text": "R1 — тупіковий: один сусід, тож замість переліку чужих LAN йому досить одного маршруту за замовчуванням на R2. R2 у зворотний бік пише конкретні маршрути до LAN-A1 і LAN-A2: другий default назустріч зациклив би весь невідомий трафік.",
        "referenceRoutes": {
          "R1": [{"id":"R1.route1","dst":"0.0.0.0","prefix":0,"via":"192.168.0.2","hint":"Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад."}],
          "R2": [
            {"id":"R2.route1","dst":"10.1.0.0","prefix":24,"via":"192.168.0.1","hint":"LAN-A1 за R1"},
            {"id":"R2.route2","dst":"10.2.0.0","prefix":24,"via":"192.168.0.1","hint":"LAN-A2 за R1"}
          ]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4"],"justification":"R1 — тупіковий: один сусід, тож замість переліку чужих LAN йому досить одного маршруту за замовчуванням на R2. R2 у зворотний бік пише конкретні маршрути до LAN-A1 і LAN-A2: другий default назустріч зациклив би весь невідомий трафік."},
          {"id":"default-on-R1","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R1","destination":"198.19.255.254","justification":"Default лише на R1; R2 пише конкретні маршрути назад."},
          {"id":"no-default-R2","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R2","justification":"Default лише на R1; R2 пише конкретні маршрути назад."}
        ],
        "scaffold": {
          "R1": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R2": [{"label":"LAN-A1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},{"label":"LAN-A2","needDist":false,"dest":{"kind":"lan","segments":["segment-2"]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-04",
    "displayNumber": 4,
    "revision": 1,
    "level": 2,
    "title": "Три роутери в ланцюжку",
    "text": "R1-R2-R3 у ряд. Крайні роутери не бачать один одного напряму.",
    "topology": "[LAN1 192.168.1.0/24]--R1--[10.0.0.0/30]--R2--[10.0.0.4/30]--R3--[LAN3 192.168.3.0/24]\n                                        |-- LAN2 192.168.2.0/24",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"LAN1"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.0.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"10.0.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-3","address":{"ip":"10.0.0.5","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R3"},
            {"id":"R2.if3","segmentId":"segment-4","address":{"ip":"192.168.2.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN2"}
          ]
        },
        {
          "id": "R3",
          "kind": "router",
          "interfaces": [
            {"id":"R3.if1","segmentId":"segment-3","address":{"ip":"10.0.0.6","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R2"},
            {"id":"R3.if2","segmentId":"segment-5","address":{"ip":"192.168.3.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN3"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"lan","name":"LAN1"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"link","name":"лінк R2–R3"},
        {"id":"segment-4","kind":"lan","name":"LAN2"},
        {"id":"segment-5","kind":"lan","name":"LAN3"}
      ],
      "endpoints": [
        {"id":"segment-1.host","kind":"host","segmentId":"segment-1","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"192.168.2.2","gateway":"192.168.2.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"192.168.3.2","gateway":"192.168.3.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-1.host","to":"segment-4.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.2.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-1.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-4.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"transit-R1-segment-3","from":"segment-1.host","to":"R2.if2","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.0.4","prefix":30}}},
      {"id":"transit-R3-segment-2","from":"segment-5.host","to":"R1.if2","coverage":{"from":{"dst":"192.168.3.0","prefix":24},"to":{"dst":"10.0.0.0","prefix":30}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R1-segment-3","transit-R3-segment-2"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "4",
        "hintQuestionId": "4",
        "title": "Три роутери в ланцюжку",
        "text": "R1-R2-R3 у ряд. Крайні роутери не бачать один одного напряму.",
        "referenceRoutes": {
          "R1": [
            {"id":"R1.route1","dst":"192.168.2.0","prefix":24,"via":"10.0.0.2","hint":"LAN2 за R2. R2 — найближчий сусід"},
            {"id":"R1.route2","dst":"10.0.0.4","prefix":30,"via":"10.0.0.2","hint":"Лінк R2-R3 — R1 його не бачить, потрібен маршрут"},
            {"id":"R1.route3","dst":"192.168.3.0","prefix":24,"via":"10.0.0.2","hint":"LAN3 за R3. Шлях: R1→R2→R3"}
          ],
          "R2": [
            {"id":"R2.route1","dst":"192.168.1.0","prefix":24,"via":"10.0.0.1","hint":"LAN1 за R1"},
            {"id":"R2.route2","dst":"192.168.3.0","prefix":24,"via":"10.0.0.6","hint":"LAN3 за R3"}
          ],
          "R3": [
            {"id":"R3.route1","dst":"192.168.1.0","prefix":24,"via":"10.0.0.5","hint":"LAN1 за R1. Шлях: R3→R2→R1"},
            {"id":"R3.route2","dst":"192.168.2.0","prefix":24,"via":"10.0.0.5","hint":{"cisco":"LAN2 за R2. Next-hop = R2","routeros":"LAN2 за R2. Gateway = R2"}},
            {"id":"R3.route3","dst":"10.0.0.0","prefix":30,"via":"10.0.0.5","hint":"Лінк R1-R2 — R3 його не бачить"}
          ]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R1-segment-3","transit-R3-segment-2"],"justification":"R1-R2-R3 у ряд. Крайні роутери не бачать один одного напряму."}
        ],
        "scaffold": {
          "R1": [{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},{"label":"лінк R2–R3","needDist":false,"dest":{"kind":"link","segments":["segment-3"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}}],
          "R2": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}}],
          "R3": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},{"label":"лінк R1–R2","needDist":false,"dest":{"kind":"link","segments":["segment-2"]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-05",
    "displayNumber": 5,
    "revision": 1,
    "level": 2,
    "title": "Три роутери + default routes",
    "text": "Використовуй default route там, де це доречно, замість перерахування всіх мереж.",
    "topology": "[Internet]--R1(шлюз)--[10.1.1.0/30]--R2--[10.1.1.4/30]--R3--[LAN 172.20.0.0/24]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.1.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"},
            {"id":"R1.if3","segmentId":"segment-3","address":{"ip":"192.168.10.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN1"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"10.1.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-4","address":{"ip":"10.1.1.5","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R3"},
            {"id":"R2.if3","segmentId":"segment-5","address":{"ip":"192.168.20.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN2"}
          ]
        },
        {
          "id": "R3",
          "kind": "router",
          "interfaces": [
            {"id":"R3.if1","segmentId":"segment-4","address":{"ip":"10.1.1.6","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R2"},
            {"id":"R3.if2","segmentId":"segment-6","address":{"ip":"172.20.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN3"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"lan","name":"LAN1"},
        {"id":"segment-4","kind":"link","name":"лінк R2–R3"},
        {"id":"segment-5","kind":"lan","name":"LAN2"},
        {"id":"segment-6","kind":"lan","name":"LAN3"}
      ],
      "endpoints": [
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"192.168.10.2","gateway":"192.168.10.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"192.168.20.2","gateway":"192.168.20.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"172.20.0.2","gateway":"172.20.0.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R1":[{"id":"dhcp:R1.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-3.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.10.0","prefix":24},"to":{"dst":"192.168.20.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-3.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.10.0","prefix":24},"to":{"dst":"172.20.0.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.20.0","prefix":24},"to":{"dst":"172.20.0.0","prefix":24}}},
      {"id":"transit-R1-segment-4","from":"segment-3.host","to":"R2.if2","coverage":{"from":{"dst":"192.168.10.0","prefix":24},"to":{"dst":"10.1.1.4","prefix":30}}},
      {"id":"internet-1","from":"segment-3.host","to":"internet","coverage":{"from":{"dst":"192.168.10.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-5.host","to":"internet","coverage":{"from":{"dst":"192.168.20.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-6.host","to":"internet","coverage":{"from":{"dst":"172.20.0.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R1-segment-4","internet-1","internet-2","internet-3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "5",
        "hintQuestionId": "5",
        "title": "Три роутери + default routes",
        "text": "Використовуй default route там, де це доречно, замість перерахування всіх мереж.",
        "referenceRoutes": {
          "R1": [
            {"id":"R1.route1","dst":"10.1.1.4","prefix":30,"via":"10.1.1.2","hint":"Лінк R2-R3 — потрібен, щоб відповісти R3"},
            {"id":"R1.route2","dst":"192.168.20.0","prefix":24,"via":"10.1.1.2","hint":"LAN2 за R2"},
            {"id":"R1.route3","dst":"172.20.0.0","prefix":24,"via":"10.1.1.2","hint":"LAN3 за R3, через R2"}
          ],
          "R2": [
            {"id":"R2.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.1.1","hint":"Default: все невідоме → R1 → інтернет"},
            {"id":"R2.route2","dst":"172.20.0.0","prefix":24,"via":"10.1.1.6","hint":"LAN3 за R3"}
          ],
          "R3": [{"id":"R3.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.1.5","hint":"Default: все через R2, R2 знає далі"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R1-segment-4","internet-1","internet-2","internet-3"],"justification":"Використовуй default route там, де це доречно, замість перерахування всіх мереж."}
        ],
        "scaffold": {
          "R1": [{"label":"лінк R2–R3","needDist":false,"dest":{"kind":"link","segments":["segment-4"]}},{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}}],
          "R2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}}],
          "R3": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-06",
    "displayNumber": 6,
    "revision": 1,
    "level": 2,
    "title": "Сумаризація маршрутів",
    "text": "За R2 знаходяться дві мережі: 10.10.0.0/24 та 10.10.1.0/24. Об’єднай в один сумарний маршрут /23.",
    "topology": "[LAN 192.168.1.0/24]--R1--[172.16.0.0/30]--R2--[LAN-A 10.10.0.0/24]\n                                                      |--[LAN-B 10.10.1.0/24]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"LAN"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"172.16.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"172.16.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-3","address":{"ip":"10.10.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-A"},
            {"id":"R2.if3","segmentId":"segment-4","address":{"ip":"10.10.1.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN-B"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"lan","name":"LAN"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"lan","name":"LAN-A"},
        {"id":"segment-4","kind":"lan","name":"LAN-B"}
      ],
      "endpoints": [
        {"id":"segment-1.host","kind":"host","segmentId":"segment-1","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"10.10.0.2","gateway":"10.10.0.1"},
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"10.10.1.2","gateway":"10.10.1.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-1.host","to":"segment-3.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.10.0.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-1.host","to":"segment-4.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.10.1.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-3.host","to":"segment-4.host","coverage":{"from":{"dst":"10.10.0.0","prefix":24},"to":{"dst":"10.10.1.0","prefix":24}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "6",
        "hintQuestionId": "6",
        "title": "Сумаризація маршрутів",
        "text": "За R2 знаходяться дві мережі: 10.10.0.0/24 та 10.10.1.0/24. Об’єднай в один сумарний маршрут /23.",
        "referenceRoutes": {
          "R1": [{"id":"R1.route1","dst":"10.10.0.0","prefix":23,"via":"172.16.0.2","hint":"Сумуємо 10.10.0.0/24 + 10.10.1.0/24 в одну мережу /23."}],
          "R2": [{"id":"R2.route1","dst":"192.168.1.0","prefix":24,"via":"172.16.0.1","hint":"LAN за R1"}]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3"],"justification":"За R2 знаходяться дві мережі: 10.10.0.0/24 та 10.10.1.0/24. Об’єднай в один сумарний маршрут /23."},
          {"id":"summary-R1","type":"summary","severity":"blocks","scenarioId":null,"routerId":"R1","dst":"10.10.0.0","prefix":23,"destinations":[{"dst":"10.10.0.0","prefix":24},{"dst":"10.10.1.0","prefix":24}],"justification":"Об’єднай в один сумарний маршрут /23."}
        ],
        "scaffold": {"R1":[{"label":"LAN-A, LAN-B одним сумарним маршрутом","needDist":false,"dest":{"kind":"summary","segments":["segment-3","segment-4"]}}],"R2":[{"label":"LAN","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}}]}
      }
    ]
  },
  {
    "id": "routing.task-07",
    "displayNumber": 7,
    "revision": 1,
    "level": 2,
    "title": "Зірка — один центральний роутер",
    "text": "R-HUB у центрі, три роутери по краях. Кожен крайній шле все через HUB. HUB відкидає невідомий трафік; default тут не означає доступ до Інтернету.",
    "topology": "R1--[10.0.1.0/30]--R-HUB--[10.0.2.0/30]--R2\n                      |--[10.0.3.0/30]--R3",
    "network": {
      "devices": [
        {
          "id": "R-HUB",
          "kind": "router",
          "interfaces": [
            {"id":"R-HUB.if1","segmentId":"segment-1","address":{"ip":"10.0.1.1","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R-HUB.if2","segmentId":"segment-2","address":{"ip":"10.0.2.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"},
            {"id":"R-HUB.if3","segmentId":"segment-3","address":{"ip":"10.0.3.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→R3"},
            {"id":"R-HUB.if4","segmentId":"segment-4","address":{"ip":"192.168.0.1","prefix":24},"labels":{"cisco":"g0/3","routeros":"ether4"},"note":"LAN-HUB"}
          ]
        },
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"10.0.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→HUB"},
            {"id":"R1.if2","segmentId":"segment-5","address":{"ip":"172.16.1.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN1"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"10.0.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→HUB"},
            {"id":"R2.if2","segmentId":"segment-6","address":{"ip":"172.16.2.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN2"}
          ]
        },
        {
          "id": "R3",
          "kind": "router",
          "interfaces": [
            {"id":"R3.if1","segmentId":"segment-3","address":{"ip":"10.0.3.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→HUB"},
            {"id":"R3.if2","segmentId":"segment-7","address":{"ip":"172.16.3.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN3"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"link","name":"лінк R-HUB–R1"},
        {"id":"segment-2","kind":"link","name":"лінк R-HUB–R2"},
        {"id":"segment-3","kind":"link","name":"лінк R-HUB–R3"},
        {"id":"segment-4","kind":"lan","name":"LAN-HUB"},
        {"id":"segment-5","kind":"lan","name":"LAN1"},
        {"id":"segment-6","kind":"lan","name":"LAN2"},
        {"id":"segment-7","kind":"lan","name":"LAN3"}
      ],
      "endpoints": [
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"192.168.0.2","gateway":"192.168.0.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"172.16.1.2","gateway":"172.16.1.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"172.16.2.2","gateway":"172.16.2.1"},
        {"id":"segment-7.host","kind":"host","segmentId":"segment-7","ip":"172.16.3.2","gateway":"172.16.3.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-4.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":{"dst":"172.16.1.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-4.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":{"dst":"172.16.2.0","prefix":24}}},
      {"id":"lan-1-4","from":"segment-4.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":{"dst":"172.16.3.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"172.16.1.0","prefix":24},"to":{"dst":"172.16.2.0","prefix":24}}},
      {"id":"lan-2-4","from":"segment-5.host","to":"segment-7.host","coverage":{"from":{"dst":"172.16.1.0","prefix":24},"to":{"dst":"172.16.3.0","prefix":24}}},
      {"id":"lan-3-4","from":"segment-6.host","to":"segment-7.host","coverage":{"from":{"dst":"172.16.2.0","prefix":24},"to":{"dst":"172.16.3.0","prefix":24}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "7",
        "hintQuestionId": "7",
        "title": "Зірка — один центральний роутер",
        "text": "R-HUB у центрі, три роутери по краях. Кожен крайній шле все через HUB. HUB відкидає невідомий трафік; default тут не означає доступ до Інтернету.",
        "referenceRoutes": {
          "R-HUB": [
            {"id":"R-HUB.route1","dst":"172.16.1.0","prefix":24,"via":"10.0.1.2","hint":"LAN1 за R1"},
            {"id":"R-HUB.route2","dst":"172.16.2.0","prefix":24,"via":"10.0.2.2","hint":"LAN2 за R2"},
            {"id":"R-HUB.route3","dst":"172.16.3.0","prefix":24,"via":"10.0.3.2","hint":"LAN3 за R3"}
          ],
          "R1": [{"id":"R1.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.1.1","hint":"Все невідоме → HUB"}],
          "R2": [{"id":"R2.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.2.1","hint":"Все невідоме → HUB"}],
          "R3": [{"id":"R3.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.3.1","hint":"Все невідоме → HUB"}]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4"],"justification":"R-HUB у центрі, три роутери по краях. Кожен крайній шле все через HUB."},
          {"id":"default-on-R1","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R1","destination":"198.19.255.254","justification":"Кожен крайній шле все через HUB."},
          {"id":"default-on-R2","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R2","destination":"198.19.255.254","justification":"Кожен крайній шле все через HUB."},
          {"id":"default-on-R3","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R3","destination":"198.19.255.254","justification":"Кожен крайній шле все через HUB."}
        ],
        "scaffold": {
          "R-HUB": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}},{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}}],
          "R1": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R3": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-08",
    "displayNumber": 8,
    "revision": 1,
    "level": 3,
    "title": "Чотири роутери в ланцюжку",
    "text": {
      "cisco": "Ланцюг R1-R2-R3-R4. Налаштуй маршрути до чужих мереж без default.",
      "routeros": "R1-R2-R3-R4. Важливо: R1 не бачить мережі за R3 та R4 напряму. Шлях лише через сусіда. Налаштуй маршрути до чужих мереж без default."
    },
    "topology": {
      "cisco": "[LAN1 192.168.1.0/24]--R1--[10.0.0.0/30]--R2--[10.0.0.4/30]--R3--[10.0.0.8/30]--R4--[LAN4 192.168.4.0/24]\n                                       |--LAN2 192.168.2.0/24        |--LAN3 192.168.3.0/24",
      "routeros": "[LAN1]--R1--[10.0.0.0/30]--R2--[10.0.0.4/30]--R3--[10.0.0.8/30]--R4--[LAN4]"
    },
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"LAN1"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.0.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"10.0.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-3","address":{"ip":"10.0.0.5","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R3"},
            {"id":"R2.if3","segmentId":"segment-4","address":{"ip":"192.168.2.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN2"}
          ]
        },
        {
          "id": "R3",
          "kind": "router",
          "interfaces": [
            {"id":"R3.if1","segmentId":"segment-3","address":{"ip":"10.0.0.6","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R2"},
            {"id":"R3.if2","segmentId":"segment-5","address":{"ip":"10.0.0.9","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R4"},
            {"id":"R3.if3","segmentId":"segment-6","address":{"ip":"192.168.3.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN3"}
          ]
        },
        {
          "id": "R4",
          "kind": "router",
          "interfaces": [
            {"id":"R4.if1","segmentId":"segment-5","address":{"ip":"10.0.0.10","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R3"},
            {"id":"R4.if2","segmentId":"segment-7","address":{"ip":"192.168.4.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN4"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"lan","name":"LAN1"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"link","name":"лінк R2–R3"},
        {"id":"segment-4","kind":"lan","name":"LAN2"},
        {"id":"segment-5","kind":"link","name":"лінк R3–R4"},
        {"id":"segment-6","kind":"lan","name":"LAN3"},
        {"id":"segment-7","kind":"lan","name":"LAN4"}
      ],
      "endpoints": [
        {"id":"segment-1.host","kind":"host","segmentId":"segment-1","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"192.168.2.2","gateway":"192.168.2.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"192.168.3.2","gateway":"192.168.3.1"},
        {"id":"segment-7.host","kind":"host","segmentId":"segment-7","ip":"192.168.4.2","gateway":"192.168.4.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-1.host","to":"segment-4.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.2.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-1.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"lan-1-4","from":"segment-1.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.4.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-4.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"lan-2-4","from":"segment-4.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"192.168.4.0","prefix":24}}},
      {"id":"lan-3-4","from":"segment-6.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.3.0","prefix":24},"to":{"dst":"192.168.4.0","prefix":24}}},
      {"id":"transit-R1-segment-3","from":"segment-1.host","to":"R2.if2","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.0.4","prefix":30}}},
      {"id":"transit-R1-segment-5","from":"segment-1.host","to":"R3.if2","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.0.8","prefix":30}}},
      {"id":"transit-R2-segment-5","from":"segment-4.host","to":"R3.if2","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"10.0.0.8","prefix":30}}},
      {"id":"transit-R3-segment-2","from":"segment-6.host","to":"R1.if2","coverage":{"from":{"dst":"192.168.3.0","prefix":24},"to":{"dst":"10.0.0.0","prefix":30}}},
      {"id":"transit-R4-segment-2","from":"segment-7.host","to":"R1.if2","coverage":{"from":{"dst":"192.168.4.0","prefix":24},"to":{"dst":"10.0.0.0","prefix":30}}},
      {"id":"transit-R4-segment-3","from":"segment-7.host","to":"R2.if2","coverage":{"from":{"dst":"192.168.4.0","prefix":24},"to":{"dst":"10.0.0.4","prefix":30}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","transit-R1-segment-3","transit-R1-segment-5","transit-R2-segment-5","transit-R3-segment-2","transit-R4-segment-2","transit-R4-segment-3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "specific",
        "code": "8",
        "hintQuestionId": "8",
        "title": "Чотири роутери в ланцюжку",
        "text": "R1-R2-R3-R4. Важливо: R1 не бачить мережі за R3 та R4 напряму. Шлях лише через сусіда. Налаштуй маршрути до чужих мереж без default.",
        "referenceRoutes": {
          "R1": [
            {"id":"R1.route1","dst":"192.168.2.0","prefix":24,"via":"10.0.0.2","hint":"LAN2 за R2"},
            {"id":"R1.route2","dst":"10.0.0.4","prefix":30,"via":"10.0.0.2","hint":"Лінк R2-R3"},
            {"id":"R1.route3","dst":"192.168.3.0","prefix":24,"via":"10.0.0.2","hint":"LAN3 через R2→R3"},
            {"id":"R1.route4","dst":"10.0.0.8","prefix":30,"via":"10.0.0.2","hint":"Лінк R3-R4"},
            {"id":"R1.route5","dst":"192.168.4.0","prefix":24,"via":"10.0.0.2","hint":"LAN4 через R2→R3→R4"}
          ],
          "R2": [
            {"id":"R2.route1","dst":"192.168.1.0","prefix":24,"via":"10.0.0.1","hint":"LAN1 за R1"},
            {"id":"R2.route2","dst":"192.168.3.0","prefix":24,"via":"10.0.0.6","hint":"LAN3 за R3"},
            {"id":"R2.route3","dst":"10.0.0.8","prefix":30,"via":"10.0.0.6","hint":"Лінк R3-R4"},
            {"id":"R2.route4","dst":"192.168.4.0","prefix":24,"via":"10.0.0.6","hint":"LAN4 через R3→R4"}
          ],
          "R3": [
            {"id":"R3.route1","dst":"192.168.4.0","prefix":24,"via":"10.0.0.10","hint":"LAN4 за R4"},
            {"id":"R3.route2","dst":"192.168.2.0","prefix":24,"via":"10.0.0.5","hint":"LAN2 за R2"},
            {"id":"R3.route3","dst":"10.0.0.0","prefix":30,"via":"10.0.0.5","hint":"Лінк R1-R2"},
            {"id":"R3.route4","dst":"192.168.1.0","prefix":24,"via":"10.0.0.5","hint":"LAN1 через R2→R1"}
          ],
          "R4": [
            {"id":"R4.route1","dst":"192.168.1.0","prefix":24,"via":"10.0.0.9","hint":"LAN1 через R3→R2→R1"},
            {"id":"R4.route2","dst":"192.168.2.0","prefix":24,"via":"10.0.0.9","hint":"LAN2 через R3→R2"},
            {"id":"R4.route3","dst":"192.168.3.0","prefix":24,"via":"10.0.0.9","hint":"LAN3 за R3"},
            {"id":"R4.route4","dst":"10.0.0.0","prefix":30,"via":"10.0.0.9","hint":"Лінк R1-R2"},
            {"id":"R4.route5","dst":"10.0.0.4","prefix":30,"via":"10.0.0.9","hint":"Лінк R2-R3"}
          ]
        },
        "objectives": [
          {"id":"no-default-R1","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R1","justification":"Кожна мережа окремо."},
          {"id":"no-default-R2","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R2","justification":"Кожна мережа окремо."},
          {"id":"no-default-R3","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R3","justification":"Кожна мережа окремо."},
          {"id":"no-default-R4","type":"no-default","severity":"blocks","scenarioId":null,"routerId":"R4","justification":"Кожна мережа окремо."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","transit-R1-segment-3","transit-R1-segment-5","transit-R2-segment-5","transit-R3-segment-2","transit-R4-segment-2","transit-R4-segment-3"],"justification":"R1-R2-R3-R4. Важливо: R1 не бачить мережі за R3 та R4 напряму. Шлях лише через сусіда. Налаштуй маршрути до чужих мереж без default."}
        ],
        "scaffold": {
          "R1": [
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},
            {"label":"лінк R2–R3","needDist":false,"dest":{"kind":"link","segments":["segment-3"]}},
            {"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}},
            {"label":"лінк R3–R4","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},
            {"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}}
          ],
          "R2": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}},{"label":"лінк R3–R4","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},{"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}}],
          "R3": [{"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}},{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},{"label":"лінк R1–R2","needDist":false,"dest":{"kind":"link","segments":["segment-2"]}},{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}}],
          "R4": [
            {"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},
            {"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}},
            {"label":"лінк R1–R2","needDist":false,"dest":{"kind":"link","segments":["segment-2"]}},
            {"label":"лінк R2–R3","needDist":false,"dest":{"kind":"link","segments":["segment-3"]}}
          ]
        }
      },
      {
        "id": "stub-defaults",
        "code": "8b",
        "hintQuestionId": "8b",
        "title": "Чотири роутери в ланцюжку",
        "text": "Ланцюг R1-R2-R3-R4. R1 і R4 — тупікові. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад. R2 і R3 — транзитні: мають знати мережі в обидва боки.",
        "referenceRoutes": {
          "R1": [{"id":"R1.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.2","hint":"Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад."}],
          "R2": [
            {"id":"R2.route1","dst":"192.168.1.0","prefix":24,"via":"10.0.0.1","hint":"LAN1 за R1"},
            {"id":"R2.route2","dst":"192.168.3.0","prefix":24,"via":"10.0.0.6","hint":"LAN3 за R3"},
            {"id":"R2.route3","dst":"10.0.0.8","prefix":30,"via":"10.0.0.6","hint":"Лінк R3-R4"},
            {"id":"R2.route4","dst":"192.168.4.0","prefix":24,"via":"10.0.0.6","hint":"LAN4 через R3→R4"}
          ],
          "R3": [
            {"id":"R3.route1","dst":"192.168.4.0","prefix":24,"via":"10.0.0.10","hint":"LAN4 за R4"},
            {"id":"R3.route2","dst":"192.168.2.0","prefix":24,"via":"10.0.0.5","hint":"LAN2 за R2"},
            {"id":"R3.route3","dst":"10.0.0.0","prefix":30,"via":"10.0.0.5","hint":"Лінк R1-R2"},
            {"id":"R3.route4","dst":"192.168.1.0","prefix":24,"via":"10.0.0.5","hint":"LAN1 через R2→R1"}
          ],
          "R4": [{"id":"R4.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.9","hint":"Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад."}]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","transit-R1-segment-3","transit-R1-segment-5","transit-R2-segment-5","transit-R3-segment-2","transit-R4-segment-2","transit-R4-segment-3"],"justification":"Ланцюг R1-R2-R3-R4. R1 і R4 — тупікові. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад. R2 і R3 — транзитні: мають знати мережі в обидва боки."},
          {"id":"default-on-R1","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R1","destination":"198.19.255.254","justification":"R1 і R4 — тупікові. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад."},
          {"id":"default-on-R4","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R4","destination":"198.19.255.254","justification":"R1 і R4 — тупікові. Default спрямовує невідомий трафік вгору. Перевір, що сусід не повертає його назад."}
        ],
        "scaffold": {
          "R1": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R2": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}},{"label":"лінк R3–R4","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},{"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}}],
          "R3": [{"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}},{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-4"]}},{"label":"лінк R1–R2","needDist":false,"dest":{"kind":"link","segments":["segment-2"]}},{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}}],
          "R4": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-09",
    "displayNumber": 9,
    "revision": 1,
    "level": 3,
    "title": "Чотири роутери + default routes оптимально",
    "text": "Той самий ланцюжок, але використовуй default route на крайніх роутерах, щоб скоротити таблиці. R1 уже отримує default від провайдера й зберігає маршрути до внутрішніх мереж.",
    "topology": "[Internet]--R1--[10.0.0.0/30]--R2--[10.0.0.4/30]--R3--[10.0.0.8/30]--R4--[LAN4 192.168.4.0/24]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.0.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"},
            {"id":"R1.if3","segmentId":"segment-3","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN1"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"10.0.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-4","address":{"ip":"10.0.0.5","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R3"},
            {"id":"R2.if3","segmentId":"segment-5","address":{"ip":"192.168.2.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN2"}
          ]
        },
        {
          "id": "R3",
          "kind": "router",
          "interfaces": [
            {"id":"R3.if1","segmentId":"segment-4","address":{"ip":"10.0.0.6","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R2"},
            {"id":"R3.if2","segmentId":"segment-6","address":{"ip":"10.0.0.9","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R4"},
            {"id":"R3.if3","segmentId":"segment-7","address":{"ip":"192.168.3.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN3"}
          ]
        },
        {
          "id": "R4",
          "kind": "router",
          "interfaces": [
            {"id":"R4.if1","segmentId":"segment-6","address":{"ip":"10.0.0.10","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R3"},
            {"id":"R4.if2","segmentId":"segment-8","address":{"ip":"192.168.4.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN4"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"lan","name":"LAN1"},
        {"id":"segment-4","kind":"link","name":"лінк R2–R3"},
        {"id":"segment-5","kind":"lan","name":"LAN2"},
        {"id":"segment-6","kind":"link","name":"лінк R3–R4"},
        {"id":"segment-7","kind":"lan","name":"LAN3"},
        {"id":"segment-8","kind":"lan","name":"LAN4"}
      ],
      "endpoints": [
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"192.168.2.2","gateway":"192.168.2.1"},
        {"id":"segment-7.host","kind":"host","segmentId":"segment-7","ip":"192.168.3.2","gateway":"192.168.3.1"},
        {"id":"segment-8.host","kind":"host","segmentId":"segment-8","ip":"192.168.4.2","gateway":"192.168.4.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R1":[{"id":"dhcp:R1.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-3.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.2.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-3.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"lan-1-4","from":"segment-3.host","to":"segment-8.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.4.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-5.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"lan-2-4","from":"segment-5.host","to":"segment-8.host","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"192.168.4.0","prefix":24}}},
      {"id":"lan-3-4","from":"segment-7.host","to":"segment-8.host","coverage":{"from":{"dst":"192.168.3.0","prefix":24},"to":{"dst":"192.168.4.0","prefix":24}}},
      {"id":"transit-R1-segment-4","from":"segment-3.host","to":"R2.if2","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.0.4","prefix":30}}},
      {"id":"transit-R1-segment-6","from":"segment-3.host","to":"R3.if2","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.0.8","prefix":30}}},
      {"id":"transit-R2-segment-6","from":"segment-5.host","to":"R3.if2","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"10.0.0.8","prefix":30}}},
      {"id":"internet-1","from":"segment-3.host","to":"internet","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-5.host","to":"internet","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-7.host","to":"internet","coverage":{"from":{"dst":"192.168.3.0","prefix":24},"to":null}},
      {"id":"internet-4","from":"segment-8.host","to":"internet","coverage":{"from":{"dst":"192.168.4.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","transit-R1-segment-4","transit-R1-segment-6","transit-R2-segment-6","internet-1","internet-2","internet-3","internet-4"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "9",
        "hintQuestionId": "9",
        "title": "Чотири роутери + default routes оптимально",
        "text": "Той самий ланцюжок, але використовуй default route на крайніх роутерах, щоб скоротити таблиці. R1 уже отримує default від провайдера й зберігає маршрути до внутрішніх мереж.",
        "referenceRoutes": {
          "R1": [
            {"id":"R1.route1","dst":"10.0.0.4","prefix":30,"via":"10.0.0.2","hint":"Лінк R2-R3"},
            {"id":"R1.route2","dst":"10.0.0.8","prefix":30,"via":"10.0.0.2","hint":"Лінк R3-R4"},
            {"id":"R1.route3","dst":"192.168.2.0","prefix":24,"via":"10.0.0.2","hint":"LAN2"},
            {"id":"R1.route4","dst":"192.168.3.0","prefix":24,"via":"10.0.0.2","hint":"LAN3"},
            {"id":"R1.route5","dst":"192.168.4.0","prefix":24,"via":"10.0.0.2","hint":"LAN4"}
          ],
          "R2": [
            {"id":"R2.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.1","hint":"Default → R1 → інтернет"},
            {"id":"R2.route2","dst":"192.168.3.0","prefix":24,"via":"10.0.0.6","hint":"LAN3 за R3"},
            {"id":"R2.route3","dst":"10.0.0.8","prefix":30,"via":"10.0.0.6","hint":"Лінк R3-R4"},
            {"id":"R2.route4","dst":"192.168.4.0","prefix":24,"via":"10.0.0.6","hint":"LAN4 через R3"}
          ],
          "R3": [
            {"id":"R3.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.5","hint":"Default → R2 → R1 → інтернет"},
            {"id":"R3.route2","dst":"192.168.4.0","prefix":24,"via":"10.0.0.10","hint":"LAN4 за R4"}
          ],
          "R4": [{"id":"R4.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.9","hint":"Default → все через R3"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3","internet-4"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","transit-R1-segment-4","transit-R1-segment-6","transit-R2-segment-6","internet-1","internet-2","internet-3","internet-4"],"justification":"Той самий ланцюжок, але використовуй default route на крайніх роутерах, щоб скоротити таблиці."}
        ],
        "scaffold": {
          "R1": [
            {"label":"лінк R2–R3","needDist":false,"dest":{"kind":"link","segments":["segment-4"]}},
            {"label":"лінк R3–R4","needDist":false,"dest":{"kind":"link","segments":["segment-6"]}},
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}},
            {"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}},
            {"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}}
          ],
          "R2": [
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},
            {"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}},
            {"label":"лінк R3–R4","needDist":false,"dest":{"kind":"link","segments":["segment-6"]}},
            {"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}}
          ],
          "R3": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},{"label":"LAN4","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}}],
          "R4": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-10",
    "displayNumber": 10,
    "revision": 1,
    "level": 3,
    "title": "Три роутери — трикутник",
    "text": {
      "cisco": "R1, R2, R3 з'єднані по колу. До чужої LAN обирай сусіда, якому вона належить (прямий лінк). Лінк між двома іншими роутерами — через будь-якого з них.",
      "routeros": "R1, R2, R3 з'єднані по колу. До чужої LAN обирай сусіда, якому вона належить (прямий лінк). Лінк між двома іншими роутерами — через будь-якого з них."
    },
    "topology": {
      "cisco": "        R1 [LAN1 192.168.1.0/24]\n       /  \\\n 10.1.0.0/30  10.2.0.0/30\n     /        \\\n    R2──10.3.0.0/30──R3\n [LAN2 192.168.2.0/24]  [LAN3 192.168.3.0/24]",
      "routeros": "R1--[10.1.0.0/30]--R2\n|                    |\n[10.2.0.0/30]   [10.3.0.0/30]\n|                    |\nR3──────────────────┘"
    },
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"10.1.0.1","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R2"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"10.2.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R3"},
            {"id":"R1.if3","segmentId":"segment-3","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN1"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-1","address":{"ip":"10.1.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-4","address":{"ip":"10.3.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R3"},
            {"id":"R2.if3","segmentId":"segment-5","address":{"ip":"192.168.2.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN2"}
          ]
        },
        {
          "id": "R3",
          "kind": "router",
          "interfaces": [
            {"id":"R3.if1","segmentId":"segment-2","address":{"ip":"10.2.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R3.if2","segmentId":"segment-4","address":{"ip":"10.3.0.2","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"},
            {"id":"R3.if3","segmentId":"segment-6","address":{"ip":"192.168.3.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN3"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R3"},
        {"id":"segment-3","kind":"lan","name":"LAN1"},
        {"id":"segment-4","kind":"link","name":"лінк R2–R3"},
        {"id":"segment-5","kind":"lan","name":"LAN2"},
        {"id":"segment-6","kind":"lan","name":"LAN3"}
      ],
      "endpoints": [
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"192.168.2.2","gateway":"192.168.2.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"192.168.3.2","gateway":"192.168.3.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-3.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.2.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-3.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"192.168.3.0","prefix":24}}},
      {"id":"transit-R1","from":"segment-3.host","to":"10.3.0.1","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.3.0.0","prefix":30}}},
      {"id":"transit-R2","from":"segment-5.host","to":"10.2.0.1","coverage":{"from":{"dst":"192.168.2.0","prefix":24},"to":{"dst":"10.2.0.0","prefix":30}}},
      {"id":"transit-R3","from":"segment-6.host","to":"10.1.0.1","coverage":{"from":{"dst":"192.168.3.0","prefix":24},"to":{"dst":"10.1.0.0","prefix":30}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R1","transit-R2","transit-R3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "10",
        "hintQuestionId": "10",
        "title": "Три роутери — трикутник",
        "text": {
          "cisco": "R1, R2, R3 з'єднані по колу. До чужої LAN обирай сусіда, якому вона належить (прямий лінк). Лінк між двома іншими роутерами — через будь-якого з них.",
          "routeros": "R1, R2, R3 з'єднані по колу. До чужої LAN обирай сусіда, якому вона належить (прямий лінк). Лінк між двома іншими роутерами — через будь-якого з них."
        },
        "referenceRoutes": {
          "R1": [
            {"id":"R1.route1","dst":"192.168.2.0","prefix":24,"via":"10.1.0.2","hint":"LAN2 через R2 (прямий лінк)"},
            {"id":"R1.route2","dst":"10.3.0.0","prefix":30,"via":"10.1.0.2","alternatives":["10.2.0.2"],"hint":"Лінк R2-R3 — можна через R2"},
            {"id":"R1.route3","dst":"192.168.3.0","prefix":24,"via":"10.2.0.2","hint":"LAN3 через R3 (прямий лінк)"}
          ],
          "R2": [
            {"id":"R2.route1","dst":"192.168.1.0","prefix":24,"via":"10.1.0.1","hint":"LAN1 через R1 (прямий лінк)"},
            {"id":"R2.route2","dst":"10.2.0.0","prefix":30,"via":"10.1.0.1","alternatives":["10.3.0.2"],"hint":"Лінк R1-R3"},
            {"id":"R2.route3","dst":"192.168.3.0","prefix":24,"via":"10.3.0.2","hint":"LAN3 через R3 (прямий лінк)"}
          ],
          "R3": [
            {"id":"R3.route1","dst":"192.168.1.0","prefix":24,"via":"10.2.0.1","hint":"LAN1 через R1 (прямий лінк)"},
            {"id":"R3.route2","dst":"10.1.0.0","prefix":30,"via":"10.2.0.1","alternatives":["10.3.0.1"],"hint":"Лінк R1-R2"},
            {"id":"R3.route3","dst":"192.168.2.0","prefix":24,"via":"10.3.0.1","hint":"LAN2 через R2 (прямий лінк)"}
          ]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R1","transit-R2","transit-R3"],"justification":"R1, R2, R3 з'єднані по колу. До чужої LAN обирай сусіда, якому вона належить (прямий лінк). Лінк між двома іншими роутерами — через будь-якого з них."},
          {"id":"direct-neighbour-R1","type":"direct-neighbour","severity":"blocks","scenarioId":null,"routerId":"R1","destinations":[{"dst":"192.168.2.0","prefix":24,"deviceId":"R2"},{"dst":"192.168.3.0","prefix":24,"deviceId":"R3"}],"justification":"До чужої LAN обирай сусіда, якому вона належить (прямий лінк)."},
          {"id":"direct-neighbour-R2","type":"direct-neighbour","severity":"blocks","scenarioId":null,"routerId":"R2","destinations":[{"dst":"192.168.1.0","prefix":24,"deviceId":"R1"},{"dst":"192.168.3.0","prefix":24,"deviceId":"R3"}],"justification":"До чужої LAN обирай сусіда, якому вона належить (прямий лінк)."},
          {"id":"direct-neighbour-R3","type":"direct-neighbour","severity":"blocks","scenarioId":null,"routerId":"R3","destinations":[{"dst":"192.168.1.0","prefix":24,"deviceId":"R1"},{"dst":"192.168.2.0","prefix":24,"deviceId":"R2"}],"justification":"До чужої LAN обирай сусіда, якому вона належить (прямий лінк)."}
        ],
        "scaffold": {
          "R1": [{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}},{"label":"лінк R2–R3","needDist":false,"dest":{"kind":"link","segments":["segment-4"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}}],
          "R2": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-3"]}},{"label":"лінк R1–R3","needDist":false,"dest":{"kind":"link","segments":["segment-2"]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}}],
          "R3": [{"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-3"]}},{"label":"лінк R1–R2","needDist":false,"dest":{"kind":"link","segments":["segment-1"]}},{"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-11",
    "displayNumber": 11,
    "revision": 1,
    "level": 4,
    "title": {"cisco":"Зірка: шлюз + 3 філії (NAT на GW)","routeros":"Чотири роутери + NAT на шлюзі"},
    "text": {
      "cisco": "Зірка: R-GW у центрі з інтернетом, 3 філії. Кожна філія — default route на GW; GW — маршрути до LAN кожної філії.",
      "routeros": "Зірка: R-GW у центрі з інтернетом, 3 філії. Кожна філія — default route на GW; GW — маршрути до LAN кожної філії."
    },
    "topology": {
      "cisco": "[Internet]\n    |\n  R-GW ──10.10.1.0/30── R-A ─ [LAN-A 10.20.1.0/24]\n    ├────10.10.2.0/30── R-B ─ [LAN-B 10.20.2.0/24]\n    └────10.10.3.0/30── R-C ─ [LAN-C 10.20.3.0/24]",
      "routeros": "[Internet]--R-GW--+--[10.10.1.0/30]--R-A--[LAN-A 10.20.1.0/24]\n              +--[10.10.2.0/30]--R-B--[LAN-B 10.20.2.0/24]\n              +--[10.10.3.0/30]--R-C--[LAN-C 10.20.3.0/24]"
    },
    "network": {
      "devices": [
        {
          "id": "R-GW",
          "kind": "router",
          "interfaces": [
            {"id":"R-GW.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R-GW.if2","segmentId":"segment-2","address":{"ip":"10.10.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R-A"},
            {"id":"R-GW.if3","segmentId":"segment-3","address":{"ip":"10.10.2.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→R-B"},
            {"id":"R-GW.if4","segmentId":"segment-4","address":{"ip":"10.10.3.1","prefix":30},"labels":{"cisco":"g0/3","routeros":"ether4"},"note":"→R-C"}
          ]
        },
        {
          "id": "R-A",
          "kind": "router",
          "interfaces": [
            {"id":"R-A.if1","segmentId":"segment-2","address":{"ip":"10.10.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→GW"},
            {"id":"R-A.if2","segmentId":"segment-5","address":{"ip":"10.20.1.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-A"}
          ]
        },
        {
          "id": "R-B",
          "kind": "router",
          "interfaces": [
            {"id":"R-B.if1","segmentId":"segment-3","address":{"ip":"10.10.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→GW"},
            {"id":"R-B.if2","segmentId":"segment-6","address":{"ip":"10.20.2.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-B"}
          ]
        },
        {
          "id": "R-C",
          "kind": "router",
          "interfaces": [
            {"id":"R-C.if1","segmentId":"segment-4","address":{"ip":"10.10.3.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→GW"},
            {"id":"R-C.if2","segmentId":"segment-7","address":{"ip":"10.20.3.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN-C"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R-GW–R-A"},
        {"id":"segment-3","kind":"link","name":"лінк R-GW–R-B"},
        {"id":"segment-4","kind":"link","name":"лінк R-GW–R-C"},
        {"id":"segment-5","kind":"lan","name":"LAN-A"},
        {"id":"segment-6","kind":"lan","name":"LAN-B"},
        {"id":"segment-7","kind":"lan","name":"LAN-C"}
      ],
      "endpoints": [
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"10.20.1.2","gateway":"10.20.1.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"10.20.2.2","gateway":"10.20.2.1"},
        {"id":"segment-7.host","kind":"host","segmentId":"segment-7","ip":"10.20.3.2","gateway":"10.20.3.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R-GW":[{"id":"dhcp:R-GW.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"10.20.1.0","prefix":24},"to":{"dst":"10.20.2.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-5.host","to":"segment-7.host","coverage":{"from":{"dst":"10.20.1.0","prefix":24},"to":{"dst":"10.20.3.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-6.host","to":"segment-7.host","coverage":{"from":{"dst":"10.20.2.0","prefix":24},"to":{"dst":"10.20.3.0","prefix":24}}},
      {"id":"internet-1","from":"segment-5.host","to":"internet","coverage":{"from":{"dst":"10.20.1.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-6.host","to":"internet","coverage":{"from":{"dst":"10.20.2.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-7.host","to":"internet","coverage":{"from":{"dst":"10.20.3.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","internet-1","internet-2","internet-3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "11",
        "hintQuestionId": "11",
        "title": {"cisco":"Зірка: шлюз + 3 філії (NAT на GW)","routeros":"Чотири роутери + NAT на шлюзі"},
        "text": {
          "cisco": "Зірка: R-GW у центрі з інтернетом, 3 філії. Кожна філія — default route на GW; GW — маршрути до LAN кожної філії.",
          "routeros": "Зірка: R-GW у центрі з інтернетом, 3 філії. Кожна філія — default route на GW; GW — маршрути до LAN кожної філії."
        },
        "referenceRoutes": {
          "R-GW": [
            {"id":"R-GW.route1","dst":"10.20.1.0","prefix":24,"via":"10.10.1.2","hint":"LAN-A за R-A"},
            {"id":"R-GW.route2","dst":"10.20.2.0","prefix":24,"via":"10.10.2.2","hint":"LAN-B за R-B"},
            {"id":"R-GW.route3","dst":"10.20.3.0","prefix":24,"via":"10.10.3.2","hint":"LAN-C за R-C"}
          ],
          "R-A": [{"id":"R-A.route1","dst":"0.0.0.0","prefix":0,"via":"10.10.1.1","hint":"Default → GW"}],
          "R-B": [{"id":"R-B.route1","dst":"0.0.0.0","prefix":0,"via":"10.10.2.1","hint":"Default → GW"}],
          "R-C": [{"id":"R-C.route1","dst":"0.0.0.0","prefix":0,"via":"10.10.3.1","hint":"Default → GW"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","internet-1","internet-2","internet-3"],"justification":"Зірка: R-GW у центрі з інтернетом, 3 філії. Кожна філія — default route на GW; GW — маршрути до LAN кожної філії."},
          {"id":"default-on-R-A","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R-A","destination":"198.19.255.254","justification":"Кожна філія — default route на GW; GW — маршрути до LAN кожної філії."},
          {"id":"default-on-R-B","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R-B","destination":"198.19.255.254","justification":"Кожна філія — default route на GW; GW — маршрути до LAN кожної філії."},
          {"id":"default-on-R-C","type":"default-on","severity":"blocks","scenarioId":null,"routerId":"R-C","destination":"198.19.255.254","justification":"Кожна філія — default route на GW; GW — маршрути до LAN кожної філії."}
        ],
        "scaffold": {
          "R-GW": [{"label":"LAN-A","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}},{"label":"LAN-B","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}},{"label":"LAN-C","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}}],
          "R-A": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-B": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-C": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-12",
    "displayNumber": 12,
    "revision": 1,
    "level": 4,
    "title": "Два офіси + спільний сервер",
    "text": "Офіс А та офіс Б не зв'язані напряму. Обидва ходять через R-CORE. На R-CORE висить серверна мережа. R-CORE має вихід в Інтернет; забезпеч доступ з офісів і серверної мережі.",
    "topology": "R-A--[10.0.1.0/30]--R-CORE--[10.0.2.0/30]--R-B\n                        |\n               [Servers 10.100.0.0/24]",
    "network": {
      "devices": [
        {
          "id": "R-CORE",
          "kind": "router",
          "interfaces": [
            {"id":"R-CORE.if1","segmentId":"segment-1","address":{"ip":"10.0.1.1","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R-A"},
            {"id":"R-CORE.if2","segmentId":"segment-2","address":{"ip":"10.0.2.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R-B"},
            {"id":"R-CORE.if3","segmentId":"segment-3","address":{"ip":"10.100.0.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"Servers"},
            {"id":"R-CORE.if4","segmentId":"segment-4","address":null,"dhcp":true,"labels":{"cisco":"g0/3","routeros":"ether4"},"note":"WAN"}
          ]
        },
        {
          "id": "R-A",
          "kind": "router",
          "interfaces": [
            {"id":"R-A.if1","segmentId":"segment-1","address":{"ip":"10.0.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→CORE"},
            {"id":"R-A.if2","segmentId":"segment-5","address":{"ip":"192.168.10.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"Office-A"}
          ]
        },
        {
          "id": "R-B",
          "kind": "router",
          "interfaces": [
            {"id":"R-B.if1","segmentId":"segment-2","address":{"ip":"10.0.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→CORE"},
            {"id":"R-B.if2","segmentId":"segment-6","address":{"ip":"192.168.20.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"Office-B"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-4","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"link","name":"лінк R-CORE–R-A"},
        {"id":"segment-2","kind":"link","name":"лінк R-CORE–R-B"},
        {"id":"segment-3","kind":"server","name":"Servers"},
        {"id":"segment-4","kind":"wan","name":"WAN"},
        {"id":"segment-5","kind":"lan","name":"Office-A"},
        {"id":"segment-6","kind":"lan","name":"Office-B"}
      ],
      "endpoints": [
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"10.100.0.2","gateway":"10.100.0.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"192.168.10.2","gateway":"192.168.10.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"192.168.20.2","gateway":"192.168.20.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R-CORE":[{"id":"dhcp:R-CORE.if4","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-3.host","to":"segment-5.host","coverage":{"from":{"dst":"10.100.0.0","prefix":24},"to":{"dst":"192.168.10.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-3.host","to":"segment-6.host","coverage":{"from":{"dst":"10.100.0.0","prefix":24},"to":{"dst":"192.168.20.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.10.0","prefix":24},"to":{"dst":"192.168.20.0","prefix":24}}},
      {"id":"internet-1","from":"segment-3.host","to":"internet","coverage":{"from":{"dst":"10.100.0.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-5.host","to":"internet","coverage":{"from":{"dst":"192.168.10.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-6.host","to":"internet","coverage":{"from":{"dst":"192.168.20.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","internet-1","internet-2","internet-3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "12",
        "hintQuestionId": "12",
        "title": "Два офіси + спільний сервер",
        "text": "Офіс А та офіс Б не зв'язані напряму. Обидва ходять через R-CORE. На R-CORE висить серверна мережа. R-CORE має вихід в Інтернет; забезпеч доступ з офісів і серверної мережі.",
        "referenceRoutes": {
          "R-CORE": [
            {"id":"R-CORE.route1","dst":"192.168.10.0","prefix":24,"via":"10.0.1.2","hint":"Офіс А за R-A"},
            {"id":"R-CORE.route2","dst":"192.168.20.0","prefix":24,"via":"10.0.2.2","hint":"Офіс Б за R-B"}
          ],
          "R-A": [{"id":"R-A.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.1.1","hint":"Default → CORE → інтернет та все інше"}],
          "R-B": [{"id":"R-B.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.2.1","hint":"Default → CORE → інтернет та все інше"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","internet-1","internet-2","internet-3"],"justification":"Офіс А та офіс Б не зв'язані напряму. Обидва ходять через R-CORE. На R-CORE висить серверна мережа."}
        ],
        "scaffold": {
          "R-CORE": [{"label":"Office-A","needDist":false,"dest":{"kind":"lan","segments":["segment-5"]}},{"label":"Office-B","needDist":false,"dest":{"kind":"lan","segments":["segment-6"]}}],
          "R-A": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-B": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-13",
    "displayNumber": 13,
    "revision": 1,
    "level": 4,
    "title": "Сумаризація /22 із чотирьох /24",
    "text": {
      "cisco": "За R2 чотири суміжні мережі /24. Запиши їх одним сумарним маршрутом на R1. R2 у зворотний бік знає лише LAN за R1.",
      "routeros": "За R2 чотири суміжні мережі /24. Запиши їх одним сумарним маршрутом на R1. R2 у зворотний бік знає лише LAN за R1."
    },
    "topology": "[LAN 192.168.1.0/24]--R1--[172.16.0.0/30]--R2--[10.0.0.0/24]\n                                                    |--[10.0.1.0/24]\n                                                    |--[10.0.2.0/24]\n                                                    |--[10.0.3.0/24]",
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"192.168.1.1","prefix":24},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"LAN"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"172.16.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→R2"}
          ]
        },
        {
          "id": "R2",
          "kind": "router",
          "interfaces": [
            {"id":"R2.if1","segmentId":"segment-2","address":{"ip":"172.16.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→R1"},
            {"id":"R2.if2","segmentId":"segment-3","address":{"ip":"10.0.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"VLAN10"},
            {"id":"R2.if3","segmentId":"segment-4","address":{"ip":"10.0.1.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"VLAN20"},
            {"id":"R2.if4","segmentId":"segment-5","address":{"ip":"10.0.2.1","prefix":24},"labels":{"cisco":"g0/3","routeros":"ether4"},"note":"VLAN30"},
            {"id":"R2.if5","segmentId":"segment-6","address":{"ip":"10.0.3.1","prefix":24},"labels":{"cisco":"g0/4","routeros":"ether5"},"note":"VLAN40"}
          ]
        }
      ],
      "segments": [
        {"id":"segment-1","kind":"lan","name":"LAN"},
        {"id":"segment-2","kind":"link","name":"лінк R1–R2"},
        {"id":"segment-3","kind":"lan","name":"VLAN10"},
        {"id":"segment-4","kind":"lan","name":"VLAN20"},
        {"id":"segment-5","kind":"lan","name":"VLAN30"},
        {"id":"segment-6","kind":"lan","name":"VLAN40"}
      ],
      "endpoints": [
        {"id":"segment-1.host","kind":"host","segmentId":"segment-1","ip":"192.168.1.2","gateway":"192.168.1.1"},
        {"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"10.0.0.2","gateway":"10.0.0.1"},
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"10.0.1.2","gateway":"10.0.1.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"10.0.2.2","gateway":"10.0.2.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"10.0.3.2","gateway":"10.0.3.1"}
      ],
      "supplied": {}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-1.host","to":"segment-3.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.0.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-1.host","to":"segment-4.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.1.0","prefix":24}}},
      {"id":"lan-1-4","from":"segment-1.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.2.0","prefix":24}}},
      {"id":"lan-1-5","from":"segment-1.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.1.0","prefix":24},"to":{"dst":"10.0.3.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-3.host","to":"segment-4.host","coverage":{"from":{"dst":"10.0.0.0","prefix":24},"to":{"dst":"10.0.1.0","prefix":24}}},
      {"id":"lan-2-4","from":"segment-3.host","to":"segment-5.host","coverage":{"from":{"dst":"10.0.0.0","prefix":24},"to":{"dst":"10.0.2.0","prefix":24}}},
      {"id":"lan-2-5","from":"segment-3.host","to":"segment-6.host","coverage":{"from":{"dst":"10.0.0.0","prefix":24},"to":{"dst":"10.0.3.0","prefix":24}}},
      {"id":"lan-3-4","from":"segment-4.host","to":"segment-5.host","coverage":{"from":{"dst":"10.0.1.0","prefix":24},"to":{"dst":"10.0.2.0","prefix":24}}},
      {"id":"lan-3-5","from":"segment-4.host","to":"segment-6.host","coverage":{"from":{"dst":"10.0.1.0","prefix":24},"to":{"dst":"10.0.3.0","prefix":24}}},
      {"id":"lan-4-5","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"10.0.2.0","prefix":24},"to":{"dst":"10.0.3.0","prefix":24}}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-1-5","lan-2-3","lan-2-4","lan-2-5","lan-3-4","lan-3-5","lan-4-5"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "13",
        "hintQuestionId": "13",
        "title": "Сумаризація /22 із чотирьох /24",
        "text": {
          "cisco": "За R2 чотири суміжні мережі /24. Запиши їх одним сумарним маршрутом на R1. R2 у зворотний бік знає лише LAN за R1.",
          "routeros": "За R2 чотири суміжні мережі /24. Запиши їх одним сумарним маршрутом на R1. R2 у зворотний бік знає лише LAN за R1."
        },
        "referenceRoutes": {
          "R1": [{"id":"R1.route1","dst":"10.0.0.0","prefix":22,"via":"172.16.0.2","hint":"10.0.0–3.x/24 сумуються в /22"}],
          "R2": [{"id":"R2.route1","dst":"192.168.1.0","prefix":24,"via":"172.16.0.1","hint":"LAN за R1"}]
        },
        "objectives": [
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-1-5","lan-2-3","lan-2-4","lan-2-5","lan-3-4","lan-3-5","lan-4-5"],"justification":"За R2 чотири суміжні мережі /24. Запиши їх одним сумарним маршрутом на R1. R2 у зворотний бік знає лише LAN за R1."},
          {"id":"summary-R1","type":"summary","severity":"blocks","scenarioId":null,"routerId":"R1","dst":"10.0.0.0","prefix":22,"destinations":[{"dst":"10.0.0.0","prefix":24},{"dst":"10.0.1.0","prefix":24},{"dst":"10.0.2.0","prefix":24},{"dst":"10.0.3.0","prefix":24}],"justification":"Запиши їх одним сумарним маршрутом на R1."}
        ],
        "scaffold": {"R1":[{"label":"VLAN10, VLAN20, VLAN30, VLAN40 одним сумарним маршрутом","needDist":false,"dest":{"kind":"summary","segments":["segment-3","segment-4","segment-5","segment-6"]}}],"R2":[{"label":"LAN","needDist":false,"dest":{"kind":"lan","segments":["segment-1"]}}]}
      }
    ]
  },
  {
    "id": "routing.task-14",
    "displayNumber": 14,
    "revision": 1,
    "level": 4,
    "title": "Асиметрична мережа філій",
    "text": "Головний офіс (R-HQ) і дві філії. Філія-1 велика (2 підмережі), Філія-2 маленька.",
    "topology": "[Internet]--R-HQ--[10.1.0.0/30]--R-F1--[LAN-F1a 172.20.0.0/24]\n               |                          |--[LAN-F1b 172.20.1.0/24]\n               [10.2.0.0/30]--R-F2--[LAN-F2 172.30.0.0/24]",
    "network": {
      "devices": [
        {
          "id": "R-HQ",
          "kind": "router",
          "interfaces": [
            {"id":"R-HQ.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R-HQ.if2","segmentId":"segment-2","address":{"ip":"10.1.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→F1"},
            {"id":"R-HQ.if3","segmentId":"segment-3","address":{"ip":"10.2.0.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→F2"},
            {"id":"R-HQ.if4","segmentId":"segment-4","address":{"ip":"192.168.0.1","prefix":24},"labels":{"cisco":"g0/3","routeros":"ether4"},"note":"LAN-HQ"}
          ]
        },
        {
          "id": "R-F1",
          "kind": "router",
          "interfaces": [
            {"id":"R-F1.if1","segmentId":"segment-2","address":{"ip":"10.1.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→HQ"},
            {"id":"R-F1.if2","segmentId":"segment-5","address":{"ip":"172.20.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"F1-a"},
            {"id":"R-F1.if3","segmentId":"segment-6","address":{"ip":"172.20.1.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"F1-b"}
          ]
        },
        {
          "id": "R-F2",
          "kind": "router",
          "interfaces": [
            {"id":"R-F2.if1","segmentId":"segment-3","address":{"ip":"10.2.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→HQ"},
            {"id":"R-F2.if2","segmentId":"segment-7","address":{"ip":"172.30.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"F2"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R-HQ–R-F1"},
        {"id":"segment-3","kind":"link","name":"лінк R-HQ–R-F2"},
        {"id":"segment-4","kind":"lan","name":"LAN-HQ"},
        {"id":"segment-5","kind":"lan","name":"F1-a"},
        {"id":"segment-6","kind":"lan","name":"F1-b"},
        {"id":"segment-7","kind":"lan","name":"F2"}
      ],
      "endpoints": [
        {"id":"segment-4.host","kind":"host","segmentId":"segment-4","ip":"192.168.0.2","gateway":"192.168.0.1"},
        {"id":"segment-5.host","kind":"host","segmentId":"segment-5","ip":"172.20.0.2","gateway":"172.20.0.1"},
        {"id":"segment-6.host","kind":"host","segmentId":"segment-6","ip":"172.20.1.2","gateway":"172.20.1.1"},
        {"id":"segment-7.host","kind":"host","segmentId":"segment-7","ip":"172.30.0.2","gateway":"172.30.0.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R-HQ":[{"id":"dhcp:R-HQ.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-4.host","to":"segment-5.host","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":{"dst":"172.20.0.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-4.host","to":"segment-6.host","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":{"dst":"172.20.1.0","prefix":24}}},
      {"id":"lan-1-4","from":"segment-4.host","to":"segment-7.host","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":{"dst":"172.30.0.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-5.host","to":"segment-6.host","coverage":{"from":{"dst":"172.20.0.0","prefix":24},"to":{"dst":"172.20.1.0","prefix":24}}},
      {"id":"lan-2-4","from":"segment-5.host","to":"segment-7.host","coverage":{"from":{"dst":"172.20.0.0","prefix":24},"to":{"dst":"172.30.0.0","prefix":24}}},
      {"id":"lan-3-4","from":"segment-6.host","to":"segment-7.host","coverage":{"from":{"dst":"172.20.1.0","prefix":24},"to":{"dst":"172.30.0.0","prefix":24}}},
      {"id":"internet-1","from":"segment-4.host","to":"internet","coverage":{"from":{"dst":"192.168.0.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-5.host","to":"internet","coverage":{"from":{"dst":"172.20.0.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-6.host","to":"internet","coverage":{"from":{"dst":"172.20.1.0","prefix":24},"to":null}},
      {"id":"internet-4","from":"segment-7.host","to":"internet","coverage":{"from":{"dst":"172.30.0.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","internet-1","internet-2","internet-3","internet-4"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "14",
        "hintQuestionId": "14",
        "title": "Асиметрична мережа філій",
        "text": "Головний офіс (R-HQ) і дві філії. Філія-1 велика (2 підмережі), Філія-2 маленька.",
        "referenceRoutes": {
          "R-HQ": [
            {"id":"R-HQ.route1","dst":"172.20.0.0","prefix":23,"via":"10.1.0.2","hint":"Обидві LAN Філії-1 сумуються в /23"},
            {"id":"R-HQ.route2","dst":"172.30.0.0","prefix":24,"via":"10.2.0.2","hint":"LAN Філії-2"}
          ],
          "R-F1": [{"id":"R-F1.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.0.1","hint":"Default → HQ → інтернет"}],
          "R-F2": [{"id":"R-F2.route1","dst":"0.0.0.0","prefix":0,"via":"10.2.0.1","hint":"Default → HQ → інтернет"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3","internet-4"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-1-4","lan-2-3","lan-2-4","lan-3-4","internet-1","internet-2","internet-3","internet-4"],"justification":"Головний офіс (R-HQ) і дві філії. Філія-1 велика (2 підмережі), Філія-2 маленька."},
          {"id":"summary-R-HQ","type":"summary","severity":"advice","scenarioId":null,"routerId":"R-HQ","dst":"172.20.0.0","prefix":23,"destinations":[{"dst":"172.20.0.0","prefix":24},{"dst":"172.20.1.0","prefix":24}],"code":"could-summarise","justification":"Філія-1 велика (2 підмережі), Філія-2 маленька."}
        ],
        "scaffold": {
          "R-HQ": [{"label":"F1-a, F1-b одним сумарним маршрутом","suggestion":true,"needDist":false,"dest":{"kind":"summary","segments":["segment-5","segment-6"]}},{"label":"F2","needDist":false,"dest":{"kind":"lan","segments":["segment-7"]}}],
          "R-F1": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-F2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-15",
    "displayNumber": 15,
    "revision": 1,
    "level": 5,
    "title": "Подвійний аплінк — два провайдери",
    "text": {
      "cisco": "Два аплінки: ISP1 основний, ISP2 резервний. Обидва — маршрути за замовчуванням з різною distance: менша = пріоритет. Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254. Distance — останнє число в рядку.",
      "routeros": "Два аплінки: ISP1 основний, ISP2 резервний. Обидва — маршрути за замовчуванням з різною distance: менша = пріоритет. Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254."
    },
    "topology": {
      "cisco": "[ISP1 100.64.1.1] ─g0/0─ R1 ─g0/1─ [ISP2 100.64.2.1]\n                        |g0/2\n                [LAN 192.168.100.0/24]",
      "routeros": "ISP1--ether1--R1--ether2--ISP2\n              ether3--[LAN 192.168.100.0/24]"
    },
    "network": {
      "devices": [
        {
          "id": "R1",
          "kind": "router",
          "interfaces": [
            {"id":"R1.if1","segmentId":"segment-1","address":{"ip":"100.64.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"ISP1 (основний)"},
            {"id":"R1.if2","segmentId":"segment-2","address":{"ip":"100.64.2.2","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"ISP2 (резервний)"},
            {"id":"R1.if3","segmentId":"segment-3","address":{"ip":"192.168.100.1","prefix":24},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"LAN"}
          ]
        },
        {"id":"ISP1","kind":"isp","interfaces":[{"id":"ISP1.wan","segmentId":"segment-1","address":{"ip":"100.64.1.1","prefix":30},"labels":{"cisco":"","routeros":""}}]},
        {"id":"ISP2","kind":"isp","interfaces":[{"id":"ISP2.wan","segmentId":"segment-2","address":{"ip":"100.64.2.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [{"id":"segment-1","kind":"wan","name":"ISP1 (основний)"},{"id":"segment-2","kind":"wan","name":"ISP2 (резервний)"},{"id":"segment-3","kind":"lan","name":"LAN"}],
      "endpoints": [{"id":"segment-3.host","kind":"host","segmentId":"segment-3","ip":"192.168.100.2","gateway":"192.168.100.1"},{"id":"internet","kind":"internet","viaPeers":["ISP1","ISP2"]}],
      "supplied": {}
    },
    "probes": [
      {"id":"internet-1","from":"segment-3.host","to":"internet","coverage":{"from":{"dst":"192.168.100.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["internet-1"]},
      {"id":"isp1-down","title":"Якщо лінк до ISP1 недоступний","downLinks":["segment-1"],"probeIds":["internet-1"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "15",
        "hintQuestionId": "15",
        "title": "Подвійний аплінк — два провайдери",
        "text": {
          "cisco": "Два аплінки: ISP1 основний, ISP2 резервний. Обидва — маршрути за замовчуванням з різною distance: менша = пріоритет. Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254. Distance — останнє число в рядку.",
          "routeros": "Два аплінки: ISP1 основний, ISP2 резервний. Обидва — маршрути за замовчуванням з різною distance: менша = пріоритет. Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254."
        },
        "referenceRoutes": {
          "R1": [
            {
              "id": "R1.route1",
              "dst": "0.0.0.0",
              "prefix": 0,
              "via": "100.64.1.1",
              "distance": 1,
              "hint": {"cisco":"Основний через ISP1. AD=1 (за замовчуванням).","routeros":"Default через ISP1 (distance=1, основний)"}
            },
            {
              "id": "R1.route2",
              "dst": "0.0.0.0",
              "prefix": 0,
              "via": "100.64.2.1",
              "distance": 2,
              "hint": {
                "cisco": "Резервний через ISP2. Той самий dst, інший gw + AD=2.",
                "routeros": "Default через ISP2 (distance=2, резервний — той самий dst, інший gw!)"
              }
            }
          ]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"internet-isp1-down","type":"internet-coverage","severity":"blocks","scenarioId":"isp1-down","probeIds":["internet-1"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1"],"justification":"Два аплінки: ISP1 основний, ISP2 резервний. Обидва — маршрути за замовчуванням з різною distance: менша = пріоритет. Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254. Distance — останнє число в рядку."},
          {"id":"coverage-all-isp1-down","type":"coverage","severity":"blocks","scenarioId":"isp1-down","probeIds":["internet-1"],"justification":"Два аплінки: ISP1 основний, ISP2 резервний. Обидва — маршрути за замовчуванням з різною distance: менша = пріоритет. Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254. Distance — останнє число в рядку."},
          {"id":"path-via-all","type":"path-via","severity":"blocks","scenarioId":"normal","probeId":"internet-1","deviceId":"ISP1","justification":"Два аплінки: ISP1 основний, ISP2 резервний."},
          {"id":"path-via-all-isp1-down","type":"path-via","severity":"blocks","scenarioId":"isp1-down","probeId":"internet-1","deviceId":"ISP2","justification":"Два аплінки: ISP1 основний, ISP2 резервний."},
          {"id":"distance-order-R1","type":"distance-order","severity":"blocks","scenarioId":null,"routerId":"R1","dst":"0.0.0.0","prefix":0,"primaryVia":"100.64.1.1","backupVia":"100.64.2.1","justification":"Distance — ціле число від 1 до 254. Основному дай меншу distance, резервному — більшу, від 2 до 254.","code":"distance-order"}
        ],
        "scaffold": {
          "R1": [
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":true,"dest":{"kind":"default","segments":[]},"role":"primary"},
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":true,"dest":{"kind":"default","segments":[]},"role":"backup"}
          ]
        }
      }
    ]
  },
  {
    "id": "routing.task-16",
    "displayNumber": 16,
    "revision": 1,
    "level": 5,
    "title": "Сім роутерів — корпоративна мережа",
    "text": {
      "cisco": "INET → CORE → AGG → ACC. Вниз (до LAN) — конкретні маршрути, вгору — default. Починай з ACC, потім AGG, CORE, INET. На R-INET LAN1–LAN3 — одним сумарним маршрутом.",
      "routeros": "INET → CORE → AGG → ACC. Вниз (до LAN) — конкретні маршрути, вгору — default. Починай з ACC, потім AGG, CORE, INET. На R-INET LAN1–LAN3 — одним сумарним маршрутом."
    },
    "topology": {
      "cisco": "[Internet]\n   │ DHCP\nR-INET\n   │ 10.0.0.0/30\nR-CORE\n   ├─ 10.0.1.0/30 ─ R-AGG1 ─┬─ 10.1.1.0/30 ─ R-ACC1 ─ LAN1 172.16.0.0/24\n   │                        └─ 10.1.2.0/30 ─ R-ACC2 ─ LAN2 172.16.1.0/24\n   └─ 10.0.2.0/30 ─ R-AGG2 ──── 10.2.1.0/30 ─ R-ACC3 ─ LAN3 172.16.2.0/23",
      "routeros": "[Internet]--R-INET--[10.0.0.0/30]--R-CORE\n                         R-CORE--[10.0.1.0/30]--R-AGG1--[10.1.1.0/30]--R-ACC1--[LAN1 172.16.0.0/24]\n                                                       |--[10.1.2.0/30]--R-ACC2--[LAN2 172.16.1.0/24]\n                         R-CORE--[10.0.2.0/30]--R-AGG2--[10.2.1.0/30]--R-ACC3--[LAN3 172.16.2.0/23]"
    },
    "network": {
      "devices": [
        {
          "id": "R-INET",
          "kind": "router",
          "interfaces": [
            {"id":"R-INET.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R-INET.if2","segmentId":"segment-2","address":{"ip":"10.0.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→CORE"}
          ]
        },
        {
          "id": "R-CORE",
          "kind": "router",
          "interfaces": [
            {"id":"R-CORE.if1","segmentId":"segment-2","address":{"ip":"10.0.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→INET"},
            {"id":"R-CORE.if2","segmentId":"segment-3","address":{"ip":"10.0.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→AGG1"},
            {"id":"R-CORE.if3","segmentId":"segment-4","address":{"ip":"10.0.2.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→AGG2"}
          ]
        },
        {
          "id": "R-AGG1",
          "kind": "router",
          "interfaces": [
            {"id":"R-AGG1.if1","segmentId":"segment-3","address":{"ip":"10.0.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→CORE"},
            {"id":"R-AGG1.if2","segmentId":"segment-5","address":{"ip":"10.1.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→ACC1"},
            {"id":"R-AGG1.if3","segmentId":"segment-6","address":{"ip":"10.1.2.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→ACC2"}
          ]
        },
        {
          "id": "R-AGG2",
          "kind": "router",
          "interfaces": [
            {"id":"R-AGG2.if1","segmentId":"segment-4","address":{"ip":"10.0.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→CORE"},
            {"id":"R-AGG2.if2","segmentId":"segment-7","address":{"ip":"10.2.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→ACC3"}
          ]
        },
        {
          "id": "R-ACC1",
          "kind": "router",
          "interfaces": [
            {"id":"R-ACC1.if1","segmentId":"segment-5","address":{"ip":"10.1.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→AGG1"},
            {"id":"R-ACC1.if2","segmentId":"segment-8","address":{"ip":"172.16.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN1"}
          ]
        },
        {
          "id": "R-ACC2",
          "kind": "router",
          "interfaces": [
            {"id":"R-ACC2.if1","segmentId":"segment-6","address":{"ip":"10.1.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→AGG1"},
            {"id":"R-ACC2.if2","segmentId":"segment-9","address":{"ip":"172.16.1.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN2"}
          ]
        },
        {
          "id": "R-ACC3",
          "kind": "router",
          "interfaces": [
            {"id":"R-ACC3.if1","segmentId":"segment-7","address":{"ip":"10.2.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→AGG2"},
            {"id":"R-ACC3.if2","segmentId":"segment-10","address":{"ip":"172.16.2.1","prefix":23},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN3"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R-INET–R-CORE"},
        {"id":"segment-3","kind":"link","name":"лінк R-CORE–R-AGG1"},
        {"id":"segment-4","kind":"link","name":"лінк R-CORE–R-AGG2"},
        {"id":"segment-5","kind":"link","name":"лінк R-AGG1–R-ACC1"},
        {"id":"segment-6","kind":"link","name":"лінк R-AGG1–R-ACC2"},
        {"id":"segment-7","kind":"link","name":"лінк R-AGG2–R-ACC3"},
        {"id":"segment-8","kind":"lan","name":"LAN1"},
        {"id":"segment-9","kind":"lan","name":"LAN2"},
        {"id":"segment-10","kind":"lan","name":"LAN3"}
      ],
      "endpoints": [
        {"id":"segment-8.host","kind":"host","segmentId":"segment-8","ip":"172.16.0.2","gateway":"172.16.0.1"},
        {"id":"segment-9.host","kind":"host","segmentId":"segment-9","ip":"172.16.1.2","gateway":"172.16.1.1"},
        {"id":"segment-10.host","kind":"host","segmentId":"segment-10","ip":"172.16.2.2","gateway":"172.16.2.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R-INET":[{"id":"dhcp:R-INET.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-8.host","to":"segment-9.host","coverage":{"from":{"dst":"172.16.0.0","prefix":24},"to":{"dst":"172.16.1.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-8.host","to":"segment-10.host","coverage":{"from":{"dst":"172.16.0.0","prefix":24},"to":{"dst":"172.16.2.0","prefix":23}}},
      {"id":"lan-2-3","from":"segment-9.host","to":"segment-10.host","coverage":{"from":{"dst":"172.16.1.0","prefix":24},"to":{"dst":"172.16.2.0","prefix":23}}},
      {"id":"transit-R-INET-segment-3","from":"R-INET.if2","to":"R-CORE.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.0.1.0","prefix":30}}},
      {"id":"transit-R-INET-segment-4","from":"R-INET.if2","to":"R-CORE.if3","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.0.2.0","prefix":30}}},
      {"id":"transit-R-INET-segment-5","from":"R-INET.if2","to":"R-AGG1.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.1.0","prefix":30}}},
      {"id":"transit-R-INET-segment-6","from":"R-INET.if2","to":"R-AGG1.if3","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.2.0","prefix":30}}},
      {"id":"transit-R-INET-segment-7","from":"R-INET.if2","to":"R-AGG2.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.2.1.0","prefix":30}}},
      {"id":"transit-R-CORE-segment-5","from":"R-CORE.if1","to":"R-AGG1.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.1.0","prefix":30}}},
      {"id":"transit-R-CORE-segment-6","from":"R-CORE.if1","to":"R-AGG1.if3","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.2.0","prefix":30}}},
      {"id":"transit-R-CORE-segment-7","from":"R-CORE.if1","to":"R-AGG2.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.2.1.0","prefix":30}}},
      {"id":"internet-1","from":"segment-8.host","to":"internet","coverage":{"from":{"dst":"172.16.0.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-9.host","to":"internet","coverage":{"from":{"dst":"172.16.1.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-10.host","to":"internet","coverage":{"from":{"dst":"172.16.2.0","prefix":23},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R-INET-segment-3","transit-R-INET-segment-4","transit-R-INET-segment-5","transit-R-INET-segment-6","transit-R-INET-segment-7","transit-R-CORE-segment-5","transit-R-CORE-segment-6","transit-R-CORE-segment-7","internet-1","internet-2","internet-3"]}
    ],
    "demonstrations": [],
    "variants": [
      {
        "id": "main",
        "code": "16",
        "hintQuestionId": "16",
        "title": "Сім роутерів — корпоративна мережа",
        "text": {
          "cisco": "INET → CORE → AGG → ACC. Вниз (до LAN) — конкретні маршрути, вгору — default. Починай з ACC, потім AGG, CORE, INET. На R-INET LAN1–LAN3 — одним сумарним маршрутом.",
          "routeros": "INET → CORE → AGG → ACC. Вниз (до LAN) — конкретні маршрути, вгору — default. Починай з ACC, потім AGG, CORE, INET. На R-INET LAN1–LAN3 — одним сумарним маршрутом."
        },
        "referenceRoutes": {
          "R-INET": [
            {
              "id": "R-INET.route1",
              "dst": "172.16.0.0",
              "prefix": 22,
              "via": "10.0.0.2",
              "hint": "LAN1–LAN3 разом заповнюють /22 повністю — один сумарний маршрут, без зайвих адрес."
            },
            {"id":"R-INET.route2","dst":"10.0.1.0","prefix":30,"via":"10.0.0.2","hint":"Лінк CORE→AGG1"},
            {"id":"R-INET.route3","dst":"10.0.2.0","prefix":30,"via":"10.0.0.2","hint":"Лінк CORE→AGG2"},
            {"id":"R-INET.route4","dst":"10.1.1.0","prefix":30,"via":"10.0.0.2","hint":"Лінк AGG1→ACC1"},
            {"id":"R-INET.route5","dst":"10.1.2.0","prefix":30,"via":"10.0.0.2","hint":"Лінк AGG1→ACC2"},
            {"id":"R-INET.route6","dst":"10.2.1.0","prefix":30,"via":"10.0.0.2","hint":"Лінк AGG2→ACC3"}
          ],
          "R-CORE": [
            {"id":"R-CORE.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.1","hint":"Default → INET → інтернет"},
            {"id":"R-CORE.route2","dst":"172.16.0.0","prefix":24,"via":"10.0.1.2","hint":"LAN1 через AGG1"},
            {"id":"R-CORE.route3","dst":"172.16.1.0","prefix":24,"via":"10.0.1.2","hint":"LAN2 через AGG1"},
            {"id":"R-CORE.route4","dst":"10.1.1.0","prefix":30,"via":"10.0.1.2","hint":"Лінк AGG1-ACC1"},
            {"id":"R-CORE.route5","dst":"10.1.2.0","prefix":30,"via":"10.0.1.2","hint":"Лінк AGG1-ACC2"},
            {"id":"R-CORE.route6","dst":"172.16.2.0","prefix":23,"via":"10.0.2.2","hint":"LAN3 через AGG2"},
            {"id":"R-CORE.route7","dst":"10.2.1.0","prefix":30,"via":"10.0.2.2","hint":"Лінк AGG2-ACC3"}
          ],
          "R-AGG1": [
            {"id":"R-AGG1.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.1.1","hint":"Default → CORE → інтернет"},
            {"id":"R-AGG1.route2","dst":"172.16.0.0","prefix":24,"via":"10.1.1.2","hint":"LAN1 за ACC1"},
            {"id":"R-AGG1.route3","dst":"172.16.1.0","prefix":24,"via":"10.1.2.2","hint":"LAN2 за ACC2"}
          ],
          "R-AGG2": [
            {"id":"R-AGG2.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.2.1","hint":"Default → CORE → інтернет"},
            {"id":"R-AGG2.route2","dst":"172.16.2.0","prefix":23,"via":"10.2.1.2","hint":"LAN3 за ACC3"}
          ],
          "R-ACC1": [{"id":"R-ACC1.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.1.1","hint":"Default → AGG1"}],
          "R-ACC2": [{"id":"R-ACC2.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.2.1","hint":"Default → AGG1"}],
          "R-ACC3": [{"id":"R-ACC3.route1","dst":"0.0.0.0","prefix":0,"via":"10.2.1.1","hint":"Default → AGG2"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3"],"justification":"Увесь невідомий простір має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R-INET-segment-3","transit-R-INET-segment-4","transit-R-INET-segment-5","transit-R-INET-segment-6","transit-R-INET-segment-7","transit-R-CORE-segment-5","transit-R-CORE-segment-6","transit-R-CORE-segment-7","internet-1","internet-2","internet-3"],"justification":"INET → CORE → AGG → ACC. Вниз (до LAN) — конкретні маршрути, вгору — default. Починай з ACC, потім AGG, CORE, INET. На R-INET LAN1–LAN3 — одним сумарним маршрутом."},
          {"id":"summary-R-INET","type":"summary","severity":"blocks","scenarioId":null,"routerId":"R-INET","dst":"172.16.0.0","prefix":22,"destinations":[{"dst":"172.16.0.0","prefix":24},{"dst":"172.16.1.0","prefix":24},{"dst":"172.16.2.0","prefix":23}],"justification":"На R-INET LAN1–LAN3 — одним сумарним маршрутом."}
        ],
        "scaffold": {
          "R-INET": [
            {"label":"LAN1, LAN2, LAN3 одним сумарним маршрутом","needDist":false,"dest":{"kind":"summary","segments":["segment-8","segment-9","segment-10"]}},
            {"label":"лінк R-CORE–R-AGG1","needDist":false,"dest":{"kind":"link","segments":["segment-3"]}},
            {"label":"лінк R-CORE–R-AGG2","needDist":false,"dest":{"kind":"link","segments":["segment-4"]}},
            {"label":"лінк R-AGG1–R-ACC1","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},
            {"label":"лінк R-AGG1–R-ACC2","needDist":false,"dest":{"kind":"link","segments":["segment-6"]}},
            {"label":"лінк R-AGG2–R-ACC3","needDist":false,"dest":{"kind":"link","segments":["segment-7"]}}
          ],
          "R-CORE": [
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},
            {"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}},
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-9"]}},
            {"label":"лінк R-AGG1–R-ACC1","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},
            {"label":"лінк R-AGG1–R-ACC2","needDist":false,"dest":{"kind":"link","segments":["segment-6"]}},
            {"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-10"]}},
            {"label":"лінк R-AGG2–R-ACC3","needDist":false,"dest":{"kind":"link","segments":["segment-7"]}}
          ],
          "R-AGG1": [
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},
            {"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}},
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-9"]}}
          ],
          "R-AGG2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-10"]}}],
          "R-ACC1": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-ACC2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-ACC3": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  },
  {
    "id": "routing.task-17",
    "displayNumber": 17,
    "revision": 1,
    "level": 5,
    "title": "Сумарний маршрут із дірою",
    "text": {
      "cisco": "Ті самі сім роутерів, але LAN3 тепер /24 — у сумарному блоці /22 лишилася вільна /24. На R-INET усе одно один сумарний маршрут для LAN1–LAN3. Подбай, щоб пакети до вільної частини блоку не ходили по колу.",
      "routeros": "Ті самі сім роутерів, але LAN3 тепер /24 — у сумарному блоці /22 лишилася вільна /24. На R-INET усе одно один сумарний маршрут для LAN1–LAN3. Подбай, щоб пакети до вільної частини блоку не ходили по колу."
    },
    "topology": {
      "cisco": "[Internet]\n   │ DHCP\nR-INET\n   │ 10.0.0.0/30\nR-CORE\n   ├─ 10.0.1.0/30 ─ R-AGG1 ─┬─ 10.1.1.0/30 ─ R-ACC1 ─ LAN1 172.16.0.0/24\n   │                        └─ 10.1.2.0/30 ─ R-ACC2 ─ LAN2 172.16.1.0/24\n   └─ 10.0.2.0/30 ─ R-AGG2 ──── 10.2.1.0/30 ─ R-ACC3 ─ LAN3 172.16.2.0/24",
      "routeros": "[Internet]--R-INET--[10.0.0.0/30]--R-CORE\n                         R-CORE--[10.0.1.0/30]--R-AGG1--[10.1.1.0/30]--R-ACC1--[LAN1 172.16.0.0/24]\n                                                       |--[10.1.2.0/30]--R-ACC2--[LAN2 172.16.1.0/24]\n                         R-CORE--[10.0.2.0/30]--R-AGG2--[10.2.1.0/30]--R-ACC3--[LAN3 172.16.2.0/24]"
    },
    "network": {
      "devices": [
        {
          "id": "R-INET",
          "kind": "router",
          "interfaces": [
            {"id":"R-INET.if1","segmentId":"segment-1","address":null,"dhcp":true,"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"WAN"},
            {"id":"R-INET.if2","segmentId":"segment-2","address":{"ip":"10.0.0.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→CORE"}
          ]
        },
        {
          "id": "R-CORE",
          "kind": "router",
          "interfaces": [
            {"id":"R-CORE.if1","segmentId":"segment-2","address":{"ip":"10.0.0.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→INET"},
            {"id":"R-CORE.if2","segmentId":"segment-3","address":{"ip":"10.0.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→AGG1"},
            {"id":"R-CORE.if3","segmentId":"segment-4","address":{"ip":"10.0.2.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→AGG2"}
          ]
        },
        {
          "id": "R-AGG1",
          "kind": "router",
          "interfaces": [
            {"id":"R-AGG1.if1","segmentId":"segment-3","address":{"ip":"10.0.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→CORE"},
            {"id":"R-AGG1.if2","segmentId":"segment-5","address":{"ip":"10.1.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→ACC1"},
            {"id":"R-AGG1.if3","segmentId":"segment-6","address":{"ip":"10.1.2.1","prefix":30},"labels":{"cisco":"g0/2","routeros":"ether3"},"note":"→ACC2"}
          ]
        },
        {
          "id": "R-AGG2",
          "kind": "router",
          "interfaces": [
            {"id":"R-AGG2.if1","segmentId":"segment-4","address":{"ip":"10.0.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→CORE"},
            {"id":"R-AGG2.if2","segmentId":"segment-7","address":{"ip":"10.2.1.1","prefix":30},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"→ACC3"}
          ]
        },
        {
          "id": "R-ACC1",
          "kind": "router",
          "interfaces": [
            {"id":"R-ACC1.if1","segmentId":"segment-5","address":{"ip":"10.1.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→AGG1"},
            {"id":"R-ACC1.if2","segmentId":"segment-8","address":{"ip":"172.16.0.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN1"}
          ]
        },
        {
          "id": "R-ACC2",
          "kind": "router",
          "interfaces": [
            {"id":"R-ACC2.if1","segmentId":"segment-6","address":{"ip":"10.1.2.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→AGG1"},
            {"id":"R-ACC2.if2","segmentId":"segment-9","address":{"ip":"172.16.1.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN2"}
          ]
        },
        {
          "id": "R-ACC3",
          "kind": "router",
          "interfaces": [
            {"id":"R-ACC3.if1","segmentId":"segment-7","address":{"ip":"10.2.1.2","prefix":30},"labels":{"cisco":"g0/0","routeros":"ether1"},"note":"→AGG2"},
            {"id":"R-ACC3.if2","segmentId":"segment-10","address":{"ip":"172.16.2.1","prefix":24},"labels":{"cisco":"g0/1","routeros":"ether2"},"note":"LAN3"}
          ]
        },
        {"id":"ISP","kind":"isp","interfaces":[{"id":"ISP.wan","segmentId":"segment-1","address":{"ip":"198.18.0.1","prefix":30},"labels":{"cisco":"","routeros":""}}]}
      ],
      "segments": [
        {"id":"segment-1","kind":"wan","name":"WAN"},
        {"id":"segment-2","kind":"link","name":"лінк R-INET–R-CORE"},
        {"id":"segment-3","kind":"link","name":"лінк R-CORE–R-AGG1"},
        {"id":"segment-4","kind":"link","name":"лінк R-CORE–R-AGG2"},
        {"id":"segment-5","kind":"link","name":"лінк R-AGG1–R-ACC1"},
        {"id":"segment-6","kind":"link","name":"лінк R-AGG1–R-ACC2"},
        {"id":"segment-7","kind":"link","name":"лінк R-AGG2–R-ACC3"},
        {"id":"segment-8","kind":"lan","name":"LAN1"},
        {"id":"segment-9","kind":"lan","name":"LAN2"},
        {"id":"segment-10","kind":"lan","name":"LAN3"}
      ],
      "endpoints": [
        {"id":"segment-8.host","kind":"host","segmentId":"segment-8","ip":"172.16.0.2","gateway":"172.16.0.1"},
        {"id":"segment-9.host","kind":"host","segmentId":"segment-9","ip":"172.16.1.2","gateway":"172.16.1.1"},
        {"id":"segment-10.host","kind":"host","segmentId":"segment-10","ip":"172.16.2.2","gateway":"172.16.2.1"},
        {"id":"internet","kind":"internet","viaPeers":["ISP"]}
      ],
      "supplied": {"R-INET":[{"id":"dhcp:R-INET.if1","dst":"0.0.0.0","prefix":0,"via":"198.18.0.1"}]}
    },
    "probes": [
      {"id":"lan-1-2","from":"segment-8.host","to":"segment-9.host","coverage":{"from":{"dst":"172.16.0.0","prefix":24},"to":{"dst":"172.16.1.0","prefix":24}}},
      {"id":"lan-1-3","from":"segment-8.host","to":"segment-10.host","coverage":{"from":{"dst":"172.16.0.0","prefix":24},"to":{"dst":"172.16.2.0","prefix":24}}},
      {"id":"lan-2-3","from":"segment-9.host","to":"segment-10.host","coverage":{"from":{"dst":"172.16.1.0","prefix":24},"to":{"dst":"172.16.2.0","prefix":24}}},
      {"id":"transit-R-INET-segment-3","from":"R-INET.if2","to":"R-CORE.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.0.1.0","prefix":30}}},
      {"id":"transit-R-INET-segment-4","from":"R-INET.if2","to":"R-CORE.if3","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.0.2.0","prefix":30}}},
      {"id":"transit-R-INET-segment-5","from":"R-INET.if2","to":"R-AGG1.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.1.0","prefix":30}}},
      {"id":"transit-R-INET-segment-6","from":"R-INET.if2","to":"R-AGG1.if3","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.2.0","prefix":30}}},
      {"id":"transit-R-INET-segment-7","from":"R-INET.if2","to":"R-AGG2.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.2.1.0","prefix":30}}},
      {"id":"transit-R-CORE-segment-5","from":"R-CORE.if1","to":"R-AGG1.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.1.0","prefix":30}}},
      {"id":"transit-R-CORE-segment-6","from":"R-CORE.if1","to":"R-AGG1.if3","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.1.2.0","prefix":30}}},
      {"id":"transit-R-CORE-segment-7","from":"R-CORE.if1","to":"R-AGG2.if2","coverage":{"from":{"dst":"10.0.0.0","prefix":30},"to":{"dst":"10.2.1.0","prefix":30}}},
      {"id":"internet-1","from":"segment-8.host","to":"internet","coverage":{"from":{"dst":"172.16.0.0","prefix":24},"to":null}},
      {"id":"internet-2","from":"segment-9.host","to":"internet","coverage":{"from":{"dst":"172.16.1.0","prefix":24},"to":null}},
      {"id":"internet-3","from":"segment-10.host","to":"internet","coverage":{"from":{"dst":"172.16.2.0","prefix":24},"to":null}}
    ],
    "scenarios": [
      {"id":"normal","downLinks":[],"probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R-INET-segment-3","transit-R-INET-segment-4","transit-R-INET-segment-5","transit-R-INET-segment-6","transit-R-INET-segment-7","transit-R-CORE-segment-5","transit-R-CORE-segment-6","transit-R-CORE-segment-7","internet-1","internet-2","internet-3"]}
    ],
    "demonstrations": [{"id":"summary-hole","kind":"summary-hole","from":"segment-8.host","to":"172.16.3.10"}],
    "variants": [
      {
        "id": "main",
        "code": "17",
        "hintQuestionId": "17",
        "title": "Сумарний маршрут із дірою",
        "text": {
          "cisco": "Ті самі сім роутерів, але LAN3 тепер /24 — у сумарному блоці /22 лишилася вільна /24. На R-INET усе одно один сумарний маршрут для LAN1–LAN3. Подбай, щоб пакети до вільної частини блоку не ходили по колу.",
          "routeros": "Ті самі сім роутерів, але LAN3 тепер /24 — у сумарному блоці /22 лишилася вільна /24. На R-INET усе одно один сумарний маршрут для LAN1–LAN3. Подбай, щоб пакети до вільної частини блоку не ходили по колу."
        },
        "referenceRoutes": {
          "R-INET": [
            {
              "id": "R-INET.route1",
              "dst": "172.16.0.0",
              "prefix": 22,
              "via": "10.0.0.2",
              "hint": "LAN1–LAN3 одним сумарним маршрутом; невикористаний простір відкидає R-CORE."
            },
            {"id":"R-INET.route2","dst":"10.0.1.0","prefix":30,"via":"10.0.0.2","hint":"Лінк CORE→AGG1"},
            {"id":"R-INET.route3","dst":"10.0.2.0","prefix":30,"via":"10.0.0.2","hint":"Лінк CORE→AGG2"},
            {"id":"R-INET.route4","dst":"10.1.1.0","prefix":30,"via":"10.0.0.2","hint":"Лінк AGG1→ACC1"},
            {"id":"R-INET.route5","dst":"10.1.2.0","prefix":30,"via":"10.0.0.2","hint":"Лінк AGG1→ACC2"},
            {"id":"R-INET.route6","dst":"10.2.1.0","prefix":30,"via":"10.0.0.2","hint":"Лінк AGG2→ACC3"}
          ],
          "R-CORE": [
            {"id":"R-CORE.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.0.1","hint":"Default → INET → інтернет"},
            {"id":"R-CORE.route2","dst":"172.16.0.0","prefix":24,"via":"10.0.1.2","hint":"LAN1 через AGG1"},
            {"id":"R-CORE.route3","dst":"172.16.1.0","prefix":24,"via":"10.0.1.2","hint":"LAN2 через AGG1"},
            {"id":"R-CORE.route4","dst":"10.1.1.0","prefix":30,"via":"10.0.1.2","hint":"Лінк AGG1-ACC1"},
            {"id":"R-CORE.route5","dst":"10.1.2.0","prefix":30,"via":"10.0.1.2","hint":"Лінк AGG1-ACC2"},
            {"id":"R-CORE.route6","dst":"172.16.2.0","prefix":24,"via":"10.0.2.2","hint":"LAN3 через AGG2"},
            {"id":"R-CORE.route7","dst":"10.2.1.0","prefix":30,"via":"10.0.2.2","hint":"Лінк AGG2-ACC3"},
            {"id":"R-CORE.route8","dst":"172.16.0.0","prefix":22,"discard":true,"hint":"Вільна частина сумарного блоку не повертається до INET."}
          ],
          "R-AGG1": [
            {"id":"R-AGG1.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.1.1","hint":"Default → CORE → інтернет"},
            {"id":"R-AGG1.route2","dst":"172.16.0.0","prefix":24,"via":"10.1.1.2","hint":"LAN1 за ACC1"},
            {"id":"R-AGG1.route3","dst":"172.16.1.0","prefix":24,"via":"10.1.2.2","hint":"LAN2 за ACC2"}
          ],
          "R-AGG2": [
            {"id":"R-AGG2.route1","dst":"0.0.0.0","prefix":0,"via":"10.0.2.1","hint":"Default → CORE → інтернет"},
            {"id":"R-AGG2.route2","dst":"172.16.2.0","prefix":24,"via":"10.2.1.2","hint":"LAN3 за ACC3"}
          ],
          "R-ACC1": [{"id":"R-ACC1.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.1.1","hint":"Default → AGG1"}],
          "R-ACC2": [{"id":"R-ACC2.route1","dst":"0.0.0.0","prefix":0,"via":"10.1.2.1","hint":"Default → AGG1"}],
          "R-ACC3": [{"id":"R-ACC3.route1","dst":"0.0.0.0","prefix":0,"via":"10.2.1.1","hint":"Default → AGG2"}]
        },
        "objectives": [
          {"id":"internet-normal","type":"internet-coverage","exclude":[{"dst":"172.16.0.0","prefix":22}],"severity":"blocks","scenarioId":"normal","probeIds":["internet-1","internet-2","internet-3"],"justification":"Невідомий простір поза власним блоком має доходити до інтернету."},
          {"id":"coverage-all","type":"coverage","severity":"blocks","scenarioId":"normal","probeIds":["lan-1-2","lan-1-3","lan-2-3","transit-R-INET-segment-3","transit-R-INET-segment-4","transit-R-INET-segment-5","transit-R-INET-segment-6","transit-R-INET-segment-7","transit-R-CORE-segment-5","transit-R-CORE-segment-6","transit-R-CORE-segment-7","internet-1","internet-2","internet-3"],"justification":"Ті самі сім роутерів, але LAN3 тепер /24 — у сумарному блоці /22 лишилася вільна /24. На R-INET усе одно один сумарний маршрут для LAN1–LAN3. Подбай, щоб пакети до вільної частини блоку не ходили по колу."},
          {"id":"summary-R-INET","type":"summary","severity":"blocks","scenarioId":null,"routerId":"R-INET","dst":"172.16.0.0","prefix":22,"destinations":[{"dst":"172.16.0.0","prefix":24},{"dst":"172.16.1.0","prefix":24},{"dst":"172.16.2.0","prefix":24}],"justification":"На R-INET LAN1–LAN3 — одним сумарним маршрутом."}
        ],
        "scaffold": {
          "R-INET": [
            {"label":"LAN1, LAN2, LAN3 одним сумарним маршрутом","needDist":false,"dest":{"kind":"summary","segments":["segment-8","segment-9","segment-10"]}},
            {"label":"лінк R-CORE–R-AGG1","needDist":false,"dest":{"kind":"link","segments":["segment-3"]}},
            {"label":"лінк R-CORE–R-AGG2","needDist":false,"dest":{"kind":"link","segments":["segment-4"]}},
            {"label":"лінк R-AGG1–R-ACC1","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},
            {"label":"лінк R-AGG1–R-ACC2","needDist":false,"dest":{"kind":"link","segments":["segment-6"]}},
            {"label":"лінк R-AGG2–R-ACC3","needDist":false,"dest":{"kind":"link","segments":["segment-7"]}}
          ],
          "R-CORE": [
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},
            {"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}},
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-9"]}},
            {"label":"лінк R-AGG1–R-ACC1","needDist":false,"dest":{"kind":"link","segments":["segment-5"]}},
            {"label":"лінк R-AGG1–R-ACC2","needDist":false,"dest":{"kind":"link","segments":["segment-6"]}},
            {"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-10"]}},
            {"label":"лінк R-AGG2–R-ACC3","needDist":false,"dest":{"kind":"link","segments":["segment-7"]}},
            {"label":"Discard для всього сумарного блоку","needDist":false,"dest":{"kind":"summary","segments":["segment-8","segment-9","segment-10"]},"discard":true}
          ],
          "R-AGG1": [
            {"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},
            {"label":"LAN1","needDist":false,"dest":{"kind":"lan","segments":["segment-8"]}},
            {"label":"LAN2","needDist":false,"dest":{"kind":"lan","segments":["segment-9"]}}
          ],
          "R-AGG2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}},{"label":"LAN3","needDist":false,"dest":{"kind":"lan","segments":["segment-10"]}}],
          "R-ACC1": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-ACC2": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}],
          "R-ACC3": [{"label":{"cisco":"Маршрут за замовчуванням (усі невідомі мережі)","routeros":"Маршрут за замовчуванням"},"needDist":false,"dest":{"kind":"default","segments":[]}}]
        }
      }
    ]
  }
];

export default tasks;
