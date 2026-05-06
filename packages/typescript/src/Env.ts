import ansi from "picocolors";
import { canonize } from "smolcanon";
import { xxh32Str } from "smolxxh/str";
import z from "zod";
import { Driver } from "./drivers/Driver.ts";
import { Model } from "./Model.ts";
import { LoggerSchema } from "./telemetry/LoggerSchema.ts";
import {
  arrayString,
  filenameString,
  jsonString,
  pathString,
} from "./utils/schema.ts";
import { maskString } from "./utils/string.ts";

export namespace Env {
  export type VarsRecord = Record<string, unknown>;

  export interface InspectResult {
    vars: VarsRecord;
    valid: boolean;
  }
}

const secrets = new Set();

let cachedVars: Env.VarsRecord = {};
let envLogger: LoggerSchema.Like | undefined = undefined;

export const Env = {
  get ALUMNIUM_CACHE() {
    return envVar(
      "ALUMNIUM_CACHE",
      z
        .union([z.enum(["sqlite", "filesystem"]), z.stringbool()])
        .default("filesystem"),
    );
  },

  get ALUMNIUM_CACHE_PATH() {
    return envVar("ALUMNIUM_CACHE_PATH", pathString().optional());
  },

  get ALUMNIUM_CHANGE_ANALYSIS() {
    return envVar("ALUMNIUM_CHANGE_ANALYSIS", z.stringbool().default(false));
  },

  get ALUMNIUM_DELAY() {
    return envVar("ALUMNIUM_DELAY", z.coerce.number().default(0.5));
  },

  get ALUMNIUM_EXCLUDE_ATTRIBUTES() {
    return envVar("ALUMNIUM_EXCLUDE_ATTRIBUTES", arrayString().default([]));
  },

  get ALUMNIUM_FULL_PAGE_SCREENSHOT() {
    return envVar(
      "ALUMNIUM_FULL_PAGE_SCREENSHOT",
      z.stringbool().default(false),
    );
  },

  get ALUMNIUM_LOG_LEVEL() {
    return envVar("ALUMNIUM_LOG_LEVEL", LoggerSchema.Level);
  },

  get ALUMNIUM_LOG_PATH() {
    return envVar("ALUMNIUM_LOG_PATH", pathString().optional());
  },

  get ALUMNIUM_LOG_FILENAME() {
    return envVar("ALUMNIUM_LOG_FILENAME", filenameString().optional());
  },

  get ALUMNIUM_LOG_DEBUG_EXTRA() {
    return envVar(
      "ALUMNIUM_LOG_DEBUG_EXTRA",
      arrayString(LoggerSchema.DebugExtra).default([]),
    );
  },

  get ALUMNIUM_PRUNE_LOGS() {
    // NOTE: We ignore invalid values here to avoid missing logs due to misconfiguration.
    return envVar("ALUMNIUM_PRUNE_LOGS", z.stringbool().catch(true));
  },

  get ALUMNIUM_LOG_BUFFER_SIZE() {
    // NOTE: We ignore invalid values here to avoid missing logs due to misconfiguration.
    return envVar("ALUMNIUM_LOG_BUFFER_SIZE", z.coerce.number().catch(4096));
  },

  get ALUMNIUM_LOG_FLUSH_INTERVAL() {
    // NOTE: We ignore invalid values here to avoid missing logs due to misconfiguration.
    return envVar("ALUMNIUM_LOG_FLUSH_INTERVAL", z.coerce.number().catch(500));
  },

  get ALUMNIUM_TRACE() {
    return envVar("ALUMNIUM_TRACE", z.stringbool().default(false));
  },

  get ALUMNIUM_DRIVER() {
    return envVar("ALUMNIUM_DRIVER", Driver.Id);
  },

  get ALUMNIUM_APPIUM_SERVER() {
    return envVar(
      "ALUMNIUM_APPIUM_SERVER",
      z.httpUrl().default("http://localhost:4723"),
    );
  },

  get ALUMNIUM_MODEL() {
    return envVar(
      "ALUMNIUM_MODEL",
      z
        .union([
          Model.Provider,
          z.templateLiteral([Model.Provider, "/", z.string()]),
        ])
        .optional()
        .transform((val): Model => {
          const defaultProvider: Model.Provider = Env.GITHUB_ACTIONS
            ? "github"
            : "openai";
          return Model.parse(typeof val === "string" ? val : defaultProvider);
        }),
    );
  },

  get ALUMNIUM_MCP_ARTIFACTS_DIR() {
    return envVar("ALUMNIUM_MCP_ARTIFACTS_DIR", pathString().optional());
  },

  get ALUMNIUM_MCP_PROFILES_DIR() {
    return envVar("ALUMNIUM_MCP_PROFILES_DIR", pathString().optional());
  },

  get ALUMNIUM_SERVER_URL() {
    return envVar("ALUMNIUM_SERVER_URL", z.string().optional());
  },

  get ALUMNIUM_SERVER_DAEMONIZE() {
    return envVar("ALUMNIUM_SERVER_DAEMONIZE", z.stringbool().default(false));
  },

  get ALUMNIUM_SERVER_PID_PATH() {
    return envVar("ALUMNIUM_SERVER_PID_PATH", pathString().optional());
  },

  get ALUMNIUM_MODEL_RETRIES() {
    return envVar("ALUMNIUM_MODEL_RETRIES", z.coerce.number().default(8));
  },

  get ALUMNIUM_MODEL_TIMEOUT() {
    return envVar("ALUMNIUM_MODEL_TIMEOUT", z.coerce.number().default(90));
  },

  get ALUMNIUM_OLLAMA_URL() {
    return envVar("ALUMNIUM_OLLAMA_URL", z.httpUrl().optional());
  },

  get ALUMNIUM_PLANNER() {
    return envVar("ALUMNIUM_PLANNER", z.stringbool().default(true));
  },

  get ALUMNIUM_RETRIES() {
    return envVar("ALUMNIUM_RETRIES", z.coerce.number().default(2));
  },

  get ALUMNIUM_NO_RETRY() {
    return envVar("ALUMNIUM_NO_RETRY", z.stringbool().default(false));
  },

  get ALUMNIUM_STORE_DIR() {
    return envVar("ALUMNIUM_STORE_DIR", pathString().default(".alumnium"));
  },

  get ALUMNIUM_PLAYWRIGHT_HEADLESS() {
    return envVar("ALUMNIUM_PLAYWRIGHT_HEADLESS", z.stringbool().default(true));
  },

  get ALUMNIUM_PLAYWRIGHT_NEW_TAB_TIMEOUT() {
    return envVar(
      "ALUMNIUM_PLAYWRIGHT_NEW_TAB_TIMEOUT",
      z.coerce.number().default(200),
    );
  },

  get ALUMNIUM_DEV_DATA_TYPES_SCAN() {
    return envVar(
      "ALUMNIUM_DEV_DATA_TYPES_SCAN",
      z.stringbool().default(false),
    );
  },

  get ALUMNIUM_EVAL_TRIAL_COUNT() {
    return envVar("ALUMNIUM_EVAL_TRIAL_COUNT", z.coerce.number().default(25));
  },

  get AWS_ACCESS_KEY() {
    return secretEnvVar("AWS_ACCESS_KEY", z.string().optional());
  },

  get AWS_REGION_NAME() {
    return secretEnvVar("AWS_REGION_NAME", z.string().default("us-east-1"));
  },

  get AWS_SECRET_KEY() {
    return secretEnvVar("AWS_SECRET_KEY", z.string().optional());
  },

  get AZURE_FOUNDRY_API_KEY() {
    return secretEnvVar("AZURE_FOUNDRY_API_KEY", z.string().optional());
  },

  get AZURE_FOUNDRY_API_VERSION() {
    return envVar("AZURE_FOUNDRY_API_VERSION", z.string().optional());
  },

  get AZURE_FOUNDRY_TARGET_URI() {
    return secretEnvVar("AZURE_FOUNDRY_TARGET_URI", z.string().optional());
  },

  get AZURE_OPENAI_API_KEY() {
    return secretEnvVar("AZURE_OPENAI_API_KEY", z.string().optional());
  },

  get AZURE_OPENAI_API_VERSION() {
    return envVar("AZURE_OPENAI_API_VERSION", z.string().optional());
  },

  get AZURE_OPENAI_DEFAULT_HEADERS() {
    return envVar(
      "AZURE_OPENAI_DEFAULT_HEADERS",
      jsonString(z.record(z.string(), z.string())).optional(),
    );
  },

  get AZURE_OPENAI_ENDPOINT() {
    return secretEnvVar("AZURE_OPENAI_ENDPOINT", z.string().optional());
  },

  get OLLAMA_HOST() {
    return envVar("OLLAMA_HOST", z.string().optional());
  },

  get OPENAI_CUSTOM_URL() {
    return envVar("OPENAI_CUSTOM_URL", z.string().optional());
  },

  get LT_USERNAME() {
    return secretEnvVar("LT_USERNAME", z.string().optional());
  },

  get LT_ACCESS_KEY() {
    return secretEnvVar("LT_ACCESS_KEY", z.string().optional());
  },

  get CI() {
    return envVar("CI", z.stringbool().default(false));
  },

  get GITHUB_ACTIONS() {
    return envVar("GITHUB_ACTIONS", z.stringbool().default(false));
  },

  reset(): void {
    cachedVars = {};
  },

  init(logger: LoggerSchema.Like): Env.InspectResult {
    envLogger = logger;

    const vars: Env.VarsRecord = {};
    let valid = true;

    for (const prop in Env) {
      if (Object.getOwnPropertyDescriptor(Env, prop)?.get) {
        try {
          const val = Env[prop as keyof typeof Env];
          vars[prop] = maskedValue(val, isSecret(val));
        } catch {
          valid = false;
          vars[prop] = "<INVALID VALUE>";
        }
      }
    }

    return { vars, valid };
  },
};

