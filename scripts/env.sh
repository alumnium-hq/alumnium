#!/usr/bin/env bash

# This script exports global env variables exposed by mise.

set -eo pipefail

# Provide age key for fnox if it exists.
if [ -f ~/.config/fnox/age.txt ]; then
  export FNOX_AGE_KEY="$(cat ~/.config/fnox/age.txt | grep "AGE-SECRET-KEY")"
fi