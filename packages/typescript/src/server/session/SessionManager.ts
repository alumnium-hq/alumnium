import type { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AppId } from "../../AppId.ts";
import type { Driver } from "../../drivers/Driver.ts";
import {
  createLlmUsageStats,
  LlmUsage,
  LlmUsageStats,
} from "../../llm/llmSchema.ts";
import { Model } from "../../Model.ts";
import { Telemetry } from "../../telemetry/Telemetry.ts";
import type { TypeUtils } from "../../typeUtils.ts";
import { Session } from "./Session.ts";
import { SessionId } from "./SessionId.ts";

const { logger, tracer } = Telemetry.get(import.meta.url);
const { span } = tracer.dec();

export namespace SessionManager {
  export interface CreateSessionProps {
    platform: Driver.Platform;
    provider?: Model.Provider | undefined;
    name?: string | undefined;
    tools: ToolDefinition[];
    llm?: BaseChatModel | undefined;
    planner?: boolean | undefined;
    excludeAttributes?: string[] | undefined;
    sessionId?: SessionId | undefined;
    app?: AppId | undefined;
  }
}

/**
 * Manages multiple client sessions.
 */
export class SessionManager {
  #sessions: Record<SessionId, Session> = {};

  /**
   * Create a new session and return its ID.
   *
   * @param props Session creation properties
   * @returns Session instance
   */
  createSession(props: SessionManager.CreateSessionProps): Session {
    const sessionId = props.sessionId || Session.createId();
    return this.#createSession({ ...props, sessionId });
  }

  @span("session.create", (props) => ({ "session.id": props.sessionId }))
  #createSession(
    props: TypeUtils.RequiredKeys<
      SessionManager.CreateSessionProps,
      "sessionId"
    >,
  ): Session {
    const { sessionId } = props;

    logger.debug(`Creating session with {props}`, { props });

    const {
      provider,
      name: modelName,
      excludeAttributes,
      ...restProps
    } = props;

    const model = new Model(provider, modelName);
    const session = new Session({
      ...restProps,
      sessionId,
      model,
      excludeAttributes: new Set(excludeAttributes ?? []),
    });

    this.#sessions[sessionId] = session;

    logger.info(`Created new session: ${sessionId}`);
    tracer.span("session.active", { "session.id": sessionId }, sessionId);

    return session;
  }

  /**
   * Get a session by ID.
   */
  getSession(sessionId: SessionId): Session | undefined {
    return this.#sessions[sessionId];
  }

  /**
   * Delete a session by ID.
   */
  @span("session.delete", (sessionId) => ({ "session.id": sessionId }))
  deleteSession(sessionId: SessionId): boolean {
    tracer.end(sessionId);

    if (sessionId in this.#sessions) {
      delete this.#sessions[sessionId];
      logger.info(`Deleted session: ${sessionId}`);
      return true;
    }
    return false;
  }

  /**
   * List all active session IDs.
   */
  listSessions(): SessionId[] {
    return Object.keys(this.#sessions) as SessionId[];
  }

  /**
   * Get combined token usage statistics for all sessions.
   */
  getTotalStats(): LlmUsageStats {
    const totalStats = createLlmUsageStats();
    Object.values(this.#sessions).forEach((session) => {
      (Object.keys(session.stats.total) as (keyof LlmUsage)[]).forEach(
        (key) => {
          totalStats.total[key] += session.stats.total[key];
          totalStats.cache[key] += session.stats.cache[key];
        },
      );
    });
    return totalStats;
  }
}
