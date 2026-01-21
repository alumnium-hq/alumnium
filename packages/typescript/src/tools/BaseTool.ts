import { BaseDriver } from "../drivers/BaseDriver.js";

// eslint-disable-next-line @typescript-eslint/no-explicit-any
export type ToolClass = new (...args: any[]) => BaseTool;

export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export abstract class BaseTool {
  abstract invoke(driver: BaseDriver): void | Promise<void>;

  static async executeToolCall(
    toolCall: ToolCall,
    tools: Record<string, ToolClass>,
    driver: BaseDriver
  ): Promise<string> {
    const toolName = toolCall.name;
    const toolArgs = toolCall.args;

    const ToolClass = tools[toolName];
    if (!ToolClass) {
      throw new Error(`Tool ${toolName} not found`);
    }

    const tool = new ToolClass(toolArgs);
    await tool.invoke(driver);

    const argsStr = Object.entries(toolArgs)
      .map(([k, v]) => `${k}='${String(v)}'`)
      .join(", ");
    return `${toolName}(${argsStr})`;
  }
}
