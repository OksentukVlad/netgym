import {defineConfig} from 'vite'
import react from '@vitejs/plugin-react'
import {fileURLToPath} from 'node:url'

// The build target: an absolute src/targets/<id>.js path (tools/build.sh sets it).
const target = process.env.NETGYM_TARGET
if (!target) throw new Error('Set NETGYM_TARGET to an absolute src/targets/<id>.js path')

// The web build (tools/build-web.sh) sets NETGYM_WEB=1: the start screen's
// browser note and notices link (src/app/platform.js). The Wails build
// (tools/build.sh) never does. The web build uses relative asset paths
// (base './'), so it serves from any subpath, such as GitHub Pages' /netgym/;
// the Wails build keeps Vite's default.
const web = process.env.NETGYM_WEB === '1'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  base: web ? './' : '/',
  // Older browsers: syntax is lowered to what Chrome 80 (February 2020) and
  // its peers run; newer built-in methods come from src/app/compat.js.
  // Layout features they lack (container queries, :has, color-mix) degrade
  // instead of failing.
  build: {
    target: ['chrome80', 'edge80', 'firefox78', 'safari14']
  },
  define: {
    __NETGYM_WEB__: JSON.stringify(web)
  },
  resolve: {
    alias: {
      '@target': target,
      // Polyfills for older browsers (src/app/compat.js), loaded before the app.
      '@compat': fileURLToPath(new URL('../../src/app/compat.js', import.meta.url)),
      'react': fileURLToPath(new URL('./node_modules/react', import.meta.url)),
      'react-dom': fileURLToPath(new URL('./node_modules/react-dom', import.meta.url))
    },
    dedupe: ['react', 'react-dom']
  }
})
