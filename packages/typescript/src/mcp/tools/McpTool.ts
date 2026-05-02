import z from "zod";
import { Logger } from "../../telemetry/Logger.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);

export namespace McpTool {
  export interface DefineProps<Input extends z.ZodObject> {
    description: string;
    inputSchema: Input;
    execute: NoInfer<DefineExecuteFn<Input>>;
  }

  export type DefineExecuteFn<Input> = (
    input: z.infer<Input>,
    helpers: ExecuteHelpers,
  ) => Promise<Output>;

  export interface Definition<Name extends string, Input extends z.ZodObject> {
    name: Name;
    description: string;
    inputSchema: Input;
    execute: DefinitionExecuteFn<Input>;
  }

  export type DefinitionExecuteFn<Input> = (
    input: z.infer<Input>,
  ) => Promise<Output>;

  export interface ExecuteHelpers {
    logger: Logger.Like;
  }

  export type OutputContent = z.infer<typeof McpTool.OutputContent>;

  export type Output = z.infer<typeof McpTool.Output>;
}

export abstract class McpTool {
  static IdInput = z.object({ id: z.string() });

  static OutputContent = z.object({
    type: z.literal("text"),
    text: z.string(),
  });

  static Output = z.array(this.OutputContent);

  static define<Name extends string, Input extends z.ZodObject>(
    name: Name,
    props: McpTool.DefineProps<Input>,
  ): McpTool.Definition<Name, Input> {
    // Instrument with input/output logging
    const execute = async (input: z.infer<Input>) =>
      tracer.span("mcp.tool.invoke", { "mcp.tool.name": name }, async () => {
        const parsedInput = McpTool.IdInput.safeParse(input);
        const id = parsedInput.data?.id;
        const executeLogger = Logger.bind(
          logger,
          (message) => `${id || "global"}/${name}(): ${message}`,
        );

        executeLogger.info("Executing");
        executeLogger.debug(`  -> Input: {input}`, { input });

        const result = await props.execute(input, { logger: executeLogger });

        executeLogger.info("Completed");
        executeLogger.debug("  -> Result: {result}", { result });

        return result;
      });

    return { ...props, name, execute };
  }
}
