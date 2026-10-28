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

  it("saves and loads do lessons per app", async () => {
    const { store, storeDir } = setup.cur;

    await store.save(app, "do", "log in", ["click button 'Login'"]);

    expect(await store.lessons(app, "do")).toEqual([
      ["log in", ["click button 'Login'"]],
    ]);
    expect(await store.lessons(AppId.parse("other.com"), "do")).toEqual([]);
    expect(await storeDir.flatTree()).toEqual([
      expect.stringMatching(/^example-com\/do\/[0-9a-f]+\.json$/),
    ]);
  });

  it("keeps the do lesson file format", async () => {
    const { store, storeDir } = setup.cur;

    await store.save(app, "do", "log in", ["click button 'Login'"]);

    const [file] = await storeDir.flatTree();
    expect(await storeDir.readJson(file!)).toEqual({
      goal: "log in",
      actions: ["click button 'Login'"],
    });
  });

  it("saves and loads hints per kind", async () => {
    const { store, storeDir } = setup.cur;

    await store.save(app, "get", "total", "use the 'Total' row");
    await store.save(app, "find", "total", "cell 'Total'");

    expect(await store.lessons(app, "get")).toEqual([
      ["total", "use the 'Total' row"],
    ]);
    expect(await store.lessons(app, "find")).toEqual([
      ["total", "cell 'Total'"],
    ]);
    expect(await store.lessons(app, "check")).toEqual([]);

    const files = await storeDir.flatTree();
    const getFile = files.find((file) => file.startsWith("example-com/get/"));
    expect(await storeDir.readJson(getFile!)).toEqual({
      instruction: "total",
      hint: "use the 'Total' row",
    });
  });

  it("replaces the lesson for the same instruction", async () => {
    const { store } = setup.cur;

    await store.save(app, "do", "log in", ["click 'Sign in'"]);
    await store.save(app, "do", "log in", ["click 'Login'"]);

    expect(await store.lessons(app, "do")).toEqual([
      ["log in", ["click 'Login'"]],
    ]);
  });

  it("skips malformed lessons", async () => {
    const { store } = setup.cur;

    await store.save(app, "do", "log in", ["click button 'Login'"]);
    await store.writeFile("example-com/do/broken.json", "{");
    await store.writeJson("example-com/do/invalid.json", { goal: 1 });
    await store.writeJson("example-com/do/hint.json", {
      instruction: "log in",
      hint: "wrong kind",
    });

    expect(await store.lessons(app, "do")).toEqual([
      ["log in", ["click button 'Login'"]],
    ]);
  });

  it("clears lessons of all kinds for a single app", async () => {
    const { store } = setup.cur;
    const other = AppId.parse("other.com");

    await store.save(app, "do", "log in", ["click button 'Login'"]);
    await store.save(app, "get", "total", "use the 'Total' row");
    await store.save(other, "do", "log in", ["click button 'Login'"]);
    await store.clearApp(app);

    expect(await store.lessons(app, "do")).toEqual([]);
    expect(await store.lessons(app, "get")).toEqual([]);
    expect(await store.lessons(other, "do")).toEqual([
      ["log in", ["click button 'Login'"]],
    ]);
  });
});
