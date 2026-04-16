import { txt } from "smollit";
import z from "zod";

export const scenariosMcpShape = {
  lookup: {
    name: "lookup_scenario",

    description: txt`
      Looks up a scenario by its text. If found, will output found scenario ID.
    `,

    Input: z.object({
      text: z.string().describe(txt`
        Free-form scenario text to lookup. Use exactly the same text as used for
        the original recording. It gets trimmed before lookup.
      `),
    }),
  },

  play: {
    name: "play_scenario",

    description: "Plays recorded scenario steps.",

    Input: z.object({
      id: z.string().describe("Driver ID from start."),

      scenarioId: z.string().describe("Scenario ID to play from lookup."),

      stepByStep: z
        .boolean()
        .describe(txt`
          Set to true, to confirm each scenario step before playing. Use it when
          need to adjust scenario recording.
        `)
        .default(false),
    }),
  },

  record: {
    name: "record_scenario",

    description: txt`
      Starts a new scenario steps recording. If scenario with the same text
      already exists, it'll be overwritten.

      Once recording starts, any MCP tool calls will be recorded as scenario
      steps until scenarioCommit tool is called.
    `,

    Input: z.object({}),
  },

  commit: {
    name: "commit_scenario",

    description: txt`
      Commits the active scenario run. Invoke it at the end of a successful
      scenario run for a new or adjusted scenario. Immediately deactivates
      the active scenario. Not needed after successfully playing a committed
      scenario.
    `,

    Input: z.object({}),
  },
};
