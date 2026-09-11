import type { Alumni } from "alumnium";
import { describe } from "vitest";
import { Env } from "../../src/Env.ts";
import { baseIt } from "./helpers.ts";

describe("Native To Do application", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      // Checked before `setup` so the other drivers do not launch a browser just to skip.
      if (Env.ALUMNIUM_DRIVER !== "maestro")
        skip("The native To Do app is only driven by Maestro");

      const result = await setup(options);
      const { al, isMobile } = result;

      await Promise.all([
        al.learn('create a new task "this is Al"', [
          'type "this is Al" to a text field',
          "click save button",
        ]),
        al.learn('mark the "this is Al" task as completed', [
          'click image near the "this is Al" task',
        ]),
        al.learn('delete the "this is Al" task', [
          'click image "-" near the "this is Al" task',
          'click button "Delete" near the "this is Al" task',
          "click done button",
        ]),
      ]);

      return result;
    };
  });

  /** The app opens on a list, so adding a task starts from its "Add" button. */
  const createTask = async (al: Alumni, title: string) => {
    await al.do("click add button");
    await al.do(`create a new task '${title}'`);
  };

  /**
   * Maestro's hierarchy carries no element types, so a bare "titles of tasks" lets the retriever
   * mistake the navigation bar ("Edit", "Add", "Todo List") for the list. The rows are identifiable
   * by the circle image beside each one. This mirrors the hint the Python suite needs on Android,
   * where the rows are equally untyped — see the comment on
   * https://github.com/alumnium-hq/alumnium/issues/110 in `steps/todo_al.py`.
   */
  const TASK_TITLES =
    "titles of tasks in the list (texts next to the circle or checkmark images), excluding navigation bar and status bar items";

  it("creates a new task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    expect(await al.get(TASK_TITLES)).toContain("Buy milk");
    await al.check(
      '"Buy milk" task is not marked as completed (uncompleted task has a circle image to the left of the task title)',
      { assert: expect.assert },
    );
  });

  it("completes a task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    await al.do('mark the "Buy milk" task as completed');
    await al.check(
      '"Buy milk" task is marked as completed (completed task has a checkmark circle image to the left of the task title)',
      { assert: expect.assert },
    );
  });

  it("uncompletes a task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    await al.do('mark the "Buy milk" task as completed');
    await al.do('mark the "Buy milk" task as uncompleted');
    await al.check(
      '"Buy milk" task is not marked as completed (uncompleted task has a circle image to the left of the task title)',
      { assert: expect.assert },
    );
  });

  it("deletes a task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    await createTask(al, "Buy bread");
    // Deleting takes three screens: "Edit" reveals the remove controls, the remove control reveals a
    // "Delete" confirmation. With no element types in the tree the planner will not commit to a
    // sequence through screens it cannot see yet, so each transition is named — the same way this
    // suite already spells out "using the 'Toggle All' button" and "click add button".
    await al.do("click edit button");
    await al.do(
      'delete the "Buy milk" task by clicking its remove control, then confirming with the "Delete" button',
    );
    const tasks = await al.get(TASK_TITLES);
    expect(tasks).not.toContain("Buy milk");
    expect(tasks).toContain("Buy bread");
  });
});
