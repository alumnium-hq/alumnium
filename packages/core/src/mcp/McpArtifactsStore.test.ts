import { always } from "alwaysly";
import { describe, expect, it, mock, spyOn } from "bun:test";
import fs from "node:fs/promises";
import path from "node:path";
import {
  createMockDir,
  pushMock,
  pushTeardown,
  setupBeforeEach,
} from "../../tests/mocks.js";
import { McpArtifactsStore } from "./McpArtifactsStore.js";
import type { McpDriver } from "./mcpDrivers.js";
import { McpState } from "./McpState.js";

describe("McpArtifactsStore", () => {
  describe("path", () => {
    it("resolves path in the global artifacts store directory", () => {
      const store = new McpArtifactsStore("test-driver");
      const resolvedPath = store.resolve("sub/dir/file.txt");
      expect(resolvedPath).toBe(
        `.alumnium/artifacts/test-driver/sub/dir/file.txt`,
      );
    });

    it("allows to override the base dir via environment variable", () => {
      process.env.ALUMNIUM_MCP_ARTIFACTS_DIR = ".custom";
      pushTeardown(() => {
        delete process.env.ALUMNIUM_MCP_ARTIFACTS_DIR;
      });
      const store = new McpArtifactsStore("test-driver");
      const resolvedPath = store.resolve("sub/dir/file.txt");
      expect(resolvedPath).toBe(`.custom/test-driver/sub/dir/file.txt`);
    });
  });

  describe("saveScreenshot", () => {
    const setup = setupBeforeEach(async () => {
      const mockDir = await createMockDir();
      process.env.ALUMNIUM_MCP_ARTIFACTS_DIR = mockDir.path;
      pushTeardown(() => {
        delete process.env.ALUMNIUM_MCP_ARTIFACTS_DIR;
      });
      const driverId = "test-driver";
      const artifactsStore = new McpArtifactsStore(driverId);
      const pixelB64 =
        "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=";
      const mockScreenshot = mock(async () => pixelB64);
      McpState.registerDriver(
        driverId,
        { driver: { screenshot: mockScreenshot } } as any,
        {} as McpDriver,
        artifactsStore,
      );
      pushTeardown(() => {
        McpState.clear();
      });
      const screenshotProps: McpArtifactsStore.SaveScreenshotProps = {
        driverId,
        description:
          "Test screenshot! With special chars & long description that should be truncated",
      };
      return { mockDir, driverId, mockScreenshot, pixelB64, screenshotProps };
    });

    it("resolves path with step number and sanitized description prefix", async () => {
      const { mockDir, screenshotProps } = setup.cur;
      const result = await McpArtifactsStore.saveScreenshot(screenshotProps);
      expect(result).toBe(
        path.resolve(
          mockDir.path,
          "test-driver/screenshots/test-driver/01-test-screenshot-with-special-chars-long-descriptio.png",
        ),
      );
    });

    it("increments step number", async () => {
      const { mockDir, screenshotProps } = setup.cur;
      pushMock(
        spyOn(McpState, "incrementStepNum").mockImplementation(() => 42),
      );
      const result = await McpArtifactsStore.saveScreenshot(screenshotProps);
      expect(McpState.incrementStepNum).toBeCalledTimes(1);
      expect(result).toBe(
        path.resolve(
          mockDir.path,
          "test-driver/screenshots/test-driver/42-test-screenshot-with-special-chars-long-descriptio.png",
        ),
      );
    });

    it("writes screenshot to disk", async () => {
      const { screenshotProps, pixelB64 } = setup.cur;
      const result = await McpArtifactsStore.saveScreenshot(screenshotProps);
      always(result);
      const content = await fs.readFile(result, "base64");
      expect(content).toBe(pixelB64);
    });

    it("resolves null if saving fails", async () => {
      const { screenshotProps, mockScreenshot } = setup.cur;
      mockScreenshot.mockResolvedValue(null as any);
      const result = await McpArtifactsStore.saveScreenshot(screenshotProps);
      expect(result).toBe(null);
    });
  });
});
