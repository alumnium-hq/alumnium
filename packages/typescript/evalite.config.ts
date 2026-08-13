import path from "node:path";
import type { Evalite } from "evalite/types";
import { defineConfig } from "evalite/config";
import { createInMemoryStorage } from "evalite/in-memory-storage";
import { FileStore } from "./src/FileStore/FileStore.ts";
import { Env } from "./src/Env.ts";
import { Logger } from "./src/telemetry/Logger.ts";

const storage = createJsonStorage();

Logger.level = "warning";

export default defineConfig({
  testTimeout: Env.ALUMNIUM_EVAL_RUN_TIMEOUT_MIN * 60_000,
  maxConcurrency: Env.ALUMNIUM_EVAL_MAX_CONCURRENCY,
  scoreThreshold: Env.ALUMNIUM_EVAL_THRESHOLD_PCT,
  storage: () => storage,
});

function createJsonStorage(): Evalite.Storage & { save(): Promise<void> } {
  interface SessionEntry {
    value: unknown;
    duration: number;
  }

  const store = Env.ALUMNIUM_EVAL_SESSION_PATH
    ? FileStore.cwdRelStore()
    : FileStore.subStore(undefined, "eval");
  const sessionTimeStr = new Date().toISOString().slice(0, 19);
  const sessionName =
    Env.ALUMNIUM_EVAL_SESSION_NAME || `${sessionTimeStr}.json`;
  const memory = createInMemoryStorage();
  const cache = new Map<string, SessionEntry>();
  let savePromise = Promise.resolve();

  function save() {
    savePromise = savePromise.then(async () => {
      const [runs, suites, evals, scores, traces] = await Promise.all([
        memory.runs.getMany(),
        memory.suites.getMany(),
        memory.evals.getMany(),
        memory.scores.getMany(),
        memory.traces.getMany(),
      ]);

      const data = {
        runs,
        suites: suites.map((suite) => ({
          ...suite,
          filepath: path.relative(process.cwd(), suite.filepath),
        })),

        evals: evals.map((evalResult) => ({
          ...evalResult,
          input: deepTrim(evalResult.input),
        })),

        scores,

        traces: traces.map((trace) => ({
          ...trace,
          input: deepTrim(trace.input),
        })),

        cache: Object.fromEntries(cache),
      };

      await store.writeJson(
        Env.ALUMNIUM_EVAL_SESSION_PATH || sessionName,
        data,
      );
    });

    return savePromise;
  }

  function persistAfter<Args extends unknown[], Result>(
    operation: (...args: Args) => Promise<Result>,
  ) {
    return async (...args: Args) => {
      const result = await operation(...args);
      await save();
      return result;
    };
  }

  return {
    ...memory,

    runs: {
      ...memory.runs,
      create: persistAfter(memory.runs.create),
    },

    suites: {
      ...memory.suites,
      create: persistAfter(memory.suites.create),
      update: persistAfter(memory.suites.update),
    },

    evals: {
      ...memory.evals,
      create: persistAfter(memory.evals.create),
      update: persistAfter(memory.evals.update),
    },

    scores: {
      ...memory.scores,
      create: persistAfter(memory.scores.create),
    },

    traces: {
      ...memory.traces,
      create: persistAfter(memory.traces.create),
    },

    cache: {
      async get(keyHash: string) {
        const entry = cache.get(keyHash);
        return entry || null;
      },

      async set(keyHash: string, entry: SessionEntry) {
        cache.set(keyHash, entry);
        await save();
      },

      async delete(keyHash: string) {
        cache.delete(keyHash);
        await save();
      },

      async clear() {
        cache.clear();
        await save();
      },
    },

    save,

    async close() {
      await save();
      await memory.close();
    },

    async [Symbol.asyncDispose]() {
      await this.close();
    },
  };
}

function deepTrim(value: unknown): unknown {
  const limit = Env.ALUMNIUM_EVAL_SESSION_TRIM_INPUT;

  if (limit === false) return value;

  if (typeof value === "string")
    return value.length > limit
      ? `${value.slice(0, Math.max(0, limit - 1))}…`
      : value;

  if (Array.isArray(value)) return value.map(deepTrim);

  if (value && typeof value === "object")
    return Object.fromEntries(
      Object.entries(value).map(([key, value]) => [key, deepTrim(value)]),
    );

  return value;
}
