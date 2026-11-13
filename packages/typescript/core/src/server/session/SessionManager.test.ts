import { describe, expect, it, vi } from "vitest";
import { pushMock } from "../../../../alumnium/tests/unit/mocks.ts";
import { Model } from "../../Model.ts";
import { Session } from "./Session.ts";
import { SessionManager } from "./SessionManager.ts";

describe(SessionManager, () => {
  describe("deleteSession", () => {
    it("closes the session", async () => {
      const close = vi.spyOn(Session.prototype, "close");
      pushMock(close);
      const manager = new SessionManager();
      const session = await manager.createSession({
        model: Model.parse("openai/test"),
        platform: "chromium",
        tools: [],
      });

      await expect(manager.deleteSession(session.sessionId)).resolves.toBe(
        true,
      );
      expect(close).toHaveBeenCalledOnce();
      expect(manager.getSession(session.sessionId)).toBeUndefined();
    });
  });
});
