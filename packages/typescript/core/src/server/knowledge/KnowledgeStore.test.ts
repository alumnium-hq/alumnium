import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../../alumnium/tests/unit/mocks.ts";
import { AppId } from "../../AppId.ts";
import { Env } from "../../Env.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { KnowledgeManifest } from "./KnowledgeManifest.ts";
import { KnowledgeStore } from "./KnowledgeStore.ts";

describe(KnowledgeStore, () => {
  const setup = setupBeforeEach(async () => {
    const storeDir = await createMockDir({ prefix: "knowledge" });
    pushMock(
      vi
        .spyOn(GlobalFileStorePaths, "globalSubDir")
        .mockReturnValue(storeDir.path),
    );
    return { store: new KnowledgeStore(), storeDir };
  });

  const scope = "shop";
  const login = ["click button 'Login'"];

  it("stores lessons in the knowledge store directory", () => {
    const { store, storeDir } = setup.cur;

    expect(store.dir).toBe(storeDir.path);
    expect(GlobalFileStorePaths.globalSubDir).toHaveBeenCalledWith("knowledge");
  });

  it("allows overriding the directory", async () => {
    const dir = await createMockDir({ prefix: "knowledge-path" });
    pushMock(
      vi.spyOn(Env, "ALUMNIUM_KNOWLEDGE_PATH", "get").mockReturnValue(dir.path),
    );

    expect(new KnowledgeStore().dir).toBe(dir.path);
  });

  describe("layers", () => {
    it("saves each layer in its own file", async () => {
      const { store, storeDir } = setup.cur;

      await store.save(null, "shared", "check", "banner is gone", "no Accept");
      await store.save(scope, "product", "do", "log in", login);
      await store.save(scope, "android", "do", "log in", ["tap 'Login'"]);

      expect(await storeDir.flatTree()).toEqual([
        "shared.json",
        "shop/android.json",
        "shop/lessons.json",
      ]);
      expect((await store.layer(scope, "product")).do).toEqual(
        new Map([["log in", login]]),
      );
      expect((await store.layer(scope, "android")).do).toEqual(
        new Map([["log in", ["tap 'Login'"]]]),
      );
      expect((await store.layer(null, "shared")).check).toEqual(
        new Map([["banner is gone", "no Accept"]]),
      );
    });

    it("writes readable files sorted by kind and instruction", async () => {
      const { store, storeDir } = setup.cur;

      await store.save(scope, "product", "get", "total", "the Total row");
      await store.save(scope, "product", "do", "sign up", ["click 'Sign up'"]);
      await store.save(scope, "product", "do", "log in", login);

      expect(await storeDir.readText("shop/lessons.json")).toBe(
        JSON.stringify(
          {
            do: { "log in": login, "sign up": ["click 'Sign up'"] },
            get: { total: "the Total row" },
          },
          null,
          2,
        ),
      );
    });

    it("keeps every lesson saved concurrently", async () => {
      const { store } = setup.cur;
      const goals = Array.from({ length: 20 }, (_, i) => `goal ${i}`);

      await Promise.all(
        goals.map((goal) => store.save(scope, "product", "do", goal, login)),
      );

      expect(
        [...(await store.layer(scope, "product")).do.keys()].sort(),
      ).toEqual(goals.sort());
    });

    it("needs a scope for product and platform layers", async () => {
      const { store } = setup.cur;

      await expect(
        store.save(null, "product", "do", "log in", login),
      ).rejects.toThrow("The product layer needs a knowledge scope");
    });

    it("names malformed layer files", async () => {
      const { store, storeDir } = setup.cur;
      await store.writeJson("shop/lessons.json", { dos: {} });

      await expect(store.layer(scope, "product")).rejects.toThrow(
        `Invalid knowledge file ${storeDir.path}/shop/lessons.json`,
      );
    });
  });

  describe("forget", () => {
    it("removes one lesson from a layer", async () => {
      const { store } = setup.cur;
      await store.save(scope, "product", "do", "log in", login);
      await store.save(scope, "product", "do", "sign up", ["click 'Sign up'"]);

      expect(await store.forget(scope, "product", "do", "log in")).toBe(true);
      expect(await store.forget(scope, "product", "do", "log in")).toBe(false);
      expect([...(await store.layer(scope, "product")).do.keys()]).toEqual([
        "sign up",
      ]);
    });

    it("removes the file with its last lesson", async () => {
      const { store, storeDir } = setup.cur;
      await store.save(scope, "web", "find", "login", "button 'Sign in'");

      await store.forget(scope, "web", "find", "login");

      expect(await storeDir.flatTree()).toEqual([]);
    });
  });

  it("clears a single layer", async () => {
    const { store } = setup.cur;
    await store.save(scope, "product", "do", "log in", login);
    await store.save(scope, "ios", "do", "log in", ["tap 'Login'"]);

    await store.clearLayer(scope, "product");

    expect((await store.layer(scope, "product")).do).toEqual(new Map());
    expect((await store.layer(scope, "ios")).do.size).toBe(1);
  });

  it("lists layers with lessons", async () => {
    const { store } = setup.cur;
    await store.save(null, "shared", "do", "close banner", ["click 'Accept'"]);
    await store.save("b-app", "web", "do", "log in", login);
    await store.save("a-app", "product", "do", "log in", login);

    expect(await store.layers()).toEqual([
      { scope: null, layer: "shared" },
      { scope: "a-app", layer: "product" },
      { scope: "b-app", layer: "web" },
    ]);
  });

  describe("validate", () => {
    it("reports nothing for a valid store", async () => {
      const { store } = setup.cur;
      await store.save(scope, "product", "do", "log in", login);

      expect(await store.validate()).toEqual([]);
    });

    it("reports a malformed manifest and layer files", async () => {
      const { store } = setup.cur;
      await store.writeFile("knowledge.json", "{");
      await store.writeJson("shop/web.json", {
        do: { "log in": "click" },
      });

      const problems = await store.validate();
      expect(problems).toEqual([
        expect.stringContaining("Invalid knowledge manifest"),
        expect.stringContaining("shop/web.json"),
      ]);
    });
  });

  describe("manifest", () => {
    it("is empty without a manifest file", async () => {
      const { store } = setup.cur;

      expect(await store.manifest()).toBe(KnowledgeManifest.EMPTY);
    });

    it("reads the manifest file", async () => {
      const { store } = setup.cur;
      await store.writeJson("knowledge.json", {
        products: { shop: { apps: ["*.example.org"] } },
      });

      const manifest = await store.manifest();
      expect(manifest.resolve(AppId.parse("https://www.example.org"))).toBe(
        "shop",
      );
    });

    it("names the file of an invalid manifest", async () => {
      const { store, storeDir } = setup.cur;
      await store.writeFile("knowledge.json", "{");

      await expect(store.manifest()).rejects.toThrow(
        `Invalid knowledge manifest ${storeDir.path}/knowledge.json`,
      );
    });
  });
});
