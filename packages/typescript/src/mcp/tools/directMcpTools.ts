import { snakeCase } from "case-anything";
import z from "zod";
import {
  BaseTool,
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
  SwitchToNextTabTool,
  SwitchToPreviousTabTool,
  TypeTool,
  UploadTool,
  WaitForElementTool,
  WaitTool,
  type FieldMetadata,
  type JSONSchemaType,
} from "../../tools/index.ts";
import { McpState } from "../McpState.ts";
import { McpTool } from "./McpTool.ts";
import { lit } from "smollit";

const ACTOR_TOOLS = [
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
  SwitchToNextTabTool,
  SwitchToPreviousTabTool,
  TypeTool,
  UploadTool,
  WaitForElementTool,
  WaitTool,
];

const ELEMENT_PARAMETERS: Record<string, string> = {
  id: "element_id",
  from_id: "from_element_id",
  to_id: "to_element_id",
};

export const directMcpTools = ACTOR_TOOLS.map((Tool) => {
  const name = snakeCase(Tool.name.replace(/Tool$/, ""));
  const parameters: Record<string, string> = {};
  const shape: Record<string, z.ZodType> = {};

  for (const field of "fields" in Tool ? Tool.fields : []) {
    const actorParam = field.paramName ?? field.name;
    const mcpParam = ELEMENT_PARAMETERS[actorParam] ?? actorParam;
    parameters[mcpParam] = actorParam;
    shape[mcpParam] = fieldSchema(field);
  }

  const inputSchema = z.object(shape).extend({
    id: z.string().describe("Session id returned by start"),
  });
  const description = Tool.description.replace(
    /\b([A-Z][a-zA-Z]+)Tool\b/g,
    (_, toolName: string) => snakeCase(toolName),
  );

  return McpTool.define(name, {
    description,
    inputSchema,
    async execute(input) {
      const { id, ...inputArgs } = inputSchema.parse(input);
      const state = McpState.getDriverState(z.string().parse(id));
      const args = Object.fromEntries(
        Object.entries(inputArgs).map(([param, value]) => [
          parameters[param]!,
          value,
        ]),
      );

      let call = { name: Tool.name, args };
      if ("id" in args || "from_id" in args || "to_id" in args) {
        if (!state.tree)
          throw new Error(
            "Call fetch_accessibility_tree before using element IDs",
          );
        const mapped = state.tree.mapToolCallsToRawId([call])[0];
        if (mapped) call = mapped;
      }

      state.tree = undefined;
      const result = await BaseTool.executeToolCall(
        call,
        { [Tool.name]: Tool },
        state.al.driver,
      );

      return [{ type: "text", text: result }];
    },
  });
});

function fieldSchema(field: FieldMetadata): z.ZodType {
  let schema = field.enum
    ? z.enum(field.enum)
    : typeSchema(field.type, field.items?.type);
  schema = schema.describe(field.description);
  return field.required === false ? schema.optional() : schema;
}

function typeSchema(
  type: JSONSchemaType,
  itemType?: JSONSchemaType,
): z.ZodType {
  switch (type) {
    case "string":
      return z.string();
    case "integer":
      return z.number().int();
    case "number":
      return z.number();
    case "boolean":
      return z.boolean();
    case "array":
      return z.array(itemType ? typeSchema(itemType) : z.unknown());
    case "object":
      return z.record(z.string(), z.unknown());
  }
}
