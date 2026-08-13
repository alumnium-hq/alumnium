import { ExecuteJavascriptTool } from "alumnium";
import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Execute JavaScript", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);

      if (result.model.provider === "deepseek")
        skip("DeepSeek does not support vision yet");
      if (result.model.provider === "xai")
        skip("Requires a separate check agent");

      return result;
    };
  });

  it("scrolls the page", async ({ expect, setup }) => {
    const { al, $ } = await setup({
      extraTools: [ExecuteJavascriptTool],
    });
    await $.navigate("https://the-internet.herokuapp.com/large");

    await al.check("'Powered by Elemental Selenium' is not present", {
      vision: true,
      assert: expect.assert,
    });
    await al.do(
      "execute javascript 'window.scrollTo(0, document.body.scrollHeight)'",
    );
    await al.check("'Powered by Elemental Selenium' is present", {
      vision: true,
      assert: expect.assert,
    });
  });
});
