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

  describe("hints", () => {
    it("adds learned hints to instructions in a stable order", async () => {
      const first = setup();
      first.agent.setHints([
        { kind: "get", instruction: "total", hint: "use the 'Total' row" },
        { kind: "check", instruction: "cart is empty", hint: "no badge" },
      ]);

      const second = setup();
      second.agent.setHints([
        { kind: "check", instruction: "cart is empty", hint: "no badge" },
        { kind: "get", instruction: "total", hint: "use the 'Total' row" },
      ]);

      const [firstCall, secondCall] = await Promise.all([
        retrieve(first),
        retrieve(second),
      ]);

      expect(firstCall.instructions).toContain(
        `- When retrieving "total": use the 'Total' row`,
      );
      expect(firstCall.instructions).toContain(
        `- When verifying "cart is empty": no badge`,
      );
      expect(firstCall.instructions).toBe(secondCall.instructions);
      expect(firstCall.meta.examplesHash).toBeDefined();
      expect(firstCall.meta.examplesHash).toBe(secondCall.meta.examplesHash);
    });

    it("leaves instructions intact without hints", async () => {
      const withHints = setup();
      withHints.agent.setHints([
        { kind: "get", instruction: "total", hint: "use the 'Total' row" },
      ]);
      withHints.agent.setHints([]);

      const [clearedCall, pristineCall] = await Promise.all([
        retrieve(withHints),
        retrieve(setup()),
      ]);

      expect(clearedCall.instructions).toBe(pristineCall.instructions);
      expect(clearedCall.meta).not.toHaveProperty("examplesHash");
    });
  });
});

function setup() {
  const llm = new MockLanguageModelV4({
    doGenerate: AiSdkFactory.generateResult({
      text: JSON.stringify({ explanation: "Found it", value: "42" }),
    }),
  });
  const agent = new RetrieverAgent(Model.parse("openai/test"), llm);
  return { agent, llm };
}

async function retrieve({ agent, llm }: ReturnType<typeof setup>) {
  await agent.invoke({
    statement: "total",
    treeXml: "<tree />",
    title: "Example",
    url: "https://example.test",
    screenshot: null,
  });
  const call = llm.doGenerateCalls[0];
  if (!call) throw new Error("Retriever did not call the model");
  const system = call.prompt.find((message) => message.role === "system");
  return {
    instructions: system?.content,
    meta: call.providerOptions?.alumnium?.meta as RetrieverAgent.Meta,
  };
}
