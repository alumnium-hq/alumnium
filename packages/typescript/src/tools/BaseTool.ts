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
  ): Promise<void> {
    const ToolClass = tools[toolCall.name];
    if (!ToolClass) {
      throw new Error(`Tool ${toolCall.name} not found`);
    }

    const tool = new ToolClass(toolCall.args);
    await tool.invoke(driver);
  }
}
