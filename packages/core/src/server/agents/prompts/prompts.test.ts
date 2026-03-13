import { describe, expect, it } from "bun:test";
import { agentClassNameToPromptsAgentKind } from "./prompts.js";

describe(agentClassNameToPromptsAgentKind, () => {
  it("converts simple class names to IDs", () => {
    expect(agentClassNameToPromptsAgentKind("LocatorAgent")).toBe("locator");
    expect(agentClassNameToPromptsAgentKind("PlannerAgent")).toBe("planner");
  });

  it("converts compound class names to IDs", () => {
    expect(agentClassNameToPromptsAgentKind("ChangesAnalyzer")).toBe(
      "changes-analyzer",
    );
  });
});
