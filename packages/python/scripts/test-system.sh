#!/usr/bin/env bash

# This script run Python system tests using behave and pytest against driver
# specified via ALUMNIUM_DRIVER env var.

set -euo pipefail

failed=0
run_tests() {
	if "$@"; then
		echo -e "\n🟢 OK\n"
	else
		echo -e "\n🔴 FAILED\n"
		failed=1
	fi
}

echo -e "🌀 Starting server daemon...\n"
mise run //packages/typescript:server/daemon
echo

cleanup() {
	mise run //packages/typescript:server/daemon:kill
}
trap cleanup INT

echo -e "🌀 Running behave tests\n"
run_tests fnox exec --if-missing error -- poetry run behave -t "@$ALUMNIUM_DRIVER" -f html-pretty -o reports/behave.html -f pretty

if [ "$ALUMNIUM_DRIVER" == "appium-android" ]; then
	echo -e "🟠 Skipping pytest tests for $ALUMNIUM_DRIVER\n"
else
	echo -e "🌀 Running pytest tests\n"
	run_tests fnox exec --if-missing error -- pytest --retries 1 --html reports/pytest.html examples/pytest
fi

cleanup

echo
if [ $failed -ne 0 ]; then
	echo "🔴 Some tests failed"
	exit 1
else
	echo "🟢 All tests passed"
fi
