import type { AppId } from "../../../AppId.ts";
import { SessionContext } from "../SessionContext.ts";
import type { SessionId } from "../SessionId.ts";

export abstract class SessionFactory {
  static sessionContext(): SessionContext {
    return new SessionContext({
      app: "test-app" as AppId,
      sessionId: "test-session-id" as SessionId,
    });
  }
}
