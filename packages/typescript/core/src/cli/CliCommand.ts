import { always } from "alwaysly";
import type { CAC } from "cac";
import * as ansi from "picocolors";
import { z } from "zod";
import type { $ZodError, $ZodErrorTree } from "zod/v4/core";

export namespace CliCommand {
  export interface DefineProps<ArgsSchema extends z.ZodObject> {
    name: string;
    description: string;
    Args: ArgsSchema;
    action: NoInfer<ActionFn<z.infer<ArgsSchema>>>;
  }

  export interface Definition<Args> {
    name: string;
    description: string;
    action: ActionFn<Args>;
    register: (cli: CAC) => void;
    cli?: CAC | undefined;
  }

  export type ActionFn<Args> = (props: ActionProps<Args>) => Promise<void>;

  export interface ActionProps<Args> {
    args: Args;
    logFilenameHint: string;
  }
}

export abstract class CliCommand {
  static define<ArgsSchema extends z.ZodObject>(
    props: CliCommand.DefineProps<ArgsSchema>,
  ): CliCommand.Definition<z.infer<ArgsSchema>> {
    const { name, description, Args, action } = props;

    const definition: CliCommand.Definition<z.infer<ArgsSchema>> = {
      name,
      description,

      action: async (rawArgs) => {
        const argsResult = Args.safeParse(rawArgs);

        if (argsResult.error) {
          const { error } = argsResult;
          printError(error, Args);

          if (definition.cli) {
            console.log(`${ansi.blue("Help:")}\n`);
            definition.cli.outputHelp();
          }

          process.exit(1);
        }

        const args = argsResult.data;
        const logFilenameHint = logFilenameHintFor(name);
        await action({ args, logFilenameHint });
      },

      register: (cli: CAC) => {
        definition.cli = cli;
        let command = cli.command(name, description);

        Object.values(Args.shape).forEach((Arg) => {
          const meta = CliCommand.option.get(Arg);
          always(meta);

          let defaultValue: string | undefined;
          if (Arg instanceof z.ZodDefault)
            defaultValue = String(Arg.def.defaultValue);

          command = command.option(meta.syntax, meta.description, {
            default: defaultValue,
          });
        });

        command.action(definition.action);
      },
    };
    return definition;
  }

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

function printError<Type>(error: $ZodError<Type>, Schema: z.ZodType<Type>) {
  const tree = z.treeifyError(error);

  const errors: string[] = [];
  printTree(tree, Schema);

  if (errors.length) {
    console.log(`${ansi.red(`Invalid arguments:`)}\n\n${errors.join("\n")}\n`);
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
