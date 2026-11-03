// The section's picture (E1, E3): the shared drawing in its DHCP view with
// «Текстом» (closed on a phone too: the cards carry their facts in words,
// so its button says how many lines it has) and «Розгорнути схему» on a
// phone; under it the training-address line (spec v2.1) and the caller's
// `below` (E3's «По кроках»).
import { useMemo, useRef } from 'react';
import RouterDiagram from '../../../ui/topology/RouterDiagram.jsx';
import DiagramExpand, { ExpandButton, useDiagramExpand, useTextOpen } from '../../../ui/topology/DiagramExpand.jsx';
import TextEquivalent, { TextEquivalentButton, lineCount } from '../../../ui/components/TextEquivalent.jsx';
import { labels, screen } from '../uk.js';
import { drawingTopology, textSections } from './drawing.js';

/**
 * @param {{ topology: object, vendor: 'cisco'|'mikrotik', server?: boolean, pcs?: Array<{ id: string, name: string, address: string }>|null, highlight?: object|null,
 *   viewKey: string, zoom?: any, onZoom: Function, below?: any }} props
 */
export default function Picture({ topology, vendor, server = false, pcs = null, highlight = null, viewKey, zoom, onZoom, below = null }) {
  const [textOpen, setTextOpen] = useTextOpen(false);
  const expand = useDiagramExpand({ zoom, onZoom });
  const textButton = useRef(null);
  const pcsKey = JSON.stringify(pcs);
  const drawn = useMemo(() => drawingTopology(topology, vendor, { server, pcs }), [topology, vendor, server, pcsKey]);
  const sections = useMemo(() => textSections(topology, vendor, { server, pcs }), [topology, vendor, server, pcsKey]);
  // E4: the PCs' names on their boxes (ПК1, and ПК2 in the server's place).
  const words = useMemo(() => (pcs ? { ...screen.drawing, pc: pcs[0].name, server: pcs[1]?.name ?? screen.drawing.server } : screen.drawing), [pcsKey]);
  function closeText() {
    setTextOpen(false);
    textButton.current?.focus();
  }
  return (
    // data-hosts: how many address labels the drawing has outside R1 (the hosts and the ISP gateway; the gate counts them).
    <div className="ng-dh-picture" aria-label={screen.drawing.label} role="group" data-hosts={drawn.hosts.length + 1}>
      <DiagramExpand expand={expand}>
        <RouterDiagram view="dhcp" words={words} topology={drawn} highlight={highlight} zoom={expand.zoom} onZoom={expand.onZoom} viewKey={viewKey}
          covered={expand.covered(textOpen)}
          tools={<><TextEquivalentButton buttonRef={textButton} id="ng-dh-text" label={screen.text.button} open={textOpen} onToggle={() => setTextOpen(o => !o)} count={lineCount(sections)} /><ExpandButton expand={expand} /></>}
          overlays={<TextEquivalent id="ng-dh-text" title={screen.text.title} sections={sections} open={expand.covered(textOpen)} onClose={closeText} />} />
      </DiagramExpand>
      <p className="ng-dh-caption">{labels.trainingPublic}</p>
      {below}
    </div>
  );
}
