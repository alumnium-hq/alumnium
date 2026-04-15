import type { TypeUtils } from "../../typeUtils.ts";
import {
  getLogger,
  optionalLogDebugExtra,
  type LoggerLike,
} from "../../utils/logger.ts";
import { mcpTools, type McpTools } from "../tools/index.ts";
import { McpTool } from "../tools/McpTool.ts";
import { startMcpTool } from "../tools/startMcpTool.ts";
import { McpScenario } from "./McpScenario.ts";
import { McpScenarioRecordings } from "./McpScenarioRecordings.ts";
import { scenariosMcpTools } from "./tools/index.ts";
import {
  miscScenariosMcpToolSnippets,
  scenariosMcpToolsShape as shape,
} from "./tools/scenariosMcpToolsShape.ts";

const logger = getLogger(import.meta.url);

export namespace McpScenariosState {
  //#region Results

  export interface MethodResultSuccess {
    status: "success";
    message: string;
  }

  export interface MethodResultFailure {
    status: "failure";
    error: string;
  }

  export type MethodResult = MethodResultSuccess | MethodResultFailure;

  export interface InnerMethodResultSuccess {
    status: "success";
  }

  export type InnerMethodResult =
    | InnerMethodResultSuccess
    | MethodResultFailure;

  //#endregion

  //#region Management

  //#region lookupScenario

  export type LookupScenarioResult =
    | LookupScenarioResultSuccess
    | MethodResultFailure;

  export interface LookupScenarioResultSuccess extends MethodResultSuccess {
    scenario: McpScenario.Scenario | null;
  }

  //#endregion

  //#region getScenario

  export type GetScenarioResult =
    | GetScenarioResultSuccess
    | MethodResultFailure;

  export interface GetScenarioResultSuccess extends MethodResultSuccess {
    scenario: McpScenario.Scenario;
  }

  //#endregion

  //#region listScenarios

  export type ListScenariosResult =
    | ListScenariosResultSuccess
    | MethodResultFailure;

  export interface ListScenariosResultSuccess extends MethodResultSuccess {
    scenarioFiles: McpScenario.ScenarioFile[];
  }

  //#endregion

  //#endregion

  //#region Playback

  //#region playScenario

  export type PlayScenarioResult =
    | PlayScenarioResultSuccessAll
    | PlayScenarioResultSuccessStepByStep
    | MethodResultFailure;

  export interface PlayScenarioResultSuccessAll extends MethodResultSuccess {
    executions: McpScenario.Execution[];
  }

  export interface PlayScenarioResultSuccessStepByStep extends MethodResultSuccess {
    playbackId: McpScenario.PlaybackId;
    nextStep: McpScenario.Step | null;
  }

  //#endregion

  //#region stepScenario

  export type StepScenarioResult =
    | StepScenarioResultSuccess
    | MethodResultFailure;

  export interface StepScenarioResultSuccess extends MethodResultSuccess {
    execution: McpScenario.Execution;
    nextStep: McpScenario.Step | null;
  }

  //#endregion

  //#region #playAll

  export interface PlayAllProps {
    snippets: ReturnType<typeof shape.play.snippets>;
    playback: McpScenario.Playback;
  }

  //#endregion

  //#region #playStep

  export interface PlayStepProps {
    stepId: McpScenario.StepId;
    snippets:
      | ReturnType<typeof shape.play.snippets>
      | ReturnType<typeof shape.step.snippets>;
    playback: McpScenario.Playback;
  }

  export type PlayStepResult = MethodResultFailure | PlayStepResultSuccess;

  export interface PlayStepResultSuccess extends MethodResultSuccess {
    execution: McpScenario.Execution;
  }

  //#endregion

  //#endregion

  //#region Recording

  //#region onToolExecuted

  export interface OnToolExecutedProps {
    tool: McpTools.Definition;
    input: any;
    output: any;
  }

  export type OnToolExecutedResult =
    | OnToolExecutedResultSuccess
    | MethodResultFailure;

  export interface OnToolExecutedResultSuccess extends MethodResultSuccess {}

  //#endregion

  //#region startRecording

  export type StartRecordingResult =
    | StartRecordingResultSuccess
    | MethodResultFailure;

