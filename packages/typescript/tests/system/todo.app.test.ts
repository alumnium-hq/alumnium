import type { Alumni } from "alumnium";
import { describe, inject } from "vitest";
import { baseIt } from "./helpers.ts";

describe("Native To Do application", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { al, isMobile } = result;
      if (!isMobile) skip("The native To Do app is only driven on mobile");

      await Promise.all(
        inject("maestroOs") === "android"
          ? [
              al.learn('create a new task "this is Al"', [
                'type "this is Al" in "Title" textbox',
                'type "this is Al" in "Enter your task here" textbox',
                "click button 'Save'",
              ]),
              al.learn('mark the "this is Al" task as completed', [
                'click checkbox near the "this is Al" task',
              ]),
              al.learn('delete the "this is Al" task', [
                "click on the 'this is Al' task to open its details",
                "click button 'Delete'",
              ]),
            ]
          : [
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
            ],
      );

      return result;
    };
  });

  const os = () => inject("maestroOs");

  const createTask = async (al: Alumni, title: string) => {
    await al.do("click add button");
    if (os() === "android") {
      await al.do(`type '${title}' into the "Title" text field`);
      await al.do(
        `type '${title}' into the second text field, the description field whose placeholder reads "Enter your task here."`,
      );
      await al.do("click the save button");
    } else {
      await al.do(`create a new task '${title}'`);
    }
  };
  const completed = (title: string) =>
    os() === "android"
      ? `"${title}" task is marked as completed`
      : `"${title}" task is marked as completed (completed task has a checkmark circle image to the left of the task title)`;
  const notCompleted = (title: string) =>
    os() === "android"
      ? `"${title}" task is not marked as completed`
      : `"${title}" task is not marked as completed (uncompleted task has a circle image to the left of the task title)`;

  // The rows are identifiable by the control beside each title: a circle/checkmark image on iOS, a
  // checkbox on Android. Naming it keeps the retriever from reading the navigation bar as the list.
  const TASK_TITLES = () =>
    os() === "android"
      ? "titles of tasks in the list (the text next to each checkbox), excluding the toolbar, filter labels, and status bar"
      : "titles of tasks in the list (texts next to the circle or checkmark images), excluding navigation bar and status bar items";

  it("creates a new task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    expect(await al.get(TASK_TITLES())).toContain("Buy milk");
    await al.check(notCompleted("Buy milk"), { assert: expect.assert });
  });

  it("completes a task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    await al.do('mark the "Buy milk" task as completed');
    await al.check(completed("Buy milk"), { assert: expect.assert });
  });

  it("uncompletes a task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    await al.do('mark the "Buy milk" task as completed');
    await al.do('mark the "Buy milk" task as uncompleted');
    await al.check(notCompleted("Buy milk"), { assert: expect.assert });
  });

  it("deletes a task", async ({ expect, setup }) => {
    const { al } = await setup();
    await createTask(al, "Buy milk");
    await createTask(al, "Buy bread");
    if (os() === "android") {
      await al.do('open the "Buy milk" task by tapping its row');
      await al.do('click the "Delete task" button in the top bar');
    } else {
      await al.do("click edit button");
      await al.do(
        'delete the "Buy milk" task by clicking its remove control, then confirming with the "Delete" button',
      );
    }
    const tasks = await al.get(TASK_TITLES());
    expect(tasks).not.toContain("Buy milk");
    expect(tasks).toContain("Buy bread");
  });
});
