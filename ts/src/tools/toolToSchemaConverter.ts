import { BaseTool } from './BaseTool.js';

interface ToolSchema {
  type: string;
  function: {
    name: string;
    description: string;
    parameters: {
      type: string;
      properties: Record<string, { type: string; description: string }>;
      required: string[];
    };
  };
}

export function convertToolsToSchemas(
  tools: Record<string, new (...args: any[]) => BaseTool>
): ToolSchema[] {
  return Object.entries(tools).map(([name, ToolClass]) => {
    const description = (ToolClass as any).description || `Execute ${name}`;

    // Extract parameter info from a sample instance
    const schema: ToolSchema = {
      type: 'function',
      function: {
        name,
        description,
        parameters: {
          type: 'object',
          properties: {},
          required: [],
        },
      },
    };

    // Define properties based on tool type
    if (name === 'ClickTool' || name === 'HoverTool') {
      schema.function.parameters.properties = {
        id: { type: 'integer', description: 'Element identifier (ID)' },
      };
      schema.function.parameters.required = ['id'];
    } else if (name === 'TypeTool') {
      schema.function.parameters.properties = {
        id: { type: 'integer', description: 'Element identifier (ID)' },
        text: { type: 'string', description: 'Text to type into an element' },
      };
      schema.function.parameters.required = ['id', 'text'];
    } else if (name === 'SelectTool') {
      schema.function.parameters.properties = {
        id: { type: 'integer', description: 'Element identifier (ID)' },
        option: { type: 'string', description: 'Option to select' },
      };
      schema.function.parameters.required = ['id', 'option'];
    } else if (name === 'PressKeyTool') {
      schema.function.parameters.properties = {
        key: { type: 'string', description: 'Key to press.' },
      };
      schema.function.parameters.required = ['key'];
    } else if (name === 'DragAndDropTool') {
      schema.function.parameters.properties = {
        from_id: { type: 'integer', description: 'Identifier (ID) of element to drag' },
        to_id: { type: 'integer', description: 'Identifier (ID) of element to drop onto' },
      };
      schema.function.parameters.required = ['from_id', 'to_id'];
    }

    return schema;
  });
}
