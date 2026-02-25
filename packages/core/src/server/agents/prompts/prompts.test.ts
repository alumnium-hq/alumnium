import { describe, expect, it } from "bun:test";
import { agentClassNameToPromptsAgentId, AgentPrompts } from "./prompts.js";

describe(agentClassNameToPromptsAgentId, () => {
  it("converts simple class names to IDs", () => {
    expect(agentClassNameToPromptsAgentId("LocatorAgent")).toBe(
      "locator" as AgentPrompts.AgentId,
    );
    expect(agentClassNameToPromptsAgentId("PlannerAgent")).toBe(
      "planner" as AgentPrompts.AgentId,
    );
  });

  it("converts compound class names to IDs", () => {
    expect(agentClassNameToPromptsAgentId("ChangesAnalyzer")).toBe(
      "changes-analyzer" as AgentPrompts.AgentId,
    );
  });
});
