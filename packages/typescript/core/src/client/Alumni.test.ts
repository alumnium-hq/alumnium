import { describe, expect, it, vi } from "vitest";
import type { AppId } from "../AppId.ts";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Model } from "../Model.ts";
import { SessionManager } from "../server/session/SessionManager.ts";
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

  describe("knowledge", () => {
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
      const forgetLesson = vi
        .spyOn(al.client, "forgetLesson")
        .mockResolvedValue(true);
      const clearLayer = vi
        .spyOn(al.client, "clearLayer")
        .mockResolvedValue(undefined);
      return { al, addExample, addHint, forgetLesson, clearLayer };
    }

    it("teaches do", async () => {
      const { al, addExample } = setup();

      await al.knowledge.do("log in", ["click button 'Login'"]);

      expect(addExample).toHaveBeenCalledWith({
        goal: "log in",
        actions: ["click button 'Login'"],
        app,
        layer: "product",
      });
    });

    it.each(["get", "check", "find", "area"] as const)(
      "teaches %s",
      async (kind) => {
        const { al, addHint } = setup();

        await al.knowledge[kind]("total", "use the 'Total' row");

        expect(addHint).toHaveBeenCalledWith({
          kind,
          instruction: "total",
          hint: "use the 'Total' row",
          app,
          layer: "product",
        });
      },
    );
    describe("deprecated learn", () => {
      it("teaches do when called directly", async () => {
        const { al, addExample } = setup();

        await al.learn("log in", ["click button 'Login'"]);

        expect(addExample).toHaveBeenCalledWith({
          goal: "log in",
          actions: ["click button 'Login'"],
          app,
          layer: "product",
        });
      });

      it("teaches like knowledge", async () => {
        const { al, addExample, addHint } = setup();

        await al.learn.do("log in", ["click button 'Login'"]);
        await al.learn.on("android").find("login", "button 'Sign in'");

        expect(addExample).toHaveBeenCalledWith({
          goal: "log in",
          actions: ["click button 'Login'"],
          app,
          layer: "product",
        });
        expect(addHint).toHaveBeenCalledWith({
          kind: "find",
          instruction: "login",
          hint: "button 'Sign in'",
          app,
          layer: "android",
        });
      });
    });
  });

  describe("knowledge layers", () => {
    function setup() {
      const driver = {
        platform: "chromium",
        kind: "playwright",
        supportedTools: new Set(),
        app: async () => "example-com" as AppId,
      } as unknown as BaseDriver;
      const al = new Alumni(driver, { model: Model.parse("openai") });
      const addExample = vi
        .spyOn(al.client, "addExample")
        .mockResolvedValue(undefined);
      const addHint = vi
        .spyOn(al.client, "addHint")
        .mockResolvedValue(undefined);
      const forgetLesson = vi
        .spyOn(al.client, "forgetLesson")
        .mockResolvedValue(true);
      const clearLayer = vi
        .spyOn(al.client, "clearLayer")
        .mockResolvedValue(undefined);
      return { al, addExample, addHint, forgetLesson, clearLayer };
    }

    it("teaches lessons for a platform", async () => {
      const { al, addExample, addHint } = setup();

      await al.knowledge.on("android").do("log in", ["tap 'Login'"]);
      await al.knowledge.on("ios").find("login", "button 'Sign in'");

      expect(addExample).toHaveBeenCalledWith(
        expect.objectContaining({ layer: "android" }),
      );
      expect(addHint).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "find", layer: "ios" }),
      );
    });

    it("teaches shared lessons", async () => {
      const { al, addHint } = setup();

      await al.knowledge.shared().check("banner is gone", "no 'Accept' button");

      expect(addHint).toHaveBeenCalledWith(
        expect.objectContaining({ kind: "check", layer: "shared" }),
      );
    });

    it("forgets lessons in a layer", async () => {
      const { al, forgetLesson } = setup();

      await expect(al.knowledge.forget("do", "log in")).resolves.toBe(true);
      await al.knowledge.on("web").forget("find", "login");

      expect(forgetLesson).toHaveBeenNthCalledWith(1, {
        kind: "do",
        instruction: "log in",
        layer: "product",
      });
      expect(forgetLesson).toHaveBeenNthCalledWith(2, {
        kind: "find",
        instruction: "login",
        layer: "web",
      });
    });

    it("clears a layer", async () => {
      const { al, clearLayer } = setup();

      await al.knowledge.clear();
      await al.knowledge.shared().clear();

      expect(clearLayer).toHaveBeenNthCalledWith(1, { layer: "product" });
      expect(clearLayer).toHaveBeenNthCalledWith(2, { layer: "shared" });
    });
  });

  it("passes the knowledge scope to the session", () => {
    const createSession = vi.spyOn(SessionManager.prototype, "createSession");
    const driver = {
      platform: "chromium",
      kind: "playwright",
      supportedTools: new Set(),
    } as unknown as BaseDriver;

    new Alumni(driver, {
      model: Model.parse("openai"),
      knowledge: "live-chat",
    });

    expect(createSession).toHaveBeenCalledWith(
      expect.objectContaining({ knowledge: "live-chat" }),
    );
    createSession.mockRestore();
  });
});
