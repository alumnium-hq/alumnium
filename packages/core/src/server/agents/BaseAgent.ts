import { AgentUsage } from "./agent.js";

export class BaseAgent {
  usage: AgentUsage;

  constructor() {
    this.usage = { input_tokens: 0, output_tokens: 0, total_tokens: 0 };
    this.loadPrompts();
  }

  // TODO:
  private loadPrompts() {}

  // TODO:
  protected static shouldRaise() {}

  // TODO:
  protected invokeChain() {}

  // TODO:
  private updateUsage() {}

  // TODO:
  toState() {}

  // TODO:
  applyState() {}
}