  export interface StartRecordingResultSuccess extends MethodResultSuccess {
    scenarioId: McpScenario.ScenarioId;
  }

  //#endregion

  //#endregion

  //#region Masking

  //#region #mask

  export interface MaskProps {
    recording: McpScenario.Recording;
    tool: McpTools.Definition;
    unmaskedInput: any;
    unmaskedOutput: any;
  }

  export type MaskResult = MaskResultSuccess | MethodResultFailure;

  export interface MaskResultSuccess extends InnerMethodResultSuccess {
    maskedInput: any;
    maskedOutput: any;
  }

  //#endregion

  //#region #unmaskInput

  export interface UnmaskInputProps {
    playback: McpScenario.Playback;
    maskedInput: any;
  }

  export type UnmaskInputResult =
    | UnmaskInputResultSuccess
    | MethodResultFailure;

  export interface UnmaskInputResultSuccess extends InnerMethodResultSuccess {
    unmaskedInput: any;
  }

  //#endregion

  //#region #unmaskOutput

  export interface UnmaskOutputProps {
    playback: McpScenario.Playback;
    tool: McpTools.Definition;
    output: any;
    maskedOutput: any;
  }

  export type UnmaskOutputResult =
    | UnmaskOutputResultSuccess
    | MethodResultFailure;

  export interface UnmaskOutputResultSuccess extends InnerMethodResultSuccess {
    unmaskedOutput: any;
  }

  //#endregion

  //#endregion
}

export class McpScenariosState {
  #recordings = new McpScenarioRecordings();
  // NOTE: It widens type to `McpTools.Definition` in a type-safe way.
  #tools: McpTools.Definition[] = scenariosMcpTools;
  #run: McpScenario.Run | null = null;

  constructor() {}

  //#region Management

  /**
   * Lists all recorded scenarios.
   *
   * @returns List result.
   */
  async listScenarios(): Promise<McpScenariosState.ListScenariosResult> {
    const snippets = shape.list.snippets();

    const scenarioFiles = await this.#recordings.list();
    if (!scenarioFiles) return this.#failure(snippets.errorStore);

    return this.#success(snippets.success, { scenarioFiles });
  }

  /**
   * Looks up scenario by text.
   *
   * @param text - Text to lookup.
   * @returns Lookup result.
   */
  async lookupScenario(
    text: string,
  ): Promise<McpScenariosState.LookupScenarioResult> {
    const snippets = shape.lookup.snippets(text);

    const scenario = await this.#recordings.lookup(text);

    if (!scenario)
      return this.#success(snippets.successNotFound, { scenario: null });

    return this.#success(snippets.successFound, { scenario });
  }

  /**
   *
   * @param scenarioId - Scenario ID to get details for.
   * @return Get result.
   */
  async getScenario(
    scenarioId: McpScenario.ScenarioId,
  ): Promise<McpScenariosState.GetScenarioResult> {
    const snippets = shape.get.snippets(scenarioId);

    const scenario = await this.#recordings.get(scenarioId);
    if (!scenario) return this.#failure(snippets.errorNotFound);

    return this.#success(snippets.success, { scenario });
  }

  /**
   * Removes scenario by ID.
   *
   * @param scenarioId - Scenario ID to remove.
   * @returns Removal result.
   */
  async removeScenario(
    scenarioId: McpScenario.ScenarioId,
  ): Promise<McpScenariosState.MethodResult> {
    const snippets = shape.remove.snippets(scenarioId);

    if (await this.#recordings.remove(scenarioId)) {
      return this.#success(snippets.success);
    }

    return this.#failure(snippets.errorStore);
  }

  //#endregion

  //#region Playback