function secretEnvVar<Type>(name: string, Schema: z.ZodType<Type>): Type {
  return envVar(name, Schema, true);
}

function envVar<Type>(
  name: string,
  Schema: z.ZodType<Type>,
  isSecretVar?: boolean,
): Type {
  if (!(name in cachedVars)) {
    // oxlint-disable-next-line no-process-env -- We need it to read env vars
    const envVal = process.env[name];
    const parsedVar = Schema.safeParse(envVal);

    if (!parsedVar.success) {
      const maskedVal = maskedValue(envVal, isSecretVar);
      const message = `Invalid environment variable ${name} value \`${maskedVal}\``;

      if (envLogger) envLogger.error(message);
      else console.error(`${ansi.red("Error:")} ${message}`);

      throw parsedVar.error;
    }

    const val = parsedVar.data;
    if (isSecretVar) addSecret(val);

    cachedVars[name] = val;
  }

  return cachedVars[name] as Type;
}

function isSecret(val: unknown): boolean {
  return secrets.has(hashSecret(val));
}

function addSecret(val: unknown): void {
  secrets.add(hashSecret(val));
}

function hashSecret(val: unknown): string {
  return xxh32Str(canonize(val));
}

function maskedValue(val: unknown, isSecretVar: boolean | undefined): unknown {
  return val != null && isSecretVar ? maskString(String(val)) : val;
}
