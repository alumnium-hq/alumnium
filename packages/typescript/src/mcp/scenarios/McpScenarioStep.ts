import z from "zod";

export namespace McpScenarioStep {
  export type Type = z.infer<typeof McpScenarioStep.Schema>;
}

export abstract class McpScenarioStep {
  static Schema = z.object({});
}
