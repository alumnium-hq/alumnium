import z from "zod";
import { Logger } from "../../telemetry/Logger.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { McpScenariosState } from "../scenarios/McpScenariosState.ts";

const { tracer, logger } = Telemetry.get(import.meta.url);

export namespace McpTool {
  export interface DefineProps<
    Name extends string,
    Input extends z.ZodObject,
  > extends Shape<Name, Input> {
    execute: NoInfer<DefineExecuteFn<Input, any>>;
  }

  export type DefineExecuteFn<InputSchema, Output> = (
    input: z.infer<InputSchema>,
    context: DefineExecuteContext,
  ) => Promise<Output>;

  export interface DefineExecuteContext extends DefinitionExecuteContext {
    logger: Logger.Like;
  }

  export interface Definition<
    Name extends string,
    InputSchema extends z.ZodObject,
  > {
    name: Name;
    description: string | (() => string);
    Input: InputSchema;
    execute: DefinitionExecuteFn<InputSchema, any>;
  }

  export type DefinitionExecuteFn<Input, Output> = (
    input: z.infer<Input>,
    context: DefinitionExecuteContext,
  ) => Promise<Output>;

  export interface DefinitionExecuteContext {
    scenarios: McpScenariosState;
  }

  export interface Shape<
    Name extends string = string,
    InputSchema extends z.ZodObject = z.ZodObject,
  > {
    name: Name;
    description: string | (() => string);
    Input: InputSchema;
    snippets?: ShapeSnippetsFn;
  }

  export type ShapeSnippetsFn = (...args: any[]) => Record<string, Snippet>;

  export type Snippet = string | SnippetFn;

  export type SnippetFn = (...args: any[]) => string;

  export type Shapes = Record<string, Shape<string, z.ZodObject>>;
}

export abstract class McpTool {
  static WithDriverId = z.object({ id: z.string() });

  static OutputContent = z.object({
    type: z.literal("text"),
    text: z.string(),
  });

  static Output = z.tuple([this.OutputContent]);

  static define<Name extends string, Input extends z.ZodObject>(
    props: McpTool.DefineProps<Name, Input>,
  ): McpTool.Definition<Name, Input> {
    // Instrument with input/output logging
    const execute = (
      input: z.infer<Input>,
      context: McpTool.DefinitionExecuteContext,
    ) =>
      tracer.span(
        "mcp.tool.invoke",
        { "mcp.tool.name": props.name },
        async (span) => {
          const parsedInput = McpTool.WithDriverId.safeParse(input);
          const driverId = parsedInput.data?.id;

          span.attr("mcp.driver.id", driverId);

          const executeLogger = this.createExecuteLogger(driverId, props.name);
          executeLogger.info("Executing");
          executeLogger.debug(`  -> Input: {input}`, { input });

          const result = await props.execute(input, {
            ...context,
            logger: executeLogger,
          });

          executeLogger.info("Completed");
          executeLogger.debug("  -> Result: {result}", { result });

          return result;
        },
      );

    return { ...props, execute };
  }

  static createExecuteLogger(
    driverId: string | undefined,
    toolName: string,
  ): Logger.Like {
    return Logger.bind(
      logger,
      (message) => `${driverId || "global"}/${toolName}(): ${message}`,
    );
  }
}
