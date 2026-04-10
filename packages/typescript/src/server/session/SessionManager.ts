import type { ToolDefinition } from "@langchain/core/language_models/base";
import { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { AppId } from "../../AppId.ts";
import type { Driver } from "../../drivers/Driver.ts";
import { createLlmUsageStats, LlmUsageStats } from "../../llm/llmSchema.ts";
import { Model } from "../../Model.ts";
import { getLogger } from "../../utils/logger.ts";
import { Session } from "./Session.ts";
import { SessionId } from "./SessionId.ts";

const logger = getLogger(import.meta.url);

export namespace SessionManager {
  export interface CreateSessionProps {
    platform: Driver.Platform;
    provider: Model.Provider;
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

    logger.info(
      `Creating session ${sessionId} with model ${props.provider}/${props.name} and platform ${props.platform}`,
    );
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
  deleteSession(sessionId: SessionId): boolean {
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
    for (const session of Object.values(this.#sessions)) {
      const sessionStats = session.stats;
      for (const key of Object.keys(totalStats) as (keyof LlmUsageStats)[]) {
        totalStats[key].input_tokens += sessionStats[key].input_tokens;
        totalStats[key].output_tokens += sessionStats[key].output_tokens;
        totalStats[key].total_tokens += sessionStats[key].total_tokens;
      }
    }
    return totalStats;
  }
}
