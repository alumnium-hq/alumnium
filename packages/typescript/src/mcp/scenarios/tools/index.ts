import { commitScenarioMcpTool } from "./commitScenarioMcpTool.ts";
import { divergeScenarioMcpTool } from "./divergeScenarioMcpTool.ts";
import { getScenarioMcpTool } from "./getScenarioMcpTool.ts";
import { listScenariosMcpTool } from "./listScenariosMcpTool.ts";
import { lookupScenarioMcpTool } from "./lookupScenarioMcpTool.ts";
import { pauseScenarioMcpTool } from "./pauseScenarioMcpTool.ts";
import { playScenarioMcpTool } from "./playScenarioMcpTool.ts";
import { recordScenarioMcpTool } from "./recordScenarioMcpTool.ts";
import { removeScenarioMcpTool } from "./removeScenarioMcpTool.ts";
import { resetScenarioMcpTool } from "./resetScenarioMcpTool.ts";
import { stepScenarioMcpTool } from "./stepScenarioMcpTool.ts";
import { unpauseScenarioMcpTool } from "./unpauseScenarioMcpTool.ts";

export const scenariosMcpTools = [
  commitScenarioMcpTool,
  removeScenarioMcpTool,
  divergeScenarioMcpTool,
  listScenariosMcpTool,
  lookupScenarioMcpTool,
  playScenarioMcpTool,
  recordScenarioMcpTool,
  resetScenarioMcpTool,
  getScenarioMcpTool,
  stepScenarioMcpTool,
  pauseScenarioMcpTool,
  unpauseScenarioMcpTool,
];
