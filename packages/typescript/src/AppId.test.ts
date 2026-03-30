import { describe, expect, it } from "vitest";
import { AppId } from "./AppId.js";

describe("AppId", () => {
  it("parses string as AppId", () => {
    expect(AppId.parse("test")).toBe("test" as AppId);
  });

  it("trims the string when parsing", () => {
    expect(AppId.parse("  test  ")).toBe("test" as AppId);
  });

  it("transforms host strings", () => {
    expect(AppId.parse("www.example.com")).toBe("www-example-com" as AppId);
    expect(AppId.parse("example.com:8080")).toBe("example-com-8080" as AppId);
  });

  it("defaults to 'unknown' when parsing nullish values", () => {
    expect(AppId.parse(undefined)).toBe("unknown" as AppId);
    expect(AppId.parse(null)).toBe("unknown" as AppId);
    expect(AppId.parse(0)).toBe("unknown" as AppId);
    expect(AppId.parse(NaN)).toBe("unknown" as AppId);
  });

  it("extracts host from URL strings", () => {
    expect(AppId.parse("https://www.example.com/path")).toBe(
      "www-example-com" as AppId,
    );
    expect(AppId.parse("http://example.com:8080/path")).toBe(
      "example-com-8080" as AppId,
    );
  });
});
