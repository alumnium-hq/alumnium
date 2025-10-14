import { BaseDriver } from "../drivers/BaseDriver.js";

export interface ToolCall {
  name: string;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  args: Record<string, any>;
}

export abstract class BaseTool {
  abstract invoke(driver: BaseDriver): void | Promise<void>;

  static async executeToolCall(
    toolCall: ToolCall,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    tools: Record<string, new (...args: any[]) => BaseTool>,
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
