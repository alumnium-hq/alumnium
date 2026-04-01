#!/usr/bin/env bash

# This script run Python system tests using behave and pytest against driver
# passed via ALUMNIUM_DRIVER env var.

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
export ALUMNIUM_PRUNE_LOGS=true

echo -e "🌀 Running behave tests\n"
run_tests fnox exec -- \
	env ALUMNIUM_LOG_FILENAME=test-system-behave-$ALUMNIUM_DRIVER.log \
	uv run behave -t "@$ALUMNIUM_DRIVER" -f html-pretty -o reports/behave.html -f pretty

if [ "$ALUMNIUM_DRIVER" == "appium-android" ]; then
	echo -e "🟠 Skipping pytest tests for $ALUMNIUM_DRIVER\n"
else
	echo -e "🌀 Running pytest tests\n"
	run_tests fnox exec -- \
		env ALUMNIUM_LOG_FILENAME=test-system-pytest-$ALUMNIUM_DRIVER.log \
		uv run pytest --retries 1 --html reports/pytest.html examples/pytest
fi

echo
if [ $failed -ne 0 ]; then
	echo "🔴 Some tests failed"
	exit 1
else
	echo "🟢 All tests passed"
fi
