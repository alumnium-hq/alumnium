import { Scenario } from "./Scenario.ts";

export namespace ScenarioRecording {
  export interface Props {
    text: string;
    path: string;
  }
}

export class ScenarioRecording {
  #scenario: Scenario.Type;

  constructor(props: ScenarioRecording.Props) {
    const id = Scenario.textToId(props.text);
    this.#scenario = {
      agent: "claude-code",
      steps: [],
      id,
      ...props,
    };
  }

  get scenario(): Scenario.Type {
    return this.#scenario;
  }

  recordToolUse(toolUse: Scenario.ClaudeCodeStepToolUse) {
    this.#scenario.steps.push({
      kind: "tool-use",
      toolUse: toolUse,
    });
  }
}
