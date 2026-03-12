import type { AppId } from "../../../AppId.js";
import { SessionContext } from "../SessionContext.js";
import type { SessionId } from "../SessionId.js";

export abstract class SessionFactory {
  static sessionContext(): SessionContext {
    return new SessionContext({
      app: "test-app" as AppId,
      sessionId: "test-session-id" as SessionId,
    });
  }
}
