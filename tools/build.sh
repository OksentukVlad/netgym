#!/usr/bin/env bash
# Builds Windows .exe files into dist/ and keeps each web build in dist/web/<target>/.
# Usage: tools/build.sh [target-id ...]  (default: every target in tools/targets.tsv)
# Each target is src/targets/<id>.js; tools/targets.tsv gives its exe stem and window title.
# Builds run one at a time: they share the shell/ staging directory.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
source "$root/tools/env.sh"
mkdir -p "$root/dist"
# index.html is tracked: put its title back however the script ends (a failed
# wails build would otherwise leave the last target's title behind).
trap 'sed -i "s|<title>.*</title>|<title>NetGym</title>|" "$root/shell/frontend/index.html"' EXIT
ids=("$@")
[ ${#ids[@]} -gt 0 ] || mapfile -t ids < <(grep -v '^#' "$root/tools/targets.tsv" | cut -f1)
for id in "${ids[@]}"; do
  line="$(grep -P "^$id\t" "$root/tools/targets.tsv")" || { echo "unknown target: $id" >&2; exit 1; }
  entry="$root/src/targets/$id.js"
  [ -f "$entry" ] || { echo "missing target file: $entry" >&2; exit 1; }
  stem="$(cut -f2 <<<"$line")"; title="$(cut -f3 <<<"$line")"
  # The title goes into a Go string and a sed replacement: escape each.
  go_title="${title//\\/\\\\}"; go_title="${go_title//\"/\\\"}"
  sed_title="$(printf '%s' "$title" | sed 's/[\\|&]/\\&/g')"
  printf 'package main\n\nconst appTitle = "%s"\n' "$go_title" > "$root/shell/app_title.go"
  sed -i "s|<title>.*</title>|<title>$sed_title</title>|" "$root/shell/frontend/index.html"
  # Never the web build's flag (src/app/platform.js): the app shows no browser note.
  (cd "$root/shell" && env -u NETGYM_WEB NETGYM_TARGET="$entry" wails build -platform windows/amd64 -clean -o "$stem.exe" >/dev/null)
  cp "$root/shell/build/bin/$stem.exe" "$root/dist/$stem.exe"
  rm -rf "$root/dist/web/$id" && mkdir -p "$root/dist/web" && cp -r "$root/shell/frontend/dist" "$root/dist/web/$id"
  echo "built dist/$stem.exe ($(du -h "$root/dist/$stem.exe" | cut -f1))"
done
