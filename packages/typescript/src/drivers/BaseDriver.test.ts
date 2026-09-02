import { afterEach, describe, expect, it, vi } from "vitest";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import type { AccessibilityElement } from "../accessibility/AccessibilityElement.ts";
import { AppId } from "../AppId.ts";
import { Env } from "../Env.ts";
import { TreeDevDrillStore } from "../tree/dev/TreeDevDrillStore.ts";
import type { ToolClass } from "../tools/BaseTool.ts";
import { BaseDriver } from "./BaseDriver.ts";
import type { Element } from "./index.ts";
import type { Keys } from "./keys.ts";

describe(BaseDriver, () => {
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.restoreAllMocks();
    Env.reset();
  });

  describe("drill probe", () => {
    it("has no drill side effects when disabled", async () => {
      vi.stubEnv("ALUMNIUM_DEV_DRILL_TEST_TREES", "false");
      Env.reset();
      const update = vi
        .spyOn(TreeDevDrillStore.default, "update")
        .mockResolvedValue(undefined);
      const driver = new TestDriver();
      const action = vi.fn(async () => "result");

      await expect(driver.act(action)).resolves.toBe("result");
      expect(driver.fetches).toBe(0);
      expect(driver.probes).toEqual([]);
      expect(update).not.toHaveBeenCalled();
    });

    it("uses a fresh tree and restores the previous cache", async () => {
      vi.stubEnv("ALUMNIUM_DEV_DRILL_TEST_TREES", "true");
      Env.reset();
      vi.spyOn(TreeDevDrillStore.default, "update").mockResolvedValue(
        undefined,
      );
      const driver = new TestDriver();
      const previous = new TestTree("Previous");
      const fresh = new TestTree("Fresh");
      driver.setAccessibilityTree(previous);
      driver.trees.push(fresh);

      await driver.act(async () => 42);

      expect(driver.fetches).toBe(1);
      expect(driver.probes.map((probe) => probe.tree)).toEqual([fresh, fresh]);
      await expect(driver.getAccessibilityTree()).resolves.toBe(previous);
      expect(driver.fetches).toBe(1);
    });

    it("rethrows failed actions without drilling", async () => {
      vi.stubEnv("ALUMNIUM_DEV_DRILL_TEST_TREES", "true");
      Env.reset();
      const update = vi
        .spyOn(TreeDevDrillStore.default, "update")
        .mockResolvedValue(undefined);
      const driver = new TestDriver();
      const error = new Error("action failed");

      await expect(
        driver.act(async () => {
          throw error;
        }),
      ).rejects.toBe(error);
      expect(driver.fetches).toBe(0);
      expect(driver.probes).toEqual([]);
      expect(update).not.toHaveBeenCalled();
    });

    const stateful = BaseDriver.stateful;

    class TestTree extends BaseAccessibilityTree {
      readonly name: string;

      constructor(name: string) {
        super(name);
        this.name = name;
      }

      toStr(): string {
        return `<RootWebArea raw_id="1" backendDOMNodeId="10"><button raw_id="2" backendDOMNodeId="20" name="${this.name}"/></RootWebArea>`;
      }

      elementById(id: number): AccessibilityElement {
        return { backendNodeId: id * 10 };
      }

      scopeToArea(): BaseAccessibilityTree {
        return this;
      }
    }

    class TestDriver extends BaseDriver {
      platform = "chromium" as const;
      supportedTools = new Set<ToolClass>();
      trees: BaseAccessibilityTree[] = [];
      fetches = 0;
      probes: Array<{ tree: BaseAccessibilityTree; rawId: number }> = [];

      protected async fetchAccessibilityTree(): Promise<BaseAccessibilityTree> {
        this.fetches += 1;
        const tree = this.trees.shift();
        if (!tree) throw new Error("No test tree");
        return tree;
      }

      @stateful
      async act(fn: () => Promise<unknown>): Promise<unknown> {
        return fn();
      }

      protected override async devDrillProbeTree(
        tree: BaseAccessibilityTree,
        rawId: number,
      ): Promise<number> {
        this.probes.push({ tree, rawId });
        return rawId * 10;
      }

      click(): Promise<void> {
        throw new Error("Not implemented");
      }
      dragSlider(): void {
        throw new Error("Not implemented");
      }
      dragAndDrop(): Promise<void> {
        throw new Error("Not implemented");
      }
      pressKey(_key: Keys.Key): Promise<void> {
        throw new Error("Not implemented");
      }
      quit(): Promise<void> {
        throw new Error("Not implemented");
      }
      back(): Promise<void> {
        throw new Error("Not implemented");
      }
      screenshot(): Promise<string> {
        throw new Error("Not implemented");
      }
      title(): Promise<string> {
        throw new Error("Not implemented");
      }
      type(): Promise<void> {
        throw new Error("Not implemented");
      }
      url(): Promise<string> {
        throw new Error("Not implemented");
      }
      app(): Promise<AppId> {
        throw new Error("Not implemented");
      }
      findElement(): Promise<Element> {
        throw new Error("Not implemented");
      }
      visit(): Promise<void> {
        throw new Error("Not implemented");
      }
      scrollTo(): Promise<void> {
        throw new Error("Not implemented");
      }
      executeScript(): Promise<void> {
        throw new Error("Not implemented");
      }
      switchToNextTab(): Promise<void> {
        throw new Error("Not implemented");
      }
      switchToPreviousTab(): Promise<void> {
        throw new Error("Not implemented");
      }
      wait(): Promise<void> {
        throw new Error("Not implemented");
      }
      waitForSelector(): Promise<void> {
        throw new Error("Not implemented");
      }
      printToPdf(): Promise<void> {
        throw new Error("Not implemented");
      }
      checkNavigationPolicy(): void {}
    }
  });
});
