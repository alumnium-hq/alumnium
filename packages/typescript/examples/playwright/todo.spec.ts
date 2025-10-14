import { expect, test } from "./index.js";

test.describe("To Do application", () => {
  test.beforeEach(async ({ page }) => {
    await page.goto("https://todomvc.com/examples/vue/dist");
  });

  test("creates a new task", async ({ al }) => {
    await al.do("create a new task 'buy milk'");
    expect(await al.get("titles of tasks")).toContain("buy milk");
    await al.check("'buy milk' task is not marked as completed");
  });

  test("complete a task", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("mark the 'Buy milk' task as completed");
    await al.check("'Buy milk' task is marked as completed");
    expect(await al.get("tasks counter")).toBe(0);
  });

  test("uncomplete a task", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("mark the 'Buy milk' task as completed");
    await al.do("mark the 'Buy milk' task as uncompleted");
    await al.check("'Buy milk' task is not marked as completed");
    expect(await al.get("tasks counter")).toBe(1);
  });

  test("complete all tasks", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("create a new task 'Buy bread'");
    await al.do("mark all tasks as completed");
    await al.check("'Buy milk' task is marked as completed");
    await al.check("'Buy bread' task is marked as completed");
    expect(await al.get("tasks counter")).toBe(0);
  });

  test("delete a task", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("create a new task 'Buy bread'");
    await al.do("delete the 'Buy milk' task");
    const tasks = await al.get("titles of tasks");
    expect(tasks).not.toContain("Buy milk");
  });

  test("show active tasks", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("create a new task 'Buy bread'");
    await al.do("mark the 'Buy milk' task as completed");
    await al.do("show only 'Active' tasks");
    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy bread");
    expect(tasks).not.toContain("Buy milk");
  });

  test("show completed tasks", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("create a new task 'Buy bread'");
    await al.do("mark the 'Buy milk' task as completed");
    await al.do("show only 'Completed' tasks");
    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy milk");
    expect(tasks).not.toContain("Buy bread");
  });

  test("clear completed tasks", async ({ al }) => {
    await al.do("create a new task 'Buy milk'");
    await al.do("create a new task 'Buy bread'");
    await al.do("mark the 'Buy milk' task as completed");
    await al.do("clear completed tasks");
    const tasks = await al.get("titles of tasks");
    expect(tasks).toContain("Buy bread");
    expect(tasks).not.toContain("Buy milk");
  });
});
