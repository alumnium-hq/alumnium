// import { JSONSchema } from "zod/v4/core";
// import { BaseDriver } from "../drivers/BaseDriver.js";
// import { BaseTool, ToolClass } from "../tools/BaseTool.js";
// import { FieldMetadata, JSONSchemaType } from "../tools/Field.js";
// import { ToolSchema } from "../tools/ToolSchema.js";

// /** Convert JSON schema type to Python type. */
// function jsonTypeToPythonType(fieldSchema: JSONSchema.Schema): unknown {
//   const jsonType = (fieldSchema["type"] as string | undefined) ?? "string";

//   const typeMap: Record<string, unknown> = {
//     integer: Number,
//     string: String,
//     boolean: Boolean,
//     number: Number,
//     object: Object,
//   };

//   // Handle array types with items
//   if (jsonType === "array") {
//     const items =
//       (fieldSchema["items"] as Record<string, unknown> | undefined) ?? {};
//     const itemType = jsonTypeToPythonType(items);
//     return [itemType];
//   }

//   return typeMap[jsonType] ?? String;
// }

// /**
//  * Dynamically create a tool class from a schema.
//  */
// function createToolClassFromSchema(schema: ToolSchema): ToolClass {
//   const fn = schema.function;
//   const required = new Set<string>(fn.parameters.required ?? []);

//   // Create field annotations and defaults
//   const annotations: Record<string, unknown> = {};
//   const fieldDefaults: Record<
//     string,
//     { default: unknown; description: string }
//   > = {};
//   const fields: FieldMetadata[] = [];

//   for (const [fieldName, fieldSchema] of Object.entries(
//     fn.parameters.properties || {},
//   )) {
//     const fieldType = jsonTypeToPythonType(fieldSchema);
//     const fieldDescription =
//       (fieldSchema["description"] as string | undefined) ??
//       `${fieldName} parameter`;

//     // Set type annotation
//     annotations[fieldName] = fieldType;

//     // Create Field with description
//     if (required.has(fieldName)) {
//       fieldDefaults[fieldName] = {
//         default: undefined,
//         description: fieldDescription,
//       };
//     } else {
//       fieldDefaults[fieldName] = {
//         default: null,
//         description: fieldDescription,
//       };
//     }

//     const jsonType =
//       (fieldSchema["type"] as JSONSchemaType | undefined) ?? "string";
//     const items =
//       (fieldSchema["items"] as { type?: JSONSchemaType } | undefined) ??
//       undefined;
//     const enumValues =
//       (fieldSchema["enum"] as string[] | undefined) ?? undefined;

//     fields.push({
//       name: fieldName,
//       type: jsonType,
//       description: fieldDescription,
//       required: required.has(fieldName),
//       enum: enumValues,
//       items: items?.type ? { type: items.type } : undefined,
//     });
//   }

//   // Create empty invoke method
//   // Create class attributes
//   class DynamicTool extends BaseTool {
//     static description = fn.description;
//     static fields = fields;
//     static __annotations__ = annotations;
//     static fieldDefaults = fieldDefaults;

//     constructor(args: Record<string, unknown> = {}) {
//       super();
//       Object.assign(this, args);
//     }

//     /** Empty invoke method - to be implemented by actual tool execution. */
//     invoke(_driver: BaseDriver): void {}
//   }

//   // Create the class
//   Object.defineProperty(DynamicTool, "name", { value: fn.name });

//   return DynamicTool as unknown as ToolClass;
// }

// /**
//  * Convert tool schemas to dynamically created tool classes.
//  */
// export function convertSchemasToTools(
//   schemas: ToolSchema[],
// ): Record<string, ToolClass> {
//   const tools: Record<string, ToolClass> = {};
//   for (const schema of schemas) {
//     tools[schema.function.name] = createToolClassFromSchema(schema);
//   }
//   return tools;
// }
