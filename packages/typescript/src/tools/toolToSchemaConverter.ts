/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { ToolClass } from "./BaseTool.js";
import { ToolWithFields } from "./Field.js";

interface ToolSchema {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<
        string,
        { type: string; description: string; enum?: string[] }
      >;
      required: string[];
    };
  };
}

export function convertToolsToSchemas(
  tools: Record<string, ToolClass>
): ToolSchema[] {
  return Object.entries(tools).map(([name, ToolClass]) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any, @typescript-eslint/no-unsafe-member-access
    const description = (ToolClass as any).description || `Execute ${name}`;

    // Get field metadata from the tool class static property
    const fields = (ToolClass as ToolWithFields).fields || [];

    const properties: Record<
      string,
      { type: string; description: string; enum?: string[] }
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
