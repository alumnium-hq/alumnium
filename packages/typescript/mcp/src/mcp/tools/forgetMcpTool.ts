import z from "zod";
import { McpState } from "../McpState.ts";
import { McpLearn } from "./McpLearn.ts";
import { McpTool } from "./McpTool.ts";

/**
 * Execute Alumni.knowledge.forget().
 */
export const forgetMcpTool = McpTool.define("forget", {
  description:
    "Forget a lesson taught with `learn` that turned out wrong, so `do`, `get` and `check` stop using it in this and, when persisted, later sessions.",

  inputSchema: McpTool.IdInput.extend({
    kind: z
      .enum(["do", "get", "check", "find", "area"])
      .describe("Tool the lesson is for"),

    instruction: z
      .string()
      .describe("Instruction the lesson was learned for, exactly as taught"),

    layer: z
      .enum(["shared", "product", "web", "ios", "android"])
      .default("product")
      .describe("Knowledge layer the lesson was taught in"),
  }),

  async execute(input) {
    const { id, kind, instruction, layer } = input;

    const al = McpState.getDriverAlumni(id);
    const forgotten = await McpLearn.layered(al, layer).forget(
      kind,
      instruction,
    );

    return [{ type: "text", text: JSON.stringify({ forgotten }) }];
  },
});
