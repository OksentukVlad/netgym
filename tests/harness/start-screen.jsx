// The NetGym start screen rendered on the server, for tests/web-build.test.mjs:
// the web build's note and notices link, and their absence in the app.
import { renderToStaticMarkup } from 'react-dom/server';
import { Root } from '../../src/targets/netgym.js';

export { inWails, webPreview } from '../../src/app/platform.js';
export const renderStart = () => renderToStaticMarkup(<Root />);
