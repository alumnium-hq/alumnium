import { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { Model, Provider } from "../../Model.js";
import { getLogger } from "../../utils/logger.js";
import { Agent } from "../agents/Agent.js";
import { Platform } from "../Platform.js";
import { UsageStats } from "../serverSchema.js";
import { Session } from "./Session.js";
import { SessionId } from "./SessionId.js";

const logger = getLogger(import.meta.url);

/**
 * Manages multiple client sessions.
 */
export class SessionManager {
  sessions: Record<SessionId, Session> = {};

  constructor() {}

  /**
   * Create a new session and return its ID.
   *
   * @param props Session creation properties
   * @returns Session ID string
   */
  createSession(props: SessionManager.CreateSessionProps): SessionId {
    const sessionId = props.sessionId || Session.createId();

    logger.info(
      `Creating session ${sessionId} with model ${props.provider}/${props.name} and platform ${props.platform}`,
    );
    const { provider, name: modelName, ...restProps } = props;
    const model = new Model(provider, modelName);

    this.sessions[sessionId] = new Session({
      ...restProps,
      sessionId,
      model,
    });
    logger.info(`Created new session: ${sessionId}`);
    return sessionId;
  }

  applySessionState(sessionState: Session.State): void {
    logger.info(
      `Applying session state for session ${sessionState["session_id"]}`,
    );
    const session = Session.fromState(sessionState);
    this.sessions[session.sessionId] = session;
    logger.info(`Applied session state: ${session.sessionId}`);
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: SessionId): Session | undefined {
    return this.sessions[sessionId];
  }

  /**
   * Delete a session by ID.
   */
  deleteSession(sessionId: SessionId): boolean {
    if (sessionId in this.sessions) {
      delete this.sessions[sessionId];
      logger.info(`Deleted session: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * List all active session IDs.
   */
  listSessions(): SessionId[] {
    return Object.keys(this.sessions) as SessionId[];
  }

  /**
   * Get combined token usage statistics for all sessions.
   */
  getTotalStats(): UsageStats {
    const totalStats = SessionManager.createTotalStats();
    for (const session of Object.values(this.sessions)) {
      const sessionStats = session.stats;
      for (const key of Object.keys(totalStats) as (keyof UsageStats)[]) {
        totalStats[key].input_tokens += sessionStats[key].input_tokens;
        totalStats[key].output_tokens += sessionStats[key].output_tokens;
        totalStats[key].total_tokens += sessionStats[key].total_tokens;
      }
    }
    return totalStats;
  }

  static createTotalStats(): UsageStats {
    return {
      total: Agent.createUsage(),
      cache: Agent.createUsage(),
    };
  }
}

export namespace SessionManager {
  export interface CreateSessionProps {
    platform: Platform;
    provider: Provider;
    name?: string | undefined;
    tools: ToolDefinition[];
    llm?: BaseChatModel | undefined;
    planner?: boolean | undefined;
    sessionId?: SessionId | undefined;
  }
}
