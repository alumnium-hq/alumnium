import type { TreeDevDrill } from "./TreeDevDrill.ts";

export class TreeDevDrillError extends Error {
  stage: "resolve" | "probe";
  external?: TreeDevDrill.ExternalId | undefined;

  constructor(
    stage: "resolve" | "probe",
    error: unknown,
    external?: TreeDevDrill.ExternalId,
  ) {
    super(error instanceof Error ? error.message : String(error), {
      cause: error,
    });
    this.name = "TreeDevDrillError";
    this.stage = stage;
    this.external = external;
  }
}
