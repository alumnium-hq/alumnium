import { unlink, writeFile } from "fs/promises";
import { tmpdir } from "os";
import { join } from "path";
import { resolveURL } from "../mocha/helpers.js";
import { expect, test } from "./index.js";

test.describe("File Upload", () => {
  let testFile: string;

  test.beforeEach(async function () {
    const timestamp = Date.now();
    testFile = join(tmpdir(), `test-upload-${timestamp}.txt`);
    await writeFile(testFile, "Test content 1");
  });

  test.afterEach(async function () {
    await unlink(testFile);
  });

  test("should upload to hidden file input", async function ({ page, al }) {
    await page.goto(resolveURL("hidden_file_upload.html"));
    await al.do(`upload '${testFile}' to 'Choose Files' button`);
    await al.do("click 'Upload Files' button");
    const message = await al.get("success message");
    expect(message).toBe("Files Uploaded Successfully!");
  });
});
