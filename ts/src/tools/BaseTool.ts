import { BaseDriver } from '../drivers/BaseDriver';
import { BaseAccessibilityTree } from '../accessibility/BaseAccessibilityTree';

export interface ToolCall {
  name: string;
  args: Record<string, any>;
}

export abstract class BaseTool {
  abstract invoke(driver: BaseDriver): void | Promise<void>;

  static async executeToolCall(
    toolCall: ToolCall,
    tools: Record<string, new (...args: any[]) => BaseTool>,
    accessibilityTree: BaseAccessibilityTree,
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
      (tool as any).id = accessibilityTree.elementById(args.id).id;
    }
    if ('from_id' in args) {
      (tool as any).fromId = accessibilityTree.elementById(args.from_id).id;
    }
    if ('to_id' in args) {
      (tool as any).toId = accessibilityTree.elementById(args.to_id).id;
    }

    await tool.invoke(driver);
  }
}
