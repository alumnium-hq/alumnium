import { describe, expect, it, vi } from "vitest";
import type { AppId } from "../AppId.ts";
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

  describe("learn", () => {
    const app = "example-com" as AppId;

    function setup() {
      const driver = {
        platform: "chromium",
        kind: "playwright",
        supportedTools: new Set(),
        app: async () => app,
      } as unknown as BaseDriver;
      const al = new Alumni(driver, { model: Model.parse("openai") });
      const addExample = vi
        .spyOn(al.client, "addExample")
        .mockResolvedValue(undefined);
      const addHint = vi
        .spyOn(al.client, "addHint")
        .mockResolvedValue(undefined);
      return { al, addExample, addHint };
    }

    it("teaches do when called directly", async () => {
      const { al, addExample } = setup();

      await al.learn("log in", ["click button 'Login'"]);

      expect(addExample).toHaveBeenCalledWith({
        goal: "log in",
        actions: ["click button 'Login'"],
        app,
      });
    });

    it("teaches do", async () => {
      const { al, addExample } = setup();

      await al.learn.do("log in", ["click button 'Login'"]);

      expect(addExample).toHaveBeenCalledWith({
        goal: "log in",
        actions: ["click button 'Login'"],
        app,
      });
    });

    it.each(["get", "check", "find", "area"] as const)(
      "teaches %s",
      async (kind) => {
        const { al, addHint } = setup();

        await al.learn[kind]("total", "use the 'Total' row");

        expect(addHint).toHaveBeenCalledWith({
          kind,
          instruction: "total",
          hint: "use the 'Total' row",
          app,
        });
      },
    );
  });
});
