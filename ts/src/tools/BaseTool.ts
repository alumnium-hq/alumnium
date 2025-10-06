import { BaseDriver } from '../drivers/BaseDriver.js';
import { HttpClient } from '../clients/HttpClient.js';

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
    client: HttpClient,
    driver: BaseDriver
  ): Promise<void> {
    const ToolClass = tools[toolCall.name];
    if (!ToolClass) {
      throw new Error(`Tool ${toolCall.name} not found`);
    }

    const tool = new ToolClass(toolCall.args);

    // Map accessibility tree IDs to backend DOM node IDs
    const args = toolCall.args;
    if ('id' in args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      (tool as any).id = client.elementById(args.id).id;
    }
    if ('from_id' in args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      (tool as any).fromId = client.elementById(args.from_id).id;
    }
    if ('to_id' in args) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access, @typescript-eslint/no-unsafe-argument
      (tool as any).toId = client.elementById(args.to_id).id;
    }

    await tool.invoke(driver);
  }
}
