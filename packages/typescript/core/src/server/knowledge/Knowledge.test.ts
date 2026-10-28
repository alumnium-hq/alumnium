import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../../alumnium/tests/unit/mocks.ts";
import { AppId } from "../../AppId.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { SessionContext } from "../session/SessionContext.ts";
import { SessionId } from "../session/SessionId.ts";
import { Knowledge } from "./Knowledge.ts";
import { KnowledgeStore } from "./KnowledgeStore.ts";

describe(Knowledge, () => {
  const setup = setupBeforeEach(async () => {
    const storeDir = await createMockDir({ prefix: "knowledge" });
    pushMock(
      vi
        .spyOn(GlobalFileStorePaths, "globalSubDir")
        .mockReturnValue(storeDir.path),
    );
    return { storeDir };
  });

  const app = AppId.parse("https://example.com");
  const blank = AppId.parse("about:blank");

  it("applies persisted lessons to later sessions of the app", async () => {
    const first = session(app);
    await first.knowledge.learn("do", "log in", ["click 'Login'"], app);

    const second = session(app);
    expect(await second.knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
  });

  it("doesn't apply persisted lessons to other apps", async () => {
    await session(app).knowledge.learn("do", "log in", ["click 'Login'"], app);

    const other = session(AppId.parse("other.com"));
    expect(await other.knowledge.lessons("do")).toEqual(new Map());
  });

  it("persists lessons under the session app when the learning app is a placeholder", async () => {
    await session(app).knowledge.learn(
      "do",
      "log in",
      ["click 'Login'"],
      blank,
    );

    expect(await session(app).knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
  });

  it("defers persisting lessons until the app is known", async () => {
    const { storeDir } = setup.cur;
    const first = session(blank);
    await first.knowledge.learn("do", "log in", ["click 'Login'"], blank);

    expect(await first.knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
    expect(await storeDir.flatTree()).toEqual([]);

    first.context.update({ app });
    await first.knowledge.lessons("do");

    expect(await session(app).knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
  });

  it("prefers lessons learned in the session over persisted ones", async () => {
    await session(app).knowledge.learn(
      "do",
      "log in",
      ["click 'Sign in'"],
      app,
    );

    const second = session(app);
    await second.knowledge.lessons("do");
    await second.knowledge.learn("do", "log in", ["click 'Login'"], app);

    expect(await second.knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
    expect(await session(app).knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
  });

  it("keeps lessons loaded for the app and adds the ones it persists", async () => {
    const current = session(app);
    expect(await current.knowledge.lessons("do")).toEqual(new Map());

    await session(app).knowledge.learn("do", "log in", ["click 'Login'"], app);
    await current.knowledge.learn("do", "add item", ["click 'Add'"], app);

    expect(await current.knowledge.lessons("do")).toEqual(
      new Map([["add item", ["click 'Add'"]]]),
    );
  });

  it("clears session and persisted lessons of the session app", async () => {
    const other = AppId.parse("other.com");
    await session(other).knowledge.learn(
      "do",
      "log in",
      ["click 'Login'"],
      other,
    );

    const current = session(app);
    await current.knowledge.learn("do", "log in", ["click 'Login'"], app);
    await current.knowledge.clear();

    expect(await current.knowledge.lessons("do")).toEqual(new Map());
    expect(await session(app).knowledge.lessons("do")).toEqual(new Map());
    expect(await session(other).knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
  });

  it("drops deferred lessons on clear", async () => {
    const { storeDir } = setup.cur;
    const current = session(blank);
    await current.knowledge.learn("do", "log in", ["click 'Login'"], blank);
    await current.knowledge.clear();

    current.context.update({ app });
    expect(await current.knowledge.lessons("do")).toEqual(new Map());
    expect(await storeDir.flatTree()).toEqual([]);
  });

  it("persists hints separately per kind", async () => {
    const first = session(app);
    await first.knowledge.learn("get", "total", "use the 'Total' row", app);
    await first.knowledge.learn("find", "total", "cell 'Total'", app);

    const second = session(app);
    expect(await second.knowledge.lessons("get")).toEqual(
      new Map([["total", "use the 'Total' row"]]),
    );
    expect(await second.knowledge.lessons("find")).toEqual(
      new Map([["total", "cell 'Total'"]]),
    );
    expect(await second.knowledge.lessons("check")).toEqual(new Map());
  });

  it("defers persisting hints until the app is known", async () => {
    const first = session(blank);
    await first.knowledge.learn("check", "cart is empty", "no badge", blank);
    await first.knowledge.learn("do", "log in", ["click 'Login'"], blank);

    first.context.update({ app });
    // Resolving lessons of any kind persists deferred lessons of all kinds.
    await first.knowledge.lessons("do");

    const second = session(app);
    expect(await second.knowledge.lessons("check")).toEqual(
      new Map([["cart is empty", "no badge"]]),
    );
  });

  it("clears lessons of all kinds", async () => {
    const current = session(app);
    await current.knowledge.learn("do", "log in", ["click 'Login'"], app);
    await current.knowledge.learn("area", "cart", "panel 'Bag'", app);
    await current.knowledge.clear();

    const later = session(app);
    expect(await later.knowledge.lessons("do")).toEqual(new Map());
    expect(await later.knowledge.lessons("area")).toEqual(new Map());
  });

  it("keeps lessons in the session only without a store", async () => {
    const { storeDir } = setup.cur;
    const current = session(app, null);
    await current.knowledge.learn("do", "log in", ["click 'Login'"], app);

    expect(await current.knowledge.lessons("do")).toEqual(
      new Map([["log in", ["click 'Login'"]]]),
    );
    expect(await storeDir.flatTree()).toEqual([]);
  });
});

function session(
  app: AppId,
  store: KnowledgeStore | null = new KnowledgeStore(),
) {
  const context = new SessionContext({
    app,
    sessionId: "test-session-id" as SessionId,
  });
  return { context, knowledge: new Knowledge(context, store) };
}
