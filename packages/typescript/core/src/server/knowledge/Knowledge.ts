import { type AppId, isPlaceholderAppId } from "../../AppId.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { SessionContext } from "../session/SessionContext.ts";
import type { KnowledgeStore } from "./KnowledgeStore.ts";

const logger = Logger.get(import.meta.url);

export namespace Knowledge {
  /** Learned actions by goal. */
  export type Examples = Map<string, string[]>;
}

/**
 * Lessons available to a session: the ones learned in it, plus the ones
 * persisted for the current app by previous sessions.
 *
 * Lessons are often learned before navigating to the app under test, so when
 * the app isn't known yet, they're persisted on the first planning for an app.
 */
export class Knowledge {
  #context: SessionContext;
  #store: KnowledgeStore | null;
  #learned: Knowledge.Examples = new Map();
  #pending = new Set<string>();
  #persisted = new Map<AppId, Promise<Knowledge.Examples>>();

  constructor(context: SessionContext, store: KnowledgeStore | null) {
    this.#context = context;
    this.#store = store;
  }

  /**
   * Learns actions to achieve the goal.
   *
   * @param app App the lesson was learned on, the session app by default.
   */
  async learn(goal: string, actions: string[], app?: AppId): Promise<void> {
    this.#learned.set(goal, actions);
    if (!this.#store) return;

    const target = [app, this.#context.app].find(
      (candidate) => candidate && !isPlaceholderAppId(candidate),
    );
    if (target) {
      this.#pending.delete(goal);
      await this.#persist(target, goal, actions);
    } else {
      logger.debug(`Deferring persisting lesson until app is known: ${goal}`);
      this.#pending.add(goal);
    }
  }

  /**
   * Resolves lessons for the session app. Lessons learned in the session
   * override persisted ones with the same goal.
   */
  async examples(): Promise<Knowledge.Examples> {
    const app = this.#context.app;
    if (!this.#store || isPlaceholderAppId(app)) return new Map(this.#learned);

    await this.#persistPending(app);
    const persisted = await this.#load(app);
    return new Map([...persisted, ...this.#learned]);
  }

  /** Forgets lessons learned in the session and persisted for the session app. */
  async clear(): Promise<void> {
    this.#learned.clear();
    this.#pending.clear();

    const app = this.#context.app;
    if (!this.#store || isPlaceholderAppId(app)) return;

    this.#persisted.delete(app);
    try {
      await this.#store.clearApp(app);
    } catch (error) {
      logger.warn(`Failed to clear lessons for ${app}: {error}`, { error });
    }
  }

  async #persistPending(app: AppId): Promise<void> {
    const goals = [...this.#pending];
    this.#pending.clear();

    await Promise.all(
      goals.flatMap((goal) => {
        const actions = this.#learned.get(goal);
        return actions ? [this.#persist(app, goal, actions)] : [];
      }),
    );
  }

  async #persist(app: AppId, goal: string, actions: string[]): Promise<void> {
    const store = this.#store;
    if (!store) return;

    try {
      await store.save(app, { goal, actions });
      logger.debug(`Persisted lesson for ${app}: ${goal}`);
    } catch (error) {
      logger.warn(`Failed to persist lesson for ${app}: {error}`, { error });
      return;
    }

    (await this.#persisted.get(app))?.set(goal, actions);
  }

  #load(app: AppId): Promise<Knowledge.Examples> {
    let loaded = this.#persisted.get(app);
    if (!loaded) {
      loaded = (this.#store?.lessons(app) ?? Promise.resolve([]))
        .then(
          (lessons) =>
            new Map(lessons.map((lesson) => [lesson.goal, lesson.actions])),
        )
        .catch((error) => {
          logger.warn(`Failed to load lessons for ${app}: {error}`, { error });
          return new Map();
        });
      this.#persisted.set(app, loaded);
    }
    return loaded;
  }
}
