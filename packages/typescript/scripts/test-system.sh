#!/usr/bin/env bash

# This script run TypeScript system tests using Vitest against driver passed
# via ALUMNIUM_DRIVER env var.

set -euo pipefail

ALUMNIUM_MODEL="${ALUMNIUM_MODEL:-azure_openai}"
ALUMNIUM_CACHE_PATH="${ALUMNIUM_CACHE_PATH:-}"
ALUMNIUM_TEST_VITEST_ARGS="${ALUMNIUM_TEST_VITEST_ARGS:-}"
ALUMNIUM_TEST_CACHE="${ALUMNIUM_TEST_CACHE:-}"
PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."

failed=0
run_tests() {
	if "$@"; then
		echo "🟢 OK"
	else
		echo "🔴 FAILED"
		failed=1
	fi
}

cd "$PKG_DIR"

export ALUMNIUM_LOG_LEVEL=debug
export ALUMNIUM_LOG_FILENAME=test-system-$ALUMNIUM_DRIVER.log
export ALUMNIUM_PRUNE_LOGS=true
export ALUMNIUM_LOG_BUFFER_SIZE=0
export ALUMNIUM_LOG_FLUSH_INTERVAL=0

test_cache="false"
if [ -n "$ALUMNIUM_TEST_CACHE" ]; then
	test_cache="true"
	export ALUMNIUM_CACHE_PATH=".alumnium/cache/test/${ALUMNIUM_MODEL}"
fi

echo_setup() {
	echo "🔵 ALUMNIUM_MODEL=\"$ALUMNIUM_MODEL\""
	echo "🔵 ALUMNIUM_DRIVER=\"$ALUMNIUM_DRIVER\""
	echo "🔵 ALUMNIUM_LOG_FILENAME=\"$ALUMNIUM_LOG_FILENAME\""
	echo "🔵 ALUMNIUM_CACHE_PATH=\"$ALUMNIUM_CACHE_PATH\""
	echo "🔵 ALUMNIUM_TEST_CACHE=$test_cache"
	echo "🔵 ALUMNIUM_TEST_VITEST_ARGS=\"$ALUMNIUM_TEST_VITEST_ARGS\""
}

echo "🚧 Running system tests using:"
echo
echo_setup

if [ -n "$ALUMNIUM_TEST_CACHE" ]; then
	echo -e "\n🟡 Cache verification enabled, using cache path: $ALUMNIUM_CACHE_PATH"
	rm -rf "$ALUMNIUM_CACHE_PATH"
fi

echo -e "\n🌀 Running vitest tests"
run_tests fnox exec -- \
	bun vitest run --project system --hideSkippedTests $ALUMNIUM_TEST_VITEST_ARGS

if [ -n "$ALUMNIUM_TEST_CACHE" ]; then
	# NOTE: We wrap into `bash -c` to grep tree output rather than `run_tests`.

	echo -e "\n🌀 Checking responses cache"
	run_tests bash -c 'tree "$1" | grep responses -C 1' _ "$ALUMNIUM_CACHE_PATH"

	echo -e "\n🌀 Checking elements cache"
	run_tests bash -c 'tree "$1" | grep elements -C 1' _ "$ALUMNIUM_CACHE_PATH"
fi

echo
if [ $failed -ne 0 ]; then
	echo "🔴 Some tests failed using:"
	echo
	echo_setup
	exit 1
else
	echo "🟢 All tests passed"
fi
