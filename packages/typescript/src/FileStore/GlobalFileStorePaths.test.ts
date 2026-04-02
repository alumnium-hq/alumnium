import { describe, expect, it } from "vitest";
import { pushTeardown } from "../../tests/unit/mocks.ts";
import { GlobalFileStorePaths } from "./GlobalFileStorePaths.ts";

describe("GlobalFileStorePaths", () => {
  describe("GlobalFileStorePaths.globalSubDir", () => {
    it("returns a subdirectory path under the global store directory", () => {
      const result = GlobalFileStorePaths.globalSubDir("sub/dir");
      expect(result).toBe(".alumnium/sub/dir");
    });

    it("allows to override global store directory via env var", () => {
      process.env.ALUMNIUM_STORE_DIR = ".custom";
      pushTeardown(() => {
        delete process.env.ALUMNIUM_STORE_DIR;
      });
      const result = GlobalFileStorePaths.globalSubDir("sub/dir");
      expect(result).toBe(".custom/sub/dir");
    });
  });

  describe("GlobalFileStorePaths.globalDir", () => {
    it("returns the default global store directory", () => {
      expect(GlobalFileStorePaths.globalDir).toBe(".alumnium");
    });

    it("allows to override global store directory via env var", () => {
      process.env.ALUMNIUM_STORE_DIR = ".custom";
      pushTeardown(() => {
        delete process.env.ALUMNIUM_STORE_DIR;
      });
      expect(GlobalFileStorePaths.globalDir).toBe(".custom");
    });
  });
});
