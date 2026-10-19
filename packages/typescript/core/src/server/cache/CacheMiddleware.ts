import type {
  LanguageModelV4CallOptions,
  LanguageModelV4Middleware,
} from "@ai-sdk/provider";
import { canonize } from "@js-fns/canon";
import { xxh64Str } from "@js-fns/xxhash/str";
import type { Agent } from "../agents/Agent.ts";
import type { ServerCache } from "./ServerCache.ts";

const CACHE_VERSION = "ai-sdk-v1";

export function createCacheMiddleware(
  cache: ServerCache,
): LanguageModelV4Middleware {
  const metadata = new WeakMap<LanguageModelV4CallOptions, Metadata>();

  return {
    specificationVersion: "v4",
    async transformParams({ params }) {
      const meta = readMetadata(params);
      const providerOptions = { ...params.providerOptions };
      delete providerOptions.alumnium;
      const transformed: LanguageModelV4CallOptions = {
        ...params,
        providerOptions,
      };
      if (!Object.keys(providerOptions).length)
        delete transformed.providerOptions;
      metadata.set(transformed, meta);
      return transformed;
    },
    async wrapGenerate({ doGenerate, params, model }) {
      const { meta, cache: useCache } =
        metadata.get(params) ?? readMetadata(params);
      if (!useCache) return doGenerate();

      const cacheableParams = { ...params };
      delete cacheableParams.abortSignal;
      const providerOptions = { ...cacheableParams.providerOptions };
      delete providerOptions.alumnium;
      if (Object.keys(providerOptions).length)
        cacheableParams.providerOptions = providerOptions;
      else delete cacheableParams.providerOptions;

      const keyInput = {
        version: CACHE_VERSION,
        app: cache.app,
        model: { provider: model.provider, modelId: model.modelId },
        params: cacheableParams,
        meta,
      };
      const request: ServerCache.CacheRequest = {
        key: xxh64Str(canonize(keyInput)),
        model: keyInput.model,
        params: cacheableParams,
        meta,
      };
      const cached = await cache.lookup(request);
      if (cached) return cached;
      const result = await doGenerate();
      await cache.update(request, result);
      return result;
    },
  };
}

interface Metadata {
  meta: Agent.Meta;
  cache: boolean;
}

function readMetadata(params: LanguageModelV4CallOptions): Metadata {
  const alumnium = params.providerOptions?.alumnium;
  const meta = alumnium?.meta;
  if (
    !meta ||
    typeof meta !== "object" ||
    !("kind" in meta) ||
    typeof meta.kind !== "string" ||
    !AGENT_KINDS.has(meta.kind)
  ) {
    throw new Error("Missing Alumnium cache metadata");
  }
  return { meta: meta as Agent.Meta, cache: alumnium?.cache !== false };
}

const AGENT_KINDS = new Set([
  "actor",
  "area",
  "changes-analyzer",
  "locator",
  "planner",
  "retriever",
]);
