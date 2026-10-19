import { describe, expect, it, vi } from "vitest";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Model } from "../Model.ts";
import { Tracer } from "../telemetry/Tracer.ts";
import { Alumni } from "./Alumni.ts";

describe("Alumni", () => {
  it("waits for tracing to initialize before starting operations", async () => {
    const driver = {
      platform: "chromium",
      kind: "playwright",
      supportedTools: new Set(),
    } as unknown as BaseDriver;
    const al = new Alumni(driver, { model: Model.parse("openai") });
    const model = await al.model();

    let initialized!: () => void;
    vi.spyOn(Tracer, "init").mockReturnValue(
      new Promise((resolve) => (initialized = resolve)),
    );
    const getModel = vi.spyOn(al.client, "getModel");

    const result = al.model();
    await new Promise((resolve) => setTimeout(resolve));
    expect(getModel).not.toHaveBeenCalled();

    initialized();
    await expect(result).resolves.toEqual(model);
    expect(getModel).toHaveBeenCalledOnce();
  });
});
