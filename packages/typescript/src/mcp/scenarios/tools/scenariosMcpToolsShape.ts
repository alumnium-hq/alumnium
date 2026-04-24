import { txt, txts } from "smollit";
import z from "zod";
import { stringExcerpt } from "../../../utils/string.ts";
import type { McpTool } from "../../tools/McpTool.ts";
import { McpScenario } from "../McpScenario.ts";

//#region Management

// Lists all recorded scenarios.
const list = {
  name: "list_scenarios" as const,

  description: txt`
    Lists all recorded scenarios.

    Invoke it to get a list of all recorded scenarios with their IDs and step
    details. Use it to find scenario IDs for playing, inspecting, or deleting
    scenarios.
  `,

  Input: z.object({}),

  snippets: () => {
    const errorPre = txt`
      Can't list scenarios:
    `;

    return {
      success: txt`
        Scenarios listed successfully.
      `,

      errorStore: txt`
        ${errorPre} can't parse some of the scenarios, or don't have
        permissions to access the scenarios store.
      `,
    };
  },
} satisfies McpTool.Shape;

// Looks up scenario by text.
const lookup = {
  name: "lookup_scenario" as const,

  description: txt`
    Looks up a scenario by its text.

    If found, will respond with the matching scenario ID and details. If not
    found, will respond with an empty result.
  `,

  Input: z.object({
    text: z.string().describe(txt`
      Free-form scenario text to lookup. Use exactly the same text as used for
      the original recording. It gets trimmed before lookup.
    `),
  }),

  snippets: (text: string) => {
    const textExcerpt = stringExcerpt(text, 25);
    return {
      successFound: txt`
        Scenario with text "${textExcerpt}" matched recorded scenario.
      `,

      successNotFound: txt`
        Scenario with text "${textExcerpt}" not found.
      `,
    };
  },
} satisfies McpTool.Shape;

// Gets recorded scenario details.
const get = {
  name: "get_scenario" as const,

  description: txt`
    Gets recorded scenario details.

    Invoke it to get scenario details by ID. Use it to inspect the scenario
    step details.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe(
      "Scenario ID to get details for.",
    ),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't get scenario ${fmt.scenarioId(scenarioId)}:
    `;

    return {
      success: txt`
        Scenario ${fmt.scenarioId(scenarioId)} details retrieved successfully.
      `,

      errorNotFound: txt`
        ${errorPre} scenario not found or don't have permissions to
        access it.
      `,
    };
  },
} satisfies McpTool.Shape;

// Removes scenario by ID.
const remove = {
  name: "delete_scenario" as const,

  description: txt`
    Deletes a recorded scenario.

    Invoke it to delete a scenario by ID. Use it to clean up old or
    unneeded scenarios.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe("Scenario ID to delete."),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't delete scenario ${fmt.scenarioId(scenarioId)} recording:
    `;

    return {
      success: txt`
        Scenario recording ${fmt.scenarioId(scenarioId)} deleted
        successfully.
      `,

      errorStore: txt`
        ${errorPre} scenario not found or don't have permissions to delete it.
      `,
    };
  },
} satisfies McpTool.Shape;

//#endregion

//#region Playback

// Plays recorded scenario steps.
const play = {
  name: "play_scenario" as const,

  description: txt`
    Plays recorded scenario steps.

    If stepByStep is false (default), it will play all the scenario steps in
    one go and respond with the final scenario run result if successful, or
    with the failure details and further instructions if any of the scenario
    steps failed.

    If stepByStep is true, it will respond with the next scenario step
    details and further instructions.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe(
      "Scenario ID to play from lookup.",
    ),

    stepByStep: z
      .boolean()
      .describe(txt`
        Set to true, to confirm each scenario step before playing. Use it when
        you need to adjust scenario recording.
      `)
      .default(false),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't play scenario ${fmt.scenarioId(scenarioId)}:
    `;

    return {
      successAll: txt`
        All scenario ${fmt.scenarioId(scenarioId)} steps played successfully.
      `,

      successStepByStep: txt`
        Step-by-step scenario ${fmt.scenarioId(scenarioId)} play initiated.
      `,

      errorRunningRecording: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

      errorRunningPlayback: (playbackId: McpScenario.PlaybackId) => txt`
        ${errorPre} another scenario playback ${fmt.playbackId(playbackId)}
        is in progress.
      `,

      errorNotFound: txt`
        ${errorPre} scenario not found or don't have permissions to access it.
      `,

      errorNoSteps: txt`
        ${errorPre} scenario has no steps to play.
      `,

      ...sharedStepSnippets(errorPre),
    };
  },
} satisfies McpTool.Shape;

