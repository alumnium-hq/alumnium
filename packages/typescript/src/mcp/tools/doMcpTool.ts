import z from "zod";
import {
  ClickTool,
  DragAndDropTool,
  DragSliderTool,
  ExecuteJavascriptTool,
  HoverTool,
  NavigateBackTool,
  NavigateToUrlTool,
  PressKeyTool,
  PrintToPdfTool,
  ScrollTool,
  TypeTool,
  UploadTool,
} from "../../tools/index.js";
import { McpArtifactsStore } from "../McpArtifactsStore.js";
import { McpState } from "../McpState.js";
import { McpTool } from "./McpTool.js";

/**
 * @internal
 * Agent tools available to the MCP's `do` command (matches handlers.ts extra_tools + common driver tools).
 */
const MCPS_DO_TOOLS = [
  ClickTool,
  DragAndDropTool,
  DragSliderTool,
  ExecuteJavascriptTool,
  HoverTool,
  NavigateBackTool,
  NavigateToUrlTool,
  PressKeyTool,
  PrintToPdfTool,
  ScrollTool,
  TypeTool,
  UploadTool,
];

/**
 * @internal
 * Generate comma-separated action list from tool class names.
 */
function getDoToolActions(): string {
  const actions: string[] = [];
  for (const tool of MCPS_DO_TOOLS) {
    // Convert ClickTool -> click, NavigateToUrlTool -> navigate to url
    const name = tool.name.replace("Tool", "");
    // Insert spaces before capital letters and lowercase
    const action = name
      .replace(/([A-Z])/g, " $1")
      .trim()
      .toLowerCase();
    actions.push(action);
  }
  return actions.join(", ");
}

/**
 * Execute Alumni.do().
 */
export const doMcpTool = McpTool.define("do", {
  description:
    "Execute a goal using natural language (e.g., 'click login button', 'fill out the form'). Alumnium will plan and execute the necessary steps. " +
    `Supported actions: ${getDoToolActions()}. ` +
    "IMPORTANT: Each call operates on the CURRENT PAGE state only. For multi-page workflows, issue separate calls (e.g., first 'navigate to URL', then 'search for X' as a separate call after page loads). " +
    "Note that you don't need to scroll the page to interact with elements, Alumnium can locate and work with elements outside the viewport.",

  inputSchema: z.object({
    driver_id: z.string().describe("Driver ID from start_driver"),

    goal: z
      .string()
      .describe(
        "Natural language description of what to do on the current page. Do NOT combine actions that span multiple pages in a single goal.",
      ),
  }),

  async execute(input, { logger }) {
    const { driver_id: driverId, goal } = input;

    const al = McpState.getDriverAlumni(driverId);
    const { steps, explanation, changes } = await al.do(goal);

    logger.debug(`Completed with ${steps.length} steps`);
    await McpArtifactsStore.saveScreenshot({ driverId, description: goal });

    // Build structured response
    const performedSteps = steps.map((step) => ({
      name: step.name,
      tools: step.tools,
    }));

    const response = Object.assign(
      { explanation, performed_steps: performedSteps },
      changes ? { changes } : {},
    );

    return [{ type: "text", text: JSON.stringify(response, null, 2) }];
  },
});
