import type { Generation } from "@langchain/core/outputs";
import { LlmContext } from "../LlmContext.js";
import { ServerCache } from "./ServerCache.js";

export class NullCache extends ServerCache {
  override async lookup(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
  ): Promise<Generation[] | null> {
    /*     try {
      throw new Error("STACK");
    } catch (error) {
      console.log("==========================");
      console.log("######## LOOKUP:", {
        prompt,
        llmKey,
      });
      console.log("--------------------------");
      // @ts-expect-error
      console.log(error.stack);
      // process.exit(0);
    } */
    return null;
  }

  override async update(
    prompt: LlmContext.Prompt,
    llmKey: LlmContext.LlmKey,
    generations: Generation[],
  ): Promise<void> {
    console.log("######## UPDATE #########");
    console.log(JSON.stringify(generations[0]!, null, 2));
    console.log("#########################");
    // try {
    //   throw new Error("STACK");
    // } catch (error) {
    //   console.log("==========================");
    //   console.log("######## UPDATE:", {
    //     prompt,
    //     llmKey,
    //   });
    //   console.log("--------------------------");
    //   // @ts-expect-error
    //   console.log(error.stack);
    //   // process.exit(0);
    // }
    // console.log("--- GENERATIONS:", generations);
  }

  async save(): Promise<void> {}

  async discard(): Promise<void> {}

  async clear(): Promise<void> {}
}
