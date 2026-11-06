import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { ScrollTool } from "@alumnium/core";
import { MaestroDriver } from "./MaestroDriver.ts";
import { MaestroSession } from "./MaestroSession.ts";

describe(MaestroDriver, () => {
  let driver: MaestroDriver;
  let run: MockInstance<MaestroSession["run"]>;
  let inspect: MockInstance<MaestroSession["inspectScreen"]>;

  beforeEach(() => {
    const session = new MaestroSession({ appId: "com.todo" });
    run = vi.spyOn(session, "run").mockResolvedValue();
    inspect = vi.spyOn(session, "inspectScreen").mockResolvedValue({
      ui_schema: { abbreviations: {}, defaults: {} },
      elements: [
        {
          b: "[0,0][400,800]",
          c: [
            {
              b: "[0,100][400,700]",
              c: [
                {
                  rid: "log.out[0]",
                  a11y: "Log out (now)",
                  b: "[0,1000][400,1050]",
                },
              ],
            },
          ],
        },
      ],
    });
    driver = new MaestroDriver(session);
  });

  it("advertises scroll-to and directional scrolling", () => {
    expect(driver.supportedTools.has(ScrollTool)).toBe(true);
  });

  it.each([
    ["down", "200,550", "200,250"],
    ["up", "200,250", "200,550"],
    ["right", "300,400", "100,400"],
    ["left", "100,400", "300,400"],
  ] as const)(
    "scrolls a container %s and invalidates its tree",
    async (direction, start, end) => {
      const previous = await driver.getAccessibilityTree();
      await driver.scroll(2, direction);
      expect(run).toHaveBeenCalledWith(
        `- swipe:\n    start: "${start}"\n    end: "${end}"`,
      );
      expect(await driver.getAccessibilityTree()).not.toBe(previous);
    },
  );

  it.each([
    ["down", "200,600", "200,200"],
    ["up", "200,200", "200,600"],
    ["right", "300,400", "100,400"],
    ["left", "100,400", "300,400"],
  ] as const)(
    "scrolls the screen %s without requiring an element ID",
    async (direction, start, end) => {
      await driver.scroll(undefined, direction);
      expect(run).toHaveBeenCalledWith(
        `- swipe:\n    start: "${start}"\n    end: "${end}"`,
      );
    },
  );

  it.each([
    [undefined, "201,656", "201,219"],
    [3, "201,711", "201,384"],
  ])(
    "keeps the Profile swipe on screen and above its bottom controls (target %s)",
    async (id, start, end) => {
      inspect.mockResolvedValueOnce({
        ui_schema: { abbreviations: {}, defaults: {} },
        elements: [
          {
            b: "[0,0][402,874]",
            c: [
              {
                b: "[0,0][402,874]",
                c: [
                  { b: "[0,221][402,1091]" },
                  { a11y: "Switch to hosting", b: "[108,717][294,761]" },
                  { a11y: "Tab bar", b: "[0,783][402,874]" },
                ],
              },
            ],
          },
          { b: "[0,0][402,54]" },
        ],
      });

      await driver.scroll(id, "down");

      expect(run).toHaveBeenCalledWith(
        `- swipe:\n    start: "${start}"\n    end: "${end}"`,
      );
    },
  );

  it.each([false, true])(
    "finds the Android app viewport inside a boundless root (status bar first: %s)",
    async (statusBarFirst) => {
      const app = { b: "[0,0][1080,2400]" };
      const statusBar = { b: "[0,0][1080,63]" };
      inspect.mockResolvedValueOnce({
        ui_schema: { platform: "android", abbreviations: {}, defaults: {} },
        elements: [{ c: statusBarFirst ? [statusBar, app] : [app, statusBar] }],
      });

      await driver.scroll(undefined, "down");

      expect(run).toHaveBeenCalledWith(
        '- swipe:\n    start: "540,1800"\n    end: "540,600"',
      );
    },
  );

  it("clips a container to its nested viewport on both axes", async () => {
    inspect.mockResolvedValueOnce({
      ui_schema: { abbreviations: {}, defaults: {} },
      elements: [
        {
          b: "[0,0][400,800]",
          c: [{ b: "[20,150][380,650]", c: [{ b: "[-100,-200][600,1200]" }] }],
        },
      ],
    });

    await driver.scroll(3, "right");

    expect(run).toHaveBeenCalledWith(
      '- swipe:\n    start: "290,400"\n    end: "110,400"',
    );
  });

  it("rejects a fully offscreen container without sending a gesture", async () => {
    await expect(driver.scroll(3, "down")).rejects.toThrow("no visible area");
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects a screen without bounds without sending a gesture", async () => {
    inspect.mockResolvedValueOnce({
      ui_schema: { abbreviations: {}, defaults: {} },
      elements: [{}],
    });

    await expect(driver.scroll(undefined, "down")).rejects.toThrow(
      "cannot determine the screen bounds",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("scrolls to an offscreen target with literal selector text", async () => {
    const previous = await driver.getAccessibilityTree();
    await driver.scrollTo(3);
    expect(run).toHaveBeenCalledWith(
      `- scrollUntilVisible:\n    element:\n      id: ${JSON.stringify("log\\.out\\[0\\]")}\n      text: ${JSON.stringify("Log out \\(now\\)")}\n    timeout: 20000`,
    );
    expect(await driver.getAccessibilityTree()).not.toBe(previous);
  });

  it("rejects an unnamed target and recommends directional scrolling", async () => {
    await expect(driver.scrollTo(2)).rejects.toThrow(
      "use directional scrolling",
    );
    expect(run).not.toHaveBeenCalled();
  });

  it("rejects unknown IDs without sending a gesture", async () => {
    await expect(driver.scroll(1000, "down")).rejects.toThrow("No element");
    expect(run).not.toHaveBeenCalled();
  });

  it("sends integer coordinates for containers with odd dimensions", async () => {
    inspect.mockResolvedValueOnce({
      ui_schema: { abbreviations: {}, defaults: {} },
      elements: [{ b: "[1,101][394,702]" }],
    });
    await driver.scroll(1, "down");
    expect(run).toHaveBeenCalledWith(
      '- swipe:\n    start: "198,552"\n    end: "198,251"',
    );
  });

  it.each(["scroll", "scrollTo"] as const)(
    "invalidates the cached tree when %s fails",
    async (action) => {
      const previous = await driver.getAccessibilityTree();
      run.mockRejectedValueOnce(new Error("gesture failed"));
      await expect(
        action === "scroll" ? driver.scroll(2, "down") : driver.scrollTo(3),
      ).rejects.toThrow("gesture failed");
      expect(await driver.getAccessibilityTree()).not.toBe(previous);
    },
  );
});
