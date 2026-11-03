#!/usr/bin/env bash
set -euo pipefail

project_root="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$project_root"
case "$#:${1:-}" in
  0:) export NETGYM_TEST_MODE=fast ;;
  1:--full) export NETGYM_TEST_MODE=full ;;
  *) echo 'Usage: tools/test.sh [--full]' >&2; exit 2 ;;
esac

# The lock file is outside .test-bundles: cleaning bundles must not replace
# the locked inode. flock releases on exit; never remove this file.
exec 9>tools/.test.lock
if ! flock -n 9; then
  echo "Another test run holds the worktree lock: $project_root" >&2
  exit 75
fi

pids=()
cleanup() {
  local status=$?
  trap - EXIT INT TERM HUP
  if [[ -n ${wake_pid:-} ]]; then
    kill -TERM "$wake_pid" 2>/dev/null || true
    wait "$wake_pid" 2>/dev/null || true
  fi
  for pid in "${pids[@]}"; do kill -TERM "$pid" 2>/dev/null || true; done
  # Bound shutdown even for a shard that ignores TERM. Signal only owned PIDs.
  for ((attempt=0; attempt<100; attempt++)); do
    alive=0
    for pid in "${pids[@]}"; do
      if kill -0 "$pid" 2>/dev/null; then alive=1; fi
    done
    if (( ! alive )); then break; fi
    sleep .05
  done
  for pid in "${pids[@]}"; do kill -KILL "$pid" 2>/dev/null || true; done
  for pid in "${pids[@]}"; do wait "$pid" 2>/dev/null || true; done
  exit "$status"
}
trap cleanup EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
trap 'exit 129' HUP

run_stage() {
  "$@" &
  pids=("$!")
  local status=0
  wait "${pids[0]}" || status=$?
  pids=()
  return "$status"
}

# Bash wait -n ignores statuses already reported while a foreground validator
# ran. Drain those with wait PID first. A one-second wakeup closes the race
# between the liveness scan and wait -n if another child exits in that gap.
wait_next() {
  local pid status
  while :; do
    for pid in "${pids[@]}"; do
      if ! kill -0 "$pid" 2>/dev/null; then
        completed=$pid
        status=0
        wait "$completed" || status=$?
        return "$status"
      fi
    done
    sleep 1 &
    wake_pid=$!
    status=0
    wait -n -p completed "${pids[@]}" "$wake_pid" 2>/dev/null || status=$?
    if [[ ${completed:-} == "$wake_pid" ]]; then
      wake_pid=""
      continue
    fi
    kill -TERM "$wake_pid" 2>/dev/null || true
    wait "$wake_pid" 2>/dev/null || true
    wake_pid=""
    if [[ -n ${completed:-} ]]; then return "$status"; fi
  done
}

# Entry points are explicit: mounted-results.mjs is the validator, not a helper.
mounted_helpers=(routing firewall ip vlan vlan3 setup shared dhcp)
declare -A registered_helpers
for helper in "${mounted_helpers[@]}"; do
  path="tests/helpers/mounted-$helper.mjs"
  [[ -f $path ]] || { echo "Registered mounted helper missing: $path" >&2; exit 1; }
  registered_helpers[$path]=1
done
for path in tests/helpers/mounted-*.mjs; do
  [[ $path == tests/helpers/mounted-results.mjs ]] && continue
  if [[ ! -v registered_helpers[$path] ]]; then
    echo "Unregistered mounted helper: $path (add it to tools/test.sh)" >&2
    exit 1
  fi
done

