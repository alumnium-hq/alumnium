import assert from "assert";
import { unlinkSync, writeFileSync } from "fs";
import { tmpdir } from "os";
import { join } from "path";
import "./globals.js";
import { navigate } from "./helpers.js";

const driverType = process.env.ALUMNIUM_DRIVER || "selenium";

describe("File Upload", () => {
  let testFile1: string;
  let testFile2: string;

  beforeEach(function () {
    const timestamp = Date.now();
    testFile1 = join(tmpdir(), `test-upload-${timestamp}-1.txt`);
    testFile2 = join(tmpdir(), `test-upload-${timestamp}-2.txt`);
    writeFileSync(testFile1, "Test content 1");
    writeFileSync(testFile2, "Test content 2");
  });

  afterEach(function () {
    unlinkSync(testFile1);
    unlinkSync(testFile2);
  });

  it("should upload a single file", async function () {
    if (driverType === "appium") {
      this.skip();
    }

    await navigate(driver, "https://the-internet.herokuapp.com/upload");
    await al.do(`upload '${testFile1}'`);
    await al.do("click on 'Upload' button");
    const heading = await al.get("heading");
    assert.strictEqual(heading, "File Uploaded!");
  });

  it("should upload multiple files", async function () {
    if (driverType === "appium") {
      this.skip();
    }

    await navigate(driver, "multiple_file_upload.html");
    await al.do(`upload files '${testFile1}', '${testFile2}'`);
    await al.do("click 'Upload Files' button");
    const message = await al.get("success message");
    assert.strictEqual(message, "✓ Upload Successful!");
    const uploadedFiles = await al.get("uploaded files names");
    assert.deepStrictEqual(uploadedFiles, [
      testFile1.split("/").pop(),
      testFile2.split("/").pop(),
    ]);
  });
});
