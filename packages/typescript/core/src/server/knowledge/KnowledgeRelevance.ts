export namespace KnowledgeRelevance {
  export interface Scored<Value> {
    instruction: string;
    value: Value;
    /** Word overlap with the instruction, 1 for exact matches. */
    score: number;
    exact: boolean;
  }
}

/**
 * Selects the lessons relevant to an instruction, so prompts stay small and
 * adding a lesson changes cache keys only for similar instructions. Exact
 * matches are always selected, then up to `topK` lessons by word overlap.
 * Selection is deterministic: ties break by instruction.
 */
export abstract class KnowledgeRelevance {
  static #STOP_WORDS = new Set([
    "a",
    "an",
    "and",
    "are",
    "as",
    "at",
    "be",
    "by",
    "false",
    "following",
    "for",
    "from",
    "in",
    "into",
    "is",
    "it",
    "of",
    "on",
    "or",
    "the",
    "to",
    "true",
    "with",
  ]);

  // Statements of `check()` reach the retriever in this form.
  static #CHECK_PREFIX = /^is the following true or false - /i;

  static select<Value>(
    lessons: Map<string, Value>,
    instruction: string,
    topK: number,
  ): KnowledgeRelevance.Scored<Value>[] {
    const target = KnowledgeRelevance.#normalize(instruction);
    const targetWords = KnowledgeRelevance.#words(target);

    const scored = [...lessons].map(([lesson, value]) => {
      const normalized = KnowledgeRelevance.#normalize(lesson);
      const exact = normalized === target;
      const score = exact
        ? 1
        : KnowledgeRelevance.#overlap(
            targetWords,
            KnowledgeRelevance.#words(normalized),
          );
      return { instruction: lesson, value, score, exact };
    });

    const byInstruction = (
      a: KnowledgeRelevance.Scored<Value>,
      b: KnowledgeRelevance.Scored<Value>,
    ) =>
      a.instruction < b.instruction
        ? -1
        : a.instruction > b.instruction
          ? 1
          : 0;

    const exact = scored.filter((lesson) => lesson.exact).sort(byInstruction);
    const similar = scored
      .filter((lesson) => !lesson.exact && lesson.score > 0)
      .sort((a, b) => b.score - a.score || byInstruction(a, b))
      .slice(0, Math.max(0, topK));

    return [...exact, ...similar];
  }

  /** Lowercases, drops the check prefix and unifies `{param}` placeholders. */
  static #normalize(instruction: string): string {
    return instruction
      .replace(KnowledgeRelevance.#CHECK_PREFIX, "")
      .toLowerCase()
      .replace(/\{[^{}]*\}/g, "{}")
      .replace(/\s+/g, " ")
      .trim();
  }

  static #words(instruction: string): Set<string> {
    const words = instruction.match(/[\p{L}\p{N}]+/gu) ?? [];
    return new Set(
      words.filter((word) => !KnowledgeRelevance.#STOP_WORDS.has(word)),
    );
  }

  /** Jaccard similarity of the word sets. */
  static #overlap(a: Set<string>, b: Set<string>): number {
    if (!a.size || !b.size) return 0;
    const shared = [...a].filter((word) => b.has(word)).length;
    return shared / (a.size + b.size - shared);
  }
}
