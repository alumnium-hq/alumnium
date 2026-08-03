import z from "zod";
import { CliCommand } from "../cli/CliCommand.ts";
import { Logger } from "../telemetry/Logger.ts";
import { pathString } from "../utils/schema.ts";
import { Runner } from "./Runner.ts";
import { SystemProcess } from "../system/SystemProcess.ts";

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

  Options: z.object({
    skipRecovery: z
      .union([z.boolean(), z.stringbool()])
      .default(true)
      .register(CliCommand.option, {
        name: "skip-recovery",
        syntax: "--skip-recovery",
        description: "Skip recovery if scenario playback fails",
      }),

    skipRecording: z
      .union([z.boolean(), z.stringbool()])
      .default(false)
      .register(CliCommand.option, {
        name: "skip-recording",
        syntax: "--skip-recording",
        description: "Skip recording if scenario is not found in the store",
      }),
  }),

  action: async ({ args, options }) => {
    await Logger.initEnv(logger);

    SystemProcess.initCleanup();

    const [scenarioPath] = args;
    const { skipRecovery, skipRecording } = options;

    const runner = new Runner(scenarioPath);
    await runner.run({
      recover: !skipRecovery,
      record: !skipRecording,
    });
  },
});
