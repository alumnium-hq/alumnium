import { MockLanguageModelV4 } from "ai/test";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
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

  describe("hints", () => {
    beforeEach(async () => {
      vi.stubEnv("ALUMNIUM_CACHE", "false");
      Env.reset();
      const storeDir = await createMockDir({ prefix: "session-hints" });
      pushMock(
        vi
          .spyOn(GlobalFileStorePaths, "globalSubDir")
          .mockReturnValue(storeDir.path),
      );
    });

    const app = AppId.parse("https://example.com");

    it("provides agents with hints learned in previous sessions", async () => {
      const first = createSession(app);
      await first.session.addHint("get", "total", "use Total row", app);
      await first.session.addHint("check", "cart is empty", "no badge", app);
      await first.session.addHint("find", "login", "button Sign in", app);
      await first.session.addHint("area", "cart", "panel Bag", app);

      const second = createSession(app);
      const { session, llm } = second;

      await session.syncHints("retriever");
      await session.retrieverAgent.invoke({
        statement: "total",
        treeXml: "<tree />",
        title: "",
        url: "",
        screenshot: null,
      });
      const retrieverPrompt = lastPrompt(llm);
      expect(retrieverPrompt).toContain("use Total row");
      expect(retrieverPrompt).toContain("no badge");
      expect(retrieverPrompt).not.toContain("button Sign in");

      await session.syncHints("locator");
      await session.locatorAgent.invoke("login", "<tree />");
      const locatorPrompt = lastPrompt(llm);
      expect(locatorPrompt).toContain("button Sign in");
      expect(locatorPrompt).not.toContain("use Total row");

      await session.syncHints("area");
      await session.areaAgent.invoke("cart", "<tree />");
      const areaPrompt = lastPrompt(llm);
      expect(areaPrompt).toContain("panel Bag");
      expect(areaPrompt).not.toContain("button Sign in");
    });

    it("forgets cleared hints in later sessions", async () => {
      const first = createSession(app);
      await first.session.addHint("find", "login", "button Sign in", app);
      await first.session.clearExamples();

      const { session, llm } = createSession(app);
      await session.syncHints("locator");
      await session.locatorAgent.invoke("login", "<tree />");

      expect(lastPrompt(llm)).not.toContain("button Sign in");
    });
  });
});

interface TestSession {
  session: Session;
  llm: MockLanguageModelV4;
}

function createSession(app?: AppId): TestSession {
  // Satisfies output schemas of all agents.
  const llm = new MockLanguageModelV4({
    doGenerate: AiSdkFactory.generateResult({
      text: JSON.stringify({
        explanation: "Done",
        actions: ["click"],
        value: "42",
        id: 1,
      }),
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

async function plan({ session, llm }: TestSession): Promise<string> {
  await session.syncExamples();
  await session.plannerAgent.invoke("do something", "<tree />");
  return lastPrompt(llm);
}

function lastPrompt(llm: MockLanguageModelV4): string {
  return JSON.stringify(llm.doGenerateCalls.at(-1)?.prompt);
}
