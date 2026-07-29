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
} from "../../tools/index.ts";
import { McpArtifactsStore } from "../McpArtifactsStore.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";

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
    "Prefer short, specific goals over long, complex ones. Each goal should describe a single action on the current page. " +
    "Note that you don't need to scroll the page to interact with elements, Alumnium can locate and work with elements outside the viewport. " +
    "When any value in the goal varies between runs, put a `{placeholder}` in the goal and pass the value in `params` instead of inlining it — this keeps the goal text stable so repeated runs reuse the cache.",

  inputSchema: z.object({
    id: z.string().describe("Driver ID from start"),

    goal: z
      .string()
      .describe(
        "Natural language description of what to do on the current page. Do NOT combine actions that span multiple pages in a single goal.",
      ),

    params: z
      .record(z.string(), z.string())
      .optional()
      .describe(
        'Values for the `{placeholder}` tokens in the goal, e.g. goal \'type {email} into the email field\' with params {"email": "a@b.com"}. ' +
          "Works both for values that get typed or navigated to and for values that pick the element, so 'click {number} button' with a different number reuses one cache entry. " +
          "Every placeholder in the goal must have a value here, and every value must be referenced by the goal.",
      ),
  }),

  async execute(input, { logger }) {
    const { id, goal, params } = input;

    const al = McpState.getDriverAlumni(id);
    const { steps, explanation, changes } = await al.do(goal, params);

    logger.debug(`Completed with ${steps.length} steps`);
    await McpArtifactsStore.saveScreenshot({ id, description: goal });

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
