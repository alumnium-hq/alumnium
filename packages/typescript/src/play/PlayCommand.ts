import z from "zod";
import { CliCommand } from "../cli/CliCommand.ts";
import { getLogger } from "../utils/logger.ts";

const logger = getLogger(import.meta.url);

export const PlayCommand = CliCommand.define({
  name: "play",
  description: "Plays Alumnium scenario",

  Args: z.tuple([
    z.string().register(CliCommand.arg, {
      name: "path",
      syntax: "[path]",
      description: "Path to the scenario file to play",
    }),
  ]),

  Options: z.object({}),

  action: async ({ args: [path], logFilenameHint }) => {
    logger.info(
      `Playing scenario from ${path} with log hint "${logFilenameHint}"`,
    );
  },
});
