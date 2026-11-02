// Bundled for the browser by tests/r5-browser.test.mjs (esbuild, in memory):
// the round 5 shared parts mounted in a real page, for what a server render
// or the mini DOM can't show: FactLink by keyboard, the highlight outline
// (drawn around its label, pulsing or static), scrolling a label into view
// in one column, and purpose lines at a 420 px panel.
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import FactLink, { scrollToLabel } from '../../src/ui/components/FactLink.jsx';
import HighlightLayer from '../../src/ui/topology/HighlightLayer.jsx';
import { hl } from '../../src/ui/topology/highlight.js';
import { RuleTable } from '../../src/sections/firewall/screens/Choices.jsx';
import { tableRows } from '../../src/sections/firewall/screens/walkView.js';
import { policies } from '../../src/banks/firewall/policies.js';
import '../../src/ui/tokens.css';
import '../../src/sections/firewall/screens/firewall.css';

const mount = (element, host) => { const root = createRoot(host); flushSync(() => root.render(element)); return root; };

window.r5 = {
  activations: 0,
  factLink(host) {
    mount(<p>Куди: <FactLink value="192.168.88.1" onActivate={() => { window.r5.activations += 1; return '192.168.88.1 — адреса R1 у LAN'; }} /></p>, host);
  },
  label(host, lit) {
    const highlight = lit ? { kind: 'address', value: '192.168.88.1' } : null;
    mount(
      <svg className="lbl" width="300" height="80" viewBox="0 0 300 80" style={{ display: 'block' }}>
        <rect x="0" y="0" width="300" height="80" fill="#123" />
        <text x="40" y="45" fontSize="14" fill="#fff" fontFamily="monospace" {...hl(highlight, ['address', '192.168.88.1'])}>bridge · 192.168.88.1</text>
        <HighlightLayer highlight={highlight} />
      </svg>, host);
  },
  scrollToLabel,
  rules(host) {
    mount(
      <div className="ng-fw" data-theme="dark" data-mode="desk">
        <section className="ng-fw-work" style={{ width: '420px' }}>
          {policies.map(p => <RuleTable key={p.id} rows={tableRows(p)} value={null} onChange={() => {}} />)}
        </section>
      </div>, host);
  },
};
