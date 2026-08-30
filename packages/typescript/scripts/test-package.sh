#!/usr/bin/env bash

# This script tests built npm packages by emulating real consumer usage.
#
# The fixtures (tests/npm/{esm,cjs}) are run from a temporary directory OUTSIDE
# the repository on purpose. Node resolves bare imports by walking up the
# directory tree through every parent node_modules, so running inside the
# monorepo lets the published package resolve packages that are only the repo's
# devDependencies, masking missing runtime dependencies that break real installs.
# See https://github.com/alumnium-hq/alumnium/issues/380
#
# The built packages are installed from their tarballs (not the dist dirs). pnpm
# extracts a tarball into its store — a real copy — so the package resolves its
# dependencies from the isolated temp dir. Installing a dist *directory* instead
# would symlink it back into the repo, defeating the isolation above.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
REPO_ROOT="$(cd "$PKG_DIR/../.." && pwd)"
DIST_DIR="$PKG_DIR/dist"
DIST_NPM_DIR="$DIST_DIR/npm"
FIXTURES_DIR="$PKG_DIR/tests/npm"
FNOX_CONFIG="$REPO_ROOT/fnox.toml"
PLAYWRIGHT_VERSION="$(PKG_DIR="$PKG_DIR" bun -e \
	'console.log(require(`${process.env.PKG_DIR}/node_modules/playwright/package.json`).version)')"

# The CLI ships as a platform-specific package; `alumnium --version` loads its
# prebuilt binary. Install the tarball matching the host so the binary resolves.
case "$(uname -s)" in
Linux) HOST_OS=linux ;;
Darwin) HOST_OS=darwin ;;
*) HOST_OS=windows ;;
esac
case "$(uname -m)" in
x86_64 | amd64) HOST_ARCH=x64 ;;
arm64 | aarch64) HOST_ARCH=arm64 ;;
*) HOST_ARCH=x64 ;;
esac

# The build cleans stale tarballs, so exactly one of each matches after a build.
ALUMNIUM_TARBALL=""
CLI_TARBALL=""
shopt -s nullglob
for tarball in "$DIST_NPM_DIR"/alumnium-*.tgz; do
	case "$(basename "$tarball")" in
	"alumnium-cli-$HOST_OS-$HOST_ARCH"-*) CLI_TARBALL="$tarball" ;;
	alumnium-cli-*) ;; # CLI for other platforms — ignore
	*) ALUMNIUM_TARBALL="$tarball" ;;
	esac
done
shopt -u nullglob

if [ -z "$ALUMNIUM_TARBALL" ] || [ -z "$CLI_TARBALL" ]; then
	echo "🔴 Missing tarballs in $DIST_NPM_DIR — run the full build first." >&2
	exit 1
fi

ALUMNIUM_PKG_NAME="alumnium"
CLI_PKG_NAME="@alumnium/cli-$HOST_OS-$HOST_ARCH"

MODULES=(esm cjs)

WORK_ROOT="$(mktemp -d)"
trap 'rm -rf "$WORK_ROOT"' EXIT

echo -e "🚧 Running npm package tests...\n"

for module in "${MODULES[@]}"; do
	echo -e "🌀 Testing $module module\n"

	work_dir="$WORK_ROOT/$module"
	mkdir -p "$work_dir"

	# Stage only the fixture's source files (not its in-repo node_modules). The
	# package.json is generated below rather than copied so it can pin the exact
	# Playwright version and reference the freshly built `alumnium`/CLI tarballs
	# by absolute path — repo-relative paths that must never be committed.
	cp "$FIXTURES_DIR/$module/example.spec.js" \
		"$FIXTURES_DIR/$module/pnpm-workspace.yaml" \
		"$work_dir/"

	cd "$work_dir"

	case "$module" in
	esm) module_type="module" ;;
	*) module_type="commonjs" ;;
	esac

	cat >package.json <<EOF
{
  "name": "@alumnium/test-npm-$module",
  "private": true,
  "type": "$module_type",
  "dependencies": {
    "@playwright/test": "$PLAYWRIGHT_VERSION",
    "$ALUMNIUM_PKG_NAME": "file:$ALUMNIUM_TARBALL",
    "$CLI_PKG_NAME": "file:$CLI_TARBALL"
  }
}
EOF

	if pnpm_output=$(pnpm install 2>&1); then
		echo "🟢 Package OK: dependencies installed successfully"
	else
		echo -e "🔴 Package FAIL: 'pnpm install' failed\n"
		echo "--- Output ------------------------------------------"
		echo "$pnpm_output"
		echo "-----------------------------------------------------"
		exit 1
	fi

	SMOKE_PLAYWRIGHT_VERSION="$(pnpm exec playwright --version)"
	SMOKE_PLAYWRIGHT_VERSION="${SMOKE_PLAYWRIGHT_VERSION#Version }"
	if [[ "$SMOKE_PLAYWRIGHT_VERSION" != "$PLAYWRIGHT_VERSION" ]]; then
		echo "🔴 Playwright version mismatch: expected $PLAYWRIGHT_VERSION, got $SMOKE_PLAYWRIGHT_VERSION"
		exit 1
	fi

	if version_output=$(pnpm exec alumnium --version 2>&1); then
		if [[ "$version_output" == *"alumnium/"* ]]; then
			echo "🟢 Binary OK: 'alumnium --version' printed '$version_output'"
		else
			echo "🔴 Binary FAIL: 'alumnium --version' output is incorrect: $version_output"
			exit 1
		fi
	else
		echo -e "🔴 Binary FAIL: 'alumnium --version' failed to execute\n"
		echo "--- Output ------------------------------------------"
		echo "$version_output"
		echo "-----------------------------------------------------"
		exit 1
	fi

	echo -e "\n🌀 Running Playwright with $module module"

	ALUMNIUM_LOG_LEVEL=warning fnox exec -c "$FNOX_CONFIG" -- pnpm exec playwright test --retries=3

	echo -e "\n🟢 Playwright OK: Tests executed successfully"
	echo -e "\n🟢 $module module OK: All tests passed\n"

	cd - >/dev/null
done

echo -e "\n🎉 All npm package tests passed!\n"