export NODE_PATH="${NETGYM_TEST_NODE_MODULES:-$project_root/shell/frontend/node_modules}"
mkdir -p .test-bundles
run_stage "$NODE_PATH/.bin/esbuild" src/targets/*.js \
  --bundle --platform=node --format=esm --jsx=automatic \
  --outdir=.test-bundles/targets --out-extension:.js=.mjs
run_stage "$NODE_PATH/.bin/esbuild" tests/harness/*.jsx \
  --bundle --platform=node --format=esm --jsx=automatic \
  --banner:js="import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" \
  --outdir=.test-bundles/harness --out-extension:.js=.mjs

# Each timeout owns its helper and forwards TERM to it on cleanup. KILL after
# five seconds also bounds a helper that ignores TERM. Keep separate fresh logs.
declare -A helpers starts
for helper in "${mounted_helpers[@]}"; do
  starts[$helper]=$EPOCHREALTIME
  NETGYM_MOUNTED_TIMING="$project_root/.test-bundles/mounted-$helper.timing.json" \
    timeout --kill-after=5 240 node --import "$project_root/tools/test-mounted-profile.mjs" "tests/helpers/mounted-$helper.mjs" \
    > ".test-bundles/mounted-$helper.jsonl" 2> ".test-bundles/mounted-$helper.stderr" &
  pid=$!
  pids+=("$pid")
  helpers[$pid]=$helper
done
while ((${#pids[@]})); do
  status=0
  wait_next || status=$?
  helper=${helpers[$completed]}
  remaining=()
  for pid in "${pids[@]}"; do
    if [[ $pid != "$completed" ]]; then remaining+=("$pid"); fi
  done
  pids=("${remaining[@]}")
  echo "mounted-$helper: ${starts[$helper]} → $EPOCHREALTIME (exit $status)" >&2
  if ((status)); then
    echo "mounted-$helper failed (exit $status; 124 means timeout); see .test-bundles/mounted-$helper.stderr" >&2
    cat ".test-bundles/mounted-$helper.stderr" >&2
    exit "$status"
  fi
  # Do not replace the helpers' PID list while validating a completed output.
  if ! node tests/helpers/mounted-results.mjs "$helper" ".test-bundles/mounted-$helper.jsonl"; then
    echo "mounted-$helper returned invalid or failing results" >&2
    exit 1
  fi
done

export NETGYM_MOUNTED_RESULTS="$project_root/.test-bundles/mounted-routing.jsonl"
export NETGYM_MOUNTED_FIREWALL_RESULTS="$project_root/.test-bundles/mounted-firewall.jsonl"
export NETGYM_MOUNTED_IP_RESULTS="$project_root/.test-bundles/mounted-ip.jsonl"
export NETGYM_MOUNTED_VLAN_RESULTS="$project_root/.test-bundles/mounted-vlan.jsonl"
export NETGYM_MOUNTED_VLAN3_RESULTS="$project_root/.test-bundles/mounted-vlan3.jsonl"
export NETGYM_MOUNTED_SETUP_RESULTS="$project_root/.test-bundles/mounted-setup.jsonl"
export NETGYM_MOUNTED_SHARED_RESULTS="$project_root/.test-bundles/mounted-shared.jsonl"
export NETGYM_MOUNTED_DHCP_RESULTS="$project_root/.test-bundles/mounted-dhcp.jsonl"
# Bash launches bounded shards because nested Node process creation is denied in
# restricted executors. Each Node still uses --test-isolation=none. No workers.
# Profiling only affects scheduling costs; every discovered test file runs once.
jobs=${NETGYM_TEST_JOBS:-3}
case "$jobs" in 1|2|3) ;; *) echo 'NETGYM_TEST_JOBS must be 1, 2 or 3' >&2; exit 2 ;; esac
run_stage node tools/test-plan.mjs "$jobs"
profiles=()
declare -A shards
for ((shard=0; shard<jobs; shard++)); do
  mapfile -t files < ".test-bundles/shard-$shard.files"
  reporter_args=()
  profile=""
  if [[ -n ${NETGYM_TEST_PROFILE:-} ]]; then
    profile="$project_root/.test-bundles/profile-shard-$shard.json"
    profiles+=("$profile")
    reporter_args=(--test-reporter=spec --test-reporter-destination=stdout
      --test-reporter="$project_root/tools/test-profile.mjs"
      --test-reporter-destination="$project_root/.test-bundles/profile-reporter-$shard.txt")
  fi
  NETGYM_TEST_PROFILE="$profile" node --test --test-isolation=none "${reporter_args[@]}" "${files[@]}" \
    > ".test-bundles/shard-$shard.stdout" 2> ".test-bundles/shard-$shard.stderr" &
  pid=$!
  pids+=("$pid")
  shards[$pid]=$shard
done
while ((${#pids[@]})); do
  status=0
  wait_next || status=$?
  shard=${shards[$completed]}
  remaining=()
  for pid in "${pids[@]}"; do
    if [[ $pid != "$completed" ]]; then remaining+=("$pid"); fi
  done
  pids=("${remaining[@]}")
  cat ".test-bundles/shard-$shard.stdout"
  if ((status)); then
    echo "Node test shard $shard failed (exit $status)" >&2
    cat ".test-bundles/shard-$shard.stderr" >&2
    exit "$status"
  fi
done
if [[ -n ${NETGYM_TEST_PROFILE:-} ]]; then
  run_stage node tools/test-profile-merge.mjs "$NETGYM_TEST_PROFILE" "${profiles[@]}"
fi
if [[ $NETGYM_TEST_MODE == full ]]; then
  run_stage node tools/step9-sweep.mjs --output .test-bundles/step9-sweep.json
  run_stage node tools/vlan-sweep.mjs 200 > .test-bundles/vlan-sweep.json
fi
