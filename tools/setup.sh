#!/usr/bin/env bash
# Installs the toolchain the original apps were built with into .tools/:
# Go 1.23.4 (from the official module proxy) and the Wails v2.12.0 CLI.
set -euo pipefail
root="$(cd "$(dirname "$0")/.." && pwd)"
mkdir -p "$root/.tools"
cd "$root/.tools"
if [ ! -x go/bin/go ]; then
  curl -fsSLo tc.zip https://proxy.golang.org/golang.org/toolchain/@v/v0.0.1-go1.23.4.linux-amd64.zip
  python3 -I -m zipfile -e tc.zip .
  mv "golang.org/toolchain@v0.0.1-go1.23.4.linux-amd64" go
  rm -rf golang.org tc.zip
  chmod +x go/bin/* go/pkg/tool/linux_amd64/*
fi
source "$root/tools/env.sh"
[ -x "$GOPATH/bin/wails" ] || go install github.com/wailsapp/wails/v2/cmd/wails@v2.12.0
go version
wails version | head -1