// Plays next running scenario step.
const step = {
  name: "step_scenario" as const,

  description: txt`
    Plays a running scenario recording step.

    If successful, and there's a next step, it will respond with the step
    details and further instructions, or with the final scenario run result
    if it was the last step. If failed, it will respond with the failure
    details and further instructions.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe(
      "Scenario ID to play next step for.",
    ),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't step scenario ${fmt.scenarioId(scenarioId)}:
    `;

    return {
      successNextStep: txt`
        Step  of scenario ${fmt.scenarioId(scenarioId)} played successfully.
      `,

      successCompleted: txt`
        Step  of scenario ${fmt.scenarioId(scenarioId)} played successfully.
      `,

      errorRunningRecording: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

      errorRunningPlaybackId: (playbackId: McpScenario.PlaybackId) => txt`
        ${errorPre} another scenario playback ${fmt.playbackId(playbackId)}
        is in progress.
      `,

      errorNotStepByStep: txt`
        ${errorPre} scenario wasn't played with stepByStep enabled. Only
        stepByStep scenario runs can be stepped.
      `,

      errorNoActivePlayback: txt`
        ${errorPre} no scenario playback is in progress to step.
      `,

      errorNextStepNotFound: (nextStepId: McpScenario.StepId) => txt`
        ${errorPre} next scenario step ${fmt.stepId(nextStepId)} not found.
      `,

      ...sharedStepSnippets(errorPre),
    };
  },
} satisfies McpTool.Shape;

// Diverges the running scenario recording.
const diverge = {
  name: "diverge_scenario" as const,

  description: () => txt`
    Diverges the running scenario recording.

    Invoke it when you want to record different scenario steps instead of
    prompted next step. Use it when you need to adjust the scenario recording.

    It requires a scenario to be played with stepByStep set to true.

    To overwrite the scenario recording, run ${commit.name} after diverging and
    invoking new steps. To discard the changes, run reset_scenario.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe("Scenario ID to diverge from."),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't diverge scenario ${fmt.scenarioId(scenarioId)}:
    `;

    return {
      success: (stepId: McpScenario.StepId | null) => {
        return txts(
          stepId &&
            `
              Scenario ${fmt.scenarioId(scenarioId)} diverged at step
              ${fmt.stepId(stepId)} successfully.

              The step and all the following steps are discarded.
            `,
          !stepId &&
            `
              Scenario ${fmt.scenarioId(scenarioId)} diverged successfully at
              the end of the scenario.
            `,
          `
            The scenario now is in diverged recording state. Any new steps will
            be recorded as the scenario continuation.

            Invoke ${commit.name} to commit the diverged scenario recording
            or ${reset.name} to discard the diverged recording and reset
            the scenario to the original recording.
          `,
        );
      },

      errorRunningRecording: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

      errorRunningId: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} is being
        played.
      `,

      errorNotStepByStep: txt`
        ${errorPre} scenario wasn't played with stepByStep enabled. Only
        stepByStep scenario runs can be diverged.
      `,

      errorNoActivePlayback: txt`
        ${errorPre} no scenario playback is in progress to diverge.
      `,
    };
  },
} satisfies McpTool.Shape;

// Resets the running scenario playback or diverged scenario recording.
const reset = {
  name: "reset_scenario" as const,

  description: txt`
    Resets the running scenario.

    Invoke it to stop a running scenario or to discard the scenario recording.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe("Scenario ID to reset."),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't reset scenario ${fmt.scenarioId(scenarioId)}:
    `;

    return {
      successRecording: txt`
        Scenario ${fmt.scenarioId(scenarioId)} recording reset successfully.
      `,

      successPlayback: txt`
        Scenario ${fmt.scenarioId(scenarioId)} playback reset successfully.
      `,

      errorRunningRecordingId: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

      errorRunningPlaybackId: (
        runningId: McpScenario.ScenarioId,
        playbackId: McpScenario.PlaybackId,
      ) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} playback
        ${fmt.playbackId(playbackId)} is in progress.
      `,

      errorNoActiveRun: txt`
        ${errorPre} no active scenario recording or playback to reset.
      `,
    };
  },
} satisfies McpTool.Shape;

