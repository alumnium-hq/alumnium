import { describe, expect, it, vi } from "vitest";
import { KnowledgeStore } from "@alumnium/core/agents";
import { GlobalFileStorePaths } from "@alumnium/core/internal";
import {
  createMockDir,
  pushMock,
  setupBeforeEach,
} from "../../../alumnium/tests/unit/mocks.ts";
import { KnowledgeCommand } from "./KnowledgeCommand.ts";

describe("KnowledgeCommand", () => {
  const setup = setupBeforeEach(async () => {
    const storeDir = await createMockDir({ prefix: "knowledge-command" });
    pushMock(
      vi
        .spyOn(GlobalFileStorePaths, "globalSubDir")
        .mockReturnValue(storeDir.path),
    );
    const store = new KnowledgeStore();
    await store.save(null, "shared", "check", "banner is gone", "no Accept");
    await store.save("live-chat", "product", "do", "start a conversation", [
      "click 'Live Chat'",
      "click 'New Conversation'",
    ]);
    await store.save("live-chat", "android", "do", "start a conversation", [
      "tap the chat bubble",
    ]);
    return { storeDir, store };
  });

  async function run(args: Partial<KnowledgeCommand.Args>) {
    const lines: string[] = [];
    const ok = await KnowledgeCommand.run(
      KnowledgeCommand.Args.parse(args),
      (line) => lines.push(line),
    );
    return { ok, lines };
  }

  it("lists lessons by layer", async () => {
    const { ok, lines } = await run({ action: "list" });

    expect(ok).toBe(true);
    expect(lines).toEqual([
      "shared",
      "  check  banner is gone  →  no Accept",
      "live-chat (product)",
      "  do  start a conversation  →  click 'Live Chat'; click 'New Conversation'",
      "live-chat (android)",
      "  do  start a conversation  →  tap the chat bubble",
    ]);
  });

  it("validates the store", async () => {
    expect(await run({ action: "validate" })).toEqual({
      ok: true,
      lines: [expect.stringMatching(/is valid$/)],
    });
  });

  it("fails validation on malformed files", async () => {
    const { store } = setup.cur;
    await store.writeJson("live-chat/web.json", { do: { x: "not a list" } });

    const { ok, lines } = await run({ action: "validate" });

    expect(ok).toBe(false);
    expect(lines).toEqual([expect.stringContaining("live-chat/web.json")]);
  });

  it("explains which lessons are sent for an instruction", async () => {
    const { store } = setup.cur;
    await store.writeJson("knowledge.json", {
      products: { "live-chat": { apps: ["*.sprinklr.com"] } },
    });

    const { ok, lines } = await run({
      action: "explain",
      instruction: "start a conversation",
      app: "https://live-chat-static.sprinklr.com",
      platform: "android",
    });

    expect(ok).toBe(true);
    expect(lines).toEqual([
      "Scope live-chat, platform android: 1 of 1 do lessons sent",
      "  [android] exact  start a conversation  →  tap the chat bubble",
    ]);
  });

  it("needs a scope or an app to explain", async () => {
    const { ok, lines } = await run({
      action: "explain",
      instruction: "start a conversation",
    });

    expect(ok).toBe(false);
    expect(lines).toEqual(["explain needs --scope or --app"]);
  });

  it("migrates lessons saved in the earlier layout", async () => {
    const { store, storeDir } = setup.cur;
    await store.writeJson("live-chat/get/legacy.json", {
      instruction: "total",
      hint: "the Total row",
    });

    const { ok, lines } = await run({ action: "migrate" });

    expect(ok).toBe(true);
    expect(lines).toEqual(["live-chat: moved 1 lessons into lessons.json"]);
    expect(await storeDir.flatTree()).not.toContain(
      "live-chat/get/legacy.json",
    );
  });
});
