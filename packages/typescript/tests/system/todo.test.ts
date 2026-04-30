import { describe } from "vitest";
import { baseIt } from "./helpers.ts";

describe("To Do application", () => {
  const it = baseIt.override("setup", async ({ setup }) => {
    return async (options) => {
      const result = await setup(options);
      const { al } = result;

      await Promise.all([
        al.learn('create a new task "this is Al"', [
          'type "this is Al" in textbox "what needs to be done"',
          'press key "Enter"',
        ]),
        al.learn('mark the "this is Al" task as completed', [
          'click checkbox near the "this is Al" task',
        ]),
        al.learn('delete the "this is Al" task', [
          'hover the "this is Al" task',
          'click button "x" near the "this is Al" task',
        ]),
      ]);

      return result;
    };
  });

  it("creates a new task", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    expect(await al.get("titles of tasks")).toContain("Buy milk");
    await al.check('"Buy milk" task is not marked as completed', {
      assert: expect.assert,
    });
  });

  it("complete a task", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('mark the "Buy milk" task as completed');
    await al.check('"Buy milk" task is marked as completed', {
      assert: expect.assert,
    });
    await al.check("tasks counter is 0", { assert: expect.assert });
  });

  it("uncomplete a task", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('mark the "Buy milk" task as completed');
    await al.do('mark the "Buy milk" task as uncompleted');
    await al.check('"Buy milk" task is not marked as completed', {
      assert: expect.assert,
    });
    await al.check("tasks counter is 1", { assert: expect.assert });
  });

  it("complete all tasks", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('create a new task "Buy bread"');
    await al.do("mark all tasks as completed");
    await al.check('"Buy milk" task is marked as completed', {
      assert: expect.assert,
    });
    await al.check('"Buy bread" task is marked as completed', {
      assert: expect.assert,
    });
    await al.check("tasks counter is 0", { assert: expect.assert });
  });

  it("delete a task", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('create a new task "Buy bread"');
    await al.do('delete the "Buy milk" task');
    const tasks = await al.get("titles of tasks");
    expect(tasks).not.toContain("Buy milk");
  });

  it("show active tasks", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('create a new task "Buy bread"');
    await al.do('mark the "Buy milk" task as completed');
    await al.do('show only "Active" tasks');
    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy bread");
    expect(tasks).not.toContain("Buy milk");
  });

  it("show completed tasks", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('create a new task "Buy bread"');
    await al.do('mark the "Buy milk" task as completed');
    await al.do('show only "Completed" tasks');
    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy milk");
    expect(tasks).not.toContain("Buy bread");
  });

  it("clear completed tasks", async ({ expect, setup }) => {
    const { al, $ } = await setup();
    await $.navigate("https://todomvc.com/examples/vue/dist");
    await al.do('create a new task "Buy milk"');
    await al.do('create a new task "Buy bread"');
    await al.do('mark the "Buy milk" task as completed');
    await al.do("clear completed tasks");
    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy bread");
    expect(tasks).not.toContain("Buy milk");
  });
});
