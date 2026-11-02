import { codes as engineCodes } from '../../../engine/l2.js';
export const codes = Object.freeze([...engineCodes,
  'invalid-record', 'invalid-bank', 'invalid-selection', 'wrong-receivers',
  'must-ping', 'must-not-reach', 'vlan-leaves-switch', 'trunk-faces-access', 'carry-through-middle',
  'trunk-carries-unused', 'user-port-vlan-1', 'access-frame-types', 'trunk-frame-types', 'allowed-all',
  'hint-port-move', 'hint-port', 'hint-trunk', 'hint-evidence', 'hint-example',
  'reachability-abstraction', 'network-convention', 'address-other-network',
  'frame-source', 'frame-arrival', 'frame-ingress', 'frame-tagged-out', 'frame-untagged-out', 'frame-transparent', 'frame-access-out', 'frame-other-access',
]);
