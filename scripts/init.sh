#!/bin/sh
# Initialize from any working directory; keep orchestration shared with the Node task runner.
set -eu
QUICKLANG_ROOT=$(CDPATH= cd -- "$(dirname -- "$0")/.." && pwd)
if [ "${1:-}" = "--help" ] || [ "${1:-}" = "-h" ]; then
  echo 'Usage: scripts/init.sh'
  echo 'Prepare local Rust, dependencies, seekdb runtime and word library.'
  echo 'Requires macOS 15+ Apple Silicon, Node.js 22.12+ and Command Line Tools.'
  echo 'Optional: QUICKLANG_NETWORK=auto|proxy|direct, QUICKLANG_DATA_DIR=/absolute/path'
  exit 0
fi
if [ "$#" -ne 0 ]; then
  echo 'Unknown argument. Use scripts/init.sh --help.' >&2
  exit 1
fi
if ! command -v node >/dev/null 2>&1; then
  echo 'Node.js 22.12+ is required. Install Node.js, then rerun scripts/init.sh.' >&2
  exit 1
fi
if ! node -e 'const [major, minor] = process.versions.node.split(".").map(Number); process.exit(major > 22 || (major === 22 && minor >= 12) ? 0 : 1)'; then
  echo 'Node.js 22.12+ is required. Upgrade Node.js, then rerun scripts/init.sh.' >&2
  exit 1
fi
exec node "$QUICKLANG_ROOT/scripts/tasks.mjs" init
