import type { JSONSchema7 } from "@ai-sdk/provider";

export interface ToolDefinition {
  type: "function";
  function: {
    name: string;
    description: string;
    parameters: JSONSchema7;
  };
}
