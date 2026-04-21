#!/usr/bin/env bun

// This script outputs the current Ollama model id.

import { ModelName } from "../src/Model.ts";

process.stdout.write(ModelName.DEFAULT.ollama);
