import { afterEach, describe, expect, it, vi } from "vitest";
import { Env } from "./Env.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  Env.reset();
});

describe("Env", () => {
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
