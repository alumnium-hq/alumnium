import { describe, expect, it } from "vitest";
import { AiSdkFactory } from "./__factories__/AiSdkFactory.ts";
import { AiSdk } from "./AiSdk.ts";

describe(AiSdk, () => {
  it.each([
    ["empty", "", "empty"],
    ["array", "[]", "non-object"],
    ["null", "null", "non-object"],
    ["string", '"value"', "non-object"],
    ["number", "42", "non-object"],
    ["malformed", "{", "malformed"],
    ["object", '{ "id": 5 }', "object"],
  ])("distinguishes %s tool input", (_case, raw, kind) => {
    const toolCall = AiSdkFactory.toolCall({ input: raw });

    expect(AiSdk.toolCallInput(toolCall).kind).toBe(kind);
  });
});
