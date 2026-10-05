import { cac, type CAC } from "cac";
import { describe, expect, it, vi } from "vitest";
import z from "zod";
import { CliCommand } from "./CliCommand.ts";

describe("CliCommand", () => {
  it("passes positional arguments by field name", async () => {
    const { cli, action } = setup();
    await parse(cli, ["greet", "Sasha", "--loud"]);
    expect(action.mock.calls[0]?.[0].args).toEqual({
      name: "Sasha",
      loud: true,
    });
  });

  it("keeps numeric-looking values as strings", async () => {
    const { cli, action } = setup();
    await parse(cli, ["greet", "42", "-t", "7"]);
    expect(action.mock.calls[0]?.[0].args).toEqual({
      name: "42",
      loud: false,
      tag: "7",
    });
  });

  it("passes variadic positional arguments", async () => {
    const action = vi.fn(async (_props: { args: unknown }) => {});
    const command = CliCommand.define({
      name: "say",
      description: "Say words",
      Args: z.object({
        words: z
          .array(z.coerce.string())
          .min(1)
          .transform((words) => words.join(" "))
          .register(CliCommand.option, {
            name: "words",
            syntax: "<...words>",
            description: "Words to say",
            positional: true,
          }),
      }),
      action,
    });
    const cli = cac("test");
    command.register(cli);

    await parse(cli, ["say", "click", "the", "login", "button"]);
    expect(action.mock.calls[0]?.[0].args).toEqual({
      words: "click the login button",
    });
  });

  it("supports option-only commands", async () => {
    const action = vi.fn(async (_props: { args: unknown }) => {});
    const command = CliCommand.define({
      name: "plain",
      description: "Plain command",
      Args: z.object({
        loud: z
          .union([z.boolean(), z.stringbool()])
          .default(false)
          .register(CliCommand.option, {
            name: "loud",
            syntax: "--loud",
            description: "Shout",
          }),
      }),
      action,
    });
    const cli = cac("test");
    command.register(cli);

    await parse(cli, ["plain", "--loud"]);
    expect(action.mock.calls[0]?.[0].args).toEqual({ loud: true });
  });
});

function setup() {
  const action = vi.fn(async (_props: { args: unknown }) => {});
  const command = CliCommand.define({
    name: "greet",
    description: "Greet someone",
    Args: z.object({
      name: z.coerce.string().register(CliCommand.option, {
        name: "name",
        syntax: "<name>",
        description: "Who to greet",
        positional: true,
      }),
      loud: z
        .union([z.boolean(), z.stringbool()])
        .default(false)
        .register(CliCommand.option, {
          name: "loud",
          syntax: "--loud",
          description: "Shout",
        }),
      tag: z.coerce.string().optional().register(CliCommand.option, {
        name: "tag",
        syntax: "-t, --tag <tag>",
        description: "Tag",
      }),
    }),
    action,
  });
  const cli = cac("test");
  command.register(cli);
  return { cli, action };
}

async function parse(cli: CAC, argv: string[]) {
  cli.parse(["", "", ...argv], { run: false });
  await cli.runMatchedCommand();
}
