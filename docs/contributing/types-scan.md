# Types Scan

This document describes the `scanTypes` defined in [`packages/typescript/src/utils/typesScan.ts`](../../packages/typescript/src/utils/typesScan.ts), and its counterpart script [`packages/typescript/scripts/generate-types-scan-schema.ts`](../../packages/typescript/scripts/generate-types-scan-schema.ts).

## Quick Start

The idea of the types scan is to assist in adding type safety and provide an insight into the shape of weakly typed data structures. It is important given that Alumnium has to work with numerous ever-changing 3rd-party APIs. New models and project features require additional detail in the existing schemas, so it will be instrumental going forward.

We initially built it to type LangChain generations but can use it out of the context of LLM APIs.

To use it, set the `ALUMNIUM_DEV_DATA_TYPES_SCAN=true` env var (any non-empty value) and call the `scanTypes` function, passing the current module URL and ID, e.g.,:

```ts
const stored = serializeGeneration(generation);
scanTypes({
  url: import.meta.url,
  id: "serialized",
  value: stored,
});
// ...
```

Once the function is executed (e.g., when running system tests), it creates a JSON file next to the module with the data types information. For example, when called from `Lchain.ts` with the arguments above, it would create `Lchain.serialized.types-scan.json` with content looking like that:

```json
[
  {
    "kind": "object",
    "properties": {
      "text": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "string",
            "values": ["Hello", "cruel", "world"]
          }
        ]
      }
    }
  }
]
```

See a types scan example: [`packages/typescript/src/llm/Lchain.serialized.types-scan.json`](../../packages/typescript/src/llm/Lchain.serialized.types-scan.json).

Each `scanTypes` reads the existing schema and extends it with the passed data types. The more examples it sees, the more detailed the `types-scan.json` file becomes.

It doesn't guarantee the 100% match and can only be as detailed as the diverse passed data is.

While processing a new data structure or its variant, it produces literals for every primitive data type, so to get the most out of it, a contributor must manually edit the `types-scan.json` to shape the schema.

