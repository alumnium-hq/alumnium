import { afterEach } from "vitest";
import { Logger } from "@alumnium/core/internal";
import { clearAllMocks } from "./mocks.ts";
// Register all LLM providers.
import "@alumnium/anthropic";
import "@alumnium/aws";
import "@alumnium/azure";
import "@alumnium/codex";
import "@alumnium/cursor";
import "@alumnium/deepseek";
import "@alumnium/google";
import "@alumnium/mistral";
import "@alumnium/ollama";
import "@alumnium/openai";
import "@alumnium/openrouter";
import "@alumnium/xai";

Logger.level = "error";

afterEach(clearAllMocks);
