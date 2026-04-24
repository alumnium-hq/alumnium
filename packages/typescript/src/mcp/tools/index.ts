import { scenariosMcpTools } from "../scenarios/tools/index.ts";
import { checkMcpTool } from "./checkMcpTool.ts";
import { doMcpTool } from "./doMcpTool.ts";
import { fetchAccessibilityTreeMcpTool } from "./fetchAccessibilityTreeMcpTool.ts";
import { getMcpTool } from "./getMcpTool.ts";
import { startMcpTool } from "./startMcpTool.ts";
import { stopMcpTool } from "./stopMcpTool.ts";
import { waitMcpTool } from "./waitMcpTool.ts";

export namespace McpTools {
  export type Definition = (typeof mcpTools)[number];
}

export const mcpTools = [
  checkMcpTool,
  doMcpTool,
  fetchAccessibilityTreeMcpTool,
  getMcpTool,
  startMcpTool,
  stopMcpTool,
  waitMcpTool,
  ...scenariosMcpTools,
];
