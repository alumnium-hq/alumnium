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

// Persisting knowledge is opt-in, so enable it for the tests of persistence.
beforeEach(() => {
  vi.stubEnv("ALUMNIUM_KNOWLEDGE", "true");
  Env.reset();
});

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
    // Only the learned example carries the actions; the goal is in every plan.
    const learned = actions.join(", ");

    it("provides the planner with examples learned in previous sessions", async () => {
      const first = createSession();
      await first.session.addExample(goal, actions, {
        app: AppId.parse("about:blank"),
      });
      first.session.updateContext({ app });
      await plan(first);

      const second = createSession();
      second.session.updateContext({ app });
      const prompt = await plan(second);

      expect(prompt).toContain(learned);
    });

    it("keeps persisted examples when the session is cleared", async () => {
      const first = createSession(app);
      await first.session.addExample(goal, actions, { app });
      await first.session.clearExamples();

      expect(await plan(first)).toContain(learned);
      expect(await plan(createSession(app))).toContain(learned);
    });

    it("leaves out examples unrelated to the goal", async () => {
      await createSession(app).session.addExample(goal, actions, { app });

      expect(await plan(createSession(app), "open the settings")).not.toContain(
        learned,
      );
    });

    it("forgets cleared layers in later sessions", async () => {
      const first = createSession(app);
      await first.session.addExample(goal, actions, { app });
      await first.session.clearLayer();

      const prompt = await plan(createSession(app));

      expect(prompt).not.toContain(learned);
    });

    it("keeps examples in the session when knowledge is disabled", async () => {
      vi.stubEnv("ALUMNIUM_KNOWLEDGE", "false");
      Env.reset();
      const { storeDir } = setup.cur;

      const first = createSession(app);
      await first.session.addExample(goal, actions, { app });

      expect(await plan(first)).toContain(learned);
      expect(await plan(createSession(app))).not.toContain(learned);
      expect(await storeDir.flatTree()).toEqual([]);
    });
  });

  describe("knowledge scope", () => {
    beforeEach(async () => {
      vi.stubEnv("ALUMNIUM_CACHE", "false");
      Env.reset();
      const storeDir = await createMockDir({ prefix: "session-scope" });
      pushMock(
        vi
          .spyOn(GlobalFileStorePaths, "globalSubDir")
          .mockReturnValue(storeDir.path),
      );
    });

    const blank = AppId.parse("about:blank");
    const other = AppId.parse("https://other.example");
    const goal = "delete Test task";
    const actions = ["hover Test task", "click x button near Test task"];
    // Only the learned example carries the actions; the goal is in every plan.
    const learned = actions.join(", ");

    it("persists examples in the knowledge scope without an app", async () => {
      const first = createSession(blank, { knowledge: "live-chat" });
      await first.session.addExample(goal, actions);

      const prompt = await plan(
        createSession(other, { knowledge: "live-chat" }),
      );
      expect(prompt).toContain(learned);
    });

    it("takes the knowledge scope from ALUMNIUM_KNOWLEDGE_SCOPE", async () => {
      vi.stubEnv("ALUMNIUM_KNOWLEDGE_SCOPE", "live-chat");
      Env.reset();

      await createSession(blank).session.addExample(goal, actions);

      vi.stubEnv("ALUMNIUM_KNOWLEDGE_SCOPE", "");
      Env.reset();
      const prompt = await plan(
        createSession(other, { knowledge: "live-chat" }),
      );
      expect(prompt).toContain(learned);
    });

    it("rejects invalid knowledge scopes", () => {
      expect(() => createSession(blank, { knowledge: "../escape" })).toThrow(
        /Knowledge scope must start with a letter or digit/,
      );
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
      await first.session.addHint("get", "total", "use Total row", { app });
      await first.session.addHint("check", "cart is empty", "no badge", {
        app,
      });
      await first.session.addHint("find", "login", "button Sign in", { app });
      await first.session.addHint("area", "cart", "panel Bag", { app });

      const second = createSession(app);
      const { session, llm } = second;

      await session.syncHints("retriever", "total");
      await session.retrieverAgent.invoke({
        statement: "total",
        treeXml: "<tree />",
        title: "",
        url: "",
        screenshot: null,
      });
      const retrieverPrompt = lastPrompt(llm);
      expect(retrieverPrompt).toContain("use Total row");
      expect(retrieverPrompt).not.toContain("no badge");
      expect(retrieverPrompt).not.toContain("button Sign in");

      const statement = "Is the following true or false - cart is empty";
      await session.syncHints("retriever", statement);
      await session.retrieverAgent.invoke({
        statement,
        treeXml: "<tree />",
        title: "",
        url: "",
        screenshot: null,
      });
      expect(lastPrompt(llm)).toContain("no badge");

      await session.syncHints("locator", "login");
      await session.locatorAgent.invoke("login", "<tree />");
      const locatorPrompt = lastPrompt(llm);
      expect(locatorPrompt).toContain("button Sign in");
      expect(locatorPrompt).not.toContain("use Total row");

      await session.syncHints("area", "cart");
      await session.areaAgent.invoke("cart", "<tree />");
      const areaPrompt = lastPrompt(llm);
      expect(areaPrompt).toContain("panel Bag");
      expect(areaPrompt).not.toContain("button Sign in");
    });

    it("forgets cleared hints in later sessions", async () => {
      const first = createSession(app);
      await first.session.addHint("find", "login", "button Sign in", { app });
      await first.session.clearLayer();

      const { session, llm } = createSession(app);
      await session.syncHints("locator", "login");
      await session.locatorAgent.invoke("login", "<tree />");

      expect(lastPrompt(llm)).not.toContain("button Sign in");
    });
  });
});

interface TestSession {
  session: Session;
  llm: MockLanguageModelV4;
}

function createSession(
  app?: AppId,
  props: Partial<Session.Props> = {},
): TestSession {
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
    ...props,
  });
  return { session, llm };
}

async function plan(
  { session, llm }: TestSession,
  goal = "delete Test task",
): Promise<string> {
  await session.syncExamples(goal);
  await session.plannerAgent.invoke(goal, "<tree />");
  return lastPrompt(llm);
}

function lastPrompt(llm: MockLanguageModelV4): string {
  return JSON.stringify(llm.doGenerateCalls.at(-1)?.prompt);
}
