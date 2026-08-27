import {
  afterAll,
  afterEach,
  beforeAll,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import z from "zod";
import { Env } from "./Env.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  Env.reset();
});

describe("Env", () => {
  beforeAll(() => {
    Env.log = false;
  });

  afterAll(() => {
    Env.log = true;
  });

  it("applies the schema default when the variable is unset", () => {
    vi.stubEnv("ALUMNIUM_CACHE", undefined);
    expect(Env.ALUMNIUM_CACHE).toBe("filesystem");
  });

  it("reads a literal value", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-literal");
    expect(Env.OPENAI_API_KEY).toBe("sk-literal");
  });

  it("caches the value so it is only read once", () => {
    vi.stubEnv("OPENAI_API_KEY", "sk-first");
    expect(Env.OPENAI_API_KEY).toBe("sk-first");

    vi.stubEnv("OPENAI_API_KEY", "sk-second");
    expect(Env.OPENAI_API_KEY).toBe("sk-first");
  });

  it("throws on an invalid value", () => {
    vi.stubEnv("ALUMNIUM_RETRIES", "not-a-number");
    expect(() => Env.ALUMNIUM_RETRIES).toThrow();
  });

  describe("model invocation", () => {
    it.each(["github", "github/gpt-4o-mini"])(
      "reports that GitHub Models were retired for %s",
      (input) => {
        vi.stubEnv("ALUMNIUM_MODEL", input);

        expect(() => Env.ALUMNIUM_MODEL).toThrow(z.ZodError);
        expect(() => Env.ALUMNIUM_MODEL).toThrow(
          "GitHub Models were retired on July 30, 2026: https://docs.github.com/en/github-models",
        );
      },
    );

    it("preserves the validation error for unknown providers", () => {
      vi.stubEnv("ALUMNIUM_MODEL", "unknown/model");
      expect(() => Env.ALUMNIUM_MODEL).toThrow(/Invalid option/);
    });

    it.each([
      [undefined, 8],
      ["0", 0],
      ["3", 3],
    ])("parses model retries %s as %s", (input, expected) => {
      vi.stubEnv("ALUMNIUM_MODEL_RETRIES", input);
      expect(Env.ALUMNIUM_MODEL_RETRIES).toBe(expected);
    });

    it.each(["-1", "1.5", "NaN", "Infinity", "-Infinity"])(
      "rejects invalid model retries %s",
      (input) => {
        vi.stubEnv("ALUMNIUM_MODEL_RETRIES", input);
        expect(() => Env.ALUMNIUM_MODEL_RETRIES).toThrow();
      },
    );

    it.each([
      [undefined, 90],
      ["0.5", 0.5],
      ["120", 120],
    ])("parses model timeout %s as %s", (input, expected) => {
      vi.stubEnv("ALUMNIUM_MODEL_TIMEOUT", input);
      expect(Env.ALUMNIUM_MODEL_TIMEOUT).toBe(expected);
    });

    it.each(["0", "-1", "NaN", "Infinity", "-Infinity"])(
      "rejects invalid model timeout %s",
      (input) => {
        vi.stubEnv("ALUMNIUM_MODEL_TIMEOUT", input);
        expect(() => Env.ALUMNIUM_MODEL_TIMEOUT).toThrow();
      },
    );
  });

  describe("debug extras", () => {
    it.each([
      ["ai-sdk", ["ai-sdk"]],
      ["langchain", ["ai-sdk"]],
      ["langchain,ai-sdk", ["ai-sdk"]],
      ["tree,all,http", ["tree", "all", "http"]],
    ])("normalizes %s to %j", (input, expected) => {
      vi.stubEnv("ALUMNIUM_LOG_DEBUG_EXTRA", input);
      expect(Env.ALUMNIUM_LOG_DEBUG_EXTRA).toEqual(expected);
    });

    it("rejects invalid categories", () => {
      vi.stubEnv("ALUMNIUM_LOG_DEBUG_EXTRA", "invalid");
      expect(() => Env.ALUMNIUM_LOG_DEBUG_EXTRA).toThrow();
    });
  });

  describe("eval session", () => {
    it("defaults input trimming to 100", () => {
      vi.stubEnv("ALUMNIUM_EVAL_SESSION_TRIM_INPUT", undefined);
      expect(Env.ALUMNIUM_EVAL_SESSION_TRIM_INPUT).toBe(100);
    });

    it("accepts an input trimming length", () => {
      vi.stubEnv("ALUMNIUM_EVAL_SESSION_TRIM_INPUT", "100");
      expect(Env.ALUMNIUM_EVAL_SESSION_TRIM_INPUT).toBe(100);
    });

    it("allows input trimming to be disabled", () => {
      vi.stubEnv("ALUMNIUM_EVAL_SESSION_TRIM_INPUT", "false");
      expect(Env.ALUMNIUM_EVAL_SESSION_TRIM_INPUT).toBe(false);
    });

    it("normalizes the session path", () => {
      vi.stubEnv("ALUMNIUM_EVAL_SESSION_PATH", "test\\sessions");
      expect(Env.ALUMNIUM_EVAL_SESSION_PATH).toBe("test/sessions");
    });
  });

  describe("command expansion", () => {
    it("expands a whole-value command substitution", () => {
      vi.stubEnv("OPENAI_API_KEY", "$(echo hello)");
      expect(Env.OPENAI_API_KEY).toBe("hello");
    });

    it("trims trailing newlines from command output", () => {
      vi.stubEnv("OPENAI_API_KEY", "$(printf 'hello\\n\\n')");
      expect(Env.OPENAI_API_KEY).toBe("hello");
    });

    it("does not expand inline substitution (whole-value only)", () => {
      vi.stubEnv("OPENAI_API_KEY", "prefix $(echo x)");
      expect(Env.OPENAI_API_KEY).toBe("prefix $(echo x)");
    });

    it("leaves literal values untouched", () => {
      vi.stubEnv("OPENAI_API_KEY", "sk-literal");
      expect(Env.OPENAI_API_KEY).toBe("sk-literal");
    });

    it("throws when the expansion command fails", () => {
      vi.stubEnv("OPENAI_API_KEY", "$(exit 1)");
      expect(() => Env.OPENAI_API_KEY).toThrow();
    });
  });
});
