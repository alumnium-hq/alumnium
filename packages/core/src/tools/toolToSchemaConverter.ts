/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { ToolDefinition } from "@langchain/core/language_models/base";
import type { ToolClass } from "./BaseTool.js";
import type { ToolWithFields } from "./Field.js";

export function convertToolsToSchemas(
  tools: Record<string, ToolClass>,
): ToolDefinition[] {
  return Object.entries(tools).map(([name, ToolClass]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const description = (ToolClass as any).description || `Execute ${name}`;

    // Get field metadata from the tool class static property
    const fields = (ToolClass as ToolWithFields).fields || [];

    const properties: Record<
      string,
      {
        type: string;
        description: string;
        enum?: readonly string[];
        items?: { type: string };
      }
    > = {};
    const required: string[] = [];

    // Build properties and required array from field metadata
    fields.forEach((metadata) => {
      const paramName: string = metadata.paramName ?? metadata.name;

      properties[paramName] = {
        type: metadata.type,
        description: metadata.description,
      };

      if (metadata.enum) {
        properties[paramName].enum = metadata.enum;
      }

      if (metadata.items) {
        properties[paramName].items = metadata.items;
      }

      if (metadata.required !== false) {
        required.push(paramName);
      }
    });

    return {
      type: "function",
      function: {
        name,
        description,
        parameters: {
          type: "object",
          properties,
          required,
        },
      },
    };
  });
}
