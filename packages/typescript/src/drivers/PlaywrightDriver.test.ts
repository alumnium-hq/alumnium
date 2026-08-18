import type { Page } from "playwright-core";
import { describe, expect, it, vi } from "vitest";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { TreeDevDrillError } from "../tree/dev/TreeDevDrillError.ts";
import { TestTreeFactory } from "./__factories__/TestTreeFactory.ts";
import { PlaywrightDriver } from "./PlaywrightDriver.ts";

describe("PlaywrightDriver", () => {
  it("waits for CDP initialization before closing the page", async () => {
    const initScript = Promise.withResolvers<void>();
    const frame = {};
    const session = {
      send: vi.fn(async () => ({})),
      on: vi.fn(),
      detach: vi.fn(),
    };
    const close = vi.fn(async () => undefined);
    const page = {
      on: vi.fn(),
      context: () => ({
        addInitScript: vi.fn(() => initScript.promise),
        newCDPSession: vi.fn(async () => session),
      }),
      mainFrame: () => frame,
      frames: () => [frame],
      close,
    };
    const driver = new PlaywrightDriver(page as unknown as Page);

    const quitting = driver.quit();
    await Promise.resolve();
    expect(close).not.toHaveBeenCalled();

    initScript.resolve();
    await quitting;
    expect(close).toHaveBeenCalledOnce();
  });

  it("serializes AX nodes without fetching DOM metadata", async () => {
    const frame = { url: () => "https://example.com" };
    const send = vi.fn(async (command: string) => {
      if (command === "Page.getFrameTree") {
        return {
          frameTree: {
            frame: { id: "main", url: "https://example.com" },
          },
        };
      }
      if (command === "DOM.getFlattenedDocument") {
        return {
          nodes: [{ nodeId: 1, backendNodeId: 42, nodeType: 1 }],
        };
      }
      if (command === "Accessibility.getFullAXTree") {
        return {
          nodes: [
            {
              nodeId: "ax-1",
              backendDOMNodeId: 42,
              role: { value: "button" },
            },
          ],
        };
      }
      return {};
    });
    const session = { send, on: vi.fn(), detach: vi.fn() };
    const page = {
      on: vi.fn(),
      context: () => ({
        addInitScript: vi.fn(),
        newCDPSession: vi.fn(async () => session),
      }),
      mainFrame: () => frame,
      frames: () => [frame],
      evaluate: vi.fn(async () => ({
        lastMutationAt: 0,
        now: performance.now(),
        pendingTimeouts: 0,
        readyState: "complete",
      })),
    };
    const driver = new FetchTestPlaywrightDriver(page as unknown as Page);
    await vi.waitFor(() =>
      expect(send).toHaveBeenCalledWith(
        "Target.setAutoAttach",
        expect.anything(),
      ),
    );

    await expect(driver.fetchTree().then((tree) => tree.toStr())).resolves.toBe(
      '<button raw_id=1 backendDOMNodeId=42 nodeId="f0:ax-1" />',
    );
    expect(send).not.toHaveBeenCalledWith(
      "DOM.getFlattenedDocument",
      expect.anything(),
    );
  });

  describe("drill probe", () => {
    it("runs the exact Playwright set/remove CDP probe", async () => {
      const send = vi.fn(async (command: string) => {
        if (command === "DOM.pushNodesByBackendIdsToFrontend") {
          return { nodeIds: [7] };
        }
        return {};
      });
      const session = { send, on: vi.fn(), detach: vi.fn() };
      const frame = {};
      const context = {
        addInitScript: vi.fn(),
        newCDPSession: vi.fn(async () => session),
      };
      const page = {
        on: vi.fn(),
        context: () => context,
        mainFrame: () => frame,
        frames: () => [frame],
      };
      const driver = new TestPlaywrightDriver(page as unknown as Page);
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          "Target.setAutoAttach",
          expect.anything(),
        ),
      );

      await expect(
        driver.probe(TestTreeFactory.tree({ backendNodeId: 42, frame }), 1),
      ).resolves.toBe(42);
      expect(send).toHaveBeenCalledWith("DOM.setAttributeValue", {
        nodeId: 7,
        name: "data-alumnium-drill",
        value: expect.any(String),
      });
      expect(send).toHaveBeenCalledWith("DOM.removeAttribute", {
        nodeId: 7,
        name: "data-alumnium-drill",
      });
    });

    it("classifies Playwright non-elements as probe failures", async () => {
      const protocolError = new Error(
        "Protocol error (DOM.setAttributeValue): Node is not an Element",
      );
      const send = vi.fn(async (command: string) => {
        if (command === "DOM.pushNodesByBackendIdsToFrontend") {
          return { nodeIds: [7] };
        }
        if (command === "DOM.setAttributeValue") throw protocolError;
        return {};
      });
      const session = { send, on: vi.fn(), detach: vi.fn() };
      const frame = {};
      const page = {
        on: vi.fn(),
        context: () => ({
          addInitScript: vi.fn(),
          newCDPSession: vi.fn(async () => session),
        }),
        mainFrame: () => frame,
        frames: () => [frame],
      };
      const driver = new TestPlaywrightDriver(page as unknown as Page);
      await vi.waitFor(() => expect(send).toHaveBeenCalled());

      const error = await driver
        .probe(TestTreeFactory.tree({ backendNodeId: 42, frame }), 1)
        .catch((value: unknown) => value);
      expect(error).toBeInstanceOf(TreeDevDrillError);
      expect(error).toMatchObject({
        stage: "probe",
        external: 42,
        cause: protocolError,
      });
    });

    it("classifies Playwright push errors as resolution failures", async () => {
      const pushError = new Error("No node with given backend id");
      const send = vi.fn(async (command: string) => {
        if (command === "DOM.pushNodesByBackendIdsToFrontend") throw pushError;
        return {};
      });
      const session = { send, on: vi.fn(), detach: vi.fn() };
      const frame = {};
      const page = {
        on: vi.fn(),
        context: () => ({
          addInitScript: vi.fn(),
          newCDPSession: vi.fn(async () => session),
        }),
        mainFrame: () => frame,
        frames: () => [frame],
      };
      const driver = new TestPlaywrightDriver(page as unknown as Page);
      await vi.waitFor(() => expect(send).toHaveBeenCalled());

      const error = await driver
        .probe(TestTreeFactory.tree({ backendNodeId: 42, frame }), 1)
        .catch((value: unknown) => value);
      expect(error).toMatchObject({
        stage: "resolve",
        external: 42,
        cause: pushError,
      });
    });

    it("detaches Playwright OOPIF sessions after cleanup failures", async () => {
      const cleanupError = new Error("cleanup failed");
      const send = vi.fn(async (command: string) => {
        if (command === "DOM.pushNodesByBackendIdsToFrontend") {
          return { nodeIds: [7] };
        }
        if (command === "DOM.removeAttribute") throw cleanupError;
        return {};
      });
      const detach = vi.fn(async () => undefined);
      const session = { send, on: vi.fn(), detach };
      const mainFrame = {};
      const oopifFrame = {};
      const page = {
        on: vi.fn(),
        context: () => ({
          addInitScript: vi.fn(),
          newCDPSession: vi.fn(async () => session),
        }),
        mainFrame: () => mainFrame,
        frames: () => [mainFrame],
      };
      const driver = new TestPlaywrightDriver(page as unknown as Page);
      await vi.waitFor(() =>
        expect(send).toHaveBeenCalledWith(
          "Target.setAutoAttach",
          expect.anything(),
        ),
      );
      Object.assign(driver, { oopifFrames: new Set([oopifFrame]) });

      await expect(
        driver.probe(
          TestTreeFactory.tree({ backendNodeId: 42, frame: oopifFrame }),
          1,
        ),
      ).rejects.toMatchObject({ stage: "probe", cause: cleanupError });
      expect(detach).toHaveBeenCalledOnce();
    });

    class TestPlaywrightDriver extends PlaywrightDriver {
      probe(tree: BaseAccessibilityTree, rawId: number): Promise<number> {
        return this.devDrillProbeTree(tree, rawId);
      }
    }
  });
});

class FetchTestPlaywrightDriver extends PlaywrightDriver {
  fetchTree(): Promise<BaseAccessibilityTree> {
    return this.fetchAccessibilityTree();
  }
}
