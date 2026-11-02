#!/usr/bin/env bash
# Exports the public NetGym tree: the tracked files of one commit that the
# allowlist below names, into a separate working copy, then runs the leak scan
# (tools/leak-scan.mjs, with tools/leak-scan-exceptions.tsv) over it and, when
# given, over a built web site. It never commits or pushes.
#
# Usage: tools/export-public.sh [--commit REV] [--target DIR] [--artifact DIR]
#   --commit    the commit to export (default: main)
#   --target    the public working copy (default: ~/projects/netgym-public);
#               it must be missing, empty, or an earlier export. Its .git/
#               is kept; every other file not in this export is deleted.
#   --artifact  a built site (tools/build-web.sh) to scan as well
# Exit: 0 clean; 1 leak findings or a refused export; 2 usage.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
commit=main target="$HOME/projects/netgym-public" artifact=""
while [ $# -gt 0 ]; do
  case "$1" in
    --commit) commit="${2:?--commit needs a value}"; shift 2 ;;
    --target) target="${2:?--target needs a value}"; shift 2 ;;
    --artifact) artifact="${2:?--artifact needs a value}"; shift 2 ;;
    *) echo "Usage: tools/export-public.sh [--commit REV] [--target DIR] [--artifact DIR]" >&2; exit 2 ;;
  esac
done

# What goes public: these top-level files and directories, tracked at the commit.
allow_files=(README.md ARCHITECTURE.md LICENSE THIRD_PARTY_NOTICES.md .gitignore)
allow_dirs=(src shell tests tools .github)
# Never public: private notes and instructions, and generated or ignored paths
# (should any of them ever be tracked).
deny='^(notes/|AGENTS\.md$|CLAUDE\.md$|PLAN\.md$|ROADMAP\.md$|dist/|\.shots/|\.test-bundles/|\.tools/|shell/build/bin/|shell/frontend/dist/|shell/frontend/wailsjs/|shell/frontend/node_modules/|shell/app_title\.go$|shell/frontend/package\.json\.md5$|tools/\.test\.lock$)'

fail() { echo "export-public: $*" >&2; exit 1; }

sha="$(git -C "$root" rev-parse --verify --quiet "$commit^{commit}")" || fail "unknown commit: $commit"

# Checked before anything is created: not /, $HOME or this repository, and
# not inside another Git working tree (only its own .git, if any).
target="$(realpath -m -- "$target")"
case "$target/" in
  /|"$HOME/"|"$root/"*) fail "refusing target $target" ;;
esac
parent="$target"
while [ ! -d "$parent" ]; do parent="$(dirname "$parent")"; done
if top="$(git -C "$parent" rev-parse --show-toplevel 2>/dev/null)" && [ "$(realpath -- "$top")" != "$target" ]; then
  fail "refusing target $target: it is inside the Git working tree $top"
fi
mkdir -p "$target"
if [ -n "$(find "$target" -mindepth 1 -maxdepth 1 ! -name .git -print -quit)" ] \
   && ! { [ -f "$target/LICENSE" ] && [ -f "$target/src/targets/netgym.js" ]; }; then
  fail "$target is not empty and not an earlier export"
fi
if [ -n "$(find "$target" -path "$target/.git" -prune -o -type l -print -quit)" ]; then
  fail "$target contains symlinks"
fi

# The commit's tracked files: classify every one; symlinks and submodules are refused.
list="$(mktemp)"; trap 'rm -f "$list"' EXIT
unclassified=()
while IFS= read -r -d '' entry; do
  meta="${entry%%$'\t'*}" path="${entry#*$'\t'}"
  mode="${meta%% *}"
  case "$mode" in
    100644|100755) ;;
    120000) fail "symlink in $commit: $path" ;;
    *) fail "unsupported entry ($mode) in $commit: $path" ;;
  esac
  if [[ $path =~ $deny ]]; then continue; fi
  top="${path%%/*}"
  if [[ $path != */* ]]; then
    printf '%s\n' "${allow_files[@]}" | grep -qxF -- "$path" || { unclassified+=("$path"); continue; }
  else
    printf '%s\n' "${allow_dirs[@]}" | grep -qxF -- "$top" || { unclassified+=("$path"); continue; }
  fi
  printf '%s\0' "$path" >> "$list"
done < <(git -C "$root" ls-tree -r -z --full-tree "$sha")
[ ${#unclassified[@]} -eq 0 ] || fail "tracked files neither allowed nor excluded (classify them here): ${unclassified[*]}"
for f in "${allow_files[@]}"; do
  grep -qzxF -- "$f" "$list" || fail "missing from $commit: $f"
done

# Re-sync: delete files the export no longer has (never .git/) and the
# directories that leaves empty, then write all.
while IFS= read -r -d '' existing; do
  rel="${existing#"$target"/}"
  grep -qzxF -- "$rel" "$list" || rm -f -- "$existing"
done < <(find "$target" -path "$target/.git" -prune -o -type f -print0)
find "$target" -mindepth 1 -type d -empty ! -path "$target/.git" ! -path "$target/.git/*" -delete
xargs -0 -a "$list" env GIT_LITERAL_PATHSPECS=1 git -C "$root" archive --format=tar "$sha" -- | tar -x -C "$target"

count="$(tr -cd '\0' < "$list" | wc -c)"
echo "exported $count files from $commit ($sha) into $target"

# The exported scanner and exceptions: the reviewed versions at that commit.
scan=(node "$target/tools/leak-scan.mjs" --exceptions "$target/tools/leak-scan-exceptions.tsv" "$target")
[ -z "$artifact" ] || scan+=(--artifact "$artifact")
"${scan[@]}"
