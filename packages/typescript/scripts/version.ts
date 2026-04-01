#!/usr/bin/env bun

// This script outputs the current version of the project extracted from package.json.

import { ALUMNIUM_VERSION } from "../src/package.js";

process.stdout.write(ALUMNIUM_VERSION);
