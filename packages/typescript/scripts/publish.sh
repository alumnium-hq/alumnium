#!/usr/bin/env bash

# This script publishes TypeScript packages to npm registry in correct order.
# It is not meant to be run locally, but only in GitHub Actions workflow
# to enable provenance.

set -euo pipefail

echo -e "🚧 Publishing Alumnium npm packages...\n"

# No CI, no provenance, no publish.
if [ -z "${CI:-}" ]; then
	echo "🔴 Not in CI environment! Publishing requires configured OIDC, so only works in GitHub Actions at the moment."
	exit 1
fi

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
DIST_NPM_DIR="$PKG_DIR/dist/npm"
VERSION="$(mise //packages/typescript:version)"

publish_pkg() {
	local pkg="$1"

	[[ -f "$pkg" ]] || return 0

	echo -e "🌀️ Publishing $pkg...\n"
	npm publish "$pkg" --provenance --access public
	echo -e "\n🟢 $pkg published\n"
}

cd "$DIST_NPM_DIR"

for pkg in alumnium-cli-*-"$VERSION".tgz; do
	publish_pkg "$pkg"
done

publish_pkg "alumnium-$VERSION.tgz"

echo "🎉 All npm packages published!"
