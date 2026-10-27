import { MockLanguageModelV4 } from "ai/test";
import { describe, expect, it } from "vitest";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { Model } from "../../Model.ts";
import { PlannerAgent } from "./PlannerAgent.ts";

describe(PlannerAgent, () => {
  describe("examples", () => {
    it("renders learned examples independently of the order they were added in", async () => {
      const first = setup();
      first.agent.addExample("log in", ["click button 'Login'"]);
      first.agent.addExample("add item", ["click button 'Add'"]);

      const second = setup();
      second.agent.addExample("add item", ["click button 'Add'"]);
      second.agent.addExample("log in", ["click button 'Login'"]);

      const [firstCall, secondCall] = await Promise.all([
        invoke(first),
        invoke(second),
      ]);

      expect(firstCall.prompt).toEqual(secondCall.prompt);
      expect(firstCall.meta.examplesHash).toBeDefined();
      expect(firstCall.meta.examplesHash).toBe(secondCall.meta.examplesHash);
    });

    it("replaces the example when a goal is learned again", async () => {
      const relearned = setup();
      relearned.agent.addExample("log in", ["click button 'Sign in'"]);
      relearned.agent.addExample("log in", ["click button 'Login'"]);

      const learnedOnce = setup();
      learnedOnce.agent.addExample("log in", ["click button 'Login'"]);

      const [relearnedCall, learnedOnceCall] = await Promise.all([
        invoke(relearned),
        invoke(learnedOnce),
      ]);

      expect(JSON.stringify(relearnedCall.prompt)).not.toContain("Sign in");
      expect(relearnedCall.prompt).toEqual(learnedOnceCall.prompt);
      expect(relearnedCall.meta.examplesHash).toBe(
        learnedOnceCall.meta.examplesHash,
      );
    });

    it("changes the examples hash when examples change", async () => {
      const login = setup();
      login.agent.addExample("log in", ["click button 'Login'"]);

      const signIn = setup();
      signIn.agent.addExample("log in", ["click button 'Sign in'"]);

      const [loginCall, signInCall] = await Promise.all([
        invoke(login),
        invoke(signIn),
      ]);

      expect(loginCall.meta.examplesHash).not.toBe(
        signInCall.meta.examplesHash,
      );
    });

    it("omits the examples hash when nothing was learned", async () => {
      const { meta } = await invoke(setup());

      expect(meta).not.toHaveProperty("examplesHash");
    });

    it("omits the examples hash once examples are cleared", async () => {
      const learned = setup();
      learned.agent.addExample("log in", ["click button 'Login'"]);
      learned.agent.clearExamples();

      const [learnedCall, pristineCall] = await Promise.all([
        invoke(learned),
        invoke(setup()),
      ]);

      expect(learnedCall.meta).not.toHaveProperty("examplesHash");
      expect(learnedCall.prompt).toEqual(pristineCall.prompt);
    });
  });
});

function setup() {
  const llm = new MockLanguageModelV4({
    doGenerate: AiSdkFactory.generateResult({
      text: JSON.stringify({
        explanation: "Click login",
        actions: ["click button 'Login'"],
      }),
    }),
  });
  const agent = new PlannerAgent(Model.parse("openai/test"), llm, [
    "ClickTool",
  ]);
  return { agent, llm };
}

async function invoke({ agent, llm }: ReturnType<typeof setup>) {
  await agent.invoke("log in", '<button id="1" name="Login" />');
  const call = llm.doGenerateCalls[0];
  if (!call) throw new Error("Planner did not call the model");
  return {
    prompt: call.prompt,
    meta: call.providerOptions?.alumnium?.meta as PlannerAgent.Meta,
  };
}
