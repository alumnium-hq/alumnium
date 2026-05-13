import z from "zod";
import { CliCommand } from "../cli/CliCommand.ts";
import { Logger } from "../telemetry/Logger.ts";
import { pathString } from "../utils/schema.ts";
import { Runner } from "./Runner.ts";

const logger = Logger.get(import.meta.url);

export const TestCommand = CliCommand.define({
  name: "test",
  description: "Test a text scenario",

  Args: z.tuple([
    pathString().register(CliCommand.arg, {
      name: "scenario",
      syntax: "<scenario>",
      description: "Test scenario file to run",
    }),
  ]),

  Options: z.object({}),

  action: async ({ args }) => {
    await Logger.initEnv(logger);

    const [scenarioPath] = args;

    const runner = new Runner(scenarioPath);
    await runner.run();
  },
});
