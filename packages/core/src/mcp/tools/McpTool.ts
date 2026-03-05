import z from "zod";

export namespace McpTool {
  export interface DefineProps<Input extends z.ZodObject> {
    description: string;
    inputSchema: Input;
    execute: NoInfer<ExecuteFn<Input>>;
  }

  export interface Definition<Name extends string, Input extends z.ZodObject> {
    name: Name;
    description: string;
    inputSchema: Input;
    execute: ExecuteFn<Input>;
  }

  export type ExecuteFn<Input> = (input: z.infer<Input>) => Promise<Output>;

  export type OutputContent = z.infer<typeof McpTool.OutputContent>;

  export type Output = z.infer<typeof McpTool.Output>;
}

export abstract class McpTool {
  static OutputContent = z.object({
    type: z.literal("text"),
    text: z.string(),
  });

  static Output = z.array(this.OutputContent);

  static define<Name extends string, Input extends z.ZodObject>(
    name: Name,
    props: McpTool.DefineProps<Input>,
  ): McpTool.Definition<Name, Input> {
    return { ...props, name };
  }
}
