import { getLogger } from "../../utils/logger.ts";
import { McpScenariosState } from "../scenarios/McpScenariosState.ts";
import type { McpTool } from "../tools/McpTool.ts";

const logger = getLogger(import.meta.url);

export abstract class McpFactory {
  static createToolExecuteContext(): McpTool.DefineExecuteContext {
    return {
      scenarios: new McpScenariosState(),
      logger,
    };
  }
}
