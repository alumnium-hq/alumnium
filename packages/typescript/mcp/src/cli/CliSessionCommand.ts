import { cac, type CAC } from "cac";
import * as ansi from "picocolors";
import z from "zod";
import { ALUMNIUM_BIN_VERSION, CliCommand, Env } from "@alumnium/core/internal";
import { CliSessionClient } from "./session/CliSessionClient.ts";
import { CliSessionRegistry } from "./session/CliSessionRegistry.ts";

const DEFAULT_CAPABILITIES = '{"platformName":"chrome"}';

const CheckOutput = z.object({ result: z.string() });

const Session = CliSessionRegistry.SessionName.default(
  Env.ALUMNIUM_CLI_SESSION ?? "default",
).register(CliCommand.option, {
  name: "session",
  syntax: "-s, --session <name>",
  description: "Session name (defaults to ALUMNIUM_CLI_SESSION or 'default')",
});

const Vision = z
  .union([z.boolean(), z.stringbool()])
  .default(false)
  .register(CliCommand.option, {
    name: "vision",
    syntax: "--vision",
    description: "Use a screenshot",
  });

const StartCommand = CliCommand.define({
  name: "start",
  description: "Start a session (browser or mobile app) in the background",

  Args: z.object({
    session: Session,

    capabilities: z
      .string()
      .default(DEFAULT_CAPABILITIES)
      .register(CliCommand.option, {
        name: "capabilities",
        syntax: "--capabilities <json|file>",
        description:
          "Capabilities JSON or path to a JSON file, same format as the MCP start tool",
      }),

    serverUrl: z.string().optional().register(CliCommand.option, {
      name: "server-url",
      syntax: "--server-url <url>",
      description: "Remote Selenium/Appium server URL",
    }),
  }),

  action: async ({ args, logFilenameHint }) => {
    if (Env.ALUMNIUM_CLI_DAEMONIZE) {
      const { runCliDaemon } = await import("./session/runCliDaemon.ts");
      return runCliDaemon({ ...args, logFilenameHint });
    }

    await respond(() => new CliSessionClient().start(args.session, args));
  },
});

const DoCommand = CliCommand.define({
  name: "do",
  description: "Execute a goal on the current page",

  Args: z.object({
    session: Session,
    goal: words("goal", "Natural language goal"),
  }),

  action: ({ args }) =>
    respond(() =>
      new CliSessionClient().run(args.session, "do", { goal: args.goal }),
    ),
});

const CheckCommand = CliCommand.define({
  name: "check",
  description: "Verify a statement about the current page, exits 1 if false",

  Args: z.object({
    session: Session,
    statement: words("statement", "Statement to verify"),
    vision: Vision,
  }),

  action: ({ args }) =>
    respond(
      () =>
        new CliSessionClient().run(args.session, "check", {
          statement: args.statement,
          vision: args.vision,
        }),
      isCheckFailure,
    ),
});

const GetCommand = CliCommand.define({
  name: "get",
  description: "Extract data from the current page",

  Args: z.object({
    session: Session,
    data: words("data", "Description of data to extract"),
    vision: Vision,
  }),

  action: ({ args }) =>
    respond(() =>
      new CliSessionClient().run(args.session, "get", {
        data: args.data,
        vision: args.vision,
      }),
    ),
});

const WaitCommand = CliCommand.define({
  name: "wait",
  description: "Wait for seconds (1-30) or until a condition is met",

  Args: z.object({
    session: Session,
    for: words("seconds|condition", "Seconds to wait or condition"),

    timeout: z.coerce
      .number()
      .int()
      .min(1)
      .optional()
      .register(CliCommand.option, {
        name: "timeout",
        syntax: "--timeout <seconds>",
        description: "Max seconds to wait for a condition (default: 10)",
      }),
  }),

  action: ({ args }) =>
    respond(() =>
      new CliSessionClient().run(args.session, "wait", {
        for: parseWaitFor(args.for),
        timeout: args.timeout,
      }),
    ),
});

