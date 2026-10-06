import { readFile } from "node:fs/promises";
import { describe } from "vitest";
import { sleep } from "../../src/utils/timers.ts";
import { baseIt } from "./helpers.ts";

describe("Waiter script", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverId } = result;

      if (driverId === "appium-ios")
        skip("Synchronization is not implemented in Appium yet");

      return result;
    };
  });

  it("waiting for loading content", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("the-internet/dynamic-content.html");
    const totalImages = await al.get("the total number of profile images");
    expect(totalImages).toBe(3);
  });

  it("waiting for requests and form updates", async ({ setup }) => {
    const { al, $ } = await setup();
    const page = await readFile(
      new URL($.resolveUrl("the-internet/forgot-password.html")),
    );
    const { url } = await $.serve(async (request, response) => {
      if (request.method === "POST" && request.url === "/password-reset") {
        request.resume();
        await sleep(500);
        response.writeHead(200, { "content-type": "text/plain" });
        response.end("Your e-mail's been sent!");
      } else {
        response.writeHead(200, { "content-type": "text/html" });
        response.end(page);
      }
    });
    await $.navigate(url);
    await al.do("type test@example.com in the email field");
    await al.do("click Retrieve password button");
    await al.check("should see Your e-mail's been sent!");
  });
});
