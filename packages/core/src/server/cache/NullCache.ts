import { BaseCache } from "@langchain/core/caches";
import { Generation } from "@langchain/core/outputs";
import { Agent } from "../agents/Agent.js";

export class NullCache extends BaseCache {
  usage = Agent.createUsage();

  async lookup(
    _prompt: string,
    _llmString: string,
  ): Promise<Generation[] | null> {
    return null;
  }

  async update(
    _prompt: string,
    _llmString: string,
    _returnVal: Generation[],
  ): Promise<void> {}

  save(): void {}

  discard(): void {}

  clear(_args = {}): void {}
}