const FetchAccessibilityTreeCommand = CliCommand.define({
  name: "fetch-accessibility-tree",
  description: "Print the accessibility tree of the current page",

  Args: z.object({ session: Session }),

  action: ({ args }) =>
    respond(() =>
      new CliSessionClient().run(args.session, "fetch_accessibility_tree", {}),
    ),
});

const StopCommand = CliCommand.define({
  name: "stop",
  description: "Stop the session and close the browser or app",

  Args: z.object({
    session: Session,

    saveCache: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "save-cache",
        syntax: "--save-cache",
        description: "Save the Alumnium cache before stopping",
      }),
  }),

  action: ({ args }) =>
    respond(() => new CliSessionClient().stop(args.session, args.saveCache)),
});

const ListCommand = CliCommand.define({
  name: "list",
  description: "List sessions",

  Args: z.object({}),

  action: () =>
    respond(async () => {
      const sessions = await new CliSessionClient().list();
      return JSON.stringify(
        sessions.map(({ name, platform, pid, status }) => ({
          name,
          platform,
          pid,
          status,
        })),
      );
    }),
});

const SUBCOMMANDS = [
  StartCommand,
  DoCommand,
  CheckCommand,
  GetCommand,
  WaitCommand,
  FetchAccessibilityTreeCommand,
  StopCommand,
  ListCommand,
];

/**
 * Top-level `alumnium cli` help entry. The subcommands are parsed by
 * `runCliSession`, because cac only matches single-word commands.
 */
export const CliSessionCommand = {
  name: "cli",

  register(cli: CAC) {
    cli.command(
      "cli <command>",
      "Drive a persistent session from the shell, see `alumnium cli --help`",
    );
  },
};

export async function runCliSession(argv: string[]) {
  const cli = cac("alumnium cli");
  SUBCOMMANDS.forEach((command) => command.register(cli));
  cli.help();
  cli.version(ALUMNIUM_BIN_VERSION);

  cli.addEventListener("command:*", () => {
    const names = SUBCOMMANDS.map((command) => command.name).join(", ");
    console.error(
      `${ansi.red("Error:")} Incorrect '${cli.args[0]}' command, use one of: ${names}\n`,
    );
    process.exit(1);
  });

  if (!argv.length) {
    cli.outputHelp();
    process.exit(1);
    return;
  }

  try {
    cli.parse(["", "", ...argv], { run: false });
    await cli.runMatchedCommand();
  } catch (error) {
    // NOTE: cac throws on missing arguments and unknown options.
    await writeError(error);
    process.exit(1);
  }
}

export function parseWaitFor(value: string): number | string {
  return /^\d+(\.\d+)?$/.test(value) ? Number(value) : value;
}

export function isCheckFailure(text: string): boolean {
  return CheckOutput.safeParse(JSON.parse(text)).data?.result === "failure";
}

/**
 * Free-text positional argument. Words are joined, so an unquoted
 * `do click the login button` is not truncated to `click`.
 */
function words(name: string, description: string) {
  return z
    .array(z.coerce.string())
    .min(1)
    .transform((words) => words.join(" "))
    .register(CliCommand.option, {
      name,
      syntax: `<...${name}>`,
      description,
      positional: true,
    });
}

async function respond(
  request: () => Promise<string>,
  isFailure?: (text: string) => boolean,
) {
  try {
    const text = await request();
    await write(process.stdout, `${text}\n`);
    process.exit(isFailure?.(text) ? 1 : 0);
  } catch (error) {
    await writeError(error);
    process.exit(1);
  }
}

function writeError(error: unknown): Promise<void> {
  const message = error instanceof Error ? error.message : String(error);
  return write(process.stderr, `${ansi.red("Error:")} ${message}\n`);
}

/**
 * Writes and waits for the flush, so `process.exit` can't truncate output
 * written to a pipe.
 */
function write(stream: NodeJS.WriteStream, text: string): Promise<void> {
  return new Promise((resolve) => stream.write(text, () => resolve()));
}
