import { describe, expect, it } from "bun:test";
import { pushTeardown } from "../../tests/mocks.js";
import { GlobalFileStorePaths } from "./GlobalFileStorePaths.js";

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
