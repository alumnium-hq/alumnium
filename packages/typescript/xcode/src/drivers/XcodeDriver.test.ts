import { readFile } from "node:fs/promises";
import {
  beforeEach,
  describe,
  expect,
  it,
  vi,
  type MockInstance,
} from "vitest";
import {
  ClickTool,
  DragAndDropTool,
  DragSliderTool,
  NavigateBackTool,
  PressKeyTool,
  ScrollTool,
  TypeTool,
} from "@alumnium/core";
import { XcodeAccessibilityTree } from "../accessibility/XcodeAccessibilityTree.ts";
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

  it("types into the focused Search field when another field has the same label and context", async () => {
    source =
      "Application bundle identifier: com.ayodeji.TodoList\nApplication, label: 'App'\n  Window\n    ScrollView\n      SearchField, label: 'Search', value: Old, Keyboard Focused, hitPoint: {100, 200}\n      SearchField, label: 'Search', hitPoint: {100, 300}";
    capture.mockImplementation(async (command) => {
      if (command === "t 100 200")
        source = source.replace("value: Old", "value: Existing");
      return { tree: new XcodeAccessibilityTree(source), screenshotPath: "" };
    });
    await driver.type(4, "888 Brannan St");
    expect(capture).toHaveBeenCalledWith("t 100 200", "com.ayodeji.TodoList");
    expect(capture).toHaveBeenCalledWith(
      "sender keyboard kbd " + encode("\b".repeat(8) + "888 Brannan St"),
      undefined,
    );
  });

  it("resolves the newly focused input when tapping creates an identical Search field", async () => {
    source =
      "Application bundle identifier: com.ayodeji.TodoList\nApplication, label: 'App'\n  Window\n    ScrollView\n      SearchField, label: 'Search', hitPoint: {100, 200}";
    capture.mockImplementation(async (command) => {
      if (command === "t 100 200")
        source +=
          ", Keyboard Focused\n      SearchField, label: 'Search', hitPoint: {100, 300}";
      return { tree: new XcodeAccessibilityTree(source), screenshotPath: "" };
    });
    await driver.type(4, "888 Brannan St");
    expect(capture).toHaveBeenCalledWith(
      "sender keyboard kbd " + encode("888 Brannan St"),
      undefined,
    );
  });

  it("keeps ambiguous clicks ambiguous even when one input is focused", async () => {
    source =
      "Application, label: 'App'\n  SearchField, label: 'Search', Keyboard Focused, hitPoint: {100, 200}\n  SearchField, label: 'Search', hitPoint: {100, 300}";
    await expect(driver.click(2)).rejects.toThrow("ambiguous");
    expect(capture.mock.calls.every(([command]) => command === undefined)).toBe(
      true,
    );
  });

  it("does not type into a focused input when a different ambiguous input was selected", async () => {
    source =
      "Application, label: 'App'\n  SearchField, label: 'Search', Keyboard Focused, hitPoint: {100, 200}\n  SearchField, label: 'Search', hitPoint: {100, 300}";
    await expect(driver.type(3, "888 Brannan St")).rejects.toThrow("ambiguous");
    expect(capture.mock.calls.every(([command]) => command === undefined)).toBe(
      true,
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

  it.each([
    ["down", "t 200 550 f 200 250 0.3"],
    ["up", "t 200 250 f 200 550 0.3"],
    ["right", "t 300 400 f 100 400 0.3"],
    ["left", "t 100 400 f 300 400 0.3"],
  ] as const)(
    "scrolls a visible container %s even when the target is absent",
    async (direction, gesture) => {
      source =
        "Application bundle identifier: com.ayodeji.TodoList\nApplication, label: 'Todo'\n  Window, {{0, 0}, {400, 800}}\n    ScrollView, {{0, 100}, {400, 600}}, hitPoint: {200, 400}";
      const previous = await driver.getAccessibilityTree();
      await driver.scroll(3, direction);
      expect(capture).toHaveBeenCalledWith(gesture, "com.ayodeji.TodoList");
      expect(await driver.getAccessibilityTree()).not.toBe(previous);
    },
  );

  it("scrolls the app window without an element ID", async () => {
    await driver.scroll(undefined, "down");
    expect(capture).toHaveBeenCalledWith(
      "t 196.5 639 f 196.5 213 0.3",
      "com.ayodeji.TodoList",
    );
  });

  it("keeps the gesture inside the visible part of a container", async () => {
    source =
      "Application bundle identifier: com.ayodeji.TodoList\nApplication, label: 'Todo'\n  Window, {{0, 0}, {400, 800}}\n    ScrollView, {{0, 100}, {400, 1200}}";
    await driver.scroll(3, "down");
    expect(capture).toHaveBeenCalledWith(
      "t 200 625 f 200 275 0.3",
      "com.ayodeji.TodoList",
    );
  });

  it("rejects containers outside the window without sending a gesture", async () => {
    source =
      "Application bundle identifier: com.ayodeji.TodoList\nApplication, label: 'Todo'\n  Window, {{0, 0}, {400, 800}}\n    ScrollView, {{0, 1000}, {400, 600}}";
    await expect(driver.scroll(3, "down")).rejects.toThrow("no visible area");
    expect(capture.mock.calls.every(([command]) => command === undefined)).toBe(
      true,
    );
  });

  it("does not scroll another application's window when the app is missing", async () => {
    source =
      "Application bundle identifier: com.other\nApplication, label: 'Other'\n  Window, {{0, 0}, {400, 800}}";
    await expect(driver.scroll(undefined, "down")).rejects.toThrow(
      "cannot determine a frame",
    );
    expect(capture.mock.calls.every(([command]) => command === undefined)).toBe(
      true,
    );
  });

  it("uses labels to click the intended control when identifiers are reused", async () => {
    source =
      "Application bundle identifier: com.ayodeji.TodoList\nApplication, label: 'Todo'\n  Button, identifier: 'Search', label: 'Search stays', hitPoint: {100, 200}\n  Button, identifier: 'Search', label: 'Search experiences', hitPoint: {100, 300}";
    await driver.getAccessibilityTree();
    source = source.replace("{100, 200}", "{150, 250}");
    await driver.click(2);
    expect(capture).toHaveBeenCalledWith("t 150 250", "com.ayodeji.TodoList");
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
  // Properly count UTF-16 characters.
  return Array.from(
    text,
    (character) => `\\u{${character.codePointAt(0)!.toString(16)}}`,
  ).join("");
}
