import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { describe, vi } from "vitest";
import { Env } from "@alumnium/core/internal";
import { baseIt } from "./helpers.ts";

const TODO_URL = "https://todomvc.com/examples/vue/dist";
const ACCOUNT_PAGE = "account.html";

describe("Knowledge", () => {
  const it = baseIt.override(
    "setup",
    async ({ setup, skip, onTestFinished }) => {
      // Knowledge is persisted by the session, which runs in another process
      // when using the server.
      if (Env.ALUMNIUM_SERVER_URL)
        skip("Knowledge path can't be passed to server");

      const knowledgeDir = await fs.mkdtemp(
        path.join(os.tmpdir(), "alumnium-knowledge-"),
      );
      vi.stubEnv("ALUMNIUM_KNOWLEDGE", "true");
      vi.stubEnv("ALUMNIUM_KNOWLEDGE_PATH", knowledgeDir);
      Env.reset();

      onTestFinished(async () => {
        vi.unstubAllEnvs();
        Env.reset();
        await fs.rm(knowledgeDir, { recursive: true, force: true });
      });

      return async (options) => {
        const result = await setup(options);
        if (result.isMobile) skip("TodoMVC is a web application");
        return result;
      };
    },
  );

  it("applies lessons learned in a previous session", async ({
    expect,
    setup,
  }) => {
    // The first session teaches how to delete a task. Since the app is known,
    // the lesson is persisted right away.
    const teacher = await setup();
    await teacher.$.navigate(TODO_URL);
    await teacher.al.knowledge.do('delete the "this is Al" task', [
      'hover the "this is Al" task',
      'click button "x" near the "this is Al" task',
    ]);

    // The second session is separate and never calls learn().
    const { al, $ } = await setup();
    await $.navigate(TODO_URL);
    await al.do('create a new task "Buy milk"');
    await al.do('create a new task "Buy bread"');

    // The delete button only appears on hover, which comes from the lesson.
    const { steps } = await al.do('delete the "Buy milk" task');
    expect(steps.map((step) => step.name).join("\n")).toMatch(/hover/i);

    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy bread");
    expect(tasks).not.toContain("Buy milk");
  });

  // The account page has a decoy matching each instruction more obviously than
  // the element the hint points to.

  it("uses obvious matches without hints", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate(ACCOUNT_PAGE);

    expect(await al.get("status")).toBe("Active");

    await $.click(await al.find("save button"));
    expect(await al.driver.title()).toBe("Saved");
  });

  it("applies hints learned in a previous session", async ({
    expect,
    setup,
  }) => {
    const teacher = await setup();
    await teacher.$.navigate(ACCOUNT_PAGE);
    await Promise.all([
      teacher.al.knowledge.get("status", "the status means the billing status"),
      teacher.al.knowledge.check(
        "account is active",
        "the account is active only when its billing status is 'Paid'",
      ),
      teacher.al.knowledge.find("save button", "the button 'Keep for later'"),
      teacher.al.knowledge.area("orders table", "the 'Archived orders' table"),
    ]);

    // The second session is separate and never calls learn.
    const { al, $ } = await setup();
    await $.navigate(ACCOUNT_PAGE);

    expect(await al.get("status")).toBe("Overdue");

    await expect(al.check("account is active")).rejects.toThrow();

    await $.click(await al.find("save button"));
    expect(await al.driver.title()).toBe("Kept for later");

    const orders = await al.area("orders table");
    expect(await orders.get("order numbers")).toEqual([
      "ORD-9001",
      "ORD-9002",
      "ORD-9003",
    ]);
  });
});
