#!/usr/bin/env bash

# This script tests built pip wheels by emulating usage.

set -euo pipefail

PKG_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
TEST_DIR="$PKG_DIR/tests/pip"

VERSION="$(mise //:version)"

write_pyproject_toml() {
	cat >"$TEST_DIR/pyproject.toml" <<EOF
[project]
name = "alumnium-test-pip"
version = "0.1.0"
description = "Test package for pip wheels"
requires-python = ">=3.10"
dependencies = [
	"alumnium==$VERSION",
	"alumnium-cli==$VERSION; (sys_platform == 'linux' or sys_platform == 'darwin' or sys_platform == 'win32') and (platform_machine == 'x86_64' or platform_machine == 'amd64' or platform_machine == 'AMD64' or platform_machine == 'aarch64' or platform_machine == 'arm64' or platform_machine == 'ARM64')",
	"playwright>=1.49,<2.0",
	"pytest-retry>=1.7.0,<2.0.0",
	"pytest>=8.3.3,<9.0.0",
]

[[tool.uv.sources.alumnium]]
path = "../../dist/alumnium-$VERSION-py3-none-any.whl"

[[tool.uv.sources.alumnium-cli]]
path = "../../../typescript/dist/pip/alumnium_cli-$VERSION-py3-none-manylinux_2_28_x86_64.whl"
marker = "sys_platform == 'linux' and (platform_machine == 'x86_64' or platform_machine == 'amd64' or platform_machine == 'AMD64')"

[[tool.uv.sources.alumnium-cli]]
path = "../../../typescript/dist/pip/alumnium_cli-$VERSION-py3-none-manylinux_2_28_aarch64.whl"
marker = "sys_platform == 'linux' and (platform_machine == 'aarch64' or platform_machine == 'arm64' or platform_machine == 'ARM64')"

[[tool.uv.sources.alumnium-cli]]
path = "../../../typescript/dist/pip/alumnium_cli-$VERSION-py3-none-macosx_x86_64.whl"
marker = "sys_platform == 'darwin' and (platform_machine == 'x86_64' or platform_machine == 'amd64' or platform_machine == 'AMD64')"

[[tool.uv.sources.alumnium-cli]]
path = "../../../typescript/dist/pip/alumnium_cli-$VERSION-py3-none-macosx_arm64.whl"
marker = "sys_platform == 'darwin' and (platform_machine == 'aarch64' or platform_machine == 'arm64' or platform_machine == 'ARM64')"

[[tool.uv.sources.alumnium-cli]]
path = "../../../typescript/dist/pip/alumnium_cli-$VERSION-py3-none-win_amd64.whl"
marker = "sys_platform == 'win32' and (platform_machine == 'x86_64' or platform_machine == 'amd64' or platform_machine == 'AMD64')"

[[tool.uv.sources.alumnium-cli]]
path = "../../../typescript/dist/pip/alumnium_cli-$VERSION-py3-none-win_arm64.whl"
marker = "sys_platform == 'win32' and (platform_machine == 'aarch64' or platform_machine == 'arm64' or platform_machine == 'ARM64')"
EOF
}

echo -e "🚧 Running pip package tests...\n"

cd "$TEST_DIR"

uv venv --clear --quiet
source .venv/bin/activate
rm -f uv.lock

write_pyproject_toml

if uv_output=$(uv sync 2>&1); then
	echo "🟢 Package OK: 'uv sync' executed successfully"
else
	echo -e "🔴 Package FAIL: 'uv sync' failed\n"
	echo "--- Output ------------------------------------------"
	echo "$uv_output"
	echo "-----------------------------------------------------"
	exit 1
fi

if version_output=$(uv run alumnium --version 2>&1); then
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

echo -e "\n🌀 Running pytest Playwright smoke test\n"

ALUMNIUM_LOG_LEVEL=warning fnox exec -- uv run pytest --retries=3

echo -e "\n🟢 Pytest OK: Tests executed successfully"
echo -e "\n🎉 All pip package tests passed!\n"
