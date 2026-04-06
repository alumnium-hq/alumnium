#!/usr/bin/env bash

set -euo pipefail

BUILD_SUBSCRIPT="${BUILD_SUBSCRIPT:-false}"

if [ "$BUILD_SUBSCRIPT" != "true" ]; then
	echo -e "🚧 Generating source tarball for pip package...\n"
fi

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
DIST_DIR="$PKG_DIR/dist"
SRC_TAR_GZ_NAME="alumnium-cli-$VERSION.tar.gz"
SRC_TAR_GZ_PATH="$DIST_DIR/pip/$SRC_TAR_GZ_NAME"

tmp_dir="$(mktemp -d)"
trap 'rm -rf "$tmp_dir"' EXIT

# Copy pip directories to temp, zeroing out binaries
while IFS= read -r -d '' dir; do
	cp -r "$dir" "$tmp_dir/"
	find "$tmp_dir/$(basename "$dir")" -path '*/src/alumnium_cli/alumnium-*' \
		-exec sh -c ': > "$1"' _ {} \;
done < <(find "$DIST_DIR" -maxdepth 1 -type d -name 'pip-alumnium-cli*' -print0)

# Archive from temp directory, excluding ruff cache
tar -czf "$SRC_TAR_GZ_PATH" \
	--exclude='*.ruff_cache*' \
	-C "$tmp_dir" \
	.

if [ "$BUILD_SUBSCRIPT" = "true" ]; then
	echo "🟢 Pip source tarball: $SRC_TAR_GZ_PATH"
else
	echo "🎉 Generated source tarball: $SRC_TAR_GZ_PATH"
fi

if [ -n "${BUILD_DEBUG:-}" ]; then
	tmp_debug_dir="$(mktemp -d)"
	tar -xf "$SRC_TAR_GZ_PATH" -C "$tmp_debug_dir"
	echo -e "\n📦 Contents of the generated tarball:\n"
	tree "$tmp_debug_dir"
fi
