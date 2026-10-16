import type * as AiModule from "ai";

/** The `ai` (AI SDK) module agents run on. */
export type Ai = typeof AiModule;

let aiPromise: Promise<Ai> | undefined;

/**
 * Loads the `ai` package agents run on. It's an optional peer dependency of
 * `@alumnium/core` installed with every LLM provider package, so importing
 * `@alumnium/core` alone never loads it.
 */
export function loadAi(): Promise<Ai> {
  return (aiPromise ??= import("ai").catch((error: unknown) => {
    aiPromise = undefined;
    throw new Error(
      'Alumnium agents need the "ai" package, which is installed with LLM provider packages. Install the one for your model, e.g. `npm install @alumnium/openai`, and import it (`import "@alumnium/openai";`).',
      { cause: error },
    );
  }));
}
