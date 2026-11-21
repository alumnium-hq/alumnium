import { describe, expect, it, vi } from "vitest";
import type { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import type { Client } from "../clients/Client.ts";
import type { BaseDriver } from "../drivers/BaseDriver.ts";
import { Area } from "./Area.ts";

describe("Area", () => {
  describe("check", () => {
    it("sends a screenshot of the area element with vision", async () => {
      const { area, driver, client, tree } = setup();

      await area.check("has a logo", { vision: true });

      expect(driver.setAccessibilityTree).toHaveBeenCalledWith(tree);
      expect(driver.elementScreenshot).toHaveBeenCalledWith(42);
      expect(driver.screenshot).not.toHaveBeenCalled();
      expect(client.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ screenshot: "area-screenshot" }),
      );
    });

    it("falls back to the full screenshot when the area cannot be captured", async () => {
      const { area, driver, client } = setup();
      driver.elementScreenshot.mockRejectedValue(
        new Error("Cannot take screenshot with 0 width."),
      );

      await area.check("has a logo", { vision: true });

      expect(driver.screenshot).toHaveBeenCalledOnce();
      expect(client.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ screenshot: "full-screenshot" }),
      );
    });

    it("does not take screenshots without vision", async () => {
      const { area, driver, client } = setup();

      await area.check("has a logo");

      expect(driver.elementScreenshot).not.toHaveBeenCalled();
      expect(driver.screenshot).not.toHaveBeenCalled();
      expect(client.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ screenshot: undefined }),
      );
    });
  });

  describe("get", () => {
    it("sends a screenshot of the area element with vision", async () => {
      const { area, driver, client } = setup();

      await area.get("logo text", { vision: true });

      expect(driver.elementScreenshot).toHaveBeenCalledWith(42);
      expect(client.retrieve).toHaveBeenCalledWith(
        expect.objectContaining({ screenshot: "area-screenshot" }),
      );
    });
  });
});

function setup() {
  const tree = {
    toStr: vi.fn().mockResolvedValue("<area />"),
  } as unknown as BaseAccessibilityTree;
  const driver = {
    setAccessibilityTree: vi.fn(),
    elementScreenshot: vi.fn().mockResolvedValue("area-screenshot"),
    screenshot: vi.fn().mockResolvedValue("full-screenshot"),
    title: vi.fn().mockResolvedValue("Title"),
    url: vi.fn().mockResolvedValue("https://example.com"),
    app: vi.fn().mockResolvedValue("example.com"),
  };
  const client = {
    retrieve: vi.fn().mockResolvedValue(["explanation", true]),
  };
  const area = new Area(
    42,
    "header",
    tree,
    driver as unknown as BaseDriver,
    {},
    client as unknown as Client,
  );
  return { area, driver, client, tree };
}
