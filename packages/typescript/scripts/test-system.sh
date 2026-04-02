#!/usr/bin/env bash

# This script run TypeScript system tests using Vitest against driver passed
# via ALUMNIUM_DRIVER env var.

set -euo pipefail

TEST_FILTER="${TEST_FILTER:-}"
PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."

failed=0
run_tests() {
	if "$@"; then
		echo -e "\n🟢 OK\n"
	else
		echo -e "\n🔴 FAILED\n"
		failed=1
	fi
}

cd "$PKG_DIR"

export ALUMNIUM_LOG_LEVEL=debug
export ALUMNIUM_LOG_FILENAME=test-system-$ALUMNIUM_DRIVER.log
export ALUMNIUM_PRUNE_LOGS=true
export TEST_PLAYWRIGHT_HEADLESS=true

echo -e "🌀 Running vitest tests\n"
if [ -n "${TEST_FILTER}" ]; then
	echo "🔵 Using test filter '$TEST_FILTER'"
	run_tests fnox exec -- \
		bun vitest --project system --hideSkippedTests run "$TEST_FILTER"
else
	run_tests fnox exec -- \
		bun vitest --project system run
fi

echo
if [ $failed -ne 0 ]; then
	echo "🔴 Some tests failed"
	exit 1
else
	echo "🟢 All tests passed"
fi
