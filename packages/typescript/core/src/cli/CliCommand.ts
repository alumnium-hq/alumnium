import { always } from "alwaysly";
import { type CAC, cac } from "cac";
import * as ansi from "picocolors";
import { z } from "zod";
import type { $ZodError, $ZodErrorTree } from "zod/v4/core";
import { Env, envVarSchema } from "../Env.ts";

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

  export interface Group {
    name: string;
    description: string;
    commands: Definition<never>[];
    register: (cli: CAC) => void;
  }

  export interface GroupProps {
    name: string;
    description: string;
    commands: Definition<never>[];
  }

  export interface ParseProps {
    name: string;
    version?: string | undefined;
    commands: (Definition<never> | Group)[];
    args: string[];
  }

  export interface OptionMeta {
    name: string;
    syntax: string;
    description: string;
    env?: Env.VarName | undefined;
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
        const options = Object.fromEntries(
          Object.entries(rawArgs).map(([key, value]) => [
            key,
            typeof value === "number" ? String(value) : value, // cac parses numeric values like `0` as numbers
          ]),
        );
        const argsResult = Args.safeParse(options);

        if (argsResult.error) {
          const { error } = argsResult;
          printError(error, Args);

          if (definition.cli) {
            console.log(`${ansi.blue("Help:")}\n`);
            definition.cli.outputHelp();
          }

          process.exit(1);
        }

        // Env vars are read here rather than in the schema defaults, so
        // that help shows the defaults instead of the current env values.
        const args: Record<string, unknown> = argsResult.data;
        Object.entries(Args.shape).forEach(([key, Arg]) => {
          const env = CliCommand.option.get(Arg)?.env;
          if (env && !(key in options)) args[key] = Env[env];
        });

        const logFilenameHint = logFilenameHintFor(name);
        await action({
          args: args as z.infer<ArgsSchema>,
          logFilenameHint,
        });
      },

      register: (cli: CAC) => {
        definition.cli = cli;
        let command = cli.command(name, description);

        Object.values(Args.shape).forEach((Arg) => {
          const meta = CliCommand.option.get(Arg);
          always(meta);

          const notes = [];
          if (Arg instanceof z.ZodDefault)
            notes.push(
              `default: ${String(z.encode(Arg, Arg.def.defaultValue))}`,
            );
          if (meta.env) notes.push(`env: ${meta.env}`);
          const description = notes.length
            ? `${meta.description} (${notes.join(", ")})`
            : meta.description;

          command = command.option(meta.syntax, description);
        });

        command.action(definition.action);
      },
    };
    return definition;
  }

  static group(props: CliCommand.GroupProps): CliCommand.Group {
    const { name, description, commands } = props;
    return {
      name,
      description,
      commands,
      register: (cli) => {
        cli.command(`${name} <command>`, description);
      },
    };
  }

  static parse(props: CliCommand.ParseProps): void {
    const { name, version, commands, args } = props;

    const group = commands.find(
      (command): command is CliCommand.Group =>
        "commands" in command && command.name === args[0],
    );

    if (group)
      return CliCommand.parse({
        name: `${name} ${group.name}`,
        commands: group.commands,
        args: args.slice(1),
      });

    const cli = cac(name);
    commands.forEach((command) => command.register(cli));
    cli.help();
    if (version) cli.version(version);

    cli.addEventListener("command:*", () => {
      const commandNames = commands.map((command) => command.name).join(", ");
      exitWithHelp(
        cli,
        `Incorrect '${cli.args[0]}' command, use one of: ${commandNames}`,
      );
    });

    if (!args.length) {
      cli.outputHelp();
      process.exit(1);
    }

    try {
      cli.parse(["", "", ...args]);
    } catch (error) {
      // cac throws CACError on missing args, unknown options and missing
      // option values, but doesn't export it.
      if (error instanceof Error && error.name === "CACError")
        exitWithHelp(cli, error.message);
      throw error;
    }
  }

  static option = z.registry<CliCommand.OptionMeta>();

  static envOption<Name extends Env.VarName>(
    env: Name,
    meta: Omit<CliCommand.OptionMeta, "env">,
  ): z.ZodType<(typeof Env)[Name]> {
    // Clones the schema, as env vars may share schemas, e.g. Driver.Id.
    return envVarSchema(env)
      .clone()
      .register(CliCommand.option, { ...meta, env });
  }
}

function exitWithHelp(cli: CAC, message: string): never {
  // We intentionally use `console` here to format it independently and
  // before commands configure logging.
  console.error(`${ansi.red("Error:")} ${message}\n`);
  console.log(`${ansi.blue("Help:")}\n`);
  cli.outputHelp();
  process.exit(1);
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
