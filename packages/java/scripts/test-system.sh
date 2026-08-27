#!/usr/bin/env bash

# This script runs Java system tests using JUnit against the driver passed via
# ALUMNIUM_DRIVER env var.

set -euo pipefail

normalize_test_name() {
	printf '%s' "$1" | tr '[:upper:]' '[:lower:]' | tr -cd '[:lower:][:digit:]'
}

sanitize_filename() {
  printf '%s' "$1" | sed 's/[^[:alnum:]._-][^[:alnum:]._-]*/_/g'
}

PKG_DIR="$(dirname "${BASH_SOURCE[0]}")/.."
ALUMNIUM_TEST_ARG="${ALUMNIUM_TEST_ARG:-}"

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
	matched_class=""

	for test_file in src/test/java/ai/alumnium/system/*Test.java; do
		[ -f "$test_file" ] || continue
		test_class="${test_file##*/}"
		test_class="${test_class%.java}"
		[ "$test_class" = "BaseTest" ] && continue
		test_name="${test_class%Test}"
		if [ "$(normalize_test_name "$test_name")" = "$test_arg_normalized" ]; then
			if [ -n "$matched_class" ]; then
				echo "🔴 System test '$ALUMNIUM_TEST_ARG' matches both '$matched_class' and '$test_class'"
				exit 1
			fi
			matched_class="$test_class"
		fi
	done

	if [ -z "$matched_class" ]; then
		echo "🔴 System test '$ALUMNIUM_TEST_ARG' not found"
		exit 1
	fi
	ALUMNIUM_TEST_GRADLE_ARGS="--tests ai.alumnium.system.${matched_class}"
fi

export ALUMNIUM_LOG_LEVEL=debug
export ALUMNIUM_LOG_FILENAME="test-system-${ALUMNIUM_DRIVER}-$(sanitize_filename "$ALUMNIUM_MODEL").log"
export ALUMNIUM_PRUNE_LOGS=false
export ALUMNIUM_LOG_BUFFER_SIZE=0
export ALUMNIUM_LOG_FLUSH_INTERVAL=0
export PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1

rm -f ".alumnium/logs/$ALUMNIUM_LOG_FILENAME"

echo "🚧 Running system tests using:"
echo
echo "🔵 ALUMNIUM_MODEL=$ALUMNIUM_MODEL"
echo "🔵 ALUMNIUM_DRIVER=$ALUMNIUM_DRIVER"
echo "🔵 ALUMNIUM_LOG_FILENAME=$ALUMNIUM_LOG_FILENAME"
echo "🔵 ALUMNIUM_TEST_PASS_THRESHOLD_PCT=${ALUMNIUM_TEST_PASS_THRESHOLD_PCT:-}"
echo "🔵 ALUMNIUM_TEST_RETRY_COUNT=${ALUMNIUM_TEST_RETRY_COUNT:-}"
echo "🔵 ALUMNIUM_TEST_RETRY_DELAY=${ALUMNIUM_TEST_RETRY_DELAY:-}"
echo "🔵 ALUMNIUM_TEST_GRADLE_ARGS=${ALUMNIUM_TEST_GRADLE_ARGS:-}"

echo -e "\n🌀 Running JUnit tests\n"
read -r -a gradle_args <<<"${ALUMNIUM_TEST_GRADLE_ARGS:-}"
run_tests fnox exec -- ./gradlew clean systemTest --rerun-tasks "${gradle_args[@]}"

if [ $failed -ne 0 ]; then
	echo "👎 Some tests failed"
	exit 1
else
	echo "🎉 All tests passed"
fi