  /**
   * Plays recorded scenario steps.
   *
   * @param scenarioId - Scenario ID to play.
   * @param stepByStep - Whether to play step by step stopping before each step.
   * @returns Playback result.
   */
  async playScenario(
    scenarioId: McpScenario.ScenarioId,
    stepByStep: boolean,
  ): Promise<McpScenariosState.PlayScenarioResult> {
    const snippets = shape.play.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        return this.#failure(
          snippets.errorRunningRecording(this.#run.scenario.id),
        );

      case "playback":
        return this.#failure(
          snippets.errorRunningPlayback(this.#run.playbackId),
        );

      default:
        this.#run satisfies null;
        const scenario = await this.#recordings.get(scenarioId);
        if (!scenario) return this.#failure(snippets.errorNotFound);

        const firstStep = scenario.steps[0];
        if (!firstStep) return this.#failure(snippets.errorNoSteps);

        this.#run = McpScenario.createPlayback(scenario, stepByStep);

        if (stepByStep)
          return this.#success(snippets.successStepByStep, {
            playbackId: this.#run.playbackId,
            nextStep: firstStep,
          });

        const playAllResult = await this.#playAll({
          snippets,
          playback: this.#run,
        });
        if (playAllResult.status === "failure") return playAllResult;

        this.#completePlayback(this.#run);

        return playAllResult;
    }
  }

  /**
   * Plays next running scenario step.
   *
   * @param scenarioId - Scenario ID to play next step for.
   * @returns Step result.
   */
  async stepScenario(
    scenarioId: McpScenario.ScenarioId,
  ): Promise<McpScenariosState.StepScenarioResult> {
    const snippets = shape.step.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        return this.#failure(
          snippets.errorRunningRecording(this.#run.scenario.id),
        );

      case "playback":
        if (this.#run.scenario.id !== scenarioId)
          return this.#failure(
            snippets.errorRunningPlaybackId(this.#run.playbackId),
          );

        if (!this.#run.stepByStep)
          return this.#failure(snippets.errorNotStepByStep);

        const stepResult = await this.#playStep({
          stepId: this.#run.nextStepId!,
          snippets,
          playback: this.#run,
        });

        if (stepResult.status === "failure") return stepResult;

        const { execution } = stepResult;

        const nextStepId = this.#run.nextStepId;
        if (nextStepId) {
          const [nextStep] = this.#findStep(this.#run.scenario, nextStepId);
          if (!nextStep)
            return this.#failure(snippets.errorNextStepNotFound(nextStepId));

          return this.#success(snippets.successNextStep, {
            nextStep,
            execution,
          });
        }

        this.#completePlayback(this.#run);

        return this.#success(snippets.successCompleted, {
          nextStep: null,
          execution,
        });

      default:
        this.#run satisfies null;
        return this.#failure(snippets.errorNoActivePlayback);
    }
  }

  /**
   * Diverges the running scenario recording.
   *
   * @param scenarioId - Scenario ID to diverge.
   * @returns Diverge result.
   */
  async divergeScenario(
    scenarioId: McpScenario.ScenarioId,
  ): Promise<McpScenariosState.MethodResult> {
    const snippets = shape.diverge.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        return this.#failure(
          snippets.errorRunningRecording(this.#run.scenario.id),
        );

      case "playback":
        if (this.#run.scenario.id !== scenarioId)
          return this.#failure(snippets.errorRunningId(this.#run.scenario.id));

        if (!this.#run.stepByStep)
          return this.#failure(snippets.errorNotStepByStep);

        const diveredStepId = this.#run.nextStepId;

        this.#run = McpScenario.createDivergedRecording(
          this.#run.scenario,
          diveredStepId,
        );

        return this.#success(snippets.success(diveredStepId));

      default:
        this.#run satisfies null;
        return this.#failure(snippets.errorNoActivePlayback);
    }
  }

  /**
   * Resets the running scenario playback or diverged scenario recording.
   *
   * @param scenarioId - Scenario ID to reset.
   * @returns Reset result.
   */
  resetScenario(
    scenarioId: McpScenario.ScenarioId,
  ): McpScenariosState.MethodResult {
    const snippets = shape.reset.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        if (this.#run.scenario.id !== scenarioId)
          return this.#failure(
            snippets.errorRunningRecordingId(this.#run.scenario.id),
          );

        this.#run = null;
        return this.#success(snippets.successRecording);

      case "playback":
        if (this.#run.scenario.id !== scenarioId)
          return this.#failure(
            snippets.errorRunningPlaybackId(
              this.#run.scenario.id,
              this.#run.playbackId,
            ),
          );

        this.#run.state = "canceled";
        this.#run = null;

        return this.#success(snippets.successPlayback);

      default:
        this.#run satisfies null;
        return this.#failure(snippets.errorNoActiveRun);
    }
  }

  async #playAll(
    props: McpScenariosState.PlayAllProps,
  ): Promise<McpScenariosState.PlayScenarioResult> {
    const { snippets, playback } = props;

    const executions: McpScenario.Execution[] = [];
    while (playback.nextStepId) {
      const stepResult = await this.#playStep({
        stepId: playback.nextStepId,
        snippets,
        playback,
      });

      if (stepResult.status === "failure") return stepResult;

      const { execution } = stepResult;
      executions.push(execution);
    }

    return this.#success(snippets.successAll, { executions });
  }

  async #playStep(
    props: McpScenariosState.PlayStepProps,
  ): Promise<McpScenariosState.PlayStepResult> {
    const { stepId, snippets, playback } = props;
    const { steps } = playback.scenario;

    if (playback.state === "canceled")
      return this.#failure(snippets.errorCanceled);

    const [step, stepIndex] = this.#findStep(playback.scenario, stepId);
    if (!step) return this.#failure(snippets.errorStepNotFound(stepId));

    const { toolName, maskedInput, maskedOutput } = step;

    const tool = mcpTools.find((tool) => tool.name === toolName);
    if (!tool)
      return this.#failure(snippets.errorToolNotFound(toolName, stepId));

    const unmaskInputResult = this.#unmaskInput({ playback, maskedInput });

    if (unmaskInputResult.status === "failure")
      return this.#failure(unmaskInputResult.error);
    const { unmaskedInput } = unmaskInputResult;

    const output = await tool.execute(unmaskedInput, {
      scenarios: this,
    });

    const unmaskOutputResult = this.#unmaskOutput({
      playback,
      tool,
      maskedOutput,
      output,
    });
    if (unmaskOutputResult.status === "failure")
      return this.#failure(unmaskOutputResult.error);
    const { unmaskedOutput } = unmaskOutputResult;

    // TODO: Check output match

    const execution = McpScenario.createExecution({
      toolName,
      input: unmaskedInput,
      output,
    });

    playback.nextStepId = steps[stepIndex + 1]?.id || null;

    return this.#success(snippets.successStep(stepId), { execution });
  }

  #completePlayback(playback: McpScenario.Playback): void {
    playback.state = "completed";
    this.#run = null;
  }

  #findStep(
    scenario: McpScenario.Scenario,
    stepId: McpScenario.StepId,
  ): [McpScenario.Step | null, number] {
    const { steps } = scenario;
    const stepIndex = steps.findIndex((step) => step.id === stepId);
    return [scenario.steps[stepIndex] || null, stepIndex];
  }

  //#endregion

  //#region Recording

  /**
   * Handles tool execution events.
   *
   * @param props - Hook props.
   */
  async onToolExecuted(
    props: McpScenariosState.OnToolExecutedProps,
  ): Promise<McpScenariosState.OnToolExecutedResult> {
    const { tool, input: unmaskedInput, output: unmaskedOutput } = props;
    const snippets = miscScenariosMcpToolSnippets.onToolExecuted(tool.name);

    // Ignore scenario tool executions.
    if (this.#tools.includes(tool))
      return this.#success(snippets.successIgnored);

    const run = this.#run;
    if (run?.kind !== "recording" || run.state !== "recording")
      return this.#success(snippets.successNotRecording);

    const maskResult = this.#mask({
      recording: run,
      tool,
      unmaskedInput,
      unmaskedOutput,
    });

    if (maskResult.status === "failure") return this.#failure(maskResult.error);

    const { maskedInput, maskedOutput } = maskResult;

    run.scenario.steps.push(
      McpScenario.createStep({
        toolName: tool.name,
        maskedInput,
        maskedOutput,
      }),
    );

    return this.#success(snippets.successRecorded(run.scenario.id));
  }

  /**
   * Starts scenario recording.
   *
   * @param text - Scenario text.
   * @returns Start recording result.
   */
  async startRecording(
    text: string,
  ): Promise<McpScenariosState.StartRecordingResult> {
    const snippets = shape.record.snippets();

    switch (this.#run?.kind) {
      case "recording":
        return this.#failure(
          snippets.errorRunningRecording(this.#run.scenario.id),
        );

      case "playback":
        return this.#failure(
          snippets.errorRunningPlayback(
            this.#run.scenario.id,
            this.#run.playbackId,
          ),
        );

      default:
        this.#run satisfies null;

        const existingScenario = await this.#recordings.lookup(text);
        this.#run = McpScenario.createRecording(text, existingScenario?.id);

        const scenarioId = this.#run.scenario.id;
        return this.#success(snippets.success(scenarioId), {
          scenarioId,
        });
    }
  }

  /**
   * Stops scenario recording.
   *
   * @param scenarioId - The scenario ID to stop recording for.
   * @returns Pause recording result.
   */
  pauseRecording(
    scenarioId: McpScenario.ScenarioId,
  ): McpScenariosState.MethodResult {
    const snippets = shape.pause.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        if (this.#run.scenario.id !== scenarioId) {
          return this.#failure(
            snippets.errorRunningRecordingId(this.#run.scenario.id),
          );
        }

        if (this.#run.state !== "recording") {
          return this.#failure(snippets.errorRunningRecordingPaused);
        }

        this.#run.state = "paused";

        return this.#success(snippets.success);

      case "playback":
        return this.#failure(
          snippets.errorRunningPlayback(this.#run.playbackId),
        );

      default:
        this.#run satisfies null;
        return this.#failure(snippets.errorNoRunningRecording);
    }
  }

  /**
   * Unpauses scenario recording.
   *
   * @param scenarioId - The scenario ID to unpause recording for.
   * @returns Unpause recording result.
   */
  unpauseRecording(
    scenarioId: McpScenario.ScenarioId,
  ): McpScenariosState.MethodResult {
    const snippets = shape.unpause.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        if (this.#run.scenario.id !== scenarioId) {
          return this.#failure(
            snippets.errorRunningRecordingId(this.#run.scenario.id),
          );
        }

        if (this.#run.state !== "paused") {
          return this.#failure(snippets.errorRunningRecordingUnpaused);
        }

        this.#run.state = "recording";

        return this.#success(snippets.success);

      case "playback":
        return this.#failure(
          snippets.errorRunningPlayback(this.#run.playbackId),
        );

      default:
        this.#run satisfies null;
        return this.#failure(snippets.errorNoRunningRecording);
    }
  }

  /**
   * Commits the scenario recording.
   *
   * @param scenarioId - The scenario ID to commit.
   * @returns Commit result.
   */
  async commitScenario(
    scenarioId: McpScenario.ScenarioId,
  ): Promise<McpScenariosState.MethodResult> {
    const snippets = shape.commit.snippets(scenarioId);

    switch (this.#run?.kind) {
      case "recording":
        if (this.#run.scenario.id !== scenarioId)
          return this.#failure(snippets.errorRunningId(this.#run.scenario.id));

        await this.#commitRecording(this.#run);
        this.#run = null;
        return this.#success(snippets.success);

      case "playback":
        return this.#failure(
          snippets.errorRunningPlayback(this.#run.playbackId),
        );

      default:
        this.#run satisfies null;
        return this.#failure(snippets.errorNoActiveRun);
    }
  }

  async #commitRecording(recording: McpScenario.Recording): Promise<void> {
    this.#recordings.commit(recording);
    recording.state = "committed";
    this.#run = null;
  }

  //#endregion

  //#region Results

  async logWrapMethodResult<Type extends McpScenariosState.MethodResult>(
    logger: LoggerLike,
    methodLabel: string,
    method: () => Promise<Type> | Type,
  ): Promise<Type> {
    logger.info(`${methodLabel}...`);

    const result = await method();
    if (result.status === "failure") {
      logger.warn(`${methodLabel} failed: ${result.error}`);
      return result;
    }

    logger.info(`${methodLabel} succeeded: ${result.message}`);
    logger.debug(`${methodLabel} result: {result}`, {
      result: optionalLogDebugExtra("scenarios", result),
    });
    return result;
  }

  #success<
    Result extends McpScenariosState.MethodResultSuccess,
    Extra extends Result extends Result
      ? Omit<Result, keyof McpScenariosState.MethodResultSuccess>
      : never,
  >(
    ...args: TypeUtils.IsNever<keyof Extra> extends true
      ? [message: string]
      : [message: string, extra: Extra]
  ): Result {
    const [message, extra] = args;
    return {
      status: "success",
      message,
      ...extra,
    } as Result;
  }

  #innerSuccess<
    Result extends McpScenariosState.InnerMethodResultSuccess,
    Extra extends Result extends Result
      ? Omit<Result, keyof McpScenariosState.MethodResultSuccess>
      : never,
  >(
    ...args: TypeUtils.IsNever<keyof Extra> extends true ? [] : [extra: Extra]
  ): Result {
    const [extra] = args;
    return {
      status: "success",
      ...extra,
    } as Result;
  }

  #failure(error: string): McpScenariosState.MethodResultFailure {
    return {
      status: "failure",
      error,
    };
  }

  //#endregion

  //#region Masking

  #mask(props: McpScenariosState.MaskProps): McpScenariosState.MaskResult {
    const snippets = miscScenariosMcpToolSnippets.mask;
    const { recording, tool, unmaskedInput, unmaskedOutput } = props;
    const { toMaskMap } = recording;
    const maskedInput = structuredClone(unmaskedInput);
    const maskedOutput = structuredClone(unmaskedOutput);

    // Mask driver ID in input.
    const inputParseResult = McpTool.WithDriverId.safeParse(unmaskedInput);
    if (inputParseResult.success) {
      const { id } = inputParseResult.data;
      const mask = toMaskMap[id];
      if (!mask) return this.#failure(snippets.errorNoMaskFound);
      Object.assign(maskedInput, { id: mask });
    }

    // Mask driver ID in output and populate mask map.
    if (tool.name === startMcpTool.name) {
      const outputParseResult = McpTool.WithDriverId.safeParse(unmaskedOutput);
      if (outputParseResult.success) {
        const { id } = outputParseResult.data;
        const mask = this.#deriveMask(toMaskMap);
        toMaskMap[id] = mask;
        Object.assign(maskedOutput, { id: mask });
      }
      // NOTE: We ignore failed parse, so start tool report its own error.
    }

    return this.#innerSuccess({ maskedInput, maskedOutput });
  }

  #unmaskInput(
    props: McpScenariosState.UnmaskInputProps,
  ): McpScenariosState.UnmaskInputResult {
    const snippets = miscScenariosMcpToolSnippets.unmask;
    const { playback, maskedInput } = props;
    const { fromMaskMap } = playback;
    const unmaskedInput = structuredClone(maskedInput);

    // Unmask driver ID in masked input.
    const maskedInputParseResult = McpTool.WithDriverId.safeParse(maskedInput);
    if (maskedInputParseResult.success) {
      const mask = maskedInputParseResult.data.id as McpScenario.Mask;
      const id = fromMaskMap[mask];
      if (!id) return this.#failure(snippets.errorNoMaskFound);
      Object.assign(unmaskedInput, { id });
    }

    return this.#innerSuccess({ unmaskedInput });
  }

  #unmaskOutput(
    props: McpScenariosState.UnmaskOutputProps,
  ): McpScenariosState.UnmaskOutputResult {
    const snippets = miscScenariosMcpToolSnippets.unmask;
    const { playback, tool, maskedOutput, output } = props;
    const { fromMaskMap } = playback;
    const unmaskedOutput = structuredClone(maskedOutput);

    // Populate mask map with driver ID from output.
    if (tool.name === startMcpTool.name) {
      const outputParseResult = McpTool.WithDriverId.safeParse(output);
      if (outputParseResult.success) {
        const { id } = outputParseResult.data;
        const mask = this.#deriveMask(fromMaskMap);
        fromMaskMap[mask] = id;
      }
    }

    // Unmask driver ID in masked output.
    const maskedOutputParseResult =
      McpTool.WithDriverId.safeParse(maskedOutput);
    if (maskedOutputParseResult.success) {
      const mask = maskedOutputParseResult.data.id as McpScenario.Mask;
      const id = fromMaskMap[mask];
      if (!id) return this.#failure(snippets.errorNoMaskFound);
      Object.assign(unmaskedOutput, { id });
    }

    return this.#innerSuccess({ unmaskedOutput });
  }

  #deriveMask(
    maskMap: McpScenario.ToMaskMap | McpScenario.FromMaskMap,
  ): McpScenario.Mask {
    return `<MASKED_${Object.keys(maskMap).length}>` as McpScenario.Mask;
  }

  //#endregion
}
