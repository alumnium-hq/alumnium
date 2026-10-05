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
      action: runAction,

      register: (cli: CAC) => {
        definition.cli = cli;

        const fields = Object.entries(Args.shape).map(([key, Arg]) => {
          const meta = CliCommand.option.get(Arg);
          always(meta);
          return { key, Arg, meta };
        });
        const positionals = fields.filter(({ meta }) => meta.positional);

        let command = cli.command(
          [name, ...positionals.map(({ meta }) => meta.syntax)].join(" "),
          description,
        );

        fields.forEach(({ Arg, meta }) => {
          if (meta.positional) return;

          let defaultValue: string | undefined;
          if (Arg instanceof z.ZodDefault)
            defaultValue = String(Arg.def.defaultValue);

          command = command.option(meta.syntax, meta.description, {
            default: defaultValue,
          });
        });

        // NOTE: cac passes positional arguments first and the options object last.
        command.action((...params: unknown[]) => {
          const rawArgs: Record<string, unknown> = Object.assign(
            {},
            params.at(-1),
          );
          positionals.forEach(({ key }, index) => {
            rawArgs[key] = params[index];
          });
          return runAction(rawArgs);
        });
      },
    };
    return definition;

    async function runAction(rawArgs: unknown) {
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
    }
  }

  static option = z.registry<{
    name: string;
    syntax: string;
    description: string;
    positional?: boolean;
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
