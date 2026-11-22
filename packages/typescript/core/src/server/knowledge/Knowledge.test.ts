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
import type { KnowledgeLayer } from "./KnowledgeLayer.ts";
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
  const login = ["click 'Login'"];

  describe("persistence", () => {
    it("applies persisted lessons to later sessions of the app", async () => {
      await session(app).knowledge.learn("do", "log in", login, { app });

      expect(await session(app).knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("doesn't apply persisted lessons to other apps", async () => {
      await session(app).knowledge.learn("do", "log in", login, { app });

      expect(
        await session(AppId.parse("other.com")).knowledge.lessons("do"),
      ).toEqual(new Map());
    });

    it("persists lessons under the session app when the learning app is a placeholder", async () => {
      await session(app).knowledge.learn("do", "log in", login, {
        app: blank,
      });

      expect(await session(app).knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("can't persist lessons before the app is known", async () => {
      const { storeDir } = setup.cur;
      const first = session(blank);

      await expect(
        first.knowledge.learn("check", "cart is empty", "no badge"),
      ).rejects.toThrow(
        /Can't learn check lesson "cart is empty" before the app is known/,
      );
      expect(await first.knowledge.lessons("check")).toEqual(new Map());
      expect(await storeDir.flatTree()).toEqual([]);
    });

    it("doesn't persist lessons learned before the app is known in the next app", async () => {
      const first = session(blank);
      await first.knowledge.learn("do", "log in", login).catch(() => undefined);

      first.context.update({ app: AppId.parse("accounts.google.com") });
      await first.knowledge.lessons("do");

      expect(
        await session(AppId.parse("accounts.google.com")).knowledge.lessons(
          "do",
        ),
      ).toEqual(new Map());
    });

    it("persists lessons for the explicit app before the session is on it", async () => {
      const { storeDir } = setup.cur;
      await session(blank).knowledge.learn("do", "log in", login, { app });

      expect(await storeDir.flatTree()).toEqual(["example-com/lessons.json"]);
      expect(await session(app).knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("prefers the explicit app over the session app", async () => {
      const other = AppId.parse("other.com");
      await session(other).knowledge.learn("do", "log in", login, { app });

      expect(await session(other).knowledge.lessons("do")).toEqual(new Map());
      expect(await session(app).knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("learns lessons before the app is known without a store", async () => {
      const current = session(blank, { store: null });
      await current.knowledge.learn("do", "log in", login);

      expect(await current.knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("prefers lessons learned in the session over persisted ones", async () => {
      await session(app).knowledge.learn("do", "log in", ["click 'Sign in'"]);

      const current = session(app);
      await current.knowledge.lessons("do");
      await current.knowledge.learn("do", "log in", login);

      expect(await current.knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
      expect(await session(app).knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("keeps lessons in the session only without a store", async () => {
      const { storeDir } = setup.cur;
      const current = session(app, { store: null });
      await current.knowledge.learn("do", "log in", login);

      expect(await current.knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
      expect(await storeDir.flatTree()).toEqual([]);
    });
  });

  describe("layers", () => {
    it("prefers platform over product over shared lessons", async () => {
      const teacher = session(app, { platform: "android" });
      await teacher.knowledge.learn("do", "log in", ["shared"], {
        layer: "shared",
      });
      await teacher.knowledge.learn("do", "log in", ["product"]);
      await teacher.knowledge.learn("do", "sign up", ["product"]);
      await teacher.knowledge.learn("do", "log in", ["android"], {
        layer: "android",
      });

      const android = session(app, { platform: "android" });
      expect(await android.knowledge.lessons("do")).toEqual(
        new Map([
          ["log in", ["android"]],
          ["sign up", ["product"]],
        ]),
      );

      const resolved = await android.knowledge.resolve("do");
      expect(resolved.get("log in")).toEqual({
        value: ["android"],
        layer: "android",
        session: false,
      });
    });

    it("applies platform lessons to sessions on that platform only", async () => {
      await session(app, { platform: "ios" }).knowledge.learn(
        "do",
        "log in",
        ["tap 'Login'"],
        { layer: "ios" },
      );

      expect(
        await session(app, { platform: "android" }).knowledge.lessons("do"),
      ).toEqual(new Map());
      expect(
        await session(app, { platform: "ios" }).knowledge.lessons("do"),
      ).toEqual(new Map([["log in", ["tap 'Login'"]]]));
    });

    it("ignores lessons learned in the session for other platforms", async () => {
      const current = session(app, { platform: "web" });
      await current.knowledge.learn("do", "log in", ["tap"], {
        layer: "ios",
      });

      expect(await current.knowledge.lessons("do")).toEqual(new Map());
    });

    it("persists shared lessons without an app and applies them to every app", async () => {
      const { storeDir } = setup.cur;
      const first = session(blank);
      await first.knowledge.learn("check", "banner is gone", "no Accept", {
        layer: "shared",
      });

      expect(await storeDir.flatTree()).toEqual(["shared.json"]);
      for (const other of [blank, app, AppId.parse("other.com")]) {
        expect(await session(other).knowledge.lessons("check")).toEqual(
          new Map([["banner is gone", "no Accept"]]),
        );
      }
    });

    it("persists platform lessons for the explicit app in their layer", async () => {
      const first = session(blank, { platform: "android" });
      await first.knowledge.learn("do", "log in", ["tap"], {
        layer: "android",
        app,
      });

      expect(
        await session(app, { platform: "android" }).knowledge.lessons("do"),
      ).toEqual(new Map([["log in", ["tap"]]]));
      expect(await session(app).knowledge.lessons("do")).toEqual(new Map());
    });
  });

  describe("forget", () => {
    it("forgets a persisted lesson in one layer", async () => {
      const teacher = session(app, { platform: "android" });
      await teacher.knowledge.learn("do", "log in", ["product"]);
      await teacher.knowledge.learn("do", "log in", ["android"], {
        layer: "android",
      });

      const current = session(app, { platform: "android" });
      await current.knowledge.lessons("do");
      expect(
        await current.knowledge.forget("do", "log in", { layer: "android" }),
      ).toBe(true);

      expect(await current.knowledge.lessons("do")).toEqual(
        new Map([["log in", ["product"]]]),
      );
      expect(
        await session(app, { platform: "android" }).knowledge.lessons("do"),
      ).toEqual(new Map([["log in", ["product"]]]));
    });

    it("forgets a lesson of the explicit app", async () => {
      await session(app).knowledge.learn("do", "log in", login);

      expect(
        await session(blank).knowledge.forget("do", "log in", { app }),
      ).toBe(true);
      expect(await session(app).knowledge.lessons("do")).toEqual(new Map());
    });

    it("can't forget a product lesson before the app is known", async () => {
      await expect(
        session(blank).knowledge.forget("do", "log in"),
      ).rejects.toThrow(
        /Can't forget do lesson "log in" before the app is known/,
      );
    });

    it("reports when nothing was forgotten", async () => {
      expect(await session(app).knowledge.forget("do", "log in")).toBe(false);
    });
  });

  describe("clear", () => {
    it("clears the session without touching persisted lessons", async () => {
      const current = session(app);
      await current.knowledge.learn("do", "log in", login);
      current.knowledge.clearSession();

      expect(await session(app).knowledge.lessons("do")).toEqual(
        new Map([["log in", login]]),
      );
    });

    it("clears one persisted layer", async () => {
      const teacher = session(app, { platform: "web" });
      await teacher.knowledge.learn("do", "log in", ["product"]);
      await teacher.knowledge.learn("do", "sign up", ["web"], {
        layer: "web",
      });
      await teacher.knowledge.clearLayer({ layer: "product" });

      expect(
        await session(app, { platform: "web" }).knowledge.lessons("do"),
      ).toEqual(new Map([["sign up", ["web"]]]));
    });

    it("can't clear a product layer before the app is known", async () => {
      await expect(session(blank).knowledge.clearLayer()).rejects.toThrow(
        "Can't clear the product layer before the app is known",
      );
    });

    it("clears a layer of the explicit app", async () => {
      await session(app).knowledge.learn("do", "log in", login);
      await session(blank).knowledge.clearLayer({ app });

      expect(await session(app).knowledge.lessons("do")).toEqual(new Map());
    });
  });

  describe("unread", () => {
    it("reports scopes lessons were persisted in but never resolved from", async () => {
      const current = session(blank);
      await current.knowledge.learn("do", "log in", login, { app });

      current.context.update({ app: AppId.parse("staging.example.com") });
      await current.knowledge.lessons("do");

      expect(current.knowledge.unread()).toEqual(["example-com"]);
      expect(current.knowledge.read()).toEqual(["staging-example-com"]);
    });

    it("doesn't report scopes the session resolved from", async () => {
      const current = session(blank);
      await current.knowledge.learn("do", "log in", login, { app });

      current.context.update({ app: AppId.parse("accounts.google.com") });
      await current.knowledge.lessons("do");
      current.context.update({ app });
      await current.knowledge.lessons("do");

      expect(current.knowledge.unread()).toEqual([]);
    });

    it("doesn't report scopes of sessions that never resolved lessons", async () => {
      const current = session(blank);
      await current.knowledge.learn("do", "log in", login, { app });

      expect(current.knowledge.unread()).toEqual([]);
    });
  });

  describe("scope", () => {
    const web = AppId.parse("https://shop-static.example.org/chat");
    const local = AppId.parse("http://localhost:3000");
    const android = AppId.parse("com.example.chat");

    async function writeManifest() {
      await new KnowledgeStore().writeJson("knowledge.json", {
        products: {
          shop: {
            apps: ["*.example.org", "localhost:*", "com.example.chat"],
          },
        },
      });
    }

    it("persists lessons in the explicit scope without an app", async () => {
      const { storeDir } = setup.cur;
      const first = session(blank, { scope: "shop" });
      await first.knowledge.learn("do", "log in", login);

      expect(await storeDir.flatTree()).toEqual(["shop/lessons.json"]);
      expect(
        await session(app, { scope: "shop" }).knowledge.lessons("do"),
      ).toEqual(new Map([["log in", login]]));
    });

    it("shares lessons across apps the manifest maps to a product", async () => {
      await writeManifest();
      await session(web).knowledge.learn("do", "log in", login);

      for (const other of [local, android]) {
        expect(await session(other).knowledge.lessons("do")).toEqual(
          new Map([["log in", login]]),
        );
      }
    });

    it("keeps lessons of apps no product claims in the app scope", async () => {
      const { storeDir } = setup.cur;
      await writeManifest();
      await session(app).knowledge.learn("do", "log in", login);

      expect(await session(web).knowledge.lessons("do")).toEqual(new Map());
      expect(await storeDir.flatTree()).toContain("example-com/lessons.json");
    });

    it("prefers the explicit scope over the manifest", async () => {
      await writeManifest();
      await session(web, { scope: "support" }).knowledge.learn(
        "do",
        "log in",
        login,
      );

      expect(await session(local).knowledge.lessons("do")).toEqual(new Map());
      expect(
        await session(app, { scope: "support" }).knowledge.lessons("do"),
      ).toEqual(new Map([["log in", login]]));
    });

    it("resolves the explicit app through the manifest", async () => {
      await writeManifest();
      await session(blank).knowledge.learn("do", "log in", login, { app: web });

      for (const other of [local, android]) {
        expect(await session(other).knowledge.lessons("do")).toEqual(
          new Map([["log in", login]]),
        );
      }
    });

    it("fails on apps claimed by several products", async () => {
      await new KnowledgeStore().writeJson("knowledge.json", {
        products: {
          shop: { apps: ["*.example.org"] },
          support: { apps: ["shop-static.example.org"] },
        },
      });

      await expect(session(web).knowledge.lessons("do")).rejects.toThrow(
        /claimed by several knowledge products/,
      );
    });
  });
});

function session(
  app: AppId,
  options: {
    store?: KnowledgeStore | null;
    scope?: string;
    platform?: KnowledgeLayer.Platform;
  } = {},
) {
  const context = new SessionContext({
    app,
    sessionId: "test-session-id" as SessionId,
  });
  const store =
    options.store === undefined ? new KnowledgeStore() : options.store;
  const knowledge = new Knowledge({
    context,
    store,
    platform: options.platform ?? "web",
    scope: options.scope,
  });
  return { context, knowledge };
}
