import { type AppId, isPlaceholderAppId } from "../../AppId.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { SessionContext } from "../session/SessionContext.ts";
import type { KnowledgeStore } from "./KnowledgeStore.ts";

const logger = Logger.get(import.meta.url);

export namespace Knowledge {
  export type Kind = KnowledgeStore.Kind;

  export type HintKind = KnowledgeStore.HintKind;

  /** Lessons of a kind by instruction. */
  export type Lessons<K extends Kind> = Map<string, KnowledgeStore.Values[K]>;
}

/**
 * Lessons available to a session: the ones learned in it, plus the ones
 * persisted for the current app by previous sessions.
 *
 * Lessons are often learned before navigating to the app under test, so when
 * the app isn't known yet, they're persisted once a request for an app
 * resolves lessons.
 */
export class Knowledge {
  #context: SessionContext;
  #store: KnowledgeStore | null;
  #learned = new Map<Knowledge.Kind, Map<string, unknown>>();
  #pending = new Map<Knowledge.Kind, Set<string>>();
  #persisted = new Map<string, Promise<Map<string, unknown>>>();

  constructor(context: SessionContext, store: KnowledgeStore | null) {
    this.#context = context;
    this.#store = store;
  }

  /**
   * Learns a lesson for the instruction.
   *
   * @param app App the lesson was learned on, the session app by default.
   */
  async learn<K extends Knowledge.Kind>(
    kind: K,
    instruction: string,
    value: KnowledgeStore.Values[K],
    app?: AppId,
  ): Promise<void> {
    this.#ofKind(this.#learned, kind, Map).set(instruction, value);
    if (!this.#store) return;

    const pending = this.#ofKind(this.#pending, kind, Set);
    const target = [app, this.#context.app].find(
      (candidate) => candidate && !isPlaceholderAppId(candidate),
    );
    if (target) {
      pending.delete(instruction);
      await this.#persist(target, kind, instruction, value);
    } else {
      logger.debug(
        `Deferring persisting ${kind} lesson until app is known: ${instruction}`,
      );
      pending.add(instruction);
    }
  }

  /**
   * Resolves lessons of the kind for the session app. Lessons learned in
   * the session override persisted ones for the same instruction.
   */
  async lessons<K extends Knowledge.Kind>(
    kind: K,
  ): Promise<Knowledge.Lessons<K>> {
    const learned = (this.#learned.get(kind) ??
      new Map()) as Knowledge.Lessons<K>;
    const app = this.#context.app;
    if (!this.#store || isPlaceholderAppId(app)) return new Map(learned);

    await this.#persistPending(app);
    const persisted = (await this.#load(app, kind)) as Knowledge.Lessons<K>;
    return new Map([...persisted, ...learned]);
  }

  /** Forgets lessons learned in the session and persisted for the session app. */
  async clear(): Promise<void> {
    this.#learned.clear();
    this.#pending.clear();

    const app = this.#context.app;
    if (!this.#store || isPlaceholderAppId(app)) return;

    for (const key of this.#persisted.keys()) {
      if (key.startsWith(`${app}/`)) this.#persisted.delete(key);
    }
    try {
      await this.#store.clearApp(app);
    } catch (error) {
      logger.warn(`Failed to clear lessons for ${app}: {error}`, { error });
    }
  }

  /** Persists lessons of all kinds learned before the app was known. */
  async #persistPending(app: AppId): Promise<void> {
    const pending = [...this.#pending].flatMap(([kind, instructions]) =>
      [...instructions].map((instruction) => [kind, instruction] as const),
    );
    this.#pending.clear();

    await Promise.all(
      pending.flatMap(([kind, instruction]) => {
        const value = this.#learned.get(kind)?.get(instruction);
        return value === undefined
          ? []
          : [
              this.#persist(
                app,
                kind,
                instruction,
                value as KnowledgeStore.Values[typeof kind],
              ),
            ];
      }),
    );
  }

  async #persist<K extends Knowledge.Kind>(
    app: AppId,
    kind: K,
    instruction: string,
    value: KnowledgeStore.Values[K],
  ): Promise<void> {
    const store = this.#store;
    if (!store) return;

    try {
      await store.save(app, kind, instruction, value);
      logger.debug(`Persisted ${kind} lesson for ${app}: ${instruction}`);
    } catch (error) {
      logger.warn(`Failed to persist ${kind} lesson for ${app}: {error}`, {
        error,
      });
      return;
    }

    (await this.#persisted.get(Knowledge.#key(app, kind)))?.set(
      instruction,
      value,
    );
  }

  #load(app: AppId, kind: Knowledge.Kind): Promise<Map<string, unknown>> {
    const key = Knowledge.#key(app, kind);
    let loaded = this.#persisted.get(key);
    if (!loaded) {
      loaded = (this.#store?.lessons(app, kind) ?? Promise.resolve([]))
        .then((entries) => new Map<string, unknown>(entries))
        .catch((error) => {
          logger.warn(`Failed to load ${kind} lessons for ${app}: {error}`, {
            error,
          });
          return new Map<string, unknown>();
        });
      this.#persisted.set(key, loaded);
    }
    return loaded;
  }

  #ofKind<Collection>(
    collections: Map<Knowledge.Kind, Collection>,
    kind: Knowledge.Kind,
    Create: new () => Collection,
  ): Collection {
    let collection = collections.get(kind);
    if (!collection) {
      collection = new Create();
      collections.set(kind, collection);
    }
    return collection;
  }

  static #key(app: AppId, kind: Knowledge.Kind): string {
    return `${app}/${kind}`;
  }
}
