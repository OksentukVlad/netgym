# Source this to use the project-local Go and Wails in .tools/.
_root="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
export GOROOT="$_root/.tools/go" GOPATH="$_root/.tools/gopath" GOCACHE="$_root/.tools/gocache"
export GOTOOLCHAIN=local PATH="$_root/.tools/go/bin:$_root/.tools/gopath/bin:$PATH"
unset _root
