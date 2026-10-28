import { xxh64Str } from "@js-fns/xxhash/str";
import z from "zod";
import type { AppId } from "../../AppId.ts";
import { Env } from "../../Env.ts";
import { FileStore } from "../../FileStore/FileStore.ts";
import { GlobalFileStorePaths } from "../../FileStore/GlobalFileStorePaths.ts";
import { Logger } from "../../telemetry/Logger.ts";
import { safePathJoin } from "../../utils/fs.ts";

const logger = Logger.get(import.meta.url);

export namespace KnowledgeStore {
  /** Kind of lesson, named after the `Alumni` method it teaches. */
  export type Kind = "do" | HintKind;

  /** Kinds of lessons that hint how to handle an instruction. */
  export type HintKind = "get" | "check" | "find" | "area";

  /** What a lesson teaches for an instruction, by kind. */
  export interface Values {
    do: string[];
    get: string;
    check: string;
    find: string;
    area: string;
  }

  export type Entry<K extends Kind> = [instruction: string, value: Values[K]];

  export type DoLesson = z.infer<typeof KnowledgeStore.DoLesson>;

  export type HintLesson = z.infer<typeof KnowledgeStore.HintLesson>;
}

/**
 * Persists lessons learned with `Alumni.learn` per app, so they apply to
 * later sessions. Lessons are model-agnostic and stored one file per
 * instruction: `<app>/<kind>/<instruction hash>.json`.
 */
export class KnowledgeStore extends FileStore {
  static HINT_KINDS: readonly KnowledgeStore.HintKind[] = [
    "get",
    "check",
    "find",
    "area",
  ];

  static DoLesson = z.object({
    goal: z.string(),
    actions: z.array(z.string()),
  });

  static HintLesson = z.object({
    instruction: z.string(),
    hint: z.string(),
  });

  constructor() {
    super(
      Env.ALUMNIUM_KNOWLEDGE_PATH ??
        GlobalFileStorePaths.globalSubDir("knowledge"),
    );
  }

  async lessons<K extends KnowledgeStore.Kind>(
    app: AppId,
    kind: K,
  ): Promise<KnowledgeStore.Entry<K>[]> {
    const dir = safePathJoin(app, kind);
    const files = (await this.list(dir)).filter((file) =>
      file.endsWith(".json"),
    );

    const entries = await Promise.all(
      files.map(async (file) => {
        const relPath = safePathJoin(dir, file);
        try {
          return await this.#readEntry(relPath, kind);
        } catch (error) {
          logger.warn(`Skipping malformed lesson ${relPath}: {error}`, {
            error,
          });
          return null;
        }
      }),
    );

    return entries.filter((entry) => entry !== null);
  }

  async save<K extends KnowledgeStore.Kind>(
    app: AppId,
    kind: K,
    instruction: string,
    value: KnowledgeStore.Values[K],
  ): Promise<void> {
    const lesson: KnowledgeStore.DoLesson | KnowledgeStore.HintLesson =
      kind === "do"
        ? { goal: instruction, actions: value as string[] }
        : { instruction, hint: value as string };
    await this.writeJson(
      KnowledgeStore.#lessonPath(app, kind, instruction),
      lesson,
    );
  }

  /** Removes lessons of all kinds for the app. */
  async clearApp(app: AppId): Promise<void> {
    await this.subStore(app).clear();
  }

  async #readEntry<K extends KnowledgeStore.Kind>(
    relPath: string,
    kind: K,
  ): Promise<KnowledgeStore.Entry<K> | null> {
    if (kind === "do") {
      const lesson = await this.readJson(relPath, KnowledgeStore.DoLesson);
      return (
        lesson && ([lesson.goal, lesson.actions] as KnowledgeStore.Entry<K>)
      );
    }
    const lesson = await this.readJson(relPath, KnowledgeStore.HintLesson);
    return (
      lesson && ([lesson.instruction, lesson.hint] as KnowledgeStore.Entry<K>)
    );
  }

  static #lessonPath(
    app: AppId,
    kind: KnowledgeStore.Kind,
    instruction: string,
  ): string {
    return safePathJoin(app, kind, `${xxh64Str(instruction)}.json`);
  }
}
