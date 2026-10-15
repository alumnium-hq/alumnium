#!/usr/bin/env bun

// This script outputs the current Ollama model id.

import { Model } from "@alumnium/core";

process.stdout.write(Model.defaultProviderModel("ollama"));
