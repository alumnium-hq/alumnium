#!/usr/bin/env bash

# This script publishes TypeScript packages to npm registry in correct order.
# It is not meant to be run locally, but only in GitHub Actions workflow
# to enable provenance.

set -euo pipefail

echo "🚧 Publishing Alumnium npm packages...\n"
echo

# No CI, no provenance, no publish.
if [ -z "${CI:-}" ]; then
	echo "🔴 Not in CI environment, skipping publish"
	exit 0
fi

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
DIST_NPM_DIR="$PKG_DIR/dist/npm"

publish_pkg() {
	local pkg="$1"

	[[ -f "$pkg" ]] || return 0

	echo -e "🌀️ Publishing $pkg...\n"
	npm publish "$pkg" --provenance --access public
	echo -e "\n🟢 $pkg published\n"
}

cd "$DIST_NPM_DIR"

for pkg in alumnium-cli-*.tgz; do
	publish_pkg "$pkg"
done

echo "🎉 All npm packages published!"