//#endregion

//#region Recording

// Starts scenario recording.
const record = {
  name: "record_scenario" as const,

  description: txt`
    Starts a new scenario steps recording. If scenario with the same text
    already exists, it'll be overwritten.

    Once recording starts, any MCP tool calls will be recorded as scenario
    steps until commit_scenario tool is called.

    It will respond with scenario ID.
  `,

  Input: z.object({
    text: z.string().describe(txt`
      Free-form scenario text to record. It gets trimmed before recording. If a
      scenario with the same text already exists, it'll be overwritten.
    `),
  }),

  snippets: () => {
    const errorPre = txt`
      Can't start scenario recording:
    `;

    return {
      success: (scenarioId: McpScenario.ScenarioId) => txt`
        Scenario ${fmt.scenarioId(scenarioId)} recording started successfully.
      `,

      errorRunningRecording: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

      errorRunningPlayback: (
        scenarioId: McpScenario.ScenarioId,
        playbackId: McpScenario.PlaybackId,
      ) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(scenarioId)} playback ${fmt.playbackId(playbackId)}
        for scenario ${fmt.scenarioId(scenarioId)} is in progress.
        is in progress.
      `,
    };
  },
} satisfies McpTool.Shape;

// Pauses scenario recording.
const pause = {
  name: "pause_scenario" as const,

  description: txt`
    Pauses the scenario recording.

    Invoke it at the end of a successful scenario run if you don't want to
    keep the recording steps but need to interact with Alumnium MCP before
    committing the scenario recording, e.g., to test the driver state.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe("Scenario ID to pause."),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't pause scenario ${fmt.scenarioId(scenarioId)} recording:
    `;

    return {
      success: txt`
        Scenario ${fmt.scenarioId(scenarioId)} recording paused
        successfully.
      `,

      errorRunningRecordingPaused: txt`
        ${errorPre} scenario recording is already paused.
      `,

      ...sharedRecordingSnippets(errorPre),
    };
  },
} satisfies McpTool.Shape;

// Proceeds scenario recording.
const unpause = {
  name: "unpause_scenario" as const,

  description: txt`
    Proceeds the scenario recording.

    Invoke it to proceed a paused scenario recording. Use it when you need to
    do some checks or interactions with Alumnium MCP before proceeding with the
    scenario recording.
  `,

  Input: z.object({
    scenarioId: McpScenario.ScenarioId.describe("Scenario ID to stop."),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't unpause scenario ${fmt.scenarioId(scenarioId)} recording:
    `;

    return {
      success: txt`
        Scenario ${fmt.scenarioId(scenarioId)} recording unpaused
        successfully.
      `,

      errorRunningRecordingUnpaused: txt`
        ${errorPre} scenario recording is already unpaused.
      `,

      ...sharedRecordingSnippets(errorPre),
    };
  },
} satisfies McpTool.Shape;

