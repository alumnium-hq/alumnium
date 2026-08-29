import { describe, expect, it } from "vitest";
import { UploadTool } from "./UploadTool.ts";

describe(UploadTool, () => {
  it("removes a planner-added plus from absolute paths", () => {
    const tool = new UploadTool({
      id: 1,
      paths: ["+/tmp/first.txt", "'+/tmp/second.txt'"],
    });

    expect(tool.paths).toEqual(["/tmp/first.txt", "/tmp/second.txt"]);
  });
});
