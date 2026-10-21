export class RecordingLeakError extends Error {
  readonly masks: string[];

  constructor(masks: string[]) {
    super(
      `Recording would store values in clear: ${masks.join(", ")}. ` +
        "Check the host variables and response paths configured for it.",
    );
    this.name = "RecordingLeakError";
    this.masks = masks;
  }
}
