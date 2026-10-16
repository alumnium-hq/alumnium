import * as anthropic from "@alumnium/anthropic";
import * as aws from "@alumnium/aws";
import * as azure from "@alumnium/azure";
import * as codex from "@alumnium/codex";
import { Model } from "@alumnium/core/internal";
import * as cursor from "@alumnium/cursor";
import * as deepseek from "@alumnium/deepseek";
import * as google from "@alumnium/google";
import * as mistral from "@alumnium/mistral";
import * as ollama from "@alumnium/ollama";
import * as openai from "@alumnium/openai";
import * as openrouter from "@alumnium/openrouter";
import * as xai from "@alumnium/xai";

export const resolveModel = Model.resolver(
  anthropic,
  aws,
  azure,
  codex,
  cursor,
  deepseek,
  google,
  mistral,
  ollama,
  openai,
  openrouter,
  xai,
);
