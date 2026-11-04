// Bundled for the browser by tests/drag-browser.test.mjs (esbuild, in memory):
// the whole target (window.phone), one setup deck with its store
// (window.setup), and a plain ReorderList whose cards hold controls and which
// counts its `onReorder` calls (window.dragList).
import { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import './phone.jsx';
import './setup.jsx';
import ReorderList from '../../src/ui/components/ReorderList.jsx';
import Segmented from '../../src/ui/components/Segmented.jsx';

function List({ calls }) {
  const [items, setItems] = useState(Array.from({ length: 6 }, (_, i) => ({ id: `row-${i + 1}` })));
  const [mode, setMode] = useState('a');
  return (
    <ReorderList items={items} label="Рядки" name={item => item.id}
      onReorder={(ids, moved) => { calls.push({ ids, moved }); setItems(ids.map(id => ({ id }))); }}>
      {item => (
        <div data-row={item.id}>
          <span>{item.id}</span>
          <Segmented label={`Режим ${item.id}`} options={[{ value: 'a', label: 'a' }, { value: 'b', label: 'b' }]} value={mode} onChange={setMode} />
          <input aria-label={`Поле ${item.id}`} defaultValue="" />
        </div>
      )}
    </ReorderList>
  );
}

window.dragList = {
  calls: [],
  mount(host) {
    flushSync(() => createRoot(host).render(<List calls={window.dragList.calls} />));
  },
};
