import { describe } from "vitest";
import { baseIt } from "./helpers.js";

describe("Table", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { al, driverType } = result;

      // These models double-click to sort
      if (al.model.provider === "mistralai")
        await al.learn("sort by web site", ["click 'Web Site' header"]);

      if (al.model.provider === "aws_meta")
        skip("Table area instructions need more work");

      if (driverType.startsWith("appium"))
        skip("Area is not properly extracted from Appium source code.");

      return result;
    };
  });

  it("supports extraction", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("https://the-internet.herokuapp.com/tables");

    const area = await al.area("first table");
    expect(await area.get("Jason Doe's due amount")).toBe("$100.00");
    expect(await area.get("Frank Bach's due amount")).toBe("$51.00");
    expect(await area.get("Tim Conway's due amount")).toBe("$50.00");
    expect(await area.get("John Smith's due amount")).toBe("$50.00");
  });

  it("supports sorting", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("https://the-internet.herokuapp.com/tables");

    let table1 = await al.area("first table");
    const table1FirstNames = await table1.get("first names");
    expect(table1FirstNames).toEqual(["John", "Frank", "Jason", "Tim"]);
    const table1LastNames = await table1.get("last names");
    expect(table1LastNames).toEqual(["Smith", "Bach", "Doe", "Conway"]);

    let table2 = await al.area("second table");
    const table2FirstNames = await table2.get("first names");
    expect(table2FirstNames).toEqual(["John", "Frank", "Jason", "Tim"]);
    const table2LastNames = await table2.get("last names");
    expect(table2LastNames).toEqual(["Smith", "Bach", "Doe", "Conway"]);

    await table1.do("sort by last name");
    table1 = await al.area("first table"); // refresh
    expect(await table1.get("first names")).toEqual([
      "Frank",
      "Tim",
      "Jason",
      "John",
    ]);
    expect(await table1.get("last names")).toEqual([
      "Bach",
      "Conway",
      "Doe",
      "Smith",
    ]);
    // example 2 table is not affected
    table2 = await al.area("second table"); // refresh
    expect(await table2.get("first names")).toEqual([
      "John",
      "Frank",
      "Jason",
      "Tim",
    ]);
    expect(await table2.get("last names")).toEqual([
      "Smith",
      "Bach",
      "Doe",
      "Conway",
    ]);

    await table2.do("sort by first name");
    table2 = await al.area("second table"); // refresh
    expect(await table2.get("first names")).toEqual([
      "Frank",
      "Jason",
      "John",
      "Tim",
    ]);
    expect(await table2.get("last names")).toEqual([
      "Bach",
      "Doe",
      "Smith",
      "Conway",
    ]);
    // example 1 table is not affected
    table1 = await al.area("first table"); // refresh
    expect(await table1.get("first names")).toEqual([
      "Frank",
      "Tim",
      "Jason",
      "John",
    ]);
    expect(await table1.get("last names")).toEqual([
      "Bach",
      "Conway",
      "Doe",
      "Smith",
    ]);
  });

  it("retrieval of unavailable data", async ({ expect, setup }) => {
    const { al, $ } = await setup();

    await $.navigate("https://the-internet.herokuapp.com/tables");

    // This data is not available on the page.
    // Even though LLM knows the answer, it should not respond it.
    // When data is unavailable, get() returns an explanation string
    const result = await al.get("atomic number of Selenium");
    expect(typeof result).toBe("string");
    expect((result as string).toLowerCase()).not.toContain("34");
  });
});
