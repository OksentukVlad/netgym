// The firewall's diagram (FW-1 screen spec §3, v2 S4): the shared PC / R1 /
// Інтернет drawing (ui/topology/RouterDiagram.jsx, round 6) in its firewall
// view, in the firewall's words: the doors, the lanes and the core inside R1,
// the server, the ingress chip and the walk (diagram.js sceneOf).
import RouterDiagram, { RouterSvg } from '../../../ui/topology/RouterDiagram.jsx';
import { ui } from '../uk.js';

export { MAX_GROW, ROUTER_LABEL, hostLabelId } from '../../../ui/topology/RouterDiagram.jsx';

/** The drawing alone at a scene (diagram.js sceneOf), in the firewall's words. */
export function DiagramSvg(props) {
  return <RouterSvg {...props} words={ui} view="firewall" />;
}

/**
 * @param {{ scene: object, topology: object, zoom?: undefined|'all'|number, onZoom?: Function,
 *   viewKey?: string, tools?: any, overlays?: any, covered?: boolean, highlight?: object|null }} props
 */
export default function FirewallDiagram(props) {
  return <RouterDiagram {...props} words={ui} view="firewall" />;
}
