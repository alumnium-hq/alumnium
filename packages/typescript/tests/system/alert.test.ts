import { describe } from "vitest"
import { baseIt } from "./helpers.ts"

describe("Alerts", () => {
  const it = baseIt

  it("accept alert", async ({ expect, setup }) => {
    const { al, $ } = await setup()
    await $.navigate("alert.html")
    await al.do("click the Trigger Alert button")
    await al.check("an alert dialog is shown")
    await al.do("accept the alert")
  })

  it("dismiss confirm", async ({ expect, setup }) => {
    const { al, $ } = await setup()
    await $.navigate("alert.html")
    await al.do("click the Trigger Confirm button")
    await al.check("a confirm dialog is shown")
    await al.do("dismiss the alert")
    await al.check("the result text says Dismissed")
  })
})
