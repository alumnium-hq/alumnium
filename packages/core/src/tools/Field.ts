export type JSONSchemaType =
  | "string"
  | "integer"
  | "number"
  | "boolean"
  | "array"
  | "object";

export interface FieldMetadata {
  name: string;
  paramName?: string; // Custom parameter name for schema (defaults to name)
  type: JSONSchemaType;
  description: string;
  required?: boolean; // Defaults to true if not specified
  enum?: string[];
  items?: { type: JSONSchemaType }; // Type of array elements (for array types)
}

// Interface for tool classes that use fields
export interface ToolWithFields {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  new (...args: any[]): any;
  fields: FieldMetadata[];
  description: string;
}

/**
 * Helper function to create field metadata
 */
export function field(options: {
  name: string;
  type: JSONSchemaType;
  description: string;
  paramName?: string;
  required?: boolean;
  enum?: string[];
  items?: { type: JSONSchemaType };
}): FieldMetadata {
  return {
    name: options.name,
    type: options.type,
    description: options.description,
    paramName: options.paramName,
    required: options.required ?? true,
    enum: options.enum,
    items: options.items,
  };
}
