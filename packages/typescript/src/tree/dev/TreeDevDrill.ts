import { xxh64Str } from "smolxxh/str";
import type { BaseAccessibilityTree } from "../../accessibility/BaseAccessibilityTree.ts";
import type { Driver } from "../../drivers/Driver.ts";
import { Xml } from "../../xml/Xml.ts";
import { TreeFactory } from "../TreeFactory.ts";
import { TreeDevDrillError } from "./TreeDevDrillError.ts";

export abstract class TreeDevDrill {
  static async run(
    props: TreeDevDrill.RunProps,
  ): Promise<TreeDevDrill.RunResult> {
    const { action, platform, tree, probe } = props;
    const input = tree.toStr();
    const serverTree = TreeFactory.create(platform, input);
    const output = serverTree.toXml();
    const failures: TreeDevDrill.Failure[] = [];
    const renderedIds = this.#collectRenderedIds(output, action, failures);
    const seen = new Set<number>();
    let tested = 0;

    for (const renderedId of renderedIds) {
      const { parsed, role, simplified } = renderedId;
      if (simplified === undefined) continue;
      if (seen.has(simplified)) continue;
      seen.add(simplified);
      tested += 1;

      let raw: number;
      try {
        raw = serverTree.getRawId(simplified);
      } catch (error) {
        failures.push({
          action,
          stage: "map",
          role,
          ids: { parsed, simplified },
          error: this.errorMessage(error),
        });
        continue;
      }

      try {
        await probe(tree, raw);
      } catch (error) {
        const probeError =
          error instanceof TreeDevDrillError
            ? error
            : new TreeDevDrillError("probe", error);
        failures.push({
          action,
          stage: probeError.stage,
          role,
          ids: {
            parsed,
            simplified,
            raw,
            external: probeError.external,
          },
          error: this.errorMessage(probeError.cause ?? probeError),
        });
      }
    }

    return {
      key: `${this.#platformKey(platform)}-${xxh64Str(input)}`,
      tested,
      result: { platform, input, output, failures },
    };
  }

  static errorMessage(error: unknown): string {
    if (!(error instanceof Error)) return String(error);
    return error.name === "Error"
      ? error.message
      : `${error.name}: ${error.message}`;
  }

  static #collectRenderedIds(
    output: string,
    action: string,
    failures: TreeDevDrill.Failure[],
  ): TreeDevDrill.RenderedId[] {
    const ids: TreeDevDrill.RenderedId[] = [];
    const seen = new Set<number>();
    for (const root of Xml.parseAnyRootChildren(output)) {
      this.#visitRenderedIds(root, action, failures, ids, seen);
    }
    return ids;
  }

  static #visitRenderedIds(
    node: Xml.Node,
    action: string,
    failures: TreeDevDrill.Failure[],
    ids: TreeDevDrill.RenderedId[],
    seen: Set<number>,
  ): void {
    const tag = Xml.nodeAsTag(node);
    if (!tag) return;

    if ("id" in tag.attribs) {
      const parsed = tag.attribs.id;
      const strictMatch = /^([1-9]\d*)$/.exec(parsed);
      const numericId = strictMatch ? Number(strictMatch[1]) : NaN;
      const simplified = Number.isSafeInteger(numericId)
        ? numericId
        : undefined;

      if (!strictMatch || simplified === undefined) {
        failures.push({
          action,
          stage: "parse",
          role: tag.tagName,
          ids: { parsed, simplified },
          error: `Invalid rendered id=${parsed}`,
        });
      }

      ids.push({ parsed, role: tag.tagName, simplified });
      if (simplified !== undefined) {
        if (seen.has(simplified)) {
          failures.push({
            action,
            stage: "parse",
            role: tag.tagName,
            ids: { parsed, simplified },
            error: `Duplicate rendered id=${simplified}`,
          });
        }
        seen.add(simplified);
      }
    }

    for (const child of tag.children) {
      this.#visitRenderedIds(child, action, failures, ids, seen);
    }
  }

  static #platformKey(platform: Driver.Platform): string {
    return platform === "chromium" ? "chrome" : platform;
  }
}

export namespace TreeDevDrill {
  export type Stage = "parse" | "map" | "resolve" | "probe";
  export type ExternalId = number | string;

  export interface Ids {
    parsed: string;
    simplified?: number | undefined;
    raw?: number | undefined;
    external?: ExternalId | undefined;
  }

  export interface Failure {
    action: string;
    stage: Stage;
    role?: string | undefined;
    ids: Ids;
    error: string;
  }

  export interface TreeResult {
    platform: Driver.Platform;
    input: string;
    output: string;
    failures: Failure[];
  }

  export interface RunResult {
    key: string;
    tested: number;
    result: TreeResult;
  }

  export interface RunProps {
    action: string;
    platform: Driver.Platform;
    tree: BaseAccessibilityTree;
    probe: (tree: BaseAccessibilityTree, rawId: number) => Promise<ExternalId>;
  }

  export interface RenderedId {
    parsed: string;
    role: string;
    simplified?: number | undefined;
  }
}
