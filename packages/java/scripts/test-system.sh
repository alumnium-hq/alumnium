#!/usr/bin/env bash

# This script runs Java system tests using JUnit against the driver passed via
# ALUMNIUM_DRIVER env var.

set -euo pipefail

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
export ALUMNIUM_LOG_FILENAME="test-system-${ALUMNIUM_DRIVER}.log"
export ALUMNIUM_PRUNE_LOGS=false
export ALUMNIUM_LOG_BUFFER_SIZE=0
export ALUMNIUM_LOG_FLUSH_INTERVAL=0

rm -f ".alumnium/logs/$ALUMNIUM_LOG_FILENAME"

echo "🚧 Running system tests using:"
echo
echo "🔵 ALUMNIUM_MODEL=$ALUMNIUM_MODEL"
echo "🔵 ALUMNIUM_DRIVER=$ALUMNIUM_DRIVER"
echo "🔵 ALUMNIUM_LOG_FILENAME=$ALUMNIUM_LOG_FILENAME"
echo "🔵 ALUMNIUM_TEST_PASS_THRESHOLD_PCT=${ALUMNIUM_TEST_PASS_THRESHOLD_PCT:-}"
echo "🔵 ALUMNIUM_TEST_RETRY_COUNT=${ALUMNIUM_TEST_RETRY_COUNT:-}"
echo "🔵 ALUMNIUM_TEST_RETRY_DELAY=${ALUMNIUM_TEST_RETRY_DELAY:-}"

echo -e "\n🌀 Running JUnit tests\n"
run_tests fnox exec -- ./gradlew clean systemTest

if [ $failed -ne 0 ]; then
	echo "👎 Some tests failed"
	exit 1
else
	echo "🎉 All tests passed"
fi
