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

cd "$DIST_DIR"

tmp_tar="$(mktemp).tar"

# Archive without the binaries
tar -cf "$tmp_tar" \
	--warning=no-all \
	--exclude='*/src/alumnium_cli/alumnium-*' \
	--exclude='*.ruff_cache*' \
	$(find . -maxdepth 1 -type d -name 'pip-alumnium-cli*' -printf '%P\n')

# Zero out the binaries
empty_file=".empty"
: >"$empty_file"
while IFS= read -r f; do
	tar --append -f "$tmp_tar" \
		--warning=no-all \
		--transform "s|.*|$f|" \
		"$empty_file"
done < <(find pip-alumnium-cli* -path '*/src/alumnium_cli/alumnium-*')
rm "$empty_file"

cd - >/dev/null

gzip -c "$tmp_tar" >"$SRC_TAR_GZ_PATH"
rm "$tmp_tar"

if [ "$BUILD_SUBSCRIPT" = "true" ]; then
	rel_path="$(realpath --relative-to="$PWD" "$SRC_TAR_GZ_PATH")"
	echo "🟢 Pip source tarball: $rel_path"
else
	echo "🎉 Generated source tarball: $SRC_TAR_GZ_PATH"
fi

if [ -n "${BUILD_DEBUG:-}" ]; then
	tmp_debug_dir="$(mktemp -d)"
	tar -xf "$SRC_TAR_GZ_PATH" -C "$tmp_debug_dir"
	echo -e "\n📦 Contents of the generated tarball:\n"
	tree "$tmp_debug_dir"
fi
