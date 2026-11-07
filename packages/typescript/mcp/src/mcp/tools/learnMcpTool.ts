import z from "zod";
import { McpState } from "../McpState.ts";
import { McpLearn } from "./McpLearn.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Execute Alumni.knowledge.do(), knowledge.get() and knowledge.check().
 */
export const learnMcpTool = McpTool.define("learn", {
  description:
    "Teach Alumnium how to handle an instruction after `do`, `get` or `check` handled it incorrectly. The lesson goes to a knowledge layer (the current app by default) and applies to the rest of the session, and to later sessions when knowledge persistence is enabled. For `do`, provide the actions that achieve the goal; for `get` and `check`, provide a hint on where to look or what makes the statement true.",

  inputSchema: McpTool.IdInput.extend({
    kind: z.enum(["do", "get", "check"]).describe("Tool the lesson is for"),

    instruction: z
      .string()
      .describe(
        "Goal for `do`, data for `get` or statement for `check`, in the same format as passed to that tool",
      ),

    actions: z
      .array(z.string())
      .optional()
      .describe(
        'Required for `do`: actions achieving the goal (e.g., [\'hover "Test" task\', \'click "x" button near "Test" task\'])',
      ),

    hint: z
      .string()
      .optional()
      .describe(
        "Required for `get` and `check`: how to handle the instruction (e.g., \"use the 'Total' row, not 'Subtotal'\")",
      ),

    layer: z
      .enum(["shared", "product", "web", "ios", "android"])
      .default("product")
      .describe(
        "Knowledge layer: 'product' (default) for every platform of the app, 'web', 'ios' or 'android' for one platform, 'shared' for every app",
      ),
  }),

  async execute(input) {
    const { id, kind, instruction, actions, hint, layer } = input;

    const al = McpState.getDriverAlumni(id);
    const learn = McpLearn.layered(al, layer);

    if (kind === "do") {
      if (!actions?.length)
        return error("actions are required when learning `do`");
      await learn.do(instruction, actions);
    } else {
      if (!hint) return error(`hint is required when learning \`${kind}\``);
      await learn[kind](instruction, hint);
    }

    return [{ type: "text", text: JSON.stringify({ learned: kind, layer }) }];
  },
});

function error(message: string): McpTool.Output {
  return [{ type: "text", text: JSON.stringify({ error: message }) }];
}
