import { readFile } from "node:fs/promises";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import { XcodeAccessibilityTree } from "../accessibility/XcodeAccessibilityTree.ts";
import { ClickTool } from "../tools/ClickTool.ts";
import { DragAndDropTool } from "../tools/DragAndDropTool.ts";
import { DragSliderTool } from "../tools/DragSliderTool.ts";
import { NavigateBackTool } from "../tools/NavigateBackTool.ts";
import { PressKeyTool } from "../tools/PressKeyTool.ts";
import { ScrollTool } from "../tools/ScrollTool.ts";
import { TypeTool } from "../tools/TypeTool.ts";
import { XcodeDriver } from "./XcodeDriver.ts";
import { XcodeSession } from "./XcodeSession.ts";

describe(XcodeDriver, () => {
  let source: string;
  let driver: XcodeDriver;
  let capture: MockInstance<XcodeSession["capture"]>;

  beforeEach(async () => {
    source = await readFile(
      new URL(
        "../accessibility/__fixtures__/xcode-todo-editor.txt",
        import.meta.url,
      ),
      "utf-8",
    );
    const session = new XcodeSession({ appId: "com.ayodeji.TodoList" });
    capture = vi.spyOn(session, "capture").mockImplementation(async () => ({
      tree: new XcodeAccessibilityTree(source),
      screenshotPath: "/tmp/screen.png",
    }));
    driver = new XcodeDriver(session);
  });

  it("advertises the implemented native tools", () => {
    expect(driver.supportedTools).toEqual(
      new Set([
        ClickTool,
        DragAndDropTool,
        DragSliderTool,
        NavigateBackTool,
        PressKeyTool,
        ScrollTool,
        TypeTool,
      ]),
    );
  });

  it("clicks at the fresh hit point and invalidates the cached tree", async () => {
    const previous = await driver.getAccessibilityTree();
    source = source.replace("{196.5, 142.0}", "{220.0, 155.0}");
    await driver.click(7);
    expect(capture).toHaveBeenCalledWith("t 220 155", "com.ayodeji.TodoList");
    expect(await driver.getAccessibilityTree()).not.toBe(previous);
  });

  it("does not tap a disabled element", async () => {
    await expect(driver.click(5)).rejects.toThrow("not hittable");
    expect(capture.mock.calls.every(([command]) => command === undefined)).toBe(
      true,
    );
  });

  it("replaces the value and encodes literal text, whitespace, and command separators", async () => {
    await driver.type(7, " A; t 1 2\\u{000A}\n😀");
    const typed = capture.mock.calls.find(([command]) =>
      command?.startsWith("sender keyboard kbd "),
    )?.[0];
    expect(typed).toBe(
      "sender keyboard kbd " +
        encode("\b".repeat(8) + " A; t 1 2\\u{000A}\n😀"),
    );
  });

  it.each([
    ["Backspace", "\b"],
    ["Enter", "\n"],
    ["Tab", "\t"],
    ["Escape", "\u001b"],
    ["Space", " "],
    ["ArrowUp", "\uf700"],
    ["ArrowDown", "\uf701"],
    ["ArrowLeft", "\uf702"],
    ["ArrowRight", "\uf703"],
  ] as const)("synthesizes %s", async (key, character) => {
    await driver.pressKey(key);
    expect(capture).toHaveBeenCalledWith(
      "sender keyboard kbd " + encode(character),
      undefined,
    );
  });

  it("drags between two targets from the same capture", async () => {
    await driver.dragAndDrop(7, 8);
    expect(capture).toHaveBeenCalledWith(
      "drag 196.5 142 196.5 230",
      "com.ayodeji.TodoList",
    );
  });

  it("moves a slider to a percentage of its frame", async () => {
    await driver.dragSlider(9, 75);
    expect(capture).toHaveBeenCalledWith(
      "drag 196.5 315 286.75 315",
      "com.ayodeji.TodoList",
    );
    await expect(driver.dragSlider(9, 101)).rejects.toThrow(
      "between 0 and 100",
    );
  });

  it("scrolls an offscreen target until it has a hit point", async () => {
    source =
      "Application, label: 'Todo'\n  Window, {{0, 0}, {400, 800}}\n    ScrollView, {{0, 100}, {400, 600}}\n      Button, {{10, 1000}, {80, 40}}, identifier: 'target', label: 'Target'";
    capture.mockImplementation(async (command) => {
      if (command?.includes(" f ")) source += ", hitPoint: {50, 300}";
      return { tree: new XcodeAccessibilityTree(source), screenshotPath: "" };
    });
    await driver.scrollTo(4);
    expect(capture).toHaveBeenCalledWith("t 200 550 f 200 250 0.3", "");
  });

  it("uses the navigation back button and clamps waits", async () => {
    await driver.back();
    expect(capture).toHaveBeenCalledWith("t 51 80", "com.ayodeji.TodoList");
    await driver.wait(90);
    expect(capture).toHaveBeenCalledWith("w 30", undefined);
  });

  it("invalidates the tree even when an interaction fails", async () => {
    const previous = await driver.getAccessibilityTree();
    capture.mockRejectedValueOnce(new Error("capture failed"));
    await expect(driver.pressKey("Enter")).rejects.toThrow("capture failed");
    expect(await driver.getAccessibilityTree()).not.toBe(previous);
  });

  it("uses the iOS back gesture when the button has the previous screen's title", async () => {
    source = source.replace("label: 'Back'", "label: 'Todo List'");
    await driver.back();
    expect(capture).toHaveBeenCalledWith(
      "t 1 426 f 294.75 426 0.3",
      "com.ayodeji.TodoList",
    );
  });

  it("delegates screenshots and session cleanup", async () => {
    const screenshot = vi
      .spyOn(driver.session, "screenshot")
      .mockResolvedValue("base64");
    const close = vi.spyOn(driver.session, "close").mockResolvedValue();
    expect(await driver.screenshot()).toBe("base64");
    await driver.quit();
    expect(screenshot).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(driver.app()).toBe("com-ayodeji-todo-list");
  });
});

function encode(text: string): string {
  return [...text]
    .map((character) => `\\u{${character.codePointAt(0)!.toString(16)}}`)
    .join("");
}
