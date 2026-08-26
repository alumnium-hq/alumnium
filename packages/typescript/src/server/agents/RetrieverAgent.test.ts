import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { Model } from "../../Model.ts";
import { RetrieverAgent } from "./RetrieverAgent.ts";

describe(RetrieverAgent, () => {
  it("sends screenshots as image file parts", async () => {
    const llm = new MockLanguageModelV4({
      doGenerate: AiSdkFactory.generateResult({
        text: JSON.stringify({ explanation: "Found it", value: "42" }),
      }),
    });
    const agent = new RetrieverAgent(Model.parse("openai/test"), llm);

    await expect(
      agent.invoke({
        statement: "the answer",
        treeXml: "<tree />",
        title: "Example",
        url: "https://example.test",
        screenshot: "iVBORw0KGgo=",
      }),
    ).resolves.toEqual(["Found it", "42"]);

    expect(llm.doGenerateCalls[0]?.prompt).toContainEqual({
      role: "user",
      content: [
        expect.objectContaining({ type: "text" }),
        {
          type: "file",
          mediaType: "image/png",
          data: { type: "data", data: "iVBORw0KGgo=" },
        },
      ],
    });
  });
});
