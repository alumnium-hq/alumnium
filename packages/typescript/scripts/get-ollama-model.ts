#!/usr/bin/env bun

// This script outputs the current Ollama model id.

import { Model } from "../src/Model.ts";

process.stdout.write(Model.defaultProviderModel("ollama"));
