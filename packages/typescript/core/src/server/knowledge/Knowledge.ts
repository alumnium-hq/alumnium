import { type AppId, isPlaceholderAppId } from "../../AppId.ts";
import { Logger } from "../../telemetry/Logger.ts";
import type { SessionContext } from "../session/SessionContext.ts";
import { KnowledgeLayer } from "./KnowledgeLayer.ts";
import type { KnowledgeManifest } from "./KnowledgeManifest.ts";
import { KnowledgeStore } from "./KnowledgeStore.ts";

const logger = Logger.get(import.meta.url);

export namespace Knowledge {
  export type Kind = KnowledgeStore.Kind;

  export type HintKind = KnowledgeStore.HintKind;

  export type Layer = KnowledgeLayer.Layer;

  /** Lessons of a kind by instruction. */
  export type Lessons<K extends Kind> = Map<string, KnowledgeStore.Values[K]>;

  export interface Props {
    context: SessionContext;
    /** Store to persist lessons in, `null` to keep them in the session. */
    store: KnowledgeStore | null;
    /** Platform of the session, which picks its platform layer. */
    platform: KnowledgeLayer.Platform;
    /** Explicit scope, so lessons persist without an app. */
    scope?: string | undefined;
  }

  export interface LearnOptions {
    /** Layer to persist in, the product layer by default. */
    layer?: Layer | undefined;
    /** App the lesson is for, the session app by default. */
    app?: AppId | undefined;
  }

  /** A resolved lesson with the layer it comes from. */
  export interface Resolved<K extends Kind> {
    value: KnowledgeStore.Values[K];
    layer: Layer;
    /** Whether it was learned in the session and isn't persisted yet. */
    session: boolean;
  }
}

/**
 * Lessons available to a session, merged from layers: shared lessons, the
 * product's lessons and its lessons for the session platform, with lessons
 * learned in the session on top. On the same kind and instruction, the more
 * specific layer wins.
 *
 * The product scope is, in order: the explicit scope, the product the
 * manifest maps the app to, or the app itself. Persisting product and
 * platform lessons before the app is known fails rather than guessing it, as
 * the first app the session visits may be a sign-in page or a redirect.
 */
export class Knowledge {
  #context: SessionContext;
  #store: KnowledgeStore | null;
  #platform: KnowledgeLayer.Platform;
  #scope: string | undefined;
  #manifest: Promise<KnowledgeManifest> | undefined;
  /** Lessons learned in the session by layer, kind and instruction. */
  #learned = new Map<Knowledge.Layer, KnowledgeStore.Lessons>();
  /** Product scopes lessons were persisted in during the session. */
  #persisted = new Set<string>();
  /** Product scopes lessons were resolved from during the session. */
  #read = new Set<string>();
  /** Persisted lessons by layer file. */
  #loaded = new Map<string, Promise<KnowledgeStore.Lessons>>();

  constructor(props: Knowledge.Props) {
    this.#context = props.context;
    this.#store = props.store;
    this.#platform = props.platform;
    this.#scope = props.scope;
  }

  get platform(): KnowledgeLayer.Platform {
    return this.#platform;
  }

  /** Learns a lesson for the instruction. */
  async learn<K extends Knowledge.Kind>(
    kind: K,
    instruction: string,
    value: KnowledgeStore.Values[K],
    options: Knowledge.LearnOptions = {},
  ): Promise<void> {
    const layer = options.layer ?? KnowledgeLayer.DEFAULT;
    const scope = this.#store
      ? await this.#requireScope(
          layer,
          options.app,
          `learn ${kind} lesson "${instruction}"`,
        )
      : null;

    this.#lessonsOf(this.#learned, layer, kind).set(instruction, value);
    if (!this.#store) return;

    await this.#persist(scope, layer, kind, instruction, value);
    if (scope !== null) this.#persisted.add(scope);
  }

