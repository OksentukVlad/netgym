#!/usr/bin/env node
// Writes the web build's notices page: THIRD_PARTY_NOTICES.md as escaped,
// preformatted text in a plain UTF-8 HTML page (a .md file would download
// rather than display on a static host). Usage: node tools/notices-page.mjs <file>
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

export function noticesPage(text) {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>NetGym: licences and third-party notices</title>
<style>body{margin:0 auto;max-width:860px;padding:24px;font:15px/1.5 system-ui,sans-serif;background:#fff;color:#1b2636}pre{white-space:pre-wrap;word-wrap:break-word;font:13px/1.45 ui-monospace,monospace}</style>
</head>
<body>
<p><a href="./">← NetGym</a> · <a href="LICENSE.txt">LICENSE</a> · <a href="OFL.txt">OFL.txt</a> · <a href="THIRD_PARTY_NOTICES.md">THIRD_PARTY_NOTICES.md</a></p>
<pre>${escaped}</pre>
</body>
</html>
`;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file) { console.error('Usage: node tools/notices-page.mjs <THIRD_PARTY_NOTICES.md>'); process.exit(2); }
  process.stdout.write(noticesPage(readFileSync(file, 'utf8')));
}
