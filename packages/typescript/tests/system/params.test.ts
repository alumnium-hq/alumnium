import { describe } from "vitest";
import { AssertionError } from "../../src/client/errors/AssertionError.ts";
import { ParamsError } from "../../src/client/errors/ParamsError.ts";
import { baseIt } from "./helpers.ts";

describe("Goal parameters", () => {
  const it = baseIt.override("setup", async ({ setup, skip }) => {
    return async (options) => {
      const result = await setup(options);
      const { driverId } = result;

      if (driverId === "appium-ios" || driverId === "appium-android")
        skip("Test uses a web page");

      return result;
    };
  });

  it("reuses the cache for a typed value", async ({ expect, setup }) => {
    // NOTE: The planner is off so that the goal reaches the actor unchanged,
    // which keeps the assertion about a single cache entry rather than two.
    const { al, $ } = await setup({ planner: false });
    await $.navigate("https://the-internet.herokuapp.com/forgot_password");

    await al.do("type {email} in the email field", { email: "first@test.com" });
    expect((await al.getStats()).cache.total_tokens).toBe(0);

    await al.do("type {email} in the email field", {
      email: "second@test.com",
    });
    expect((await al.getStats()).cache.total_tokens).toBeGreaterThan(0);

    expect(await al.get("the value of the email field")).toBe(
      "second@test.com",
    );
  });

  it("reuses the cache for a value that picks the element", async ({
    expect,
    setup,
  }) => {
    // NOTE: The parameter is not typed anywhere — it identifies which button to
    // click. The cached element is stored with the placeholder as its text and
    // re-resolved against the live tree for the next value.
    const { al, $ } = await setup({ planner: false });
    await $.navigate("https://seleniumbase.io/apps/calculator");

    await al.do("click {number} button", { number: "8" });
    expect((await al.getStats()).cache.total_tokens).toBe(0);

    await al.do("click {number} button", { number: "3" });
    expect((await al.getStats()).cache.total_tokens).toBeGreaterThan(0);

    // 8 then 3 typed into the display, proving the second click hit "3" and not
    // the recorded "8".
    expect(await al.get("the calculator display value")).toBe(83);
  });

  it("misses the cache when the value is inlined", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup({ planner: false });
    await $.navigate("https://seleniumbase.io/apps/calculator");

    await al.do("click 8 button");
    await al.do("click 3 button");

    expect((await al.getStats()).cache.total_tokens).toBe(0);
  });

  it("rejects a goal whose placeholder has no value", async ({
    expect,
    setup,
  }) => {
    const { al } = await setup({ planner: false });

    await expect(
      al.do("type {email} in the email field", { mail: "typo@test.com" }),
    ).rejects.toThrow(ParamsError);
  });

  it("rejects a value the goal never references", async ({ expect, setup }) => {
    const { al } = await setup({ planner: false });

    await expect(
      al.do("type test@example.com in the email field", { email: "a@b.com" }),
    ).rejects.toThrow(ParamsError);
  });

  // NOTE: Unlike `do`, a parameterized `check` or `get` substitutes before the
  // request leaves the client, so it takes no part in caching - see
  // `Alumni.check`. What these cover is that the values really reach the model,
  // which is what makes a recorded step replayable against fresh data.
  it("verifies a statement against the substituted value", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup({ planner: false });
    await $.navigate("https://the-internet.herokuapp.com/forgot_password");

    await al.check("the page heading is {heading}", {
      params: { heading: "Forgot Password" },
    });

    await expect(
      al.check("the page heading is {heading}", {
        params: { heading: "Sign Up" },
      }),
    ).rejects.toThrow(AssertionError);
  });

  it("extracts data described with a parameterized value", async ({
    expect,
    setup,
  }) => {
    const { al, $ } = await setup({ planner: false });
    await $.navigate("https://the-internet.herokuapp.com/tables");

    expect(
      await al.get(
        "the last name in the row whose first name is {first_name}",
        {
          params: { first_name: "John" },
        },
      ),
    ).toBe("Smith");
  });

  it("does not reuse a check verdict across values", async ({
    expect,
    setup,
  }) => {
    // NOTE: The semantics that make client-side substitution correct: a check
    // must read the page for every value, so two values never share an entry.
    const { al, $ } = await setup({ planner: false });
    await $.navigate("https://the-internet.herokuapp.com/forgot_password");

    await al.check("the page heading is {heading}", {
      params: { heading: "Forgot Password" },
    });
    await expect(
      al.check("the page heading is {heading}", {
        params: { heading: "Sign Up" },
      }),
    ).rejects.toThrow(AssertionError);

    expect((await al.getStats()).cache.total_tokens).toBe(0);
  });

  it("rejects a value the statement never references", async ({
    expect,
    setup,
  }) => {
    const { al } = await setup({ planner: false });

    await expect(
      al.check("the page heading is Forgot Password", {
        params: { heading: "Forgot Password" },
      }),
    ).rejects.toThrow(ParamsError);
  });
});
