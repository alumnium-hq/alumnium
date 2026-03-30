import { randomUUID } from "node:crypto";
import fs from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("File Upload", () => {
  let testFile1: string;
  let testFile2: string;

  beforeEach(() => {
    testFile1 = path.join(tmpdir(), `${randomUUID()}.txt`);
    testFile2 = path.join(tmpdir(), `${randomUUID()}.txt`);
    return Promise.all([
      fs.writeFile(testFile1, "Test content 1"),
      fs.writeFile(testFile2, "Test content 2"),
    ]);
  });

  afterEach(() =>
    Promise.all([
      fs.rm(testFile1, { force: true }),
      fs.rm(testFile2, { force: true }),
    ]),
  );

  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverType } = result;

      // File upload is not implemented in Appium yet
      if (driverType === "appium")
        skip("File upload is not implemented in Appium yet");

      return result;
    };
  });

  it("should upload a single file", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("https://the-internet.herokuapp.com/upload");
    await al.do(`upload '${testFile1}'`);
    await al.do("click on 'Upload' button");

    const heading = await al.get("heading");
    expect(heading).toBe("File Uploaded!");
  });

  it("should upload multiple files", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("multiple_file_upload.html");
    await al.do(`upload files '${testFile1}', '${testFile2}'`);
    await al.do("click 'Upload Files' button");

    const message = await al.get("success message");
    expect(message).toContain("✓ Upload Successful!");

    const uploadedFiles = await al.get("uploaded files names");
    expect(uploadedFiles).toEqual([
      testFile1.split("/").pop(),
      testFile2.split("/").pop(),
    ]);
  });

  it("should upload a hidden file", async ({ expect, setup, skip }) => {
    const { al, $, driverType } = await setup();

    if (driverType === "selenium")
      skip("Hidden file upload inputs are not supported in Selenium");

    await $.navigate("hidden_file_upload.html");
    await al.do(`upload '${testFile1}' to 'Choose Files' button`);
    await al.do("click 'Upload Files' button");

    const message = await al.get("success message");
    expect(message).toBe("Files Uploaded Successfully!");
  });
});
