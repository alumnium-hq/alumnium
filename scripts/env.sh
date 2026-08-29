#!/usr/bin/env bash

# This script exports global env variables exposed by mise.

set -eo pipefail

# Playwright only supports installing Linux system dependencies through apt.
export PLAYWRIGHT_INSTALL_DEPS_ARG=""
if [[ "$(uname -s)" == "Linux" && -r /etc/debian_version ]]; then
	export PLAYWRIGHT_INSTALL_DEPS_ARG="--with-deps"
fi

# Provide age key for fnox if it exists.
if [ -f ~/.config/fnox/age.txt ]; then
	export FNOX_AGE_KEY="$(cat ~/.config/fnox/age.txt | grep "AGE-SECRET-KEY")"
fi
