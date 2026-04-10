import { describe, expect, it } from "vitest";
import { PressKeyTool } from "./PressKeyTool.ts";
import { convertToolsToSchemas } from "./toolToSchemaConverter.ts";
import { TypeTool } from "./TypeTool.ts";
import { UploadTool } from "./UploadTool.ts";

describe(convertToolsToSchemas, () => {
  it("converts tool with primitives", () => {
    expect(convertToolsToSchemas({ TypeTool })[0]).toEqual({
      type: "function",
      function: {
        name: "TypeTool",
        description:
          "Type text into an element. Automatically focuses the element and clears it before typing.",
        parameters: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Element identifier (ID)",
            },
            text: {
              type: "string",
              description: "Text to type into an element",
            },
          },
          required: ["id", "text"],
        },
      },
    });
  });

  it("converts tool with enum", () => {
    const schema = convertToolsToSchemas({ PressKeyTool })[0];

    expect(schema).toEqual({
      type: "function",
      function: {
        name: "PressKeyTool",
        description:
          "Press a keyboard key. Does not require element to be focused.",
        parameters: {
          type: "object",
          properties: {
            key: {
              type: "string",
              enum: ["Backspace", "Enter", "Escape", "Tab"],
              description: "Key to press.",
            },
          },
          required: ["key"],
        },
      },
    });
  });

  it("converts tool with array", () => {
    const schema = convertToolsToSchemas({ UploadTool })[0];

    expect(schema).toEqual({
      type: "function",
      function: {
        name: "UploadTool",
        description:
          "Upload one or more files using a button that opens a file chooser. " +
          "This tool automatically clicks the button, DO NOT use ClickTool for that.",
        parameters: {
          type: "object",
          properties: {
            id: {
              type: "integer",
              description: "Element identifier (ID)",
            },
            paths: {
              type: "array",
              items: {
                type: "string",
              },
              description:
                "Absolute file path(s) to upload. Can be a single path or multiple paths for multi-file upload.",
            },
          },
          required: ["id", "paths"],
        },
      },
    });
  });
});
