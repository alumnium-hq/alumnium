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
  export type Lesson = z.infer<typeof KnowledgeStore.Lesson>;
}

/**
 * Persists lessons learned with `Alumni.learn()` per app, so they apply to
 * later sessions. Lessons are model-agnostic and stored one file per goal:
 * `<app>/do/<goal hash>.json`.
 */
export class KnowledgeStore extends FileStore {
  static Lesson = z.object({
    goal: z.string(),
    actions: z.array(z.string()),
  });

  constructor() {
    super(
      Env.ALUMNIUM_KNOWLEDGE_PATH ??
        GlobalFileStorePaths.globalSubDir("knowledge"),
    );
  }

  async lessons(app: AppId): Promise<KnowledgeStore.Lesson[]> {
    const dir = safePathJoin(app, "do");
    const files = (await this.list(dir)).filter((file) =>
      file.endsWith(".json"),
    );

    const lessons = await Promise.all(
      files.map(async (file) => {
        const relPath = safePathJoin(dir, file);
        try {
          return await this.readJson(relPath, KnowledgeStore.Lesson);
        } catch (error) {
          logger.warn(`Skipping malformed lesson ${relPath}: {error}`, {
            error,
          });
          return null;
        }
      }),
    );

    return lessons.filter((lesson) => lesson !== null);
  }

  async save(app: AppId, lesson: KnowledgeStore.Lesson): Promise<void> {
    await this.writeJson(KnowledgeStore.#lessonPath(app, lesson.goal), lesson);
  }

  async clearApp(app: AppId): Promise<void> {
    await this.subStore(app).clear();
  }

  static #lessonPath(app: AppId, goal: string): string {
    return safePathJoin(app, "do", `${xxh64Str(goal)}.json`);
  }
}
