#!/usr/bin/env bash
# Builds the NetGym web version (the GitHub Pages site) into one directory.
# Usage: tools/build-web.sh [out-dir]   (default: dist/pages)
# Needs shell/frontend/node_modules (npm ci there); no Go or Wails.
# NETGYM_WEB=1 turns on the start screen's browser note and notices link;
# assets are relative (base './'), so the site works under any subpath.
# The site also gets LICENSE (as LICENSE.txt), THIRD_PARTY_NOTICES.md, the font's OFL.txt and
# third-party-notices.html (the page the start screen links to).
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
out="${1:-$root/dist/pages}"
mkdir -p "$out"
out="$(cd "$out" && pwd)"
case "$out" in
  /|"$root"|"$root/shell"*|"$root/src"*|"$HOME") echo "refusing to build into $out" >&2; exit 1 ;;
esac
frontend="$root/shell/frontend"
vite="$frontend/node_modules/.bin/vite"
[ -x "$vite" ] || { echo "missing $vite: run npm ci in shell/frontend" >&2; exit 1; }
entry="$root/src/targets/netgym.js"
[ -f "$entry" ] || { echo "missing target file: $entry" >&2; exit 1; }
(cd "$frontend" && NETGYM_WEB=1 NETGYM_TARGET="$entry" "$vite" build --outDir "$out" --emptyOutDir --logLevel warn)
cp "$root/LICENSE" "$out/LICENSE.txt"
cp "$root/THIRD_PARTY_NOTICES.md" "$out/"
cp "$frontend/src/assets/fonts/OFL.txt" "$out/OFL.txt"
node "$root/tools/notices-page.mjs" "$root/THIRD_PARTY_NOTICES.md" > "$out/third-party-notices.html"
echo "built the web version into $out ($(du -sh "$out" | cut -f1))"