See [Shaping `types-scan.json`](#shaping-types-scanjson) for the detailed reference.

#### Generating Schema

To generate Zod schema code from a `types-scan.json` file, use one of the following tasks:

- [`//packages/typescript:generate/types-scan-schema`](#module-mode): Generate a Zod schema module with schema and types exported on the root level.
- [`//packages/typescript:generate/types-scan-schema:class`](#class-mode): Generate a Zod schema abstract class module.

The output can be used to codegen a source file or to cherry-pick needed schemas.

##### Module Mode

Use the `//packages/typescript:generate/types-scan-schema` task to generate a module that exports Zod schemas and inferred types on the root level:

```sh
mise //packages/typescript:generate/types-scan-schema ./src/llm/Lchain.serialized.types-scan.json
```

It outputs such TypeScript code:

```ts
import z from "zod";

export const MessageThinking = z.object({
  type: z.literal("thinking"),
  thinking: z.string(),
  signature: z.string().optional(),
});

export type MessageThinking = z.infer<typeof MessageThinking>;

export const MessageText = z.object({
  type: z.literal("text"),
  text: z.string(),
  annotations: z.array(z.unknown()).optional(),
});

export type MessageText = z.infer<typeof MessageText>;

// ...
```

##### Class mode

Use the `//packages/typescript:generate/types-scan-schema:class` task to generate a module that exports Zod schemas and inferred types wrapped into `abstract class` along with a `namespace`.

```sh
mise //packages/typescript:generate/types-scan-schema:class ./src/llm/Lchain.serialized.types-scan.json LchainSchema
```

> The second argument (`LchainSchema`) specifies the class name to use.

It outputs such TypeScript code:

```ts
import z from "zod";

export abstract class LchainScan {
  static MessageThinking = z.object({
    type: z.literal("thinking"),
    thinking: z.string(),
    signature: z.string().optional(),
  });

  static MessageText = z.object({
    type: z.literal("text"),
    text: z.string(),
    annotations: z.array(z.unknown()).optional(),
  });

  static MessageDataContent = z.discriminatedUnion("type", [
    this.MessageThinking,
    this.MessageText,
  ]);
}

export namespace LchainScan {
  export type MessageThinking = z.infer<typeof LchainScan.MessageThinking>;

  export type MessageText = z.infer<typeof LchainScan.MessageText>;

  export type MessageDataContent = z.infer<
    typeof LchainScan.MessageDataContent
  >;
}
```

## How to Use

After adding a new model support provider or using a new LLM feature, make sure to run a system test with `ALUMNIUM_DEV_DATA_TYPES_SCAN` to update the existing `types-scan.json` files and also instrument any new data sources if needed.

While it can add extra unrelated work (or even irrelevant information), we advise keeping `ALUMNIUM_DEV_DATA_TYPES_SCAN` on and submitting PRs with any updates to the `types-scan.json` files and corresponding schemas.

To capture as much detail as possible, make sure to run the instrumented code multiple times and use different models when relevant. In between runs, make sure to inspect the updated `types-scan.json` and shape it so it is correct. See [Shaping `types-scan.json`](#shaping-types-scanjson) for a detailed reference of various shaping methods.

It is also a good idea to clear the LLM cache before attempting to capture data type updates:

```sh
mise //:clear/cache
```

## Shaping `types-scan.json`

### Pinning Primitives

The `types-scan.json` is supposed to be manually edited by the contributor using it to shape the schema.

The initial run on a new data structure or its variation generates literals for all primitive data types, which is undesirable in most cases, e.g., semantically, `data.message` is any `string`:

```json
[
  {
    "kind": "object",
    "properties": {
      "text": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "string",
            "values": ["Hello", "cruel", "world"]
          }
        ]
      }
    }
  }
]
```

To pin non-literal primitives, replace `"values": [...]` with `"literal": false`. On the next run, the `scanTypes` will recognize it as a generic primitive and will stop adding new values to it.

It turns `z.union([z.literal("Hello"), z.literal("cruel"), z.literal("world")])` into more accurate `z.string()`.

### Pinning Records

Some objects (i.e., LLM tool input that varies from tool to tool) don't need to be detailed, e.g.,:

```json
[
  {
    "kind": "object",
    "properties": {
      "input": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "object",
            "properties": {
              "goal": {
                "kind": "field",
                "optional": true,
                "type": [
                  {
                    "kind": "string",
                    "values": ["Goal 1", "Goal 2", "Goal 3"]
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }
]
```

To make the `scanTypes` ignore its shape, set the `kind` property to `"record"`:

```json
[
  {
    "kind": "object",
    "properties": {
      "input": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "record"
          }
        ]
      }
    }
  }
]
```

On the next run the `scanTypes` will ignore its internal shape and produce `z.record(z.string(), z.unknown())`.

To make the `scanTypes` keep collecting internal types while ignoring its keys, set the record type:

```json
[
  {
    "kind": "object",
    "properties": {
      "map": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "record",
            "type": [
              {
                "kind": "string",
                "literal": false
              }
            ]
          }
        ]
      }
    }
  }
]
```

> Note that `type` must always be an array for any data type for consistency between singular and union types.

### Marking WIP Nodes

When a node is not ready to be represented precisely yet, set `"wip"` on that node.

#### Replace with `unknown` via `"wip": true`

Set the `"wip": true` property on a node to make the generated schema use `z.unknown()` while keeping scan collection active:

```json
[
  {
    "name": "Message",
    "kind": "object",
    "properties": {
      "data": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "object",
            "wip": true,
            "properties": {
              "type": {
                "kind": "field",
                "optional": false,
                "type": [{ "kind": "string", "values": ["text"] }]
              }
            }
          }
        ]
      }
    }
  }
]
```

It will result in such a schema:

```ts
export const Message = z.object({
  data: z.unknown(),
});
```

The `scanTypes` still behaves normally and keeps collecting type information under that node. During schema generation, any node marked with `"wip": true` is emitted as `z.unknown()`.

This is useful when a node is still being explored and you want a temporary loose schema without losing scan data.

#### Replace With Custom Type

Set the `wip` property to an object with `"kind": "replace"` and specific `type` to override the generated type with a custom shape:

```json
[
  {
    "name": "Message",
    "kind": "object",
    "wip": {
      "kind": "replace",
      "type": [
        {
          "kind": "record"
        }
      ]
    },
    "properties": {
      "data": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "object",
            "properties": {
              "type": {
                "kind": "field",
                "optional": false,
                "type": [{ "kind": "string", "values": ["text"] }]
              }
            }
          }
        ]
      }
    }
  }
]
```

It will result in such a schema:

```ts
export const Message = z.record(z.string(), z.unknown());
```

#### Add Custom Type to Generated Union

Set the `wip` property to an object with `"kind": "add"` and specific `type` to add custom type to the generated type:

```json
[
  {
    "name": "Message",
    "kind": "object",
    "properties": {
      "data": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "object",
            "properties": {
              "type": {
                "kind": "field",
                "optional": false,
                "type": [
                  {
                    "kind": "string",
                    "wip": {
                      "kind": "add",
                      "type": [{ "kind": "string", "literal": false }]
                    },
                    "values": ["text"]
                  }
                ]
              }
            }
          }
        ]
      }
    }
  }
]
```

It will result in such a schema:

```ts
export const MessageData = z.object({
  type: z.union([z.literal("text"), z.string()]),
});

export const Message = z.object({
  data: MessageData,
});
```

### Pinning to Unknown

To stop scanning completely for a node, set the node kind to `"unknown"`:

```json
{
  "kind": "unknown"
}
```

The `scanTypes` stops traversing such a node and updating that branch, and the generated schema is always `z.unknown()`.

### Defining Discriminated Unions

Some data types must be represented as unions rather than objects with variable shape. To make the `scanTypes` collect discriminated union types, assign the `discriminator` property to the field to use as the discriminator.

**Important**: Make sure to run the instrumented code after assigning a discriminator to allow the `scanTypes` update the affected `types-scan.json` files.

For example, an object that can be of two shapes:

```json
{
  "type": "text",
  "text": "Hello, world!"
}
```

...and:

```json
{
  "type": "image",
  "base64": "data:image/jpeg;base64..."
}
```

The initial run would produce:

```json
[
  {
    "kind": "object",
    "properties": {
      "type": {
        "kind": "field",
        "optional": false,
        "type": [
          {
            "kind": "string",
            "values": ["text", "image"]
          }
        ]
      },
      "text": {
        "kind": "field",
        "optional": true,
        "type": [
          {
            "kind": "string",
            "values": ["Hello, world!"]
          }
        ]
      },
      "base64": {
        "kind": "field",
        "optional": true,
        "type": [
          {
            "kind": "string",
            "values": ["data:image/jpeg;base64..."]
          }
        ]
      }
    }
  }
]
```

To turn it into a discriminated union, add `discriminator`:

```jsonc
[
  {
    "kind": "object",
    "discriminator": "type",
    "properties": {
      // ...
    },
  },
]
```

On the next run with the same data, the `scanTypes` will update it and produce a union instead:

```json
[
  {
    "kind": "object",
    "discriminator": "type",
    "properties": [
      {
        "kind": "object",
        "properties": {
          "type": {
            "kind": "field",
            "optional": false,
            "type": [
              {
                "kind": "string",
                "values": ["text"]
              }
            ],
            "discriminator": true
          },
          "text": {
            "kind": "field",
            "optional": false,
            "type": [
              {
                "kind": "string",
                "values": ["Hello, world!"]
              }
            ]
          }
        }
      },
      {
        "kind": "object",
        "properties": {
          "type": {
            "kind": "field",
            "optional": false,
            "type": [
              {
                "kind": "string",
                "values": ["image"]
              }
            ],
            "discriminator": true
          },
          "base64": {
            "kind": "field",
            "optional": false,
            "type": [
              {
                "kind": "string",
                "values": ["data:image/jpeg;base64..."]
              }
            ]
          }
        }
      }
    ]
  }
]
```

The resulting Zod schema will accurately represent the shape of the object:

```ts
import z from "zod";

const MessageText = z.object({ type: z.literal("text"), text: z.string() });

const MessageImage = z.object({ type: z.literal("image"), base64: z.string() });

const Message = z.discriminatedUnion("type", [MessageText, MessageImage]);
```

> For this example, we also assigned `name` and set `literal` to `false`, but to avoid confusion the examples above doesn't reflect it.

### Naming Schemas

By default, when calling the `//packages/typescript:generate/types-scan-schema` task, it derives names from file and node parents, resulting in unique but often verbose names, e.g., `StoredGenerationMessageDataAdditionalKwargsToolCallsItem`.

To customize it, assign the `name` property to a node to use for the node schema representation and all its children, e.g., (on `data.message.data.additional_kwargs`):

```jsonc
[
  {
    "name": "MessageKwargs",
    "kind": "object",
    "properties": {
      "tool_calls": {
        "kind": "field",
        "optional": false,
        "type": [
          // ...
        ],
      },
    },
  },
]
```

It will ignore the parents' prefix and assign more friendly names, e.g., `MessageKwargs` instead of `StoredGenerationMessageDataAdditionalKwargs` and `MessageKwargsToolCallsItem` instead of `StoredGenerationMessageDataAdditionalKwargsToolCallsItem`.