// Commits the scenario recording.
const commit = {
  name: "commit_scenario" as const,

  description: txt`
    Commits the scenario recording. Invoke it at the end of a successful
    scenario run for a new or diverged scenario.

    Not needed after successfully playing a recorded scenario.
  `,

  Input: z.object({
    scenarioId: z.lazy(() =>
      McpScenario.ScenarioId.describe(
        `Scenario ID to play from ${lookup.name}.`,
      ),
    ),
  }),

  snippets: (scenarioId: McpScenario.ScenarioId) => {
    const errorPre = txt`
      Can't commit scenario ${fmt.scenarioId(scenarioId)} recording:
    `;

    return {
      success: txt`
        Scenario recording ${fmt.scenarioId(scenarioId)} committed
        successfully.
      `,

      errorRunningId: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

      errorRunningPlayback: (playbackId: McpScenario.PlaybackId) => txt`
        ${errorPre} another scenario playback ${fmt.playbackId(playbackId)}
        is in progress.
      `,

      errorNoActiveRun: txt`
        ${errorPre} no active scenario recording or playback to commit.
      `,
    };
  },
} satisfies McpTool.Shape;

//#endregion

//#region Shared snippets

function sharedStepSnippets(errorPre: string) {
  return {
    successStep: (stepId: McpScenario.StepId) => txt`
      Scenario step ${fmt.stepId(stepId)} played successfully.
    `,

    errorCanceled: txt`
      ${errorPre} scenario playback was canceled.
    `,

    errorStepNotFound: (nextStepId: McpScenario.StepId) => txt`
      ${errorPre} scenario step ${fmt.stepId(nextStepId)} not found.
    `,

    errorToolNotFound: (
      toolName: string,
      nextStepId: McpScenario.StepId,
    ) => txt`
      ${errorPre} tool ${toolName} for next scenario step ${fmt.stepId(
        nextStepId,
      )} not found.
    `,
  };
}

function sharedRecordingSnippets(errorPre: string) {
  return {
    errorRunningRecordingId: (runningId: McpScenario.ScenarioId) => txt`
        ${errorPre} another scenario ${fmt.scenarioId(runningId)} recording
        is in progress.
      `,

    errorRunningPlayback: (playbackId: McpScenario.PlaybackId) => txt`
        ${errorPre} another scenario playback ${fmt.playbackId(playbackId)}
        is in progress.
      `,

    errorNoRunningRecording: txt`
        ${errorPre} no active recording found.
      `,
  };
}

export const miscScenariosMcpToolSnippets = {
  scenarioFile: {
    errorRead: txt`
      Can't read scenario file. It may be corrupted or you may not have
      permissions to access it.
    `,

    errorParse: txt`
      Scenario file content doesn't match the expected format.
    `,
  },

  onToolExecuted: (toolName: string) => {
    const ignoredPre = txt`
      Tool ${toolName} execution ignored:
    `;
    const errorPre = txt`
      Error executing tool ${toolName}:
    `;

    return {
      successRecorded: (scenarioId: McpScenario.ScenarioId) => txt`
        Tool ${toolName} execution successfully recorded in scenario ${fmt.scenarioId(scenarioId)}.
      `,

      successIgnored: txt`
        ${ignoredPre} it is a scenario tool.
      `,

      successNotRecording: txt`
        ${ignoredPre} no active scenario recording.
      `,

      errorMasking: (error: string) => txt`
        ${errorPre} ${error}
      `,
    };
  },

  mask: {
    errorNoMaskFound: txt`
      No mask found for driver ID in the scenario recording. Did you start
      the scenario recording after starting a driver?
    `,
  },

  unmask: {
    errorNoMaskFound: txt`
      No mask found for driver ID in the scenario recording. The recording might
      be corrupted or driver failed to start.
    `,
  },
};

//#endregion

export const scenariosMcpToolsShape = {
  list,
  lookup,
  get,
  remove,
  play,
  step,
  diverge,
  reset,
  record,
  pause,
  unpause,
  commit,
} satisfies McpTool.Shapes;

const fmt = {
  scenarioId: (scenarioId: McpScenario.ScenarioId) =>
    `(scenario ID: ${scenarioId})`,

  playbackId: (playbackId: McpScenario.PlaybackId) =>
    `(playback ID: ${playbackId})`,

  stepId: (stepId: McpScenario.StepId) => `(step ID: ${stepId})`,
};
