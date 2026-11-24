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
    await store.save("shop", "product", "do", "start a conversation", [
      "click 'Messages'",
      "click 'New Conversation'",
    ]);
    await store.save("shop", "android", "do", "start a conversation", [
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
      "shop (product)",
      "  do  start a conversation  →  click 'Messages'; click 'New Conversation'",
      "shop (android)",
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
    await store.writeJson("shop/web.json", { do: { x: "not a list" } });

    const { ok, lines } = await run({ action: "validate" });

    expect(ok).toBe(false);
    expect(lines).toEqual([expect.stringContaining("shop/web.json")]);
  });

  it("explains which lessons are sent for an instruction", async () => {
    const { store } = setup.cur;
    await store.writeJson("knowledge.json", {
      products: { shop: { apps: ["*.example.org"] } },
    });

    const { ok, lines } = await run({
      action: "explain",
      instruction: "start a conversation",
      app: "https://shop-static.example.org",
      platform: "android",
    });

    expect(ok).toBe(true);
    expect(lines).toEqual([
      "Scope shop, platform android: 1 of 1 do lessons sent",
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
});
