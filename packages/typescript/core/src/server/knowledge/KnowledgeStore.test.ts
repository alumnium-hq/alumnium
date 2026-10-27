import { describe, expect, it, vi } from "vitest";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../../alumnium/tests/unit/mocks.ts";
import { AppId } from "../../AppId.ts";
import { Env } from "../../Env.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
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

  const app = AppId.parse("https://example.com");

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

  it("saves and loads lessons per app", async () => {
    const { store, storeDir } = setup.cur;
    const lesson = { goal: "log in", actions: ["click button 'Login'"] };

    await store.save(app, lesson);

    expect(await store.lessons(app)).toEqual([lesson]);
    expect(await store.lessons(AppId.parse("other.com"))).toEqual([]);
    expect(await storeDir.flatTree()).toEqual([
      expect.stringMatching(/^example-com\/do\/[0-9a-f]+\.json$/),
    ]);
  });

  it("replaces the lesson for the same goal", async () => {
    const { store } = setup.cur;

    await store.save(app, { goal: "log in", actions: ["click 'Sign in'"] });
    await store.save(app, { goal: "log in", actions: ["click 'Login'"] });

    expect(await store.lessons(app)).toEqual([
      { goal: "log in", actions: ["click 'Login'"] },
    ]);
  });

  it("skips malformed lessons", async () => {
    const { store } = setup.cur;
    const lesson = { goal: "log in", actions: ["click button 'Login'"] };

    await store.save(app, lesson);
    await store.writeFile("example-com/do/broken.json", "{");
    await store.writeJson("example-com/do/invalid.json", { goal: 1 });

    expect(await store.lessons(app)).toEqual([lesson]);
  });

  it("clears lessons of a single app", async () => {
    const { store } = setup.cur;
    const other = AppId.parse("other.com");
    const lesson = { goal: "log in", actions: ["click button 'Login'"] };

    await store.save(app, lesson);
    await store.save(other, lesson);
    await store.clearApp(app);

    expect(await store.lessons(app)).toEqual([]);
    expect(await store.lessons(other)).toEqual([lesson]);
  });
});
