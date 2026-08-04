import { always } from "alwaysly";
import { xxh64Str } from "smolxxh/str";
import { Env } from "../../Env.ts";
import { FileStore } from "../../FileStore/FileStore.ts";
import type { ToolCall } from "../../tools/BaseTool.ts";
import type { Tree } from "../../tree/Tree.ts";
import { Xml } from "../../Xml.ts";

export abstract class BaseServerAccessibilityTree {
  #simplifiedIdCounter = 0;

  protected simplifiedToRawId: Record<Tree.SimplifiedId, Tree.RawId> = {};

  /**
   * Convert tree to XML string, optionally excluding specified attributes.
   */
  abstract toXml(excludeAttrs?: Set<string>): string;

  getRawId(simplifiedIdArg: unknown): Tree.RawId {
    const simplifiedId = this.#extractId(simplifiedIdArg);
    const rawId = this.simplifiedToRawId[simplifiedId];
    if (typeof rawId !== "number") {
      throw new Error(`No element with simplified id=${simplifiedId}`);
    }

    return rawId;
  }

  // Gemini returns ids as floats
  // Llama sometimes returns ids as strings or nested dicts
  #extractId(id: unknown): Tree.SimplifiedId {
    if (typeof id === "number") {
      return Math.trunc(id) as Tree.SimplifiedId;
    } else if (typeof id === "string") {
      return +id as Tree.SimplifiedId;
    } else if (typeof id === "object" && id && "value" in id) {
      return this.#extractId(id.value);
    }

    throw new Error(`Cannot extract id from ${String(id)}`);
  }

  mapToolCallsToRawId(toolCalls: ToolCall[]): ToolCall[] {
    const mappedCalls: ToolCall[] = [];
    for (const call of toolCalls) {
      const mappedCall: ToolCall = { ...call };
      const args = { ...call.args };

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

  protected getNextId(): Tree.SimplifiedId {
    this.#simplifiedIdCounter += 1;
    return this.#simplifiedIdCounter as Tree.SimplifiedId;
  }

  protected parseIgnored(xmlNode: Xml.Node): boolean {
    const xmlEl = Xml.nodeAsTag(xmlNode);
    // An element is considered "ignored" if it's not accessible.
    // This aligns with ARIA principles where accessibility is key.
    return xmlEl?.attribs.ignored === "true";
  }

  static #devTreesStore = FileStore.subStore(undefined, "dev", "trees");

  #devCapturedTreeName?: string;

  protected async devCaptureTreeInput(
    kind: string,
    xml: string,
  ): Promise<void> {
    if (!Env.ALUMNIUM_DEV_CAPTURE_TREES) return;

    const hash = xxh64Str(xml);
    this.#devCapturedTreeName = `${kind}-${hash}`;
    await this.#devWriteTree("in", xml);
  }

  protected async devCaptureTreeOutput(xml: string): Promise<void> {
    if (!Env.ALUMNIUM_DEV_CAPTURE_TREES) return;

    await this.#devWriteTree("out", xml);
  }

  async #devWriteTree(inOut: "in" | "out", xml: string): Promise<void> {
    always(this.#devCapturedTreeName);
    const name = `${this.#devCapturedTreeName}-${inOut}.xml`;
    await BaseServerAccessibilityTree.#devTreesStore.writeFile(name, xml);
  }
}
