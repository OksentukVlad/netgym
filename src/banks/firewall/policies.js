const pred = (...values) => ({ values, not: false });
const rule = (id, chain, action, match, descriptionCode) => ({ id, enabled: true, chain, action, match, descriptionCode });
const basic = {
  id: 'home-basic',
  rules: [
    rule('r1', 'input', 'accept', { connectionState: pred('established', 'related', 'untracked') }, 'rule.input-replies'),
    rule('r2', 'input', 'drop', { connectionState: pred('invalid') }, 'rule.input-invalid'),
    rule('r3', 'input', 'accept', { protocol: pred('icmp') }, 'rule.input-icmp'),
    rule('r4', 'input', 'accept', { inInterfaceList: pred('LAN') }, 'rule.input-lan'),
    rule('r5', 'input', 'drop', {}, 'rule.input-rest'),
    rule('r6', 'forward', 'fasttrack-connection', { connectionState: pred('established', 'related') }, 'rule.forward-fasttrack'),
    rule('r7', 'forward', 'accept', { connectionState: pred('established', 'related', 'untracked') }, 'rule.forward-replies'),
    rule('r8', 'forward', 'drop', { connectionState: pred('invalid') }, 'rule.forward-invalid'),
    rule('r9', 'forward', 'drop', { connectionState: pred('new'), connectionNatState: { values: ['dstnat'], not: true }, inInterfaceList: pred('WAN') }, 'rule.forward-wan-new'),
  ],
};
// Keep stable ids through reordering; positions are derived only by the renderer.
export const policies = [
  basic,
  { id: 'home-disabled', rules: basic.rules.map(r => ({ ...r, enabled: r.id !== 'r4' })) },
  { id: 'home-drop-above', rules: [...basic.rules.slice(0, 3), basic.rules[4], basic.rules[3], ...basic.rules.slice(5)] },
];
