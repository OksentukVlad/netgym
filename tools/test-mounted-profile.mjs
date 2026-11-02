// Preloaded by each mounted helper, before its imports and scenarios execute.
import { writeFileSync } from 'node:fs';
const start = performance.now();
process.on('exit', code => {
  writeFileSync(process.env.NETGYM_MOUNTED_TIMING, JSON.stringify({
    seconds: (performance.now() - start) / 1000,
    maxRssKiB: process.resourceUsage().maxRSS,
    exit: code,
  }) + '\n');
});
