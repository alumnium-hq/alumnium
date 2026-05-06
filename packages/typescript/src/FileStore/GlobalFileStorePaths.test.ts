import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../tests/unit/mocks.ts";
import { Env } from "../Env.ts";
import { GlobalFileStorePaths } from "./GlobalFileStorePaths.ts";

describe("GlobalFileStorePaths", () => {
  describe("GlobalFileStorePaths.globalSubDir", () => {
    it("returns a subdirectory path under the global store directory", () => {
      const result = GlobalFileStorePaths.globalSubDir("sub/dir");
      expect(result).toBe(".alumnium/sub/dir");
    });

    it("allows to override global store directory via env var", () => {
      pushMock(
        vi.spyOn(Env, "ALUMNIUM_STORE_DIR", "get").mockReturnValue(".custom"),
      );
      const result = GlobalFileStorePaths.globalSubDir("sub/dir");
      expect(result).toBe(".custom/sub/dir");
    });
  });

  describe("GlobalFileStorePaths.globalDir", () => {
    it("returns the default global store directory", () => {
      expect(GlobalFileStorePaths.globalDir).toBe(".alumnium");
    });

    it("allows to override global store directory via env var", () => {
      pushMock(
        vi.spyOn(Env, "ALUMNIUM_STORE_DIR", "get").mockReturnValue(".custom"),
      );
      const result = GlobalFileStorePaths.globalDir;
      expect(result).toBe(".custom");
    });
  });
});
