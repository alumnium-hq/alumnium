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
    /** App the lesson was learned on, the session app by default. */
    app?: AppId | undefined;
  }

  export interface Unsaved {
    kind: Kind;
    instruction: string;
    layer: Layer;
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
 * manifest maps the session app to, or the app itself. Lessons are often
 * learned before navigating to the app under test, so without an explicit
 * scope and before the app is known, product and platform lessons are
 * persisted once a request for an app resolves lessons.
 */
export class Knowledge {
  #context: SessionContext;
  #store: KnowledgeStore | null;
  #platform: KnowledgeLayer.Platform;
  #scope: string | undefined;
  #manifest: Promise<KnowledgeManifest> | undefined;
  /** Lessons learned in the session by layer, kind and instruction. */
  #learned = new Map<Knowledge.Layer, KnowledgeStore.Lessons>();
  /** Lessons learned in the session, waiting for a scope to persist in. */
  #pending: Knowledge.Unsaved[] = [];
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
    this.#lessonsOf(this.#learned, layer, kind).set(instruction, value);
    this.#removePending(layer, kind, instruction);
    if (!this.#store) return;

    const scope = await this.#layerScope(layer, options.app);
    if (scope === undefined) {
      logger.debug(
        `Deferring persisting ${kind} lesson until its scope is known: ${instruction}`,
      );
      this.#pending.push({ kind, instruction, layer });
      return;
    }

    await this.#persist(scope, layer, kind, instruction, value);
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
    if (scope) await this.#persistPending(scope);

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
    layer: Knowledge.Layer = KnowledgeLayer.DEFAULT,
  ): Promise<boolean> {
    let forgotten =
      this.#learned.get(layer)?.[kind].delete(instruction) ?? false;
    this.#removePending(layer, kind, instruction);
    if (!this.#store) return forgotten;

    const scope = await this.#layerScope(layer);
    if (scope === undefined) return forgotten;

    if (await this.#store.forget(scope, layer, kind, instruction)) {
      forgotten = true;
    }
    this.#loaded.delete(Knowledge.#key(scope, layer));
    return forgotten;
  }

  /** Forgets all persisted lessons of a layer and the ones learned in it. */
  async clearLayer(
    layer: Knowledge.Layer = KnowledgeLayer.DEFAULT,
  ): Promise<void> {
    this.#learned.delete(layer);
    this.#pending = this.#pending.filter((lesson) => lesson.layer !== layer);
    if (!this.#store) return;

    const scope = await this.#layerScope(layer);
    if (scope === undefined) {
      throw new Error(
        `Can't clear the ${layer} layer before its knowledge scope is known`,
      );
    }

    await this.#store.clearLayer(scope, layer);
    this.#loaded.delete(Knowledge.#key(scope, layer));
  }

  /**
   * Forgets lessons learned in the session. Persisted lessons are kept, so
   * teardowns don't erase lessons other test suites rely on.
   */
  clearSession(): void {
    this.#learned.clear();
    this.#pending = [];
  }

  /** Lessons learned in the session that haven't been persisted yet. */
  unsaved(): Knowledge.Unsaved[] {
    return [...this.#pending];
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

  /** Persists lessons learned before the scope was known. */
  async #persistPending(scope: string): Promise<void> {
    const pending = this.#pending;
    this.#pending = [];

    for (const { kind, instruction, layer } of pending) {
      const value = this.#learned.get(layer)?.[kind].get(instruction);
      if (value === undefined) continue;
      await this.#persist(scope, layer, kind, instruction, value as never);
    }
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

  #removePending(
    layer: Knowledge.Layer,
    kind: Knowledge.Kind,
    instruction: string,
  ): void {
    this.#pending = this.#pending.filter(
      (lesson) =>
        lesson.layer !== layer ||
        lesson.kind !== kind ||
        lesson.instruction !== instruction,
    );
  }

  static #key(scope: string | null, layer: Knowledge.Layer): string {
    return scope === null ? layer : `${scope}/${layer}`;
  }
}
