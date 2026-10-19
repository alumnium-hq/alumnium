import { xxh64Any } from "@js-fns/xxhash/any";
import { always } from "alwaysly";
import { Env } from "../Env.ts";
import { FileStore } from "../FileStore/FileStore.ts";
import { Logger } from "../telemetry/Logger.ts";
import type { AccessibilityElement } from "./AccessibilityElement.ts";

const logger = Logger.get(import.meta.url);

export abstract class BaseAccessibilityTree<Source = unknown> {
  static sourceIdFor(
    this: void,
    kind: string,
    source: unknown,
  ): BaseAccessibilityTree.SourceId {
    const sourceHash = xxh64Any(source);
    return `${kind}-${sourceHash}` as BaseAccessibilityTree.SourceId;
  }

  #sourceId: BaseAccessibilityTree.SourceId;
  #xml: string | null = null;

  protected get kind(): string {
    return "unknown";
  }

  constructor(source: Source) {
    this.#sourceId = BaseAccessibilityTree.sourceIdFor(this.kind, source);

    void this.#devCaptureTree(this.#sourceId, source);
  }

  abstract toStr(): Promise<string>;

  abstract elementById(id: number): Promise<AccessibilityElement>;

  abstract scopeToArea(rawId: number): Promise<BaseAccessibilityTree<Source>>;

  protected set xml(xml: string) {
    this.#xml = xml;
    this.#devAssociateSourceIdToXml();
  }

  protected get xml(): string | null {
    return this.#xml;
  }

  //#region Dev

  static devTreesStore = FileStore.subStore(undefined, "dev", "trees");

  async #devCaptureTree(
    this: void,
    sourceId: BaseAccessibilityTree.SourceId,
    source: Source,
  ): Promise<void> {
    if (!Env.ALUMNIUM_DEV_CAPTURE_TREES) return;

    const name = `${sourceId}-source.json`;

    logger.debug(`Captured tree source {name}`, { name });

    const json = JSON.stringify(source, null, 2);
    await BaseAccessibilityTree.devTreesStore.writeFile(name, json);
  }

  static #devXmlSourceIdMap: Record<string, BaseAccessibilityTree.SourceId> =
    {};

  #devAssociateSourceIdToXml() {
    if (!Env.ALUMNIUM_DEV_CAPTURE_TREES) return;
    always(this.xml);
    BaseAccessibilityTree.#devXmlSourceIdMap[this.xml] = this.#sourceId;
  }

  static devSourceIdForXml(
    xml: string,
  ): BaseAccessibilityTree.SourceId | undefined {
    return BaseAccessibilityTree.#devXmlSourceIdMap[xml];
  }

  //#endregion
}

export namespace BaseAccessibilityTree {
  export type SourceId = string & { [sourceIdBrand]: never };
}

declare const sourceIdBrand: unique symbol;
