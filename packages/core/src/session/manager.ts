import { LanguageModel } from "ai";
import { log } from "smollog";
import { ensureModelName, Provider } from "../model/model.js";
import { ToolSchema } from "../tool/tool.js";
import { Session, SessionPlatform } from "./session.js";

export class SessionManager {
  sessions: Record<Session.Id, Session> = {};

  constructor() {}

  createSession(props: SessionManager.CreateSessionProps) {
    const sessionId = props.sessionId || Session.createId();

    // TODO: Class?
    const model = ensureModelName(props);
    log.info(
      `Creating session ${sessionId} with model ${model.provider}/${model.name} and platform ${props.platform}`,
    );

    this.sessions[sessionId] = new Session({
      ...props,
      sessionId,
      model,
    });
    log.info(`Created new session: ${sessionId}`);
    return sessionId;
  }

  // TODO:
  applySessionState() {}

  // TODO:
  getSession() {}

  // TODO:
  deleteSession() {}

  // TODO:
  listSessions() {}

  // TODO:
  getTotalStats() {}
}

export namespace SessionManager {
  export interface CreateSessionProps {
    provider: Provider;
    name?: string | undefined;
    platform: SessionPlatform;
    toolSchemas: ToolSchema[];
    llm?: LanguageModel | undefined;
    sessionId?: Session.Id | undefined;
  }
}
