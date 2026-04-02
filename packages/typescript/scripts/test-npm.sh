#!/usr/bin/env bash

# This script tests built npm packages by emulating usage.

set -euo pipefail

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."

MODULES=(esm cjs)

echo -e "🚧 Running npm package tests...\n"

for module in "${MODULES[@]}"; do
	echo -e "🌀 Testing $module module\n"

	cd "$PKG_DIR/tests/npm/$module"

	if pnpm_output=$(mise x pnpm -- pnpm install 2>&1); then
		echo "🟢 Package OK: 'pnpm install' executed successfully"
	else
		echo -e "🔴 Package FAIL: 'pnpm install' failed\n"
		echo "--- Output ------------------------------------------"
		echo "$pnpm_output"
		echo "-----------------------------------------------------"
		exit 1
	fi

	if version_output=$(mise x pnpm -- pnpm exec alumnium --version 2>&1); then
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

	ALUMNIUM_LOG_LEVEL=warning fnox exec -- mise x pnpm -- pnpm exec playwright test --retries=3

	echo -e "\n🟢 Playwright OK: Tests executed successfully"
	echo -e "\n🟢 $module module OK: All tests passed\n"

	cd - >/dev/null
done

echo -e "\n🎉 All npm package tests passed!\n"