  /**
   * Resolves lessons of the kind that apply to the session, with the layer
   * each comes from.
   */
  async resolve<K extends Knowledge.Kind>(
    kind: K,
  ): Promise<Map<string, Knowledge.Resolved<K>>> {
    const resolved = new Map<string, Knowledge.Resolved<K>>();
    const layers = KnowledgeLayer.applicable(this.#platform);

    const scope = await this.#resolveScope();
    if (scope) this.#read.add(scope);

    if (this.#store) {
      for (const layer of layers) {
        if (layer !== "shared" && !scope) continue;
        const lessons = await this.#load(scope, layer);
        for (const [instruction, value] of lessons[kind]) {
          resolved.set(instruction, {
            value: value as KnowledgeStore.Values[K],
            layer,
            session: false,
          });
        }
      }
    }

    for (const layer of layers) {
      const learned = this.#learned.get(layer)?.[kind];
      for (const [instruction, value] of learned ?? []) {
        resolved.set(instruction, {
          value: value as KnowledgeStore.Values[K],
          layer,
          session: true,
        });
      }
    }

    return resolved;
  }

  /** Resolves lessons of the kind that apply to the session. */
  async lessons<K extends Knowledge.Kind>(
    kind: K,
  ): Promise<Knowledge.Lessons<K>> {
    const resolved = await this.resolve(kind);
    return new Map([...resolved].map(([key, { value }]) => [key, value]));
  }

  /**
   * Forgets a lesson in a layer: learned in the session and persisted.
   *
   * @returns Whether a lesson was forgotten.
   */
  async forget(
    kind: Knowledge.Kind,
    instruction: string,
    options: Knowledge.LearnOptions = {},
  ): Promise<boolean> {
    const layer = options.layer ?? KnowledgeLayer.DEFAULT;
    const scope = this.#store
      ? await this.#requireScope(
          layer,
          options.app,
          `forget ${kind} lesson "${instruction}"`,
        )
      : null;

    let forgotten =
      this.#learned.get(layer)?.[kind].delete(instruction) ?? false;
    if (!this.#store) return forgotten;

    if (await this.#store.forget(scope, layer, kind, instruction)) {
      forgotten = true;
    }
    this.#loaded.delete(Knowledge.#key(scope, layer));
    return forgotten;
  }

  /** Forgets all persisted lessons of a layer and the ones learned in it. */
  async clearLayer(options: Knowledge.LearnOptions = {}): Promise<void> {
    const layer = options.layer ?? KnowledgeLayer.DEFAULT;
    const scope = this.#store
      ? await this.#requireScope(layer, options.app, `clear the ${layer} layer`)
      : null;

    this.#learned.delete(layer);
    if (!this.#store) return;

    await this.#store.clearLayer(scope, layer);
    this.#loaded.delete(Knowledge.#key(scope, layer));
  }

  /**
   * Forgets lessons learned in the session. Persisted lessons are kept, so
   * teardowns don't erase lessons other test suites rely on.
   */
  clearSession(): void {
    this.#learned.clear();
  }

  /**
   * Product scopes lessons were persisted in during the session but never
   * resolved from, although the session resolved lessons of other scopes.
   * Lessons in them don't apply to the apps the session visited, which
   * usually means the manifest doesn't map those apps to one product.
   */
  unread(): string[] {
    if (!this.#read.size) return [];
    return [...this.#persisted].filter((scope) => !this.#read.has(scope));
  }

  /** Product scopes lessons were resolved from during the session. */
  read(): string[] {
    return [...this.#read];
  }

  /**
   * Resolves the product scope: the explicit scope, the product the manifest
   * maps the app to, or the app itself. `null` without a store, or while the
   * app isn't known.
   *
   * @param app App to resolve, the session app when it's a placeholder.
   */
  async #resolveScope(app?: AppId): Promise<string | null> {
    if (!this.#store) return null;
    if (this.#scope) return this.#scope;

    const target = [app, this.#context.app].find(
      (candidate) => candidate && !isPlaceholderAppId(candidate),
    );
    if (!target) return null;

    this.#manifest ??= this.#store.manifest();
    return (await this.#manifest).resolve(target) ?? target;
  }

  /**
   * Resolves the scope a layer persists in: `null` for the shared layer, which
   * needs none, `undefined` while the product scope isn't known.
   */
  async #layerScope(
    layer: Knowledge.Layer,
    app?: AppId,
  ): Promise<string | null | undefined> {
    if (layer === "shared") return null;
    return (await this.#resolveScope(app)) ?? undefined;
  }

  /**
   * Resolves the scope a layer persists in, failing while the product scope
   * isn't known.
   *
   * @param action What needs the scope, for the error message.
   */
  async #requireScope(
    layer: Knowledge.Layer,
    app: AppId | undefined,
    action: string,
  ): Promise<string | null> {
    const scope = await this.#layerScope(layer, app);
    if (scope !== undefined) return scope;
    throw new Error(
      `Can't ${action} before the app is known, as the session isn't on an app yet (${app ?? this.#context.app}). Navigate to the app first, name the app explicitly, e.g. \`knowledge.app("example.com")\`, or set a knowledge scope with the \`knowledge\` option or ALUMNIUM_KNOWLEDGE_SCOPE.`,
    );
  }

  async #persist<K extends Knowledge.Kind>(
    scope: string | null,
    layer: Knowledge.Layer,
    kind: K,
    instruction: string,
    value: KnowledgeStore.Values[K],
  ): Promise<void> {
    const store = this.#store;
    if (!store) return;
    const where = Knowledge.#key(scope, layer);

    try {
      await store.save(scope, layer, kind, instruction, value);
      logger.debug(`Persisted ${kind} lesson in ${where}: ${instruction}`);
    } catch (error) {
      logger.warn(`Failed to persist ${kind} lesson in ${where}: {error}`, {
        error,
      });
      return;
    }

    const loaded = await this.#loaded.get(where)?.catch(() => null);
    loaded?.[kind].set(instruction, value as never);
  }

  #load(
    scope: string | null,
    layer: Knowledge.Layer,
  ): Promise<KnowledgeStore.Lessons> {
    const key = Knowledge.#key(scope, layer);
    let loaded = this.#loaded.get(key);
    if (!loaded) {
      loaded =
        this.#store?.layer(scope, layer) ??
        Promise.resolve(KnowledgeStore.empty());
      this.#loaded.set(key, loaded);
    }
    return loaded;
  }

  #lessonsOf<K extends Knowledge.Kind>(
    lessons: Map<Knowledge.Layer, KnowledgeStore.Lessons>,
    layer: Knowledge.Layer,
    kind: K,
  ): Map<string, KnowledgeStore.Values[K]> {
    let layerLessons = lessons.get(layer);
    if (!layerLessons) {
      layerLessons = KnowledgeStore.empty();
      lessons.set(layer, layerLessons);
    }
    return layerLessons[kind];
  }

  static #key(scope: string | null, layer: Knowledge.Layer): string {
    return scope === null ? layer : `${scope}/${layer}`;
  }
}
