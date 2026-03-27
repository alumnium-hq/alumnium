import z from "zod";
import { bindLogger, getLogger, type LoggerLike } from "../../utils/logger.js";

const logger = getLogger(import.meta.url);

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
    logger: LoggerLike;
  }

  export type OutputContent = z.infer<typeof McpTool.OutputContent>;

  export type Output = z.infer<typeof McpTool.Output>;
}

export abstract class McpTool {
  static DriverInput = z.object({ driver_id: z.string() });

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
    const execute = async (input: z.infer<Input>) => {
      const parsedInput = McpTool.DriverInput.safeParse(input);
      const driverId = parsedInput.data?.driver_id;
      const executeLogger = bindLogger(
        logger,
        (message) => `${driverId || "global"}/${name}(): ${message}`,
      );

      executeLogger.info("Executing");
      executeLogger.debug(`  -> Input: {input}`, { input });

      const result = await props.execute(input, { logger: executeLogger });

      executeLogger.info("Completed");
      executeLogger.debug("  -> Result: {result}", { result });

      return result;
    };

    return { ...props, name, execute };
  }
}
