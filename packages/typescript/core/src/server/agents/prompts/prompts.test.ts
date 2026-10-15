import { describe, expect, it } from "vitest";
import { agentClassNameToPromptsAgentKind } from "./prompts.ts";

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
