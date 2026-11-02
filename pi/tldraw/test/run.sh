#!/usr/bin/env bash
set -euo pipefail

package_dir=$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)
root_dir=$(cd "$package_dir/../.." && pwd)
agent_dir=${PI_CODING_AGENT_DIR:-$HOME/.pi/agent}
read -r pi_version < "$agent_dir/install/current-version"
host_modules=${PI_TLDRAW_HOST_MODULES:-$agent_dir/install/releases/$pi_version/node_modules}

if [ -e "$package_dir/node_modules" ]; then
  echo "Refusing to replace existing $package_dir/node_modules" >&2
  exit 1
fi
mkdir -p "$package_dir/node_modules/@earendil-works"
ln -s "$host_modules/@earendil-works/pi-ai" "$package_dir/node_modules/@earendil-works/pi-ai"
ln -s "$host_modules/@earendil-works/pi-coding-agent" "$package_dir/node_modules/@earendil-works/pi-coding-agent"
ln -s "$host_modules/typebox" "$package_dir/node_modules/typebox"
trap 'rm -rf "$package_dir/node_modules"' EXIT

cd "$root_dir"
./node_modules/.bin/tsc -p pi/tldraw/tsconfig.json
./node_modules/.bin/tsx --test pi/tldraw/test/*.test.ts
