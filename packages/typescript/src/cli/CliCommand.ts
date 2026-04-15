import { always } from "alwaysly";
import type { CAC } from "cac";
import * as ansi from "picocolors";
import { z } from "zod";
import type { $ZodError, $ZodErrorTree } from "zod/v4/core";

export namespace CliCommand {
  export interface DefineProps<
    ArgsSchema extends z.ZodTuple | undefined,
    OptionsSchema extends z.ZodObject,
  > {
    name: string;
    description: string;
    Args?: ArgsSchema;
    Options: OptionsSchema;
    action: NoInfer<
      ActionFn<
        ArgsSchema extends undefined ? undefined : z.infer<ArgsSchema>,
        z.infer<OptionsSchema>
      >
    >;
  }

  export type ActionFn<Args, Options> = (
    props: ActionProps<Args, Options>,
  ) => Promise<void>;

  export interface ActionProps<Args, Options> {
    args: Args;
    options: Options;
    logFilenameHint: string;
  }

  export interface Definition<Args, Options> {
    name: string;
    description: string;
    action: DefinitionActionFn<Args, Options>;
    register: (cli: CAC) => void;
    cli?: CAC | undefined;
  }

  export interface DefinitionActionInput<Args, Options> {
    args: Args;
    options: Options;
  }

  export type DefinitionActionFn<Args, Options> = (
    input: DefinitionActionInput<Args, Options>,
  ) => Promise<void>;
}

export abstract class CliCommand {
  static define<
    ArgsSchema extends z.ZodTuple | undefined,
    OptionsSchema extends z.ZodObject,
  >(
    props: CliCommand.DefineProps<ArgsSchema, OptionsSchema>,
  ): CliCommand.Definition<
    ArgsSchema extends undefined ? undefined : z.infer<ArgsSchema>,
    z.infer<OptionsSchema>
  > {
    const { name, description, Args, Options, action } = props;

    const definition: CliCommand.Definition<
      ArgsSchema extends undefined ? undefined : z.infer<ArgsSchema>,
      z.infer<OptionsSchema>
    > = {
      name,
      description,

      action: async (input) => {
        const argsResult = Args?.safeParse(input.args);
        const optionsResult = Options.safeParse(input.options);

        function printHelpAndExit(): never {
          if (definition.cli) {
            console.log(`${ansi.blue("Help:")}\n`);
            definition.cli.outputHelp();
          }
          process.exit(1);
        }

        if (Args && argsResult?.error) {
          const { error } = argsResult;
          printVarsError(error, Args, "arguments");
          printHelpAndExit();
        }

        if (optionsResult.error) {
          const { error } = optionsResult;
          printVarsError(error, Options, "options");
          printHelpAndExit();
        }

        const args = argsResult?.data as ArgsSchema extends undefined
          ? undefined
          : z.TypeOf<ArgsSchema>;
        const options = optionsResult.data;
        const logFilenameHint = logFilenameHintFor(name);
        await action({ args, options, logFilenameHint });
      },

      register: (cli: CAC) => {
        definition.cli = cli;

        const argsSyntax =
          Args?.def.items?.map((Arg, index) => {
            const meta = CliCommand.arg.get(Arg);
            if (!meta)
              throw new Error(
                `Missing metadata for argument #${index} in command '${name}'`,
              );
            always(meta);

            return meta.syntax;
          }) || [];

        const commandSyntax = [name].concat(argsSyntax).join(" ");
        let command = cli.command(commandSyntax, description, {});

        Object.entries(Options.shape).forEach(([key, Option]) => {
          const meta = CliCommand.option.get(Option);
          if (!meta)
            throw new Error(
              `Missing metadata for option '${key}' in command '${name}'`,
            );

          let defaultValue: string | undefined;
          if (Option instanceof z.ZodDefault)
            defaultValue = String(Option.def.defaultValue);

          command = command.option(meta.syntax, meta.description, {
            default: defaultValue,
          });
        });

        command.action((...argsWithOptions) => {
          const args: any = Args ? argsWithOptions.slice(0, -1) : undefined;
          const options = argsWithOptions[argsWithOptions.length - 1];
          return definition.action({ args, options });
        });
      },
    };
    return definition;
  }

  static arg = z.registry<{
    name: string;
    syntax: string;
    description: string;
  }>();

  static option = z.registry<{
    name: string;
    syntax: string;
    description: string;
  }>();
}

function logFilenameHintFor(commandName: string): string {
  const logTimeStr = new Date().toISOString().slice(0, 19);
  return `${commandName}-${logTimeStr}.log`;
}

namespace printVarsError {
  export type Component = "options" | "arguments";
}

function printVarsError<Type>(
  error: $ZodError<Type>,
  Schema: z.ZodType<Type>,
  component: printVarsError.Component,
) {
  const tree = z.treeifyError(error);

  const errors: string[] = [];
  printTree(tree, Schema);

  if (errors.length) {
    console.log(
      `${ansi.red(`Invalid ${component}:`)}\n\n${errors.join("\n")}\n`,
    );
  }

  function printTree<InnerType>(
    tree: $ZodErrorTree<InnerType>,
    Schema: z.ZodType<InnerType>,
  ) {
    const shape = Schema instanceof z.ZodObject && Schema.def.shape;
    if (shape && "properties" in tree && tree.properties) {
      Object.entries(tree.properties).forEach(([field, subtree]) => {
        const fieldSchema = shape[field];
        if (!(fieldSchema instanceof z.ZodType)) return;
        printTree(subtree as $ZodErrorTree<InnerType>, fieldSchema);
      });
    }

    if (!tree.errors.length) return;

    const meta = CliCommand.option.get(Schema);
    if (!meta) return;

    errors.push(`- ${ansi.bold(`${meta.name}`)}: ${tree.errors.join(", ")}`);
  }
}
