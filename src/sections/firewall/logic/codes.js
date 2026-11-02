import { fields } from './model.js';

export const codes = [
  'hook-ok', 'hook-retry-input', 'hook-retry-forward', 'hint-chain-look', 'hint-chain-move', 'hint-chain-example',
  'ok', 'invalid-selection', 'wrong-door', 'rule-disabled', 'rule-other-chain',
  'fasttrack-not-final', 'right-verdict-wrong-rule', 'wrong-verdict',
  'rule-accepted', 'rule-dropped', 'chain-end-accepted', 'missing-fact',
  'fasttrack-slow-path', 'invalid-rule', 'invalid-policy', 'invalid-topology',
  'unsupported-packet', 'invalid-record', 'invalid-bank', 'other-chain', 'disabled', 'mismatch',
  'match', 'marked', 'unknown', 'hint-door', 'hint-order', 'hint-example',
  'chain-end-row', 'hook.input', 'hook.forward', 'safety-suite', 'safety-exceptions',
  'card-from', 'card-to', 'dstnat.yes', 'dstnat.no', 'dstnat.unknown',
  ...['new', 'established', 'related', 'invalid', 'untracked', 'unknown'].map(s => `state.${s}`),
  ...Object.keys(fields).map(f => `mismatch.${f}`),
  ...['input-replies', 'input-invalid', 'input-icmp', 'input-lan', 'input-rest',
    'forward-fasttrack', 'forward-replies', 'forward-invalid', 'forward-wan-new'].map(s => `rule.${s}`),
];
