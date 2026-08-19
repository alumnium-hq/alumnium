#!/usr/bin/env bash

# This script run Python system tests using behave and pytest against driver
# passed via ALUMNIUM_DRIVER env var.

set -euo pipefail

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
ALUMNIUM_TEST_PASS_THRESHOLD_PCT="${ALUMNIUM_TEST_PASS_THRESHOLD_PCT:-100}"
ALUMNIUM_TEST_RETRY_COUNT="${ALUMNIUM_TEST_RETRY_COUNT:-0}"
ALUMNIUM_TEST_RETRY_DELAY="${ALUMNIUM_TEST_RETRY_DELAY:-1000}"
ALUMNIUM_TEST_RETRY_DELAY_SECONDS="$(printf '%s.%03d' \
	"$((ALUMNIUM_TEST_RETRY_DELAY / 1000))" \
	"$((ALUMNIUM_TEST_RETRY_DELAY % 1000))")"
ALUMNIUM_LOG_FILENAME_BASE="test-system-${ALUMNIUM_DRIVER}"

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

echo "🔵 ALUMNIUM_TEST_PASS_THRESHOLD_PCT=$ALUMNIUM_TEST_PASS_THRESHOLD_PCT"
echo "🔵 ALUMNIUM_TEST_RETRY_COUNT=$ALUMNIUM_TEST_RETRY_COUNT"
echo "🔵 ALUMNIUM_TEST_RETRY_DELAY=$ALUMNIUM_TEST_RETRY_DELAY"
echo "🔵 ALUMNIUM_TEST_BEHAVE_ARGS=${ALUMNIUM_TEST_BEHAVE_ARGS:-}"
echo "🔵 ALUMNIUM_TEST_PYTEST_ARGS=${ALUMNIUM_TEST_PYTEST_ARGS:-}"

read -r -a behave_args <<<"${ALUMNIUM_TEST_BEHAVE_ARGS:-}"
read -r -a pytest_args <<<"${ALUMNIUM_TEST_PYTEST_ARGS:-}"

export ALUMNIUM_LOG_LEVEL=debug
export ALUMNIUM_PRUNE_LOGS=false
export ALUMNIUM_LOG_BUFFER_SIZE=0
export ALUMNIUM_LOG_FLUSH_INTERVAL=0

rm -f ".alumnium/logs/${ALUMNIUM_LOG_FILENAME_BASE}"*

TEST_ONLY=${TEST_ONLY:-behave,pytest}

# Check if TEST_ONLY includes "behave"
if [[ "$TEST_ONLY" == *"behave"* ]]; then
	echo -e "🌀 Running behave tests\n"
	run_tests fnox exec -- \
		env ALUMNIUM_LOG_FILENAME="${ALUMNIUM_LOG_FILENAME_BASE}-behave.log" \
		uv run behave -t "@$ALUMNIUM_DRIVER" -f html-pretty -o reports/behave.html \
		-f pretty "${behave_args[@]}"
fi

if [[ "$TEST_ONLY" == *"pytest"* ]]; then
	if [ "$ALUMNIUM_DRIVER" == "appium-android" ]; then
		echo -e "🟠 Skipping pytest tests for $ALUMNIUM_DRIVER\n"
	else
		echo -e "🌀 Running pytest tests\n"
		run_tests fnox exec -- \
			env ALUMNIUM_LOG_FILENAME="${ALUMNIUM_LOG_FILENAME_BASE}-pytest.log" \
			uv run pytest --retries "$ALUMNIUM_TEST_RETRY_COUNT" \
			--retry-delay "$ALUMNIUM_TEST_RETRY_DELAY_SECONDS" \
			--html reports/pytest.html "${pytest_args[@]}" examples/pytest
	fi
fi

echo
if [ $failed -ne 0 ]; then
	echo "👎 Some tests failed"
	exit 1
else
	echo "🎉 All tests passed"
fi
