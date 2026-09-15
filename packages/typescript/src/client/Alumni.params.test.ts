import { describe, expect, it, vi } from "vitest";
import { BaseAccessibilityTree } from "../accessibility/BaseAccessibilityTree.ts";
import { Client } from "../clients/Client.ts";
import { BaseDriver } from "../drivers/BaseDriver.ts";
import { Alumni } from "./Alumni.ts";
import { Area } from "./Area.ts";

describe.each(["Alumni", "Area"])("%s parameterized planning", (flavor) => {
  it("plans using values and preserves parameterized actor cache keys", async () => {
    const tree: BaseAccessibilityTree = Object.assign(
      Object.create(BaseAccessibilityTree.prototype),
      { toStr: () => "<button>2</button><button>8</button>" },
    );
    const driver: BaseDriver = Object.assign(
      Object.create(BaseDriver.prototype),
      {
        app: async () => ({ name: "calculator" }),
        resetAccessibilityTree: vi.fn(),
        setAccessibilityTree: vi.fn(),
        getAccessibilityTree: async () => tree,
      },
    );
    const planActions = vi.fn(async ({ goal }: Client.PlanActionsProps) => ({
      explanation: goal,
      steps: [goal],
    }));
    const executeAction = vi.fn(async () => ({
      explanation: "Pressed the requested digit",
      actions: [],
    }));
    const client: Client = Object.assign(Object.create(Client.prototype), {
      planActions,
      executeAction,
    });
    const alumni: Alumni = Object.assign(Object.create(Alumni.prototype), {
      driver,
      client,
    });
    const target =
      flavor === "Alumni"
        ? alumni
        : new Area(1, "calculator", tree, driver, {}, client);

    for (const digit of ["2", "8"]) {
      const result = await target.do("click {digit} button", { digit });

      expect(planActions).toHaveBeenLastCalledWith(
        expect.objectContaining({ goal: `click ${digit} button` }),
      );
      expect(executeAction).toHaveBeenLastCalledWith(
        expect.objectContaining({
          goal: "click {digit} button",
          step: "click {digit} button",
          params: { digit },
        }),
      );
      expect(result.explanation).toBe("Pressed the requested digit");
      expect(result.steps[0]?.name).toBe(`click ${digit} button`);
    }
  });
});
