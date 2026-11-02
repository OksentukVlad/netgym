// Headless Chromium for the browser tests and tools/shots.mjs: Playwright as
// pinned in shell/frontend/package.json (devDependency), with the browser it
// manages (`npx playwright install chromium` in shell/frontend; CI installs
// it with --with-deps). Nothing here names a machine path or a browser
// revision.
//
// A missing browser fails the browser tests. Locally, NETGYM_ALLOW_NO_BROWSER=1
// turns that into a skip with the reason; under CI (the CI variable set) the
// flag is ignored, so CI never skips.
import { existsSync } from 'node:fs';
import { createRequire } from 'node:module';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const frontend = path.join(root, 'shell/frontend/package.json');

export const launchArgs = ['--no-sandbox', '--disable-dev-shm-usage'];

/** Playwright's chromium from shell/frontend, or null with the reason. */
export function findChromium() {
  let chromium;
  try {
    ({ chromium } = createRequire(frontend)('playwright'));
  } catch {
    return { chromium: null, reason: 'Playwright is not installed in shell/frontend (run npm ci there)' };
  }
  const executable = chromium.executablePath();
  if (!executable || !existsSync(executable)) {
    return { chromium: null, reason: 'Playwright\'s Chromium is not installed (in shell/frontend: npx playwright install chromium)' };
  }
  return { chromium, reason: null };
}

/**
 * For node:test's `skip` option: the reason when the browser is missing and
 * skipping is allowed, otherwise false. Without the flag (and always under
 * CI) the test runs and launchChromium() fails with the reason.
 */
export function browserSkip(env = process.env, found = findChromium()) {
  return found.reason && env.NETGYM_ALLOW_NO_BROWSER === '1' && !env.CI ? found.reason : false;
}

/** Launches headless Chromium (Playwright's managed build). */
export async function launchChromium() {
  const { chromium, reason } = findChromium();
  if (!chromium) throw new Error(`${reason}. Set NETGYM_ALLOW_NO_BROWSER=1 to skip the browser tests locally.`);
  return chromium.launch({ headless: true, args: launchArgs });
}
