import { describe, expect, it } from "vitest";
import { agentClassNameToPromptsAgentKind, promptsDev } from "./prompts.ts";

describe("agentClassNameToPromptsAgentKind", () => {
  it("converts simple class names to IDs", () => {
    expect(agentClassNameToPromptsAgentKind("LocatorAgent")).toBe("locator");
    expect(agentClassNameToPromptsAgentKind("PlannerAgent")).toBe("planner");
  });

  it("converts compound class names to IDs", () => {
    expect(agentClassNameToPromptsAgentKind("ChangesAnalyzer")).toBe(
      "changes-analyzer",
    );
  });

  it("strips _ from the name", () => {
    expect(agentClassNameToPromptsAgentKind("_LocatorAgent")).toBe("locator");
    expect(agentClassNameToPromptsAgentKind("_PlannerAgent")).toBe("planner");
  });
});

describe("promptsDev", () => {
  it.each([
    ["us.meta.llama4-maverick-17b-instruct-v1:0", "meta"],
    ["us.anthropic.claude-haiku-5-5", "anthropic"],
    ["us.openai.gpt-6-luna", "openai"],
    ["mistral.mistral-large-3", "mistralai"],
    ["zai.glm-5", "openai"],
  ] as const)("resolves AWS model %s to %s prompts", (name, dev) => {
    expect(promptsDev({ provider: "aws", name })).toBe(dev);
  });

  it("resolves other providers by provider", () => {
    expect(promptsDev({ provider: "google", name: "gemini" })).toBe("google");
  });
});
