import { describe, expect, it } from "vitest";
import { formatDuration } from "./timers.ts";

describe("formatDuration", () => {
  it("keeps sub-second precision under a minute", () => {
    expect(formatDuration(0)).toBe("0.0s");
    expect(formatDuration(450)).toBe("0.5s");
    expect(formatDuration(12_340)).toBe("12.3s");
    expect(formatDuration(59_400)).toBe("59.4s");
  });

  it("formats minutes and seconds", () => {
    expect(formatDuration(60_000)).toBe("1m 0s");
    expect(formatDuration(107_000)).toBe("1m 47s");
    expect(formatDuration(643_000)).toBe("10m 43s");
  });

  it("formats hours, minutes and seconds", () => {
    expect(formatDuration(3_600_000)).toBe("1h 0m 0s");
    expect(formatDuration(3_767_000)).toBe("1h 2m 47s");
  });

  it("rolls up to minutes instead of printing 60 seconds", () => {
    expect(formatDuration(59_960)).toBe("1m 0s");
  });

  it("treats negative durations as zero", () => {
    expect(formatDuration(-100)).toBe("0.0s");
  });
});
