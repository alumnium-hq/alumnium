import { nanoid } from "nanoid";
import z from "zod";

export namespace McpScenario {
  export type StepId = z.infer<typeof McpScenario.StepId>;

  export type Step = z.infer<typeof McpScenario.Step>;

  export type ScenarioId = z.infer<typeof McpScenario.ScenarioId>;

  export type Scenario = z.infer<typeof McpScenario.Scenario>;

  export type ScenarioFileSuccess = z.infer<
    typeof McpScenario.ScenarioFileSuccess
  >;

  export type ScenarioFileFailure = z.infer<
    typeof McpScenario.ScenarioFileFailure
  >;

  export type ScenarioFile = z.infer<typeof McpScenario.ScenarioFile>;

  export type Diversion = z.infer<typeof McpScenario.Diversion>;

  export type Mask = z.infer<typeof McpScenario.Mask>;

  export type ToMaskMap = z.infer<typeof McpScenario.ToMaskMap>;

  export type FromMaskMap = z.infer<typeof McpScenario.FromMaskMap>;

  export type RecordingState = z.infer<typeof McpScenario.RecordingState>;

  export type RecordingId = z.infer<typeof McpScenario.RecordingId>;

  export type Recording = z.infer<typeof McpScenario.Recording>;

  export type Execution = z.infer<typeof McpScenario.Execution>;

  export type PlaybackState = z.infer<typeof McpScenario.PlaybackState>;

  export type PlaybackId = z.infer<typeof McpScenario.PlaybackId>;

  export type Playback = z.infer<typeof McpScenario.Playback>;

  export type Run = z.infer<typeof McpScenario.Run>;
}

export abstract class McpScenario {
  static StepId = z.string().brand("StepId");

  static Step = z.object({
    kind: z.literal("step"),
    id: this.StepId,
    toolName: z.string(),
    maskedInput: z.any(),
    maskedOutput: z.any(),
  });

  static ScenarioId = z.string().brand("ScenarioId");

  static Scenario = z.object({
    kind: z.literal("scenario"),
    id: this.ScenarioId,
    text: z.string(),
    steps: z.array(this.Step),
  });

  static ScenarioFileBase = z.object({
    path: z.string(),
  });

  static ScenarioFileSuccess = this.ScenarioFileBase.extend({
    status: z.literal("success"),
    scenario: z.union([this.Scenario, z.null()]),
  });

  static ScenarioFileFailure = this.ScenarioFileBase.extend({
    status: z.literal("failure"),
    error: z.string(),
  });

  static ScenarioFile = z.union([
    this.ScenarioFileSuccess,
    this.ScenarioFileFailure,
  ]);

  static Diversion = z.object({
    kind: z.literal("diversion"),
    stepId: z.union([this.StepId, z.null()]),
  });

  static Mask = z.string().brand("Mask");

  static ToMaskMap = z.record(z.string(), this.Mask);

  static FromMaskMap = z.record(this.Mask, z.string());

  static RecordingState = z.union([
    z.literal("recording"),
    z.literal("paused"),
    z.literal("committed"),
  ]);

  static RecordingId = z.string().brand("RecordingId");

  static Recording = z.object({
    kind: z.literal("recording"),
    recordingId: this.RecordingId,
    scenario: this.Scenario,
    state: this.RecordingState,
    diversion: this.Diversion.exactOptional(),
    toMaskMap: this.ToMaskMap,
  });

  static Execution = z.object({
    kind: z.literal("execution"),
    toolName: z.string(),
    input: z.any(),
    output: z.any(),
  });

  static PlaybackId = z.string().brand("PlaybackId");

  static PlaybackState = z.union([
    z.literal("running"),
    z.literal("canceled"),
    z.literal("completed"),
  ]);

  static Playback = z.object({
    kind: z.literal("playback"),
    playbackId: this.PlaybackId,
    scenario: this.Scenario,
    nextStepId: z.union([this.StepId, z.null()]),
    stepByStep: z.boolean(),
    state: this.PlaybackState,
    fromMaskMap: this.FromMaskMap,
  });

  static Run = z.union([this.Recording, this.Playback]);

  static createScenario(
    text: string,
    scenarioId?: McpScenario.ScenarioId | undefined,
  ): McpScenario.Scenario {
    return {
      kind: "scenario",
      id: scenarioId || nanoid(),
      text,
      steps: [],
    };
  }

  static createRecordingId(): McpScenario.RecordingId {
    return nanoid();
  }

  static createRecording(
    recordingId: McpScenario.RecordingId,
    text: string,
    scenarioId?: McpScenario.ScenarioId | undefined,
  ): McpScenario.Recording {
    return {
      kind: "recording",
      recordingId,
      scenario: this.createScenario(text, scenarioId),
      state: "recording",
      toMaskMap: {},
    };
  }

  static createDivergedRecording(
    recordingId: McpScenario.RecordingId,
    scenario: McpScenario.Scenario,
    stepId: McpScenario.StepId | null,
  ): McpScenario.Recording {
    return {
      kind: "recording",
      recordingId,
      scenario,
      state: "recording",
      toMaskMap: {},
      diversion: {
        kind: "diversion",
        stepId,
      },
    };
  }

  static createPlaybackId(): McpScenario.PlaybackId {
    return nanoid();
  }

  static createPlayback(
    playbackId: McpScenario.PlaybackId,
    scenario: McpScenario.Scenario,
    stepByStep = false,
  ): McpScenario.Playback {
    const nextStepId = scenario.steps[0]?.id ?? null;
    return {
      kind: "playback",
      playbackId,
      scenario: structuredClone(scenario),
      nextStepId,
      stepByStep,
      state: "running",
      fromMaskMap: {},
    };
  }

  static createStep(
    assigns: Pick<
      McpScenario.Step,
      "toolName" | "maskedInput" | "maskedOutput"
    >,
  ): McpScenario.Step {
    return {
      kind: "step",
      id: nanoid(),
      ...assigns,
    };
  }

  static createExecution(
    assigns: Pick<McpScenario.Execution, "toolName" | "input" | "output">,
  ): McpScenario.Execution {
    return {
      kind: "execution",
      ...assigns,
    };
  }
}
