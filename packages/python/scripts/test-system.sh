#!/usr/bin/env bash

# This script run Python system tests using behave and pytest against driver
# passed via ALUMNIUM_DRIVER env var.

set -euo pipefail

sanitize_filename() {
  printf '%s' "$1" | sed 's/[^[:alnum:]._-][^[:alnum:]._-]*/_/g'
}

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
ALUMNIUM_TEST_ARG="${ALUMNIUM_TEST_ARG:-}"
ALUMNIUM_TEST_PASS_THRESHOLD_PCT="${ALUMNIUM_TEST_PASS_THRESHOLD_PCT:-100}"
ALUMNIUM_TEST_RETRY_COUNT="${ALUMNIUM_TEST_RETRY_COUNT:-0}"
ALUMNIUM_TEST_RETRY_DELAY="${ALUMNIUM_TEST_RETRY_DELAY:-1000}"
ALUMNIUM_TEST_RETRY_DELAY_SECONDS="$(printf '%s.%03d' \
	"$((ALUMNIUM_TEST_RETRY_DELAY / 1000))" \
	"$((ALUMNIUM_TEST_RETRY_DELAY % 1000))")"
ALUMNIUM_LOG_FILENAME_BASE="test-system-${ALUMNIUM_DRIVER}-$(sanitize_filename "$ALUMNIUM_MODEL")"
TEST_ONLY=${TEST_ONLY:-behave,pytest}

normalize_test_name() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd '[:lower:][:digit:]'
}

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

if [ -n "$ALUMNIUM_TEST_ARG" ]; then
	test_arg_normalized="$(normalize_test_name "$ALUMNIUM_TEST_ARG")"
	matched_test=""
	matched_framework=""

	for test_file in examples/behave/features/*.feature examples/pytest/*_test.py; do
		[ -f "$test_file" ] || continue
		test_name="${test_file##*/}"
		case "$test_file" in
			*.feature)
				test_name="${test_name%.feature}"
				test_framework="behave"
				;;
			*_test.py)
				test_name="${test_name%_test.py}"
				test_framework="pytest"
				;;
		esac

		if [ "$(normalize_test_name "$test_name")" = "$test_arg_normalized" ]; then
			if [ -n "$matched_test" ]; then
				echo "🔴 System test '$ALUMNIUM_TEST_ARG' matches both '$matched_test' and '$test_file'"
				exit 1
			fi
			matched_test="$test_file"
			matched_framework="$test_framework"
		fi
	done

	if [ -z "$matched_test" ]; then
		echo "🔴 System test '$ALUMNIUM_TEST_ARG' not found"
		exit 1
	elif [ "$matched_framework" = "behave" ]; then
		ALUMNIUM_TEST_BEHAVE_ARGS="$matched_test"
		ALUMNIUM_TEST_PYTEST_ARGS=""
		TEST_ONLY=behave
	else
		ALUMNIUM_TEST_BEHAVE_ARGS=""
		ALUMNIUM_TEST_PYTEST_ARGS="$matched_test"
		TEST_ONLY=pytest
	fi
else
	ALUMNIUM_TEST_PYTEST_ARGS="${ALUMNIUM_TEST_PYTEST_ARGS:-} examples/pytest"
fi

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
			--html reports/pytest.html "${pytest_args[@]}"
	fi
fi

echo
if [ $failed -ne 0 ]; then
	echo "👎 Some tests failed"
	exit 1
else
	echo "🎉 All tests passed"
fi
