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

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/../../packages/typescript" && pwd)"
DIST_NPM_DIR="$PKG_DIR/dist/npm"
PUBLISH_ORDER="$PKG_DIR/dist/npm-publish-order.txt"
VERSION="$(mise //packages/typescript:version)"

publish_pkg() {
	local pkg="$1"

	[[ -f "$pkg" ]] || return 0

	# Skip versions already on the registry, so a failed release can be re-run.
	local name
	name="$(tar -xOzf "$pkg" package/package.json | node -p 'JSON.parse(require("fs").readFileSync(0, "utf-8")).name')"
	if npm view "$name@$VERSION" version >/dev/null 2>&1; then
		echo -e "⏭️ $name@$VERSION is already published, skipping\n"
		return 0
	fi

	echo -e "🌀️ Publishing $pkg...\n"
	PUBLISH_ARGS=("--provenance" "--access=public")
	if [[ "$VERSION" == *alpha* ]]; then
		PUBLISH_ARGS+=("--tag=next")
	fi
	npm publish "$pkg" "${PUBLISH_ARGS[@]}"
	echo -e "\n🟢 $pkg published\n"
}

cd "$DIST_NPM_DIR"

# Dependencies go first: workspace packages in dependency order (written by
# scripts/build/build.ts), then the platform CLI packages and finally alumnium, which
# depends on all of them.
while read -r pkg; do
	[[ -f "$pkg" ]] || {
		echo "🔴 Missing $pkg, run the full build first."
		exit 1
	}
	publish_pkg "$pkg"
done <"$PUBLISH_ORDER"

for pkg in alumnium-cli-*-"$VERSION".tgz; do
	publish_pkg "$pkg"
done

publish_pkg "alumnium-$VERSION.tgz"

echo "🎉 All npm packages published!"
