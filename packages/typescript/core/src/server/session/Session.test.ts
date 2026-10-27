import { MockLanguageModelV4 } from "ai/test";
import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../../alumnium/tests/unit/mocks.ts";
import { AppId } from "../../AppId.ts";
import { Env } from "../../Env.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { AiSdkFactory } from "../../llm/__factories__/AiSdkFactory.ts";
import { Model } from "../../Model.ts";
import { Session } from "./Session.ts";

afterEach(() => {
  vi.unstubAllEnvs();
  Env.reset();
});

describe(Session, () => {
  describe("examples", () => {
    const setup = setupBeforeEach(async () => {
      vi.stubEnv("ALUMNIUM_CACHE", "false");
      Env.reset();
      const storeDir = await createMockDir({ prefix: "session-knowledge" });
      pushMock(
        vi
          .spyOn(GlobalFileStorePaths, "globalSubDir")
          .mockReturnValue(storeDir.path),
      );
      return { storeDir };
    });

    const app = AppId.parse("https://example.com");
    const goal = "delete Test task";
    const actions = ["hover Test task", "click x button near Test task"];

    it("provides the planner with examples learned in previous sessions", async () => {
      const first = createSession();
      await first.session.addExample(goal, actions, AppId.parse("about:blank"));
      first.session.updateContext({ app });
      await plan(first);

      const second = createSession();
      second.session.updateContext({ app });
      const prompt = await plan(second);

      expect(prompt).toContain(`following goal: ${goal}`);
      expect(prompt).toContain(actions.join(", "));
    });

    it("forgets cleared examples in later sessions", async () => {
      const first = createSession(app);
      await first.session.addExample(goal, actions, app);
      await first.session.clearExamples();

      const prompt = await plan(createSession(app));

      expect(prompt).not.toContain(goal);
    });

    it("keeps examples in the session when knowledge is disabled", async () => {
      vi.stubEnv("ALUMNIUM_KNOWLEDGE", "false");
      Env.reset();
      const { storeDir } = setup.cur;

      const first = createSession(app);
      await first.session.addExample(goal, actions, app);

      expect(await plan(first)).toContain(goal);
      expect(await plan(createSession(app))).not.toContain(goal);
      expect(await storeDir.flatTree()).toEqual([]);
    });
  });
});

interface PlannerSession {
  session: Session;
  llm: MockLanguageModelV4;
}

function createSession(app?: AppId): PlannerSession {
  const llm = new MockLanguageModelV4({
    doGenerate: AiSdkFactory.generateResult({
      text: JSON.stringify({ explanation: "Plan", actions: ["click"] }),
    }),
  });
  const session = new Session({
    app,
    sessionId: Session.createId(),
    model: Model.builder("openai", () => llm)("test"),
    platform: "chromium",
    tools: [],
  });
  return { session, llm };
}

async function plan({ session, llm }: PlannerSession): Promise<string> {
  await session.syncExamples();
  await session.plannerAgent.invoke("do something", "<tree />");
  const call = llm.doGenerateCalls.at(-1);
  return JSON.stringify(call?.prompt);
}
