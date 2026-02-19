// TODO: Combine with the original interface is defined in packages/typescript/src/tools/BaseTool.ts
export interface ToolCall {
  name: string;
  args: Record<string, unknown>;
}

export abstract class BaseServerAccessibilityTree {
  #simplifiedIdCounter = 0;

  #simplifiedToRawId: Record<string, number> = {};

  /**
   * Convert tree to XML string, optionally excluding specified attributes.
   */
  abstract toXml(excludeAttrs?: Set<string> | null): string;

  getRawId(simplifiedIdArg: unknown): number {
    const simplifiedId = this.#extractId(simplifiedIdArg);
    const rawId = this.#simplifiedToRawId[simplifiedId];
    if (typeof rawId !== "number") {
      throw new Error(`No element with simplified id=${simplifiedId}`);
    }

    return rawId;
  }

  mapToolCallsToRawId(toolCalls: ToolCall[]): ToolCall[] {
    const mappedCalls: ToolCall[] = [];
    for (const call of toolCalls) {
      const mappedCall: ToolCall = { ...call };
      const args = { ...(call.args ?? {}) };

      if ("id" in args) {
        args.id = this.getRawId(args.id);
      }
      if ("from_id" in args) {
        args.from_id = this.getRawId(args.from_id);
      }
      if ("to_id" in args) {
        args.to_id = this.getRawId(args.to_id);
      }

      mappedCall.args = args;
      mappedCalls.push(mappedCall);
    }

    return mappedCalls;
  }

  protected getNextId(): number {
    this.#simplifiedIdCounter += 1;
    return this.#simplifiedIdCounter;
  }

  // Gemini returns ids as floats
  // Llama sometimes returns ids as strings or nested dicts
  #extractId(id: unknown): number {
    if (typeof id === "number") {
      return Math.trunc(id);
    } else if (typeof id === "string") {
      return +id;
    } else if (typeof id === "object" && id && "value" in id) {
      return this.#extractId(id.value);
    }

    throw new Error(`Cannot extract id from ${String(id)}`);
  }
}
